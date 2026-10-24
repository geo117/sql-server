"""
Servidor API del Dashboard Monitor de SQL Server.

Expone endpoints REST de solo lectura basados en DMV y un endpoint de accion
(KILL) fuertemente validado. Incluye, ademas, un canal WebSocket de snapshots.

Controles de seguridad aplicados:
- Autenticacion opcional por API key (cabecera X-API-Key) activada por entorno.
- CORS restringido por lista blanca de origenes.
- Validacion estricta del SPID antes de ejecutar KILL (entero, en rango, no de sistema).
- Rate limit en la accion destructiva.
- Los errores internos se registran en servidor y NO se devuelven al cliente.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from collections import defaultdict, deque
from contextlib import closing
from typing import Any

import pyodbc
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware

from database import fetch_all, get_db_connection

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("sql-monitor")

API_KEY = os.getenv("API_KEY", "").strip()
KILL_MIN_USER_SPID = int(os.getenv("KILL_MIN_USER_SPID", "51"))
KILL_RATE_LIMIT_PER_MINUTE = int(os.getenv("KILL_RATE_LIMIT_PER_MINUTE", "10"))
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",")
    if origin.strip()
]

app = FastAPI(
    title="SQL Server Monitor API",
    version="1.0.0",
    description="Monitoreo en tiempo real de procesos, bloqueos y estadisticas de SQL Server.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["X-API-Key", "Content-Type"],
)


# --------------------------------------------------------------------------- #
# Autenticacion y utilitarios
# --------------------------------------------------------------------------- #
async def require_api_key(x_api_key: str | None = Header(default=None)) -> None:
    """Exige la API key cuando el servidor esta configurado con una."""
    if not API_KEY:
        return
    if x_api_key is None or not _constant_time_equals(x_api_key, API_KEY):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key ausente o invalida.",
        )


def _constant_time_equals(a: str, b: str) -> bool:
    import hmac

    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


_kill_attempts: dict[str, deque[float]] = defaultdict(deque)


def _enforce_kill_rate_limit(client_id: str) -> None:
    now = time.monotonic()
    window = _kill_attempts[client_id]
    while window and now - window[0] > 60:
        window.popleft()
    if len(window) >= KILL_RATE_LIMIT_PER_MINUTE:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiadas solicitudes de KILL. Espera un momento antes de reintentar.",
        )
    window.append(now)


def _handle_db_error(endpoint: str, exc: Exception) -> HTTPException:
    """Registra el detalle real y devuelve un mensaje generico al cliente."""
    logger.exception("[%s] Error de base de datos", endpoint)
    message = "No se pudo completar la consulta en SQL Server."
    if isinstance(exc, pyodbc.Error):
        message = "Error de conexion o de ejecucion en SQL Server. Revisa la configuracion."
    return HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=message)


# --------------------------------------------------------------------------- #
# Consultas DMV
# --------------------------------------------------------------------------- #
ACTIVE_PROCESSES_SQL = """
SELECT
    r.session_id,
    s.login_name,
    s.host_name,
    s.program_name,
    r.status,
    r.command,
    r.cpu_time,
    r.total_elapsed_time AS elapsed_time_ms,
    r.reads,
    r.writes,
    r.logical_reads,
    r.blocking_session_id,
    DB_NAME(r.database_id) AS database_name,
    SUBSTRING(st.text, (r.statement_start_offset/2) + 1,
        ((CASE r.statement_end_offset
            WHEN -1 THEN DATALENGTH(st.text)
            ELSE r.statement_end_offset
         END - r.statement_start_offset)/2) + 1) AS statement_text,
    qp.query_plan
FROM sys.dm_exec_requests r
INNER JOIN sys.dm_exec_sessions s ON r.session_id = s.session_id
CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) st
OUTER APPLY sys.dm_exec_query_plan(r.plan_handle) qp
WHERE s.is_user_process = 1
  AND r.session_id <> @@SPID
ORDER BY r.cpu_time DESC;
"""

BLOCKED_PROCESSES_SQL = """
SELECT
    DB_NAME(r.database_id) AS DBName,
    r.session_id AS WaitingSpid,
    r.blocking_session_id AS BlockingSpid,
    r.wait_type,
    r.wait_time AS WaitTime_ms,
    s_block.login_name AS BlockingUser,
    s_block.host_name AS BlockingHost,
    s_block.program_name AS BlockingProgram,
    s_block.status AS BlockingSessionStatus,
    COALESCE(st_block_req.text, st_block_conn.text, 'No T-SQL text available') AS BlockingQuery
FROM sys.dm_exec_requests r
INNER JOIN sys.dm_exec_sessions s_block
    ON r.blocking_session_id = s_block.session_id
LEFT JOIN sys.dm_exec_requests r_block
    ON s_block.session_id = r_block.session_id
LEFT JOIN sys.dm_exec_connections c_block
    ON s_block.session_id = c_block.session_id
