import { useCallback } from 'react'

import { useMonitor } from '../context/useMonitor'
import { confirmKillProcess, toastError, toastSuccess } from '../utils/alerts'

/**
 * Encapsula el flujo completo de terminación de una sesión:
 * confirmación en dos pasos → KILL → aviso de resultado.
 */
export function useKillProcess() {
  const { killSession, killingSpid } = useMonitor()

  const terminate = useCallback(
    async (process) => {
      const confirmed = await confirmKillProcess(process)
      if (!confirmed) return false

      const result = await killSession(process.spid)
      if (result.ok) {
        await toastSuccess(result.message)
        return true
      }
      await toastError(result.message)
      return false
    },
    [killSession],
  )

  return { terminate, killingSpid }
}
