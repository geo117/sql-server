import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { fetchSnapshot, killProcess as apiKillProcess } from '../services/api'
import { getSettings, resetSettings, saveSettings } from '../services/settings'
import { MonitorContext } from './monitorContext'

const HISTORY_LIMIT = 40

export function MonitorProvider({ children }) {
  const [activeProcesses, setActiveProcesses] = useState([])
  const [blockedProcesses, setBlockedProcesses] = useState([])
  const [serverStats, setServerStats] = useState(null)
  const [connection, setConnection] = useState('connecting')
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [history, setHistory] = useState([])
  const [killingSpid, setKillingSpid] = useState(null)
  const [settings, setSettings] = useState(() => getSettings())

  const inFlight = useRef(false)
  const abortRef = useRef(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      abortRef.current?.abort()
    }
  }, [])

  const refresh = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setIsRefreshing(true)

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const snapshot = await fetchSnapshot(controller.signal)
      if (!mountedRef.current || controller.signal.aborted) return

      const succeeded = 3 - snapshot.errors.length
      setConnection(succeeded === 3 ? 'online' : succeeded === 0 ? 'offline' : 'degraded')
      setError(snapshot.errors.length ? snapshot.errors[0].message : null)

      // Se conserva el último dato válido de cada endpoint que haya fallado.
      if (snapshot.activeProcesses) setActiveProcesses(snapshot.activeProcesses)
      if (snapshot.blockedProcesses) setBlockedProcesses(snapshot.blockedProcesses)
      if (snapshot.serverStats) setServerStats(snapshot.serverStats)

      if (succeeded > 0) {
        const timestamp = Date.now()
        setLastUpdated(timestamp)
        const stats = snapshot.serverStats?.stats ?? {}
        const cpu =
          snapshot.serverStats?.sql_cpu_percent ?? Math.round(Number(stats.avg_cpu_ms ?? 0))
        setHistory((previous) =>
          [
            ...previous,
            {
              t: timestamp,
              sessions: Number(stats.active_sessions ?? snapshot.activeProcesses?.length ?? 0),
              blocked: Number(stats.blocked_sessions ?? snapshot.blockedProcesses?.length ?? 0),
              cpu: Number(cpu ?? 0),
            },
          ].slice(-HISTORY_LIMIT),
        )
      }
    } catch (unexpected) {
      if (mountedRef.current) {
        setConnection('offline')
        setError(unexpected?.message ?? 'Error inesperado al consultar el backend.')
      }
    } finally {
      inFlight.current = false
      if (mountedRef.current) setIsRefreshing(false)
    }
  }, [])

  // Polling según el intervalo elegido (0 = pausa). La primera lectura se
  // agenda en un temporizador para no encadenar renders dentro del efecto.
  useEffect(() => {
    let cancelled = false
    const run = () => {
      if (!cancelled) refresh()
    }

    const firstId = window.setTimeout(run, 0)
    const loopId = settings.refreshInterval ? window.setInterval(run, settings.refreshInterval) : null

    return () => {
      cancelled = true
      window.clearTimeout(firstId)
      if (loopId) window.clearInterval(loopId)
    }
  }, [refresh, settings.refreshInterval])

  const updateSettings = useCallback((partial) => {
    setSettings(saveSettings(partial))
  }, [])

  const resetAllSettings = useCallback(() => {
    setSettings(resetSettings())
  }, [])

  const killSession = useCallback(
    async (spid) => {
      setKillingSpid(spid)
      try {
        const result = await apiKillProcess(spid)
        await refresh()
        return { ok: true, message: result?.message ?? `Sesión ${spid} terminada.` }
      } catch (failure) {
        return { ok: false, message: failure?.message ?? 'No se pudo terminar la sesión.' }
      } finally {
        if (mountedRef.current) setKillingSpid(null)
      }
    },
    [refresh],
  )

  const value = useMemo(
    () => ({
      activeProcesses,
      blockedProcesses,
      serverStats,
      connection,
      error,
      lastUpdated,
      isRefreshing,
      history,
      killingSpid,
      settings,
      refresh,
      updateSettings,
      resetAllSettings,
      killSession,
      activeCount: activeProcesses.length,
      blockedCount: blockedProcesses.length,
    }),
    [
      activeProcesses,
      blockedProcesses,
      serverStats,
      connection,
      error,
      lastUpdated,
      isRefreshing,
      history,
      killingSpid,
      settings,
      refresh,
      updateSettings,
      resetAllSettings,
      killSession,
    ],
  )

  return <MonitorContext.Provider value={value}>{children}</MonitorContext.Provider>
}
