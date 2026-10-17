"""
Capa de acceso a SQL Server.

Responsabilidades:
- Construir la cadena de conexion ODBC a partir de variables de entorno.
- Entregar conexiones nuevas; el llamador las cierra con `contextlib.closing`.
- Serializar filas de pyodbc a tipos JSON-seguros.

Notas de seguridad:
- Ninguna credencial se escribe en el codigo: todo viene de entorno (.env).
- `Encrypt` y `TrustServerCertificate` son configurables por entorno.
"""

from __future__ import annotations

import os
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any

import pyodbc
from dotenv import load_dotenv

load_dotenv()


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "y", "on"}


DB_SERVER = os.getenv("DB_SERVER", "localhost")
DB_NAME = os.getenv("DB_NAME", "master")
DB_USER = os.getenv("DB_USER", "")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_DRIVER = os.getenv("DB_DRIVER", "{ODBC Driver 17 for SQL Server}")
DB_TRUSTED_CONNECTION = _env_bool("DB_TRUSTED_CONNECTION", False)
DB_ENCRYPT = os.getenv("DB_ENCRYPT", "no")
DB_TRUST_SERVER_CERTIFICATE = os.getenv("DB_TRUST_SERVER_CERTIFICATE", "yes")
DB_TIMEOUT = int(os.getenv("DB_TIMEOUT", "5"))


def build_connection_string() -> str:
    """Construye la cadena ODBC segun el modo de autenticacion activo."""
    parts = [
        f"DRIVER={DB_DRIVER}",
        f"SERVER={DB_SERVER}",
        f"DATABASE={DB_NAME}",
        f"Encrypt={DB_ENCRYPT}",
        f"TrustServerCertificate={DB_TRUST_SERVER_CERTIFICATE}",
    ]

    if DB_TRUSTED_CONNECTION:
        parts.append("Trusted_Connection=yes")
    else:
        parts.append(f"UID={DB_USER}")
        parts.append(f"PWD={DB_PASSWORD}")

    return ";".join(parts) + ";"


def get_db_connection() -> pyodbc.Connection:
    """Abre una conexion nueva.

    Devuelve la conexion directamente (como en la especificacion). El llamador
    es responsable de cerrarla, p. ej. con `contextlib.closing(get_db_connection())`.
    """
    return pyodbc.connect(build_connection_string(), timeout=DB_TIMEOUT)


def _to_json_safe(value: Any) -> Any:
    """Convierte tipos de pyodbc a algo serializable por JSON."""
    if value is None:
        return None
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (bytes, bytearray)):
        # Los planes de ejecucion llegan como XML en bytes.
        return value.decode("utf-8", errors="replace")
    if isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def fetch_all(cursor: pyodbc.Cursor) -> list[dict[str, Any]]:
    """Serializa todas las filas del cursor a una lista de diccionarios."""
    if cursor.description is None:
        return []

    columns = [column[0] for column in cursor.description]
    rows: list[dict[str, Any]] = []
    for row in cursor.fetchall():
        rows.append({col: _to_json_safe(row[idx]) for idx, col in enumerate(columns)})
    return rows