OUTER APPLY sys.dm_exec_sql_text(r_block.sql_handle) st_block_req
OUTER APPLY sys.dm_exec_sql_text(c_block.most_recent_sql_handle) st_block_conn
WHERE r.blocking_session_id <> 0;
"""

SERVER_STATS_SQL = """
SELECT
    (SELECT COUNT(*) FROM sys.dm_exec_sessions WHERE is_user_process = 1) AS active_sessions,
    (SELECT COUNT(*) FROM sys.dm_exec_sessions WHERE is_user_process = 0) AS system_sessions,
    (SELECT COUNT(*) FROM sys.dm_exec_requests r
        INNER JOIN sys.dm_exec_sessions s ON r.session_id = s.session_id
        WHERE s.is_user_process = 1) AS active_requests,
    (SELECT COUNT(*) FROM sys.dm_exec_requests r
        INNER JOIN sys.dm_exec_sessions s ON r.session_id = s.session_id
        WHERE s.is_user_process = 1 AND r.blocking_session_id <> 0) AS blocked_sessions,
    (SELECT COALESCE(SUM(r.cpu_time), 0) FROM sys.dm_exec_requests r
        INNER JOIN sys.dm_exec_sessions s ON r.session_id = s.session_id
        WHERE s.is_user_process = 1) AS total_cpu_ms,
    (SELECT COALESCE(AVG(CAST(r.cpu_time AS FLOAT)), 0) FROM sys.dm_exec_requests r
        INNER JOIN sys.dm_exec_sessions s ON r.session_id = s.session_id
        WHERE s.is_user_process = 1) AS avg_cpu_ms,
    (SELECT COALESCE(SUM(r.logical_reads), 0) FROM sys.dm_exec_requests r
        INNER JOIN sys.dm_exec_sessions s ON r.session_id = s.session_id
        WHERE s.is_user_process = 1) AS total_logical_reads,
    (SELECT COALESCE(SUM(r.writes), 0) FROM sys.dm_exec_requests r
        INNER JOIN sys.dm_exec_sessions s ON r.session_id = s.session_id
        WHERE s.is_user_process = 1) AS total_writes,
    (SELECT COALESCE(AVG(CAST(r.total_elapsed_time AS FLOAT)), 0) FROM sys.dm_exec_requests r
        INNER JOIN sys.dm_exec_sessions s ON r.session_id = s.session_id
        WHERE s.is_user_process = 1) AS avg_elapsed_ms;
"""

SERVER_INFO_SQL = """
SELECT
    CAST(SERVERPROPERTY('ServerName') AS nvarchar(256)) AS server_name,
    CAST(SERVERPROPERTY('Edition') AS nvarchar(256)) AS edition,
    CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(64)) AS product_version,
    CAST(SERVERPROPERTY('ProductLevel') AS nvarchar(64)) AS product_level,
    (SELECT sqlserver_start_time FROM sys.dm_os_sys_info) AS start_time,
    (SELECT cpu_count FROM sys.dm_os_sys_info) AS cpu_count,
    (SELECT CAST(physical_memory_kb / 1024.0 AS DECIMAL(18, 1)) FROM sys.dm_os_sys_info) AS memory_mb;
"""

SQL_CPU_SQL = """
SELECT TOP 1
    record.value('(./Record/SchedulerMonitorEvent/SystemHealth/ProcessUtilization)[1]', 'int')
        AS sql_cpu_percent
