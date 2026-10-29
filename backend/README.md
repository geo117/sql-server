# Backend — SQL Server Monitor API

API REST de solo lectura (más un canal WebSocket) para monitorear SQL Server en
tiempo real usando DMV. Construida con **FastAPI** y `pyodbc`.

## Requisitos

- Python 3.10+
- El driver ODBC **ODBC Driver 17 for SQL Server** (o el que configures en `DB_DRIVER`).
- Un login con permiso `VIEW SERVER STATE` (y `ALTER ANY CONNECTION` si vas a usar KILL).
- Acceso de lectura a `msdb` para la vista de jobs del Agente (opcional: sin él
  `/api/jobs` responde `available: false` y el resto del dashboard sigue igual).

## Puesta en marcha

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows
pip install -r requirements.txt

copy .env.example .env            # Windows
# edita .env con tus datos reales

uvicorn main:app --reload --port 8000
```

Documentación interactiva: http://localhost:8000/docs

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/health` | Estado del API y de la conexión a la base de datos. |
| `GET` | `/api/active-processes` | Procesos de usuario activos (CPU, lecturas, duración, plan, SQL). |
| `GET` | `/api/blocked-processes` | Bloqueos activos con el T-SQL del proceso bloqueador. |
| `GET` | `/api/server-stats` | Resumen de CPU, sesiones, bloqueos e info del servidor. |
| `GET` | `/api/jobs` | Todos los jobs del Agente con estado, bloqueo, BD y T-SQL en curso. |
| `POST` | `/api/jobs/stop?name={job}` | Detiene un job (`msdb.dbo.sp_stop_job`) con rate limit. |
| `POST` | `/api/kill-process/{spid}` | Termina una sesión (validado y con rate limit). |
| `WS` | `/ws/monitor?interval=5` | Snapshot combinado en vivo. |

## Seguridad

Este servicio expone información sensible (texto de consultas, usuarios, hosts) y
una acción destructiva (`KILL`). Antes de exponerlo fuera de `localhost`:

1. **Define `API_KEY`** en `.env`. Todas las rutas `/api` exigirán la cabecera
   `X-API-Key`. Sin API key el servicio queda abierto.
2. **Restringe `CORS_ORIGINS`** a los orígenes reales del frontend. Nunca `*`.
3. **Usa `DB_ENCRYPT=yes`** en producción (requiere certificado de confianza) y un
   login con los mínimos privilegios posibles.
4. **No subas `.env`** al repositorio (ya está en `.gitignore`).
5. Pon el servicio detrás de HTTPS y, si es posible, de una red interna o VPN.

Controles ya implementados en el código:

- Validación estricta del SPID antes de ejecutar `KILL` (entero, positivo,
  `>= KILL_MIN_USER_SPID`, verificado como `is_user_process`).
- Rate limit de la acción `KILL` (`KILL_RATE_LIMIT_PER_MINUTE`).
- El nombre del job viaja como **parámetro** a `sp_stop_job`, nunca interpolado en
  el comando; además se valida longitud, caracteres de control, existencia del job
  y hay rate limit propio (`STOP_JOB_RATE_LIMIT_PER_MINUTE`).
- Los errores internos se registran en el servidor y no se devuelven al cliente.
- Comparación de API key en tiempo constante.

## Jobs del Agente

`/api/jobs` devuelve **todos** los jobs con la información que consume la tabla
del dashboard:

| Origen | Campos |
|---|---|
| `msdb.dbo.sysjobs` | `job_name`, `description`, `job_owner`, `is_enabled` |
| `msdb.dbo.sysjobsteps` | `database_name`, `subsystem` y `script` del paso en curso (y `step_count`) |
| `msdb.dbo.sysjobactivity` | `started_at`, `elapsed_seconds`, `step_id`/`step_name` (el estado se deduce de `start_execution_date` y `stop_execution_date`; esa tabla no tiene columna de estado) |
| `msdb.dbo.sysjobhistory` | `last_run_at`, `last_run_duration_seconds`, `last_run_status`/`last_run_label`, `last_run_message` y el último paso fallido (`last_failed_step_id`, `last_failed_step_name`, `last_failed_at`, `last_failed_message`) |
| `sys.dm_exec_*` | `session_id`, `blocking_session_id`, `wait_type`, `wait_time_ms` |

El campo `script` es el código realmente ejecutado según el subsistema: en pasos
`TSQL` prioriza el texto vivo de la sesión (`sys.dm_exec_sql_text`) y en
`CmdExec`, `PowerShell`, `SSIS` o replicación usa el comando del paso, porque la
sesión del Agente solo expone su propio envoltorio T-SQL.

El dashboard colorea así:

| Severidad | Cuándo | Color |
|---|---|---|
| `critical` | El job está bloqueado por otra sesión (`blocking_session_id > 0`). | Rojo |
| `warning` | Falló su última ejecución o supera `JOB_STUCK_MINUTES` en ejecución. | Amarillo |
| `running` | Ejecutándose con normalidad. | Verde |
| `ok` | Inactivo o deshabilitado. | Neutro |

Para detener jobs, el login necesita ser propietario del job, `sysadmin` o
miembro de `SQLAgentOperatorRole` en `msdb`; si no, `/api/jobs/stop` responde `403`.
