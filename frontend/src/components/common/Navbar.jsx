import { useLocation } from 'react-router-dom'
import { FaArrowRotateRight, FaBars } from 'react-icons/fa6'

import { useMonitor } from '../../context/useMonitor'
import { useNow } from '../../hooks/useNow'
import { formatClock, timeAgo } from '../../utils/format'
import ConnectionBadge from './ConnectionBadge'
import RefreshControl from './RefreshControl'

const ROUTE_META = {
  '/': { kicker: 'Monitoreo', title: 'Panel de procesos' },
  '/bloqueos': { kicker: 'Contención', title: 'Bloqueos activos' },
  '/ajustes': { kicker: 'Configuración', title: 'Ajustes y conexión' },
}

export default function Navbar({ onOpenSidebar }) {
  const { pathname } = useLocation()
  const now = useNow(1000)
  const { connection, lastUpdated, isRefreshing, refresh, settings, updateSettings, error } =
    useMonitor()

  const meta = ROUTE_META[pathname] ?? ROUTE_META['/']

  return (
    <header className="app-topbar">
      <button
        type="button"
        className="icon-btn topbar__menu"
        onClick={onOpenSidebar}
        aria-label="Abrir menú de navegación"
        aria-controls="app-sidebar"
      >
        <FaBars />
      </button>

      <div className="topbar__heading">
        <span className="topbar__eyebrow">{meta.kicker}</span>
        <h1 className="topbar__title">{meta.title}</h1>
      </div>

      <div className="topbar__tools">
        <RefreshControl value={settings.refreshInterval} onChange={(value) => updateSettings({ refreshInterval: value })} />

        <ConnectionBadge state={connection} detail={error ?? undefined} />

        <div className="topbar__meta">
          <span className="topbar__meta-key">Última lectura</span>
          <span className="topbar__meta-val" title={lastUpdated ? formatClock(lastUpdated) : ''}>
            {lastUpdated ? timeAgo(lastUpdated, now) : '—'}
          </span>
        </div>

        <button
          type="button"
          className="icon-btn"
          onClick={refresh}
          disabled={isRefreshing}
          aria-label="Actualizar ahora"
          title="Actualizar ahora"
        >
          <FaArrowRotateRight className={isRefreshing ? 'spin' : undefined} />
        </button>
      </div>
    </header>
  )
}
