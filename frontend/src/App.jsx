import { Navigate, Route, Routes } from 'react-router-dom'

import DashboardLayout from './components/layout/DashboardLayout'
import { MonitorProvider } from './context/MonitorProvider'
import BlockedPage from './pages/BlockedPage'
import DashboardPage from './pages/DashboardPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  return (
    <MonitorProvider>
      <Routes>
        <Route element={<DashboardLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/bloqueos" element={<BlockedPage />} />
          <Route path="/ajustes" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </MonitorProvider>
  )
}
