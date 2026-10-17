import { useContext } from 'react'

import { MonitorContext } from './monitorContext'

export function useMonitor() {
  const context = useContext(MonitorContext)
  if (!context) {
    throw new Error('useMonitor debe usarse dentro de <MonitorProvider>.')
  }
  return context
}
