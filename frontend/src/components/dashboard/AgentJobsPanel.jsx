import {
  FaCircleExclamation,
  FaCircleStop,
  FaCode,
  FaGears,
  FaTriangleExclamation,
} from 'react-icons/fa6'

import {
  formatMs,
  formatNumber,
  formatShortDateTime,
  toNumber,
  truncate,
} from '../../utils/format'
import EmptyState from '../common/EmptyState'
import { Pill } from '../common/Pill'

/** Filas visibles antes de activar el scroll vertical del panel. */
const VISIBLE_ROWS = 5

/** Caracteres del script que se muestran como vista previa en la tabla. */
const SCRIPT_PREVIEW = 44

const SEVERITY_TONE = {
  critical: 'danger',
  warning: 'warning',
  running: 'success',
  ok: 'neutral',
}

/** run_status de sysjobhistory → etiqueta y color. */
const RUN_RESULT = {
  0: { label: 'Falló', tone: 'danger' },
  1: { label: 'Correcto', tone: 'success' },
  2: { label: 'Reintentado', tone: 'warning' },
  3: { label: 'Cancelado', tone: 'warning' },
  4: { label: 'En curso', tone: 'info' },
}

/** Nombre corto del subsistema del paso (sysjobsteps.subsystem). */
const SUBSYSTEM_LABEL = {
  TSQL: 'T-SQL',
  CmdExec: 'CmdExec',
  PowerShell: 'PowerShell',
  SSIS: 'SSIS',
  'SQL Server Analysis Services Query': 'SSAS',
  'SQL Server Analysis Services Command': 'SSAS',
  'Analysis Services Query': 'SSAS',
  'Analysis Services Command': 'SSAS',
  'SQL Server Integration Services Package': 'SSIS',
  Distribution: 'Replicación',
  Snapshot: 'Replicación',
  LogReader: 'Replicación',
  Merge: 'Replicación',
  QueueReader: 'Replicación',
  ANalysisQuery: 'SSAS',
}

/**
 * Tabla completa de jobs del Agente SQL Server.
 *
 * La sección queda siempre visible sobre "Procesos activos" y resume, por job:
 * nombre y descripción (sysjobs), habilitado/deshabilitado, situación, base de
 * datos y script del paso (sysjobsteps), última ejecución, duración y resultado
 * con su mensaje de error (sysjobhistory). Se colorea en rojo si está bloqueado
 * y en amarillo si falló o no responde.
 */
