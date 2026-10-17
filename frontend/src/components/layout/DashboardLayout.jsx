import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import Navbar from '../common/Navbar'
import Sidebar from '../common/Sidebar'

export default function DashboardLayout() {
  const { pathname } = useLocation()
  const [openPath, setOpenPath] = useState(null)

  // El drawer se considera abierto solo para la ruta actual.
  // Al navegar, `pathname` cambia y el menú se cierra sin necesidad de un efecto.
  const menuOpen = openPath === pathname

  useEffect(() => {
    if (!menuOpen) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpenPath(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  useEffect(() => {
    const target = document.getElementById('main-content')
    if (target) target.focus({ preventScroll: true })
  }, [pathname])

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Saltar al contenido
      </a>

      <Sidebar open={menuOpen} onNavigate={() => setOpenPath(null)} />

      {menuOpen ? (
        <button
          type="button"
          className="scrim"
          aria-label="Cerrar menú de navegación"
          onClick={() => setOpenPath(null)}
        />
      ) : null}

      <div className="app-main">
        <Navbar onOpenSidebar={() => setOpenPath(pathname)} />
        <main className="app-content" id="main-content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
