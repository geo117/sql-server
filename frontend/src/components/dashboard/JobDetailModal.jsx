import { useState } from 'react'
import Button from 'react-bootstrap/Button'
import Modal from 'react-bootstrap/Modal'
import { FaCircleStop, FaCopy, FaTerminal, FaXmark } from 'react-icons/fa6'

import { formatMs, formatShortDateTime, toNumber } from '../../utils/format'
import { toastInfo } from '../../utils/alerts'
import { Pill } from '../common/Pill'

const SEVERITY_TONE = {
  critical: 'danger',
  warning: 'warning',
  running: 'success',
  ok: 'neutral',
}

const RUN_RESULT = {
  0: { label: 'Falló', tone: 'danger' },
  1: { label: 'Correcto', tone: 'success' },
  2: { label: 'Reintentado', tone: 'warning' },
  3: { label: 'Cancelado', tone: 'warning' },
  4: { label: 'En curso', tone: 'info' },
}

/** Etiqueta del editor según el subsistema del paso (sysjobsteps.subsystem). */
const SUBSYSTEM_LABEL = {
  TSQL: 'Script T-SQL',
  CmdExec: 'Comando de sistema (CmdExec)',
  PowerShell: 'Script de PowerShell',
  SSIS: 'Paquete SSIS',
  'SQL Server Integration Services Package': 'Paquete SSIS',
  'SQL Server Analysis Services Query': 'Consulta SSAS',
  'SQL Server Analysis Services Command': 'Comando SSAS',
  Distribution: 'Agente de replicación',
  Snapshot: 'Agente de replicación',
  LogReader: 'Agente de replicación',
  Merge: 'Agente de replicación',
  QueueReader: 'Agente de replicación',
}

function DetailCell({ label, value }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="detail-cell">
      <span className="detail-cell__key">{label}</span>
      <span className="detail-cell__val">{value}</span>
    </div>
  )
}

/**
 * Detalle de un job del Agente: datos de sysjobs, paso y script de sysjobsteps
 * y resultado/errores de sysjobhistory, con la acción para detenerlo.
 */
export default function JobDetailModal({ show, onHide, job, onStop, stopping = false }) {
  const [copied, setCopied] = useState(false)

  if (!job) return null

  const script = (job.script ?? '').trim()
  const scriptLabel = SUBSYSTEM_LABEL[job.subsystem] ?? 'Script del paso'
  const result = RUN_RESULT[job.last_run_status] ?? null
  const elapsedMs = job.elapsed_seconds !== null ? toNumber(job.elapsed_seconds) * 1000 : null
  const durationMs =
    job.last_run_duration_seconds !== null ? toNumber(job.last_run_duration_seconds) * 1000 : null
  const stepLabel = job.step_id
    ? `${job.step_id}${job.step_count ? ` de ${job.step_count}` : ''}${
        job.step_name ? ` · ${job.step_name}` : ''
      }`
    : null

  const handleCopy = async () => {
    if (!script) return
    try {
      await navigator.clipboard.writeText(script)
      setCopied(true)
      await toastInfo('Script copiado al portapapeles.')
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      await toastInfo('El navegador bloqueó el acceso al portapapeles.')
    }
  }

  return (
    <Modal
      show={show}
      onHide={onHide}
      size="lg"
      centered
      scrollable
      aria-labelledby="job-detail-title"
    >
      <Modal.Header closeButton>
        <div>
          <Modal.Title id="job-detail-title">{job.job_name}</Modal.Title>
          <p className="panel__subtitle" style={{ marginTop: 4 }}>
            {job.description || `${job.job_owner} · ${job.database_name}`}
          </p>
        </div>
      </Modal.Header>

      <Modal.Body>
        <div className="detail-grid">
          <DetailCell
            label="Situación"
            value={<Pill tone={SEVERITY_TONE[job.severity] ?? 'neutral'}>{job.status ?? '—'}</Pill>}
          />
          <DetailCell
            label="Habilitado"
            value={
              <Pill tone={job.is_enabled ? 'success' : 'neutral'}>
                {job.is_enabled ? 'Habilitado' : 'Deshabilitado'}
              </Pill>
            }
          />
          <DetailCell label="Propietario" value={job.job_owner} />
          <DetailCell label="Base de datos" value={job.database_name} />
          <DetailCell label="Paso" value={stepLabel} />
          <DetailCell label="Subsistema" value={job.subsystem} />
          <DetailCell label="Sesión (SPID)" value={job.session_id} />
          <DetailCell
            label="Bloqueado por"
            value={job.blocking_session_id ? `SPID ${job.blocking_session_id}` : null}
          />
          <DetailCell label="Tipo de espera" value={job.wait_type} />
          <DetailCell
            label="Espera"
            value={job.wait_time_ms !== null ? formatMs(job.wait_time_ms) : null}
          />
          <DetailCell
            label="Inicio de ejecución"
            value={job.started_at ? formatShortDateTime(job.started_at) : null}
          />
          <DetailCell
            label="Transcurrido"
            value={elapsedMs !== null && job.is_running ? formatMs(elapsedMs) : null}
          />
          <DetailCell
            label="Última ejecución"
            value={job.last_run_at ? formatShortDateTime(job.last_run_at) : null}
          />
          <DetailCell label="Duración" value={durationMs !== null ? formatMs(durationMs) : null} />
          <DetailCell
            label="Resultado"
            value={result ? <Pill tone={result.tone}>{result.label}</Pill> : null}
          />
        </div>

        {job.last_failed_message ? (
          <>
            <p className="section-label">
              Error del paso
              {job.last_failed_step_id ? ` ${job.last_failed_step_id}` : ''}
              {job.last_failed_step_name ? ` · ${job.last_failed_step_name}` : ''}
              {job.last_failed_at ? ` · ${formatShortDateTime(job.last_failed_at)}` : ''}
            </p>
            <pre className="message-block">{job.last_failed_message}</pre>
          </>
        ) : null}

        {job.last_run_message ? (
          <>
            <p className="section-label">Mensaje de la última ejecución</p>
            <pre className="message-block message-block--neutral">{job.last_run_message}</pre>
          </>
        ) : null}

        <p className="section-label">
          {scriptLabel}
          {job.is_running ? ' en ejecución' : ' del último paso'}
        </p>
        {script ? (
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
                {copied ? 'Copiado' : 'Copiar'}
              </Button>
            </div>
            {script}
          </div>
        ) : (
          <p className="panel__subtitle">
            No hay script disponible para este job. Puede que no tenga pasos o que el login no pueda
            leer el comando del paso.
          </p>
        )}
      </Modal.Body>

      <Modal.Footer>
        <Button
          variant="outline-secondary"
          onClick={onHide}
          className="d-inline-flex align-items-center gap-2"
        >
          <FaXmark aria-hidden="true" />
          Cerrar
        </Button>
        {job.is_running ? (
          <Button
            variant="danger"
            disabled={stopping}
            onClick={() => onStop?.(job)}
            className="d-inline-flex align-items-center gap-2"
          >
            <FaCircleStop aria-hidden="true" />
            {stopping ? 'Deteniendo…' : 'Detener job'}
          </Button>
        ) : null}
      </Modal.Footer>
    </Modal>
  )
}
