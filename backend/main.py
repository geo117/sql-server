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
STOP_JOB_RATE_LIMIT_PER_MINUTE = int(os.getenv("STOP_JOB_RATE_LIMIT_PER_MINUTE", "10"))
# Un job en ejecucion que supera este umbral se marca como "sin respuesta".
JOB_STUCK_MINUTES = int(os.getenv("JOB_STUCK_MINUTES", "60"))
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


_action_attempts: dict[str, deque[float]] = defaultdict(deque)


def _enforce_action_rate_limit(action: str, client_id: str, limit: int) -> None:
    """Limita las acciones destructivas (KILL, detener un job) por cliente."""
    now = time.monotonic()
    window = _action_attempts[f"{action}:{client_id}"]
    while window and now - window[0] > 60:
        window.popleft()
    if len(window) >= limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiadas solicitudes de esta accion. Espera un momento antes de reintentar.",
        )
    window.append(now)


def _handle_db_error(endpoint: str, exc: Exception) -> HTTPException:
    """Registra el detalle real y devuelve un mensaje generico al cliente."""
    logger.exception("[%s] Error de base de datos", endpoint)
    message = "No se pudo completar la consulta en SQL Server."
    if isinstance(exc, pyodbc.Error):
        message = "Error de conexion o de ejecucion en SQL Server. Revisa la configuracion."
    return HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=message)


def _to_int(value: Any) -> int | None:
    """Convierte a entero los valores que pyodbc entrega como Decimal/str/None."""
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


_JOB_RUN_STATUS = {
    0: "Falló",
    1: "Correcto",
    2: "Reintentado",
    3: "Cancelado",
    4: "En curso",
}


def _history_timestamp(run_date: Any, run_time: Any) -> str | None:
    """Combina sysjobhistory.run_date (yyyymmdd) y run_time (hhmmss) en ISO."""
    day = _to_int(run_date)
    clock = _to_int(run_time)
    if not day or not clock:
        return None
    d = str(day).zfill(8)
    t = str(clock).zfill(6)
    return f"{d[0:4]}-{d[4:6]}-{d[6:8]}T{t[0:2]}:{t[2:4]}:{t[4:6]}"


def _duration_seconds(raw: Any) -> int | None:
    """Convierte sysjobhistory.run_duration (hhmmss) a segundos."""
    value = _to_int(raw)
    if value is None:
        return None
    hours, rest = divmod(value, 10000)
    minutes, seconds = divmod(rest, 100)
    return hours * 3600 + minutes * 60 + seconds