export default function AgentJobsPanel({
  rows = [],
  available = true,
  detail = null,
  onViewScript,
  onStop,
  stoppingJob = null,
}) {
  const scrollable = rows.length > VISIBLE_ROWS
  const hidden = Math.max(0, rows.length - VISIBLE_ROWS)
  const runningCount = rows.filter((job) => job.is_running).length

  return (
    <section className="panel jobs-panel" aria-labelledby="agent-jobs-title">
      <div className="panel__head">
        <h2 className="panel__title" id="agent-jobs-title">
          Jobs del Agente
        </h2>
        <span className="count-chip">{formatNumber(rows.length)}</span>
        <span className="panel__subtitle">
          {available ? `${formatNumber(runningCount)} en ejecución` : 'Agente SQL Server'}
        </span>
      </div>

      {!available ? (
        <EmptyState
          variant="danger"
          icon={<FaTriangleExclamation aria-hidden="true" />}
          title="Jobs no disponibles"
          text={
            detail ??
            'No se pudo leer msdb. Revisa que el Agente SQL Server exista y que el login tenga acceso.'
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<FaGears aria-hidden="true" />}
          title="Sin jobs definidos"
          text="El Agente SQL Server no tiene jobs creados en este servidor."
        />
      ) : (
        <>
          <div
            className={`table-wrap jobs-scroll${scrollable ? ' is-scrollable' : ''}`}
            {...(scrollable
              ? {
                  tabIndex: 0,
                  role: 'region',
                  'aria-label': `Jobs del Agente, desplázate para ver los ${formatNumber(
                    rows.length,
                  )} listados`,
                }
              : {})}
          >
            <table className="data-table jobs-table">
              <caption className="visually-hidden">
                Jobs del Agente SQL Server. Amarillo: falló o no responde. Rojo: bloqueado.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Job</th>
                  <th scope="col">Habilitado</th>
                  <th scope="col">Situación</th>
                  <th scope="col">Base de datos</th>
                  <th scope="col">Script</th>
                  <th scope="col">Última ejecución</th>
                  <th scope="col" style={{ textAlign: 'right' }}>
                    Duración
                  </th>
                  <th scope="col">Resultado</th>
                  <th scope="col" style={{ textAlign: 'right' }}>
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((job) => {
                  const rowClass =
                    job.severity === 'critical'
                      ? 'row-danger'
                      : job.severity === 'warning'
                        ? 'row-warning'
                        : undefined
                  const stopping = stoppingJob === job.job_name
                  const canStop = job.is_running && !stopping
                  const result = RUN_RESULT[job.last_run_status] ?? null
                  const script = (job.script ?? '').trim()
                  // Solo se señala con icono cuando hay algo que revisar: un
                  // mensaje de éxito no debe parecer una alerta.
                  const hasError = Boolean(job.last_failed_message) || job.last_run_status === 0 || job.last_run_status === 3
                  const durationSeconds = job.is_running
                    ? job.elapsed_seconds
                    : job.last_run_duration_seconds

                  return (
                    <tr key={job.job_id ?? job.job_name} className={rowClass}>
                      <td className="cell-job">
                        <span className="cell-job__name">{job.job_name ?? '—'}</span>
                        {job.description ? (
                          <span className="cell-job__desc" title={job.description}>
                            {truncate(job.description, 64)}
                          </span>
                        ) : null}
                      </td>
                      <td>
                        <Pill tone={job.is_enabled ? 'success' : 'neutral'}>
                          {job.is_enabled ? 'Habilitado' : 'Deshabilitado'}
                        </Pill>
                      </td>
                      <td>
                        <Pill tone={SEVERITY_TONE[job.severity] ?? 'neutral'}>
                          {job.status ?? '—'}
                        </Pill>
                      </td>
                      <td className="cell-truncate" title={job.database_name ?? ''}>
                        {job.database_name ?? '—'}
                      </td>
                      <td className="cell-script" title={script || 'Sin script registrado'}>
                        {script ? (
                          <>
                            {job.subsystem ? (
                              <span className="job-chip">
                                {SUBSYSTEM_LABEL[job.subsystem] ?? job.subsystem}
                              </span>
                            ) : null}
                            <span className="cell-script__code">{truncate(script, SCRIPT_PREVIEW)}</span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="cell-nowrap">
                        {formatShortDateTime(job.last_run_at)}
                      </td>
                      <td
                        className="cell-num"
                        title={
                          job.is_running
                            ? 'Tiempo transcurrido de la ejecución en curso'
                            : 'Duración de la última ejecución'
                        }
                      >
                        {durationSeconds === null || durationSeconds === undefined
                          ? '—'
                          : formatMs(toNumber(durationSeconds) * 1000)}
                      </td>
                      <td>
                        {result ? (
                          <Pill tone={result.tone}>{result.label}</Pill>
                        ) : (
                          <span className="text-dim">Sin ejecuciones</span>
                        )}
                      </td>
                      <td>
                        <span className="row-actions">
                          {hasError ? (
                            <button
                              type="button"
                              className="icon-btn icon-btn--warning"
                              onClick={() => onViewScript?.(job)}
                              aria-label={`Ver el mensaje de error del job ${job.job_name}`}
                              title="Ver el mensaje de la última ejecución"
                            >
                              <FaCircleExclamation aria-hidden="true" />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="icon-btn"
                            onClick={() => onViewScript?.(job)}
                            aria-label={`Ver el script del job ${job.job_name}`}
                            title="Ver el script completo y el detalle"
                          >
                            <FaCode aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="icon-btn icon-btn--danger"
                            onClick={() => onStop?.(job)}
                            disabled={!canStop}
                            aria-label={`Detener el job ${job.job_name}`}
                            title={
                              job.is_running
                                ? 'Detener el job (sp_stop_job)'
                                : 'Solo se pueden detener jobs en ejecución'
                            }
                          >
                            <FaCircleStop aria-hidden="true" />
                          </button>
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {scrollable ? (
            <p className="panel__subtitle jobs-scroll__hint">
              Mostrando {formatNumber(VISIBLE_ROWS)} de {formatNumber(rows.length)} jobs. Desplázate
              para ver {hidden === 1 ? 'el resto' : `los ${formatNumber(hidden)} restantes`}.
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}
