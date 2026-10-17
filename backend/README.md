# Backend — SQL Server Monitor API

API REST de solo lectura (más un canal WebSocket) para monitorear SQL Server en
tiempo real usando DMV. Construida con **FastAPI** y `pyodbc`.

## Requisitos

- Python 3.10+
- El driver ODBC **ODBC Driver 17 for SQL Server** (o el que configures en `DB_DRIVER`).
- Un login con permiso `VIEW SERVER STATE` (y `ALTER ANY CONNECTION` si vas a usar KILL).

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
- Los errores internos se registran en el servidor y no se devuelven al cliente.
- Comparación de API key en tiempo constante.