def _describe_job(row: dict[str, Any]) -> dict[str, Any]:
    """Normaliza una fila de JOBS_SQL y calcula su estado y severidad.

    Severidades que usa el frontend:
    - `critical` (rojo): el job esta bloqueado por otra sesion.
    - `warning` (amarillo): fallo su ultima ejecucion o lleva demasiado tiempo
      ejecutandose sin responder.
    - `running`: ejecutandose con normalidad.
    - `ok`: inactivo, deshabilitado o sin ejecuciones.
    """
    started = row.get("start_execution_date")
    is_running = bool(started) and not row.get("stop_execution_date")
    elapsed = _to_int(row.get("elapsed_seconds")) if is_running else None
    blocking = _to_int(row.get("blocking_session_id")) or 0
    run_status = _to_int(row.get("last_run_status"))
    enabled = bool(row.get("is_enabled"))
    stuck_seconds = max(0, JOB_STUCK_MINUTES) * 60

    if is_running and blocking > 0:
        severity, status_label = "critical", "Bloqueado"
    elif is_running and elapsed is not None and elapsed >= stuck_seconds:
        severity, status_label = "warning", "Sin respuesta"
    elif is_running:
        severity, status_label = "running", "Ejecutando"
    elif not enabled:
        # Un job deshabilitado no debe llenar el panel de amarillos por un fallo
        # antiguo: se informa su estado real y se deja el color neutro.
        severity, status_label = "ok", "Deshabilitado"
    elif run_status == 0:
        severity, status_label = "warning", "Falló"
    else:
        severity, status_label = "ok", "Inactivo"

    subsystem = (row.get("step_subsystem") or "").strip()
    live = (row.get("live_command") or "").strip()
    step_command = (row.get("step_command") or "").strip()
    # En pasos T-SQL el texto vivo es la sentencia exacta que corre ahora. En
    # CmdExec, PowerShell o SSIS la sesion solo expone el envoltorio del Agente,
    # asi que el script real es el comando del paso.
    if subsystem.upper() == "TSQL" and live:
        command = live
    else:
        command = step_command or live

    failed_message = (row.get("last_failed_message") or "").strip()

    return {
        "job_id": row.get("job_id"),
        "job_name": row.get("job_name") or "—",
        "description": (row.get("job_description") or "").strip(),
        "job_owner": row.get("job_owner") or "—",
        "is_enabled": enabled,
        "is_running": is_running,
        "is_blocked": blocking > 0,
        "severity": severity,
        "status": status_label,
        "started_at": started,
        "elapsed_seconds": elapsed,
        "step_id": _to_int(row.get("current_step_id")) or _to_int(row.get("last_executed_step_id")),
        "step_name": row.get("current_step_name"),
        "step_count": _to_int(row.get("step_count")) or 0,
        "database_name": row.get("step_database") or "—",
        "subsystem": row.get("step_subsystem"),
        "script": command or None,
        "session_id": _to_int(row.get("session_id")),
        "blocking_session_id": blocking or None,
        "wait_type": row.get("wait_type"),
        "wait_time_ms": _to_int(row.get("wait_time")),
        "current_command": command or None,
        "last_run_status": run_status,
        "last_run_label": _JOB_RUN_STATUS.get(run_status) if run_status is not None else None,
        "last_run_at": _history_timestamp(row.get("last_run_date"), row.get("last_run_time")),
        "last_run_duration_seconds": _duration_seconds(row.get("last_run_duration")),
        "last_run_message": (row.get("last_run_message") or "").strip() or None,
        "last_failed_at": _history_timestamp(
            row.get("last_failed_run_date"), row.get("last_failed_run_time")
        ),
        "last_failed_step_id": _to_int(row.get("last_failed_step_id")),
        "last_failed_step_name": row.get("last_failed_step_name"),
        "last_failed_message": failed_message or None,
    }


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
# Jobs del Agente SQL Server (msdb)
# --------------------------------------------------------------------------- #
# sysjobactivity guarda una fila por job y sesion del Agente. La sesion activa
# es la de mayor session_id; un job esta en ejecucion cuando tiene fecha de
# inicio y aun no tiene fecha de fin.
JOBS_CURRENT_SESSION = "(SELECT MAX(session_id) FROM msdb.dbo.sysjobactivity)"

JOBS_SUMMARY_SQL = f"""
SELECT
    (SELECT COUNT(*) FROM msdb.dbo.sysjobs) AS total_jobs,
    (SELECT COUNT(*) FROM msdb.dbo.sysjobs WHERE enabled = 1) AS enabled_jobs,
    (SELECT COUNT(*) FROM msdb.dbo.sysjobactivity AS a
        WHERE a.session_id = {JOBS_CURRENT_SESSION}
          AND a.start_execution_date IS NOT NULL
          AND a.stop_execution_date IS NULL) AS running_jobs,
    (SELECT COUNT(*) FROM msdb.dbo.sysjobhistory AS h
        WHERE h.step_id = 0
          AND h.run_status = 0
          AND h.run_date >= CONVERT(int, CONVERT(varchar(8), DATEADD(DAY, -1, GETDATE()), 112)))
        AS failed_last_24h;
"""

