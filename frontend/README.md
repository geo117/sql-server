# Frontend — SQL Server Monitor

SPA en **React 19 + Vite** para monitorear SQL Server en tiempo real: procesos
activos, bloqueos y salud del motor. Consume el API de `../backend`.

## Puesta en marcha

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # build de producción en dist/
npm run lint       # ESLint
```

En desarrollo, Vite redirige `/api` y `/ws` a `http://localhost:8000`
(ver `vite.config.js`), así que no hay que tocar CORS ni la URL del API.

## Variables de entorno

Copia `.env.example` a `.env` solo si sirves el backend en otro origen:

```text
VITE_API_BASE_URL=          # vacío = mismo origen (proxy de Vite)
```

La URL y la API key también se pueden cambiar en caliente desde **Ajustes**.

## Estructura

```text
src/
├── assets/styles/custom.css      Sistema de diseño (tokens + componentes)
├── components/
│   ├── common/                   BrandMark, Sidebar, Navbar, StatCard,
│   │                             Sparkline, Pill, EmptyState, Skeleton…
│   ├── dashboard/                ActiveProcessesTable, BlockedProcessesTable,
│   │                             BlockingChain, ProcessDetailModal, EngineStrip
│   └── layout/DashboardLayout.jsx
├── context/                      Estado global (provider, contexto y hook)
├── hooks/                        useNow, useKillProcess, useProcessDetail
├── pages/                        DashboardPage, BlockedPage, SettingsPage
├── services/                     api.js (cliente HTTP), settings.js (preferencias)
├── utils/                        format, process, escape, alerts
├── App.jsx
└── main.jsx
```

## Rutas

| Ruta | Vista |
|---|---|
| `/` | Panel: métricas, tendencias, jobs del Agente y tabla de procesos activos. |
| `/bloqueos` | Cadenas de contención bloqueador ➔ bloqueado. |
| `/ajustes` | Conexión, API key, umbrales y seguridad. |

## Sistema de diseño

Modo **Operate**: densidad alta, escaneo rápido y señalización clara de
severidad. La paleta es la de la especificación y se aplica mediante tokens.

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#0F172A` | Fondo principal |
| `--surface` | `#1E293B` | Paneles y tarjetas |
| `--text` | `#F8FAFC` | Texto principal |
| `--primary` | `#2563EB` | Acción principal |
| `--danger` | `#EF4444` | Bloqueos y acciones destructivas |
| `--warning` | `#F59E0B` | Esperas y consultas lentas |
| `--success` | `#10B981` | Estado normal |

**Tipografía** (deliberada, no genérica):
- `Space Grotesk` — títulos y cifras grandes.
- `IBM Plex Sans` — interfaz y texto.
- `JetBrains Mono` — todos los datos: SPID, ms, lecturas, T-SQL.

**Elemento firma:** la *cadena de contención* en `/bloqueos`, donde el flujo
bloqueador ➔ bloqueado se dibuja con el tiempo de espera como intensidad.

## Accesibilidad

- Foco visible en todo el producto y enlace "Saltar al contenido".
- Tablas ordenables con `aria-sort` y botones de cabecera accesibles por teclado.
- Estados con color **+** icono **+** texto (nunca solo color).
- `role="status"` para la conexión, catchers de error y estados de carga.
- `prefers-reduced-motion` desactiva animaciones y el flujo de las cadenas.
- Contraste de texto secundario ≥ 4,5:1 sobre sus superficies.

## Seguridad

- La **API key** se guarda en el navegador (`localStorage`) y se envía en la
  cabecera `X-API-Key`. Úsala siempre con HTTPS y una red interna o VPN.
- No se usa `dangerouslySetInnerHTML`. Todo el contenido que viene de la base de
  datos lo escapa React; los diálogos de SweetAlert2 usan `utils/escape.js`.
- La acción `KILL` exige **dos confirmaciones** con el detalle de la sesión.
- `sanitizeBaseUrl` solo admite rutas relativas o URLs `http(s)`.
