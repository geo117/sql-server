import { useMemo } from 'react'
import { FaCircleCheck, FaLinkSlash } from 'react-icons/fa6'

import { formatMs, formatNumber, toNumber } from '../../utils/format'
import { waitSeverity } from '../../utils/process'
import EmptyState from '../common/EmptyState'
import { Pill } from '../common/Pill'
import BlockingChain from './BlockingChain'

export default function BlockedProcessesTable({
  rows = [],
  thresholds,
  onView,
  onKill,
  killingSpid,
}) {
  const summary = useMemo(() => {
    if (!rows.length) return null
    const waits = rows.map((row) => toNumber(row.WaitTime_ms))
    const worst = Math.max(...waits)
    const critical = rows.filter(
      (row) => waitSeverity(row.WaitTime_ms, thresholds) === 'critical',
    ).length
    return { worst, critical }
  }, [rows, thresholds])

  return (
    <section className="panel" aria-labelledby="blocked-title">
      <div className="panel__head">
        <h2 className="panel__title" id="blocked-title">
          <FaLinkSlash aria-hidden="true" style={{ color: 'var(--danger)' }} />
          Cadenas de contención
        </h2>
        <span className="count-chip" data-tone={rows.length ? 'danger' : undefined}>
          {formatNumber(rows.length)}
        </span>

        {summary ? (
          <div className="panel__tools">
            <Pill tone={summary.critical > 0 ? 'danger' : 'warning'}>
              Espera máxima {formatMs(summary.worst)}
            </Pill>
            {summary.critical > 0 ? (
              <Pill tone="danger">{summary.critical} en umbral crítico</Pill>
            ) : null}
          </div>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          variant="neutral"
          icon={<FaCircleCheck aria-hidden="true" style={{ color: 'var(--success)' }} />}
          title="Sin bloqueos activos"
          text="Ninguna sesión está esperando por un recurso retenido por otra. El motor fluye sin contención."
        />
      ) : (
        <div className="chain-list">
          {rows.map((item) => (
            <BlockingChain
              key={`${item.BlockingSpid}-${item.WaitingSpid}-${item.wait_type}`}
              item={item}
              thresholds={thresholds}
              onView={onView}
              onKill={onKill}
              killingSpid={killingSpid}
            />
          ))}
        </div>
      )}
    </section>
  )
}