FROM (
    SELECT CONVERT(XML, record) AS record
    FROM sys.dm_os_ring_buffers
    WHERE ring_buffer_type = N'RING_BUFFER_SCHEDULER_MONITOR'
      AND record LIKE N'%<SystemHealth>%'
) AS ring
ORDER BY record.value('(./Record/@id)[1]', 'bigint') DESC;
"""


# --------------------------------------------------------------------------- #
# Endpoints
# --------------------------------------------------------------------------- #
@app.get("/api/health", tags=["sistema"])
def health() -> dict[str, Any]:
    """Comprueba que el API responde y si la base de datos es alcanzable."""
    try:
        with closing(get_db_connection()) as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
        return {"status": "online", "database": "reachable"}
    except Exception as exc:  # noqa: BLE001 - se reporta como estado, no como 500
        logger.warning("Health check sin base de datos: %s", exc)
        return {"status": "degraded", "database": "unreachable"}


@app.get("/api/active-processes", tags=["monitoreo"], dependencies=[Depends(require_api_key)])
def active_processes() -> dict[str, Any]:
    """Procesos de usuario activos con CPU, I/O y duracion."""
    try:
        with closing(get_db_connection()) as conn:
            with conn.cursor() as cursor:
                cursor.execute(ACTIVE_PROCESSES_SQL)
                rows = fetch_all(cursor)
        return {"count": len(rows), "data": rows, "timestamp": time.time()}
    except Exception as exc:  # noqa: BLE001
        raise _handle_db_error("active-processes", exc) from exc


@app.get("/api/blocked-processes", tags=["monitoreo"], dependencies=[Depends(require_api_key)])
def blocked_processes() -> dict[str, Any]:
    """Sesiones bloqueadas y el texto del proceso bloqueador."""
    try:
        with closing(get_db_connection()) as conn:
            with conn.cursor() as cursor:
                cursor.execute(BLOCKED_PROCESSES_SQL)
                rows = fetch_all(cursor)
        return {"count": len(rows), "data": rows, "timestamp": time.time()}
    except Exception as exc:  # noqa: BLE001
        raise _handle_db_error("blocked-processes", exc) from exc


@app.get("/api/server-stats", tags=["monitoreo"], dependencies=[Depends(require_api_key)])
def server_stats() -> dict[str, Any]:
    """Resumen de CPU, conexiones, bloqueos e informacion del servidor."""
    try:
        with closing(get_db_connection()) as conn:
            with conn.cursor() as cursor:
                cursor.execute(SERVER_STATS_SQL)
                stats = fetch_all(cursor)
                cursor.execute(SERVER_INFO_SQL)
                info = fetch_all(cursor)

                sql_cpu_percent: int | None = None
                try:
                    cursor.execute(SQL_CPU_SQL)
                    cpu_row = fetch_all(cursor)
                    if cpu_row:
                        sql_cpu_percent = cpu_row[0].get("sql_cpu_percent")
                except pyodbc.Error:
                    # La DMV de ring buffers requiere VIEW SERVER STATE; es opcional.
                    logger.info("SQL CPU percent no disponible en este servidor.")

        return {
            "stats": stats[0] if stats else {},
            "server": info[0] if info else {},
            "sql_cpu_percent": sql_cpu_percent,
            "timestamp": time.time(),
        }
    except Exception as exc:  # noqa: BLE001
        raise _handle_db_error("server-stats", exc) from exc


@app.post(
    "/api/kill-process/{spid}",
    tags=["acciones"],
    dependencies=[Depends(require_api_key)],
)
def kill_process(spid: str, request: Request) -> dict[str, Any]:
    """
    Termina la sesion indicada por su SPID.

    Validaciones previas obligatorias:
    1. El SPID debe ser un entero positivo.
    2. Debe pertenecer a un proceso de usuario (no del sistema).
    3. La sesion debe existir y estar activa.
    """
    if not spid.isdigit():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El SPID debe ser un numero entero positivo.",
        )

    spid_int = int(spid)
    if spid_int < KILL_MIN_USER_SPID:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"El SPID {spid_int} corresponde a una sesion del sistema y no puede terminarse.",
        )

    # La clave del rate limit es la IP real de la conexion, no una cabecera
    # controlable por el cliente.
    client_id = request.client.host if request.client else "desconocido"
    _enforce_kill_rate_limit(client_id)

    try:
        # Conexion dedicada en modo autocommit: pyodbc abre una transaccion
        # implicita con la primera sentencia y SQL Server rechaza KILL dentro de
        # una transaccion de usuario (error 6115). En autocommit cada sentencia
        # se confirma sola, incluida la validacion previa.
        with closing(get_db_connection(autocommit=True)) as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "SELECT is_user_process FROM sys.dm_exec_sessions WHERE session_id = ?",
                    spid_int,
                )
                row = cursor.fetchone()
                if row is None:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"La sesion {spid_int} no existe o ya termino.",
                    )
                if not row[0]:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=f"El SPID {spid_int} es una sesion interna y no puede terminarse.",
                    )

                # KILL no admite parametros; el valor ya esta validado como entero en rango.
                cursor.execute(f"KILL {spid_int}")

        logger.warning("Sesion %s terminada por solicitud del operador.", spid_int)
        return {"success": True, "spid": spid_int, "message": f"Sesion {spid_int} terminada."}
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise _handle_db_error("kill-process", exc) from exc


# --------------------------------------------------------------------------- #
# WebSocket: snapshots en vivo (opcional; el frontend usa polling por defecto)
# --------------------------------------------------------------------------- #
@app.websocket("/ws/monitor")
async def monitor_socket(
    websocket: WebSocket,
    interval: float = 5.0,
    api_key: str | None = None,
) -> None:
    """Empuja el snapshot combinado cada `interval` segundos.

    La autenticación se realiza mediante el query parameter `api_key` porque
    los WebSocket no exponen cabeceras HTTP de inyección como los endpoints REST.
    """
    if API_KEY:
        if not api_key or not _constant_time_equals(api_key, API_KEY):
            await websocket.close(code=4401)
            return
    await websocket.accept()
    safe_interval = min(max(interval, 1.0), 30.0)
    try:
        while True:
            with closing(get_db_connection()) as conn:
                with conn.cursor() as cursor:
                    cursor.execute(ACTIVE_PROCESSES_SQL)
                    active = fetch_all(cursor)
                    cursor.execute(BLOCKED_PROCESSES_SQL)
                    blocked = fetch_all(cursor)
                    cursor.execute(SERVER_STATS_SQL)
                    stats = fetch_all(cursor)
            await websocket.send_json(
                {
                    "active": active,
                    "blocked": blocked,
                    "stats": stats[0] if stats else {},
                    "timestamp": time.time(),
                }
            )
            await asyncio.sleep(safe_interval)
    except WebSocketDisconnect:
        logger.info("Cliente WebSocket desconectado.")
    except Exception:  # noqa: BLE001
        logger.exception("Error en el canal WebSocket.")
        await websocket.close(code=1011)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
