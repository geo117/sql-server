# Dashboard Monitor de SQL Server

Sistema de monitoreo en tiempo real de SQL Server: procesos activos, bloqueos,
consultas lentas y salud del motor. Pensado para operación y soporte (DBAs).

- **Backend:** API REST + WebSocket en Python (**FastAPI** + `pyodbc` sobre DMV).
- **Frontend:** SPA en **React 19 + Vite** con tema oscuro empresarial.
- **UI:** Bootstrap 5 / React Bootstrap, React Icons, React Router y SweetAlert2.

## Arquitectura

```text
scanner sql/
├── backend/                     API FastAPI (ver backend/README.md)
│   ├── main.py                  Endpoints, validación y seguridad
│   ├── database.py              Conexión ODBC, configuración y serialización
│   ├── requirements.txt
│   └── .env.example
├── frontend/                    SPA React (ver frontend/README.md)
│   ├── src/
│   │   ├── assets/styles/       Sistema de diseño (tokens + componentes)
│   │   ├── components/
│   │   │   ├── common/          Sidebar, Navbar, tarjetas, píldoras, skeletons…
│   │   │   ├── dashboard/       Tablas, cadena de bloqueos, modal de detalle
│   │   │   └── layout/          DashboardLayout (shell + navegación)
│   │   ├── context/             Estado global y polling (MonitorProvider)
│   │   ├── hooks/               useNow, useKillProcess, useProcessDetail
│   │   ├── pages/               Dashboard, Bloqueos, Ajustes
│   │   ├── services/            Cliente HTTP y preferencias
│   │   └── utils/               Formato, procesos, escape y alertas
│   ├── vite.config.js           Proxy /api y /ws hacia el backend
│   └── package.json
├── analisis-seguridad/          Informe de análisis de seguridad
└── especificaciones_del_proyecto_y_prompt_de_construcci_n.md
```

## Requisitos

- Python 3.10+ y el driver **ODBC Driver 17 for SQL Server** (o el que definas
  en `DB_DRIVER`).
- Node.js 20.19+ (recomendado para Vite 8).
- Un login de SQL Server con `VIEW SERVER STATE` y, solo si se usará `KILL`,
  `ALTER ANY CONNECTION`.

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

Documentación interactiva del API: <http://localhost:8000/docs>

**2. Frontend**

```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

El frontend habla con el backend a través del proxy de Vite (`/api` y `/ws`),
así que en desarrollo no necesitas configurar CORS.

## Configuración

### Backend (`backend/.env`)

| Variable | Por defecto | Descripción |
|---|---|---|
| `DB_SERVER` | `localhost` | Servidor/instancia de SQL Server. |
| `DB_NAME` | `master` | Base de datos inicial de la conexión. |
| `DB_USER` / `DB_PASSWORD` | — | Credenciales de autenticación SQL Server. |
| `DB_TRUSTED_CONNECTION` | `no` | `yes` usa autenticación Windows y exige dejar usuario/contraseña vacíos. |
| `DB_DRIVER` | `{ODBC Driver 17 for SQL Server}` | Driver ODBC instalado. |
| `DB_ENCRYPT` | `yes` | Cifrado de la conexión. |
| `DB_TRUST_SERVER_CERTIFICATE` | `no` | `yes` solo en entornos internos de confianza. |
| `DB_TIMEOUT` | `15` | Segundos de espera del login a SQL Server. |
| `API_KEY` | vacío | Si se define, todas las rutas `/api` exigen `X-API-Key`. |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Lista blanca de orígenes separada por comas. |
| `KILL_MIN_USER_SPID` | `51` | SPIDs menores se consideran de sistema y no se pueden terminar. |
| `KILL_RATE_LIMIT_PER_MINUTE` | `10` | Máximo de intentos de `KILL` por minuto y cliente. |

`database.py` valida la configuración al conectar: si
`DB_TRUSTED_CONNECTION=yes` y además hay usuario/contraseña, la conexión falla
con un mensaje explícito para evitar configuraciones contradictorias.

### Frontend (`frontend/.env`)

| Variable | Por defecto | Descripción |
|---|---|---|
| `VITE_API_BASE_URL` | vacío | URL absoluta del backend. Vacío = mismo origen (proxy de Vite). |

## API

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/health` | Estado del API y de la conexión a la base de datos. |
| `GET` | `/api/active-processes` | Procesos de usuario activos (CPU, lecturas, duración, T-SQL y plan). |
| `GET` | `/api/blocked-processes` | Bloqueos activos con usuario, host y T-SQL del bloqueador. |
| `GET` | `/api/server-stats` | Sesiones, bloqueos, CPU, E/S e información de la instancia. |
| `POST` | `/api/kill-process/{spid}` | Termina una sesión (validado y con rate limit). |
| `WS` | `/ws/monitor?interval=5` | Snapshot combinado en vivo (el frontend usa polling por defecto). |

Los endpoints que consultan SQL Server son síncronos (`def`), de modo que
FastAPI los ejecuta en su pool de hilos y no bloquea el bucle de eventos.

