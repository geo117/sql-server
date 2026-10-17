# Dashboard Monitor de SQL Server

Sistema de monitoreo en tiempo real de SQL Server: procesos activos, bloqueos,
consultas lentas y salud del motor. Pensado para operación y soporte (DBAs).

- **Backend:** API REST + WebSocket en Python (**FastAPI** + `pyodbc`/DMV).
- **Frontend:** SPA en **React 19 + Vite** con tema oscuro empresarial.

```text
scanner sql/
├── backend/                 API FastAPI (ver backend/README.md)
│   ├── main.py              Endpoints, validación y seguridad
│   ├── database.py          Conexión ODBC y serialización
│   ├── requirements.txt
│   └── .env.example
└── frontend/                SPA React (ver frontend/README.md)
    ├── src/
    └── package.json
```

## Cómo ejecutarlo

**1. Backend**

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env      # completa tus credenciales reales
uvicorn main:app --reload --port 8000
```

**2. Frontend**

```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

El frontend habla con el backend a través del proxy de Vite, así que en
desarrollo no necesitas configurar CORS.

## Funcionalidades

- **Panel:** sesiones activas, bloqueos (con pulso rojo), CPU del motor y carga
  de E/S, más tablas y gráficos de tendencia en vivo.
- **Procesos activos:** tabla ordenable y filtrable, filas resaltadas cuando una
  consulta supera el umbral, vista de T-SQL y plan de ejecución.
- **Bloqueos:** cadenas visuales *bloqueador ➔ bloqueado* con el tiempo de espera.
- **KILL:** terminación de sesiones con **doble confirmación** y validación en el
  servidor (SPID entero, de usuario y con rate limit).
- **Ajustes:** conexión, API key, umbrales de alerta y auto-refresco (3/5/10 s).

## Seguridad

Antes de exponer el sistema fuera de `localhost`:

1. Define `API_KEY` en `backend/.env` (todas las rutas `/api` pasan a exigir
   la cabecera `X-API-Key`).
2. Restringe `CORS_ORIGINS` a los orígenes reales. Nunca `*`.
3. Sirve el backend por HTTPS, idealmente detrás de una red interna o VPN.
4. Usa un login de SQL Server con el mínimo privilegio: `VIEW SERVER STATE` y,
   solo si necesitas `KILL`, `ALTER ANY CONNECTION`.
5. No subas `.env` al repositorio (ya está en `.gitignore`).

El backend valida cada `KILL` (entero, `>= KILL_MIN_USER_SPID`, verificado como
proceso de usuario), aplica rate limit y devuelve mensajes genéricos al cliente
sin filtrar detalles internos. El frontend escapa todo el contenido de la base
de datos y confirma dos veces antes de terminar una sesión.
