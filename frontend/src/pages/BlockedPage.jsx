import { FaCircleInfo } from 'react-icons/fa6'

import Skeleton from '../components/common/Skeleton'
import BlockedProcessesTable from '../components/dashboard/BlockedProcessesTable'
import ProcessDetailModal from '../components/dashboard/ProcessDetailModal'
import { useMonitor } from '../context/useMonitor'
import { useKillProcess } from '../hooks/useKillProcess'
import { useProcessDetail } from '../hooks/useProcessDetail'

export default function BlockedPage() {
  const { blockedProcesses, settings, killingSpid, connection, lastUpdated } = useMonitor()
  const { process, open, close } = useProcessDetail()
  const { terminate } = useKillProcess()

  const thresholds = { waitWarnMs: settings.waitWarnMs, waitCritMs: settings.waitCritMs }
  const firstLoad = lastUpdated === null && connection === 'connecting'

  return (
    <>
      <div className="note" style={{ marginBottom: 'var(--sp-5)' }}>
        <FaCircleInfo className="note__icon" aria-hidden="true" />
        <span>
          Cada tarjeta lee de izquierda a derecha: el <b>bloqueador</b> retiene el recurso y el{' '}
          <b>bloqueado</b> espera. El color y el tiempo central indican la gravedad de la espera.
        </span>
      </div>

      {firstLoad ? (
        <section className="panel">
          <p className="visually-hidden" role="status">
            Cargando bloqueos…
          </p>
          <div className="panel__head">
            <Skeleton width={190} height={16} />
          </div>
          <div className="chain-list">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} height={124} radius={14} />
            ))}
          </div>
        </section>
      ) : (
        <BlockedProcessesTable
          rows={blockedProcesses}
          thresholds={thresholds}
          onView={open}
          onKill={terminate}
          killingSpid={killingSpid}
        />
      )}

      <ProcessDetailModal
        show={process !== null}
        process={process}
        killing={killingSpid !== null}
        onHide={close}
        onKill={async (value) => {
          const done = await terminate(value)
          if (done) close()
        }}
      />
    </>
  )
}
