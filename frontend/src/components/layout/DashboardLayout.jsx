import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import Navbar from '../common/Navbar'
import Sidebar from '../common/Sidebar'

export default function DashboardLayout() {
  const { pathname } = useLocation()
  const [openPath, setOpenPath] = useState(null)

  // El sidebar se considera expandido solo para la ruta actual.
  // Al navegar, `pathname` cambia y vuelve a su estado compacto (solo iconos).
  const sidebarOpen = openPath === pathname

  useEffect(() => {
    if (!sidebarOpen) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpenPath(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [sidebarOpen])

  useEffect(() => {
    const target = document.getElementById('main-content')
    if (target) target.focus({ preventScroll: true })
  }, [pathname])

  return (
    <div className={`app-shell${sidebarOpen ? ' is-sidebar-open' : ''}`}>
      <a className="skip-link" href="#main-content">
        Saltar al contenido
      </a>

      <Sidebar open={sidebarOpen} onNavigate={() => setOpenPath(null)} />

      {sidebarOpen ? (
        <button
          type="button"
          className="scrim"
          aria-label="Cerrar menú de navegación"
          onClick={() => setOpenPath(null)}
        />
      ) : null}

      <div className="app-main">
        <Navbar
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setOpenPath(sidebarOpen ? null : pathname)}
        />
        <main className="app-content" id="main-content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