## Funcionalidades

### Panel (`/`)

- Franja de la instancia: nombre, edición, versión, arranque, núcleos y memoria.
- Métricas en vivo: sesiones activas, procesos bloqueados, CPU del motor y carga
  de E/S, con resaltado de severidad.
- Sparklines de tendencia (últimas 40 lecturas) para sesiones, bloqueos y CPU.
- Tabla de procesos activos ordenable y filtrable por texto, bloqueados o
  consultas lentas (máximo de 300 filas renderizadas).
- Modal de detalle con T-SQL y plan de ejecución.
- Banner de conexión: aviso de datos parciales o sin conexión con reintento.

### Bloqueos (`/bloqueos`)

- Cadenas visuales *bloqueador ➔ bloqueado* con el tiempo de espera.
- Umbrales configurables de advertencia y espera crítica (ámbar/rojo).
- Acceso al detalle de las sesiones implicadas y a la acción `KILL`.

### Ajustes (`/ajustes`)

- Umbral de consulta lenta, advertencia de espera y espera crítica.
- Auto-refresco configurable: 3 s, 5 s, 10 s o pausa.
- Restauración de valores por defecto.
- Recordatorios de seguridad y última lectura.

Las preferencias se guardan en `sessionStorage` (se pierden al cerrar la
pestaña) y se validan al cargarlas para descartar valores corruptos.

### Acción KILL

- Doble confirmación en el cliente con el detalle de la sesión.
- Validación en el servidor: SPID entero, positivo, `>= KILL_MIN_USER_SPID` y
  verificado como proceso de usuario.
- Rate limit por IP real de la conexión.
- Ejecución en una conexión dedicada con `autocommit=True`: `KILL` no puede
  correr dentro de una transacción de usuario (error 6115 de SQL Server).

### Navegación y layout

- **Escritorio:** el sidebar arranca contraído como rail de iconos (76 px).
  El botón de hamburguesa de la navbar lo expande (250 px) y lo vuelve a
  contraer; al elegir una opción del menú se contrae automáticamente.
- Los iconos conservan `title` y etiqueta accesible cuando el texto está oculto;
  el badge de bloqueos se mantiene visible sobre el icono.
- `Escape` cierra el menú. El estado expandido se asocia a la ruta actual, por
  lo que una navegación lo devuelve al modo compacto.
- **Móvil/tablet (≤ 1024 px):** el sidebar funciona como drawer fuera del
  canvas, con velo de fondo; se abre con la hamburguesa y se cierra al navegar,
  con `Escape` o al tocar el velo.
- La transición de ancho respeta `prefers-reduced-motion`.

## Cambios recientes

- Sidebar contraíble: rail de iconos por defecto, expansión desde la navbar y
  contracción automática al elegir una opción.
- `DB_TIMEOUT` sube a 15 s por defecto y el cliente HTTP espera hasta 20 s
  (incluido `KILL` y las lecturas del panel) para tolerar latencia de red.
- `KILL` se ejecuta en una conexión con `autocommit=True`, evitando el error
  6115 de SQL Server.
- Los endpoints de base de datos pasan a funciones síncronas para que FastAPI
  las ejecute en su pool de hilos.
- Validación temprana de configuraciones contradictorias en `database.py`
  (autenticación Windows junto con usuario/contraseña).

## Seguridad

Antes de exponer el sistema fuera de `localhost`:

1. Define `API_KEY` en `backend/.env` (todas las rutas `/api` pasan a exigir la
   cabecera `X-API-Key`).
2. Restringe `CORS_ORIGINS` a los orígenes reales. Nunca `*`.
3. Sirve el backend por HTTPS, idealmente detrás de una red interna o VPN.
4. Usa un login de SQL Server con el mínimo privilegio: `VIEW SERVER STATE` y,
   solo si necesitas `KILL`, `ALTER ANY CONNECTION`.
5. No subas `.env` al repositorio (ya está en `.gitignore`).

El backend valida cada `KILL` (entero, `>= KILL_MIN_USER_SPID`, verificado como
proceso de usuario), aplica rate limit, compara la API key en tiempo constante y
devuelve mensajes genéricos al cliente sin filtrar detalles internos. El
frontend escapa todo el contenido de la base de datos (sin
`dangerouslySetInnerHTML`), usa `utils/escape.js` en los diálogos de SweetAlert2
y confirma dos veces antes de terminar una sesión. La API key y las preferencias
viven en `sessionStorage`, reduciendo el tiempo de exposición ante un XSS.

## Calidad y compilación

```bash
cd frontend
npm run lint      # ESLint
npm run build     # build de producción en dist/
npm run preview   # sirve el build
```

## Documentación adicional

- [`backend/README.md`](backend/README.md) — API, variables y controles de seguridad.
- [`frontend/README.md`](frontend/README.md) — arquitectura, sistema de diseño y accesibilidad.
- [`analisis-seguridad/README.md`](analisis-seguridad/README.md) — análisis de seguridad del proyecto.