# Todos los jobs del Agente con lo necesario para la tabla del dashboard.
#
# Origen de cada dato:
# - sysjobs:            nombre, descripcion, propietario y habilitado/deshabilitado.
# - sysjobsteps:        base de datos afectada, subsistema y script exacto del paso
#                       en curso (TSQL, CmdExec, PowerShell, SSIS...).
# - sysjobactivity:     si esta corriendo, desde cuando y en que paso va.
# - sysjobhistory:      ultima ejecucion (fecha, duracion, resultado y mensaje) y
#                       el ultimo paso que fallo, con su mensaje de error detallado.
# - sys.dm_exec_*:      sesion viva del Agente para detectar bloqueos y el texto
#                       T-SQL que se esta ejecutando en ese instante.
#
# La sesion viva se localiza por `program_name`, que incluye el job_id en
# hexadecimal con el formato "SQLAgent - TSQL JobStep (Job 0x... : Step N)";
# ese hex es el mismo que devuelve CONVERT(varchar(34), CONVERT(binary(16), job_id), 1).
JOBS_SQL = """
SELECT
    CONVERT(varchar(36), j.job_id) AS job_id,
    j.name AS job_name,
    j.description AS job_description,
    SUSER_SNAME(j.owner_sid) AS job_owner,
    j.enabled AS is_enabled,
    (SELECT COUNT(*) FROM msdb.dbo.sysjobsteps AS sc WHERE sc.job_id = j.job_id) AS step_count,
    ja.start_execution_date,
    ja.stop_execution_date,
    ja.last_executed_step_id,
    step.step_id AS current_step_id,
    step.step_name AS current_step_name,
    step.database_name AS step_database,
    step.subsystem AS step_subsystem,
    step.command AS step_command,
    CASE
        WHEN ja.start_execution_date IS NOT NULL AND ja.stop_execution_date IS NULL
            THEN DATEDIFF(SECOND, ja.start_execution_date, GETDATE())
    END AS elapsed_seconds,
    live.session_id,
    live.blocking_session_id,
    live.wait_type,
    live.wait_time,
    live.request_status,
    live.live_command,
    hist.run_status AS last_run_status,
    hist.run_date AS last_run_date,
    hist.run_time AS last_run_time,
    hist.run_duration AS last_run_duration,
    hist.message AS last_run_message,
    failed.step_id AS last_failed_step_id,
    failed.step_name AS last_failed_step_name,
    failed.run_date AS last_failed_run_date,
    failed.run_time AS last_failed_run_time,
    failed.message AS last_failed_message
FROM msdb.dbo.sysjobs AS j
OUTER APPLY (
    SELECT TOP 1
        a.start_execution_date,
        a.stop_execution_date,
        a.last_executed_step_id
    FROM msdb.dbo.sysjobactivity AS a
    WHERE a.job_id = j.job_id
      AND a.session_id = (SELECT MAX(session_id) FROM msdb.dbo.sysjobactivity)
) AS ja
OUTER APPLY (
    SELECT TOP 1
        s.step_id,
        s.step_name,
        s.database_name,
        s.subsystem,
        s.command
    FROM msdb.dbo.sysjobsteps AS s
    WHERE s.job_id = j.job_id
      AND s.step_id = COALESCE(ja.last_executed_step_id, 1)
) AS step
OUTER APPLY (
    SELECT TOP 1
        se.session_id,
        rq.blocking_session_id,
        rq.wait_type,
        rq.wait_time,
        rq.status AS request_status,
        txt.text AS live_command
    FROM sys.dm_exec_sessions AS se
    LEFT JOIN sys.dm_exec_requests AS rq ON rq.session_id = se.session_id
    OUTER APPLY sys.dm_exec_sql_text(rq.sql_handle) AS txt
    WHERE se.is_user_process = 1
      AND se.program_name LIKE
          'SQLAgent - TSQL JobStep (Job '
          + CONVERT(varchar(34), CONVERT(binary(16), j.job_id), 1) + ' %'
    ORDER BY se.session_id DESC
) AS live
OUTER APPLY (
    -- Resultado global de la ultima ejecucion (step_id = 0).
    SELECT TOP 1
        h.run_status,
        h.run_date,
        h.run_time,
        h.run_duration,
        h.message
    FROM msdb.dbo.sysjobhistory AS h
    WHERE h.job_id = j.job_id
      AND h.step_id = 0
    ORDER BY h.run_date DESC, h.run_time DESC
) AS hist
OUTER APPLY (
    -- Ultimo paso que fallo o se cancelo: ahi vive el error detallado.
    SELECT TOP 1
        f.step_id,
        f.step_name,
        f.run_date,
        f.run_time,
        f.message
    FROM msdb.dbo.sysjobhistory AS f
    WHERE f.job_id = j.job_id
      AND f.step_id > 0
      AND f.run_status IN (0, 3)
    ORDER BY f.run_date DESC, f.run_time DESC, f.step_id DESC
) AS failed
ORDER BY j.name;"""


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


