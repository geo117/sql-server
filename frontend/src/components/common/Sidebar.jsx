import { NavLink } from 'react-router-dom'
import { FaGaugeHigh, FaGear, FaLinkSlash } from 'react-icons/fa6'

import { useMonitor } from '../../context/useMonitor'
import BrandMark from './BrandMark'
import ConnectionBadge from './ConnectionBadge'

const NAV_ITEMS = [
  { to: '/', end: true, label: 'Panel', icon: <FaGaugeHigh /> },
  { to: '/bloqueos', label: 'Bloqueos', icon: <FaLinkSlash />, badge: 'blocked' },
  { to: '/ajustes', label: 'Ajustes', icon: <FaGear /> },
]

export default function Sidebar({ open = false, onNavigate }) {
  const { blockedCount, serverStats, connection } = useMonitor()
  const server = serverStats?.server ?? {}

  return (
    <aside
      id="app-sidebar"
      className={`app-sidebar${open ? ' is-open' : ''}`}
      aria-label="Navegación principal"
    >
      <div className="brand">
        <span className="brand__mark">
          <BrandMark size={24} />
        </span>
        <span>
          <span className="brand__name">SQL Server</span>
          <span className="brand__tagline">Monitor</span>
        </span>
      </div>

      <nav className="nav-group" aria-label="Secciones">
        <span className="nav-label">Operación</span>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.badge === 'blocked' && blockedCount > 0 ? (
              <span className="nav-item__badge" aria-label={`${blockedCount} bloqueos activos`}>
                {blockedCount}
              </span>
            ) : null}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar__footer">
        <div className="engine-card">
          <div className="engine-card__row">
            <span className="engine-card__key">Motor</span>
            <ConnectionBadge state={connection} />
          </div>
          <div className="engine-card__row">
            <span className="engine-card__key">Instancia</span>
            <span className="engine-card__val" title={server.server_name ?? 'Sin datos'}>
              {server.server_name ?? 'Sin datos'}
            </span>
          </div>
          <div className="engine-card__row">
            <span className="engine-card__key">Versión</span>
            <span className="engine-card__val" title={server.product_version ?? '—'}>
              {server.product_version ?? '—'}
            </span>
          </div>
        </div>
      </div>
    </aside>
  )
}
