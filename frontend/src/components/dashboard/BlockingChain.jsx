import { FaArrowRightLong, FaCode, FaSkull } from 'react-icons/fa6'

import { formatMs, truncate } from '../../utils/format'
import { describeBlocker, describeWaiter, waitSeverity } from '../../utils/process'
import { Pill } from '../common/Pill'

const TONES = {
  critical: { name: 'danger', color: 'var(--danger)' },
  warning: { name: 'warning', color: 'var(--warning)' },
  ok: { name: 'success', color: 'var(--success)' },
}

/**
 * Elemento firma del producto: la cadena de contención.
 * Bloqueador ➔ Bloqueado, con el tiempo de espera como intensidad.
 */
export default function BlockingChain({ item, thresholds, onView, onKill, killingSpid }) {
  const blocker = describeBlocker(item)
  const waiter = describeWaiter(item)
  const tone = TONES[waitSeverity(item.WaitTime_ms, thresholds)]
  const busy = killingSpid !== null

  return (
    <article className="chain chain-fade-in">
      <div className="chain-node chain-node--blocker">
        <div className="chain-node__role">
          <span className="pill__dot" aria-hidden="true" />
          Proceso bloqueador
        </div>
        <div className="chain-node__spid">SPID {blocker.spid}</div>
        <dl className="chain-node__meta">
          <div className="chain-meta-row">
            <dt>Usuario</dt>
            <dd title={blocker.user}>{blocker.user}</dd>
          </div>
          <div className="chain-meta-row">
            <dt>Host</dt>
            <dd title={blocker.host}>{blocker.host}</dd>
          </div>
          <div className="chain-meta-row">
            <dt>Programa</dt>
            <dd title={blocker.program}>{truncate(blocker.program, 34)}</dd>
          </div>
          <div className="chain-meta-row">
            <dt>Estado</dt>
            <dd>{blocker.status}</dd>
          </div>
        </dl>
        <div className="chain-node__actions">
          <button
            type="button"
            className="icon-btn"
            onClick={() => onView(blocker)}
            aria-label={`Ver la consulta del bloqueador SPID ${blocker.spid}`}
            title="Ver consulta del bloqueador"
          >
            <FaCode aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--danger"
            onClick={() => onKill(blocker)}
            disabled={busy}
            aria-label={`Terminar el bloqueador SPID ${blocker.spid}`}
            title={`Terminar bloqueador ${blocker.spid}`}
          >
            <FaSkull aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="chain-link" style={{ '--flow-color': tone.color }}>
        <span className="chain-link__label">contenido</span>
        <FaArrowRightLong aria-hidden="true" style={{ color: tone.color, fontSize: '1rem' }} />
        <span className="chain-link__wait" style={{ color: tone.color }}>
          {formatMs(item.WaitTime_ms)}
        </span>
        <span className="chain-link__label">
          <Pill tone={tone.name}>{item.wait_type ?? 'espera'}</Pill>
        </span>
      </div>

      <div className="chain-node chain-node--waiting">
        <div className="chain-node__role">
          <span className="pill__dot" aria-hidden="true" />
          Proceso bloqueado
        </div>
        <div className="chain-node__spid">SPID {waiter.spid}</div>
        <dl className="chain-node__meta">
          <div className="chain-meta-row">
            <dt>Base datos</dt>
            <dd title={waiter.database}>{waiter.database ?? '—'}</dd>
          </div>
          <div className="chain-meta-row">
            <dt>Espera</dt>
            <dd>{waiter.waitType ?? '—'}</dd>
          </div>
          <div className="chain-meta-row">
            <dt>Duración</dt>
            <dd>{formatMs(waiter.waitMs)}</dd>
          </div>
          <div className="chain-meta-row">
            <dt>Bloqueado por</dt>
            <dd>SPID {waiter.blockingSessionId}</dd>
          </div>
        </dl>
        <div className="chain-node__actions">
          <button
            type="button"
            className="icon-btn icon-btn--danger"
            onClick={() => onKill(waiter)}
            disabled={busy}
            aria-label={`Terminar el proceso bloqueado SPID ${waiter.spid}`}
            title={`Terminar bloqueado ${waiter.spid}`}
          >
            <FaSkull aria-hidden="true" />
          </button>
        </div>
      </div>
    </article>
  )
}
