import { useCallback } from 'react'

import { useMonitor } from '../context/useMonitor'
import { confirmStopJob, toastError, toastSuccess } from '../utils/alerts'

/**
 * Encapsula el flujo de detención de un job del Agente:
 * confirmación → POST /api/jobs/{nombre}/stop → aviso de resultado.
 */
export function useStopJob() {
  const { stopAgentJob, stoppingJob } = useMonitor()

  const stop = useCallback(
    async (job) => {
      const confirmed = await confirmStopJob(job)
      if (!confirmed) return false

      const result = await stopAgentJob(job.job_name)
      if (result.ok) {
        await toastSuccess(result.message)
        return true
      }
      await toastError(result.message)
      return false
    },
    [stopAgentJob],
  )

  return { stop, stoppingJob }
}