@app.get("/api/jobs", tags=["monitoreo"], dependencies=[Depends(require_api_key)])
def agent_jobs() -> dict[str, Any]:
    """Todos los jobs del Agente SQL Server con su estado actual.

    Devuelve la lista completa (no solo los que se estan ejecutando) porque el
    dashboard los muestra todos, marcando en amarillo los que fallaron o llevan
    demasiado tiempo y en rojo los que estan bloqueados.

    El acceso a `msdb` es opcional: si el login no tiene permisos o el Agente no
    esta disponible se devuelve `available: false` con una lista vacia, en lugar
    de un error, para no romper el resto del dashboard.
    """
    try:
        with closing(get_db_connection()) as conn:
            with conn.cursor() as cursor:
                cursor.execute(JOBS_SUMMARY_SQL)
                summary_rows = fetch_all(cursor)
                cursor.execute(JOBS_SQL)
                job_rows = fetch_all(cursor)

        jobs = [_describe_job(row) for row in job_rows]
        # Lo que exige atencion primero: bloqueados, con fallas y en ejecucion.
        order = {"critical": 0, "warning": 1, "running": 2, "ok": 3}
        jobs.sort(key=lambda job: (order.get(job["severity"], 4), job["job_name"].lower()))

        return {
            "available": True,
            "summary": summary_rows[0] if summary_rows else {},
            "jobs": jobs,
            "running": [job for job in jobs if job["is_running"]],
            "timestamp": time.time(),
        }
    except pyodbc.Error as exc:
        # Permisos sobre msdb, Agente detenido o edicion sin Agente: no es fatal.
        logger.warning("Jobs del Agente no disponibles: %s", exc)
        return {
            "available": False,
            "summary": {},
            "jobs": [],
            "running": [],
            "detail": "No se pudo leer msdb. Revisa que el Agente SQL Server exista y que el login tenga acceso.",
            "timestamp": time.time(),
        }
    except Exception as exc:  # noqa: BLE001
        raise _handle_db_error("jobs", exc) from exc


@app.post(
    "/api/jobs/stop",
    tags=["acciones"],
    dependencies=[Depends(require_api_key)],
)
def stop_job(request: Request, name: str = "") -> dict[str, Any]:
    """Detiene un job del Agente con `msdb.dbo.sp_stop_job`.

    El nombre viaja como query parameter (`?name=`) y no como segmento de ruta
    porque los nombres de job admiten `/`, `?` o `#`, que romperian la URL.
    Tampoco se interpola en el comando: se envia como parametro a `sp_stop_job`,
    que lo trata como identificador y no como SQL ejecutable.
    """
    job_name = name.strip()
    if not job_name or len(job_name) > 128:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El nombre del job debe tener entre 1 y 128 caracteres.",
        )
    if any(ord(char) < 32 for char in job_name):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El nombre del job contiene caracteres de control no permitidos.",
        )

    client_id = request.client.host if request.client else "desconocido"
    _enforce_action_rate_limit("stop-job", client_id, STOP_JOB_RATE_LIMIT_PER_MINUTE)

    try:
        # autocommit, igual que KILL: la accion no debe quedar en una transaccion
        # abierta que retenga bloqueos mientras el Agente intenta detenerse.
        with closing(get_db_connection(autocommit=True)) as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT name FROM msdb.dbo.sysjobs WHERE name = ?", job_name)
                if cursor.fetchone() is None:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"El job '{job_name}' no existe en este servidor.",
                    )

                cursor.execute("EXEC msdb.dbo.sp_stop_job @job_name = ?", job_name)
                # sp_stop_job devuelve mensajes informativos: hay que consumirlos
                # para que la conexion quede libre antes de cerrarla.
                while cursor.nextset():
                    pass

        logger.warning("Job '%s' detenido por solicitud del operador.", job_name)
        return {
            "success": True,
            "job_name": job_name,
            "message": f"Se solicito detener el job '{job_name}'.",
        }
    except HTTPException:
        raise
    except pyodbc.Error as exc:
        text = str(exc).lower()
        if "not currently running" in text or "no está en ejecución" in text or "14262" in text:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"El job '{job_name}' ya no esta en ejecucion.",
            ) from exc
        if "permission" in text or "denied" in text or "15247" in text:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="El login configurado no tiene permisos para detener jobs del Agente.",
            ) from exc
        raise _handle_db_error("stop-job", exc) from exc
    except Exception as exc:  # noqa: BLE001
        raise _handle_db_error("stop-job", exc) from exc


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
    _enforce_action_rate_limit("kill", client_id, KILL_RATE_LIMIT_PER_MINUTE)

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
