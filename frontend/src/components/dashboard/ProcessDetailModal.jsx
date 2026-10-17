import { useState } from 'react'
import Button from 'react-bootstrap/Button'
import Modal from 'react-bootstrap/Modal'
import { FaCopy, FaSkull, FaTerminal, FaXmark } from 'react-icons/fa6'

import { formatMs, formatNumber } from '../../utils/format'
import { escapeHtml } from '../../utils/escape'
import { toastInfo } from '../../utils/alerts'

function DetailCell({ label, value }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="detail-cell">
      <span className="detail-cell__key">{label}</span>
      <span className="detail-cell__val">{value}</span>
    </div>
  )
}

export default function ProcessDetailModal({ show, onHide, process, onKill, killing = false }) {
  const [copied, setCopied] = useState(false)

  if (!process) return null

  const sqlText = (process.sqlText ?? '').trim()
  const plan = process.queryPlan ? String(process.queryPlan).trim() : ''

  const handleCopy = async () => {
    if (!sqlText) return
    try {
      await navigator.clipboard.writeText(sqlText)
      setCopied(true)
      await toastInfo('Consulta copiada al portapapeles.')
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      await toastInfo('El navegador bloqueó el acceso al portapapeles.')
    }
  }

  return (
    <Modal show={show} onHide={onHide} size="lg" centered scrollable aria-labelledby="process-detail-title">
      <Modal.Header closeButton>
        <div>
          <Modal.Title id="process-detail-title">
            {process.role}
            {process.spid ? ` · SPID ${escapeHtml(process.spid)}` : ''}
          </Modal.Title>
          <p className="panel__subtitle" style={{ marginTop: 4 }}>
            {process.user}
            {process.host && process.host !== '—' ? ` @ ${process.host}` : ''}
          </p>
        </div>
      </Modal.Header>

      <Modal.Body>
        <div className="detail-grid">
          <DetailCell label="SPID" value={process.spid} />
          <DetailCell label="Estado" value={process.status} />
          <DetailCell label="Usuario" value={process.user} />
          <DetailCell label="Host" value={process.host} />
          <DetailCell label="Programa" value={process.program} />
          <DetailCell label="Comando" value={process.command} />
          <DetailCell label="Base de datos" value={process.database} />
          <DetailCell label="Tipo de espera" value={process.waitType} />
          <DetailCell label="CPU" value={process.cpuMs !== null ? formatMs(process.cpuMs) : null} />
          <DetailCell
            label="Transcurrido"
            value={process.elapsedMs !== null ? formatMs(process.elapsedMs) : null}
          />
          <DetailCell
            label="Espera"
            value={process.waitMs !== null ? formatMs(process.waitMs) : null}
          />
          <DetailCell
            label="Bloqueado por"
            value={process.blockingSessionId ? `SPID ${process.blockingSessionId}` : null}
          />
          <DetailCell
            label="Lecturas lógicas"
            value={process.logicalReads !== null ? formatNumber(process.logicalReads) : null}
          />
          <DetailCell label="Lecturas" value={process.reads !== null ? formatNumber(process.reads) : null} />
          <DetailCell label="Escrituras" value={process.writes !== null ? formatNumber(process.writes) : null} />
        </div>

        <p className="section-label">Sentencia T-SQL</p>
        {sqlText ? (
          <div className="code-block">
            <FaTerminal
              aria-hidden="true"
              style={{ position: 'absolute', top: 12, left: 14, color: 'var(--text-dim)' }}
            />
            <div className="code-block__tools">
              <Button
                size="sm"
                variant="outline-secondary"
                onClick={handleCopy}
                className="d-inline-flex align-items-center gap-2"
              >
                <FaCopy aria-hidden="true" />
                {copied ? 'Copiada' : 'Copiar'}
              </Button>
            </div>
            {sqlText}
          </div>
        ) : (
          <p className="panel__subtitle">
            No hay texto T-SQL disponible para esta sesión. Puede estar inactiva o sin consulta activa.
          </p>
        )}

        {plan ? (
          <>
            <p className="section-label">Plan de ejecución (XML)</p>
            <div className="code-block">{plan}</div>
          </>
        ) : null}
      </Modal.Body>

      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onHide} className="d-inline-flex align-items-center gap-2">
          <FaXmark aria-hidden="true" />
          Cerrar
        </Button>
        {process.spid ? (
          <Button
            variant="danger"
            disabled={killing}
            onClick={() => onKill(process)}
            className="d-inline-flex align-items-center gap-2"
          >
            <FaSkull aria-hidden="true" />
            {killing ? 'Terminando…' : `Terminar sesión ${process.spid}`}
          </Button>
        ) : null}
      </Modal.Footer>
    </Modal>
  )
}
