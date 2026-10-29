import { useState } from 'react'
import {
  FaDatabase,
  FaGears,
  FaLinkSlash,
  FaMicrochip,
  FaPlug,
  FaTriangleExclamation,
} from 'react-icons/fa6'

import ActiveProcessesTable from '../components/dashboard/ActiveProcessesTable'
import AgentJobsPanel from '../components/dashboard/AgentJobsPanel'
import EngineStrip from '../components/dashboard/EngineStrip'
import JobDetailModal from '../components/dashboard/JobDetailModal'
import ProcessDetailModal from '../components/dashboard/ProcessDetailModal'
import Skeleton from '../components/common/Skeleton'
import Sparkline from '../components/common/Sparkline'
import StatCard from '../components/common/StatCard'
import { useMonitor } from '../context/useMonitor'
import { useKillProcess } from '../hooks/useKillProcess'
import { useProcessDetail } from '../hooks/useProcessDetail'
import { useStopJob } from '../hooks/useStopJob'
import { formatCompact, formatMs, formatNumber, toNumber } from '../utils/format'
import { describeActiveProcess, isSlowQuery } from '../utils/process'

function Vital({ label, value, data, color, unit }) {
  return (
    <div className="vital">
      <div className="vital__head">
        <span className="vital__label">{label}</span>
        <span className="vital__value">
          {value}
          {unit ? <span className="stat-card__unit"> {unit}</span> : null}
        </span>
      </div>
      <Sparkline data={data} color={color} label={`${label} en el tiempo`} />
    </div>
  )
}

/** Esqueleto de carga para no mostrar ceros que parezcan "todo bien". */
function DashboardLoading() {
  return (
    <>
      <p className="visually-hidden" role="status">
        Cargando datos del servidor…
      </p>

      <div className="engine-strip">
        {Array.from({ length: 5 }).map((_, index) => (
          <div className="engine-strip__item" key={index}>
            <Skeleton width={64} height={10} />
            <Skeleton width={108} height={16} style={{ marginTop: 8 }} />
          </div>
        ))}
      </div>

      <div className="stat-grid">
        {Array.from({ length: 5 }).map((_, index) => (
          <div className="stat-card" key={index}>
            <Skeleton width={96} height={11} />
            <Skeleton width={132} height={30} style={{ marginTop: 14 }} />
            <Skeleton width="62%" height={10} />
          </div>
        ))}
      </div>

      <section className="panel">
        <div className="panel__head">
          <Skeleton width={150} height={16} />
        </div>
        <div style={{ padding: 'var(--sp-4) var(--sp-5)' }}>
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} height={14} style={{ marginBottom: 16 }} />
          ))}
        </div>
      </section>

      <section className="panel" style={{ marginTop: 'var(--sp-5)' }}>
        <div className="panel__head">
          <Skeleton width={170} height={16} />
        </div>
        <div style={{ padding: 'var(--sp-4) var(--sp-5)' }}>
          {Array.from({ length: 7 }).map((_, index) => (
            <Skeleton key={index} height={14} style={{ marginBottom: 16 }} />
          ))}
        </div>
      </section>
    </>
  )
}

export default function DashboardPage() {
  const {
    activeProcesses,
    serverStats,
    jobs,
    history,
    settings,
    connection,
    error,
    lastUpdated,
    refresh,
    killingSpid,
  } = useMonitor()
  const { process, open, close } = useProcessDetail()
  const { terminate } = useKillProcess()
  const { stop: stopAgentJob, stoppingJob } = useStopJob()

  // El modal guarda el job elegido y se refresca con cada lectura mientras siga
  // existiendo, para que el estado y el script mostrados no queden obsoletos.
  const [selectedJob, setSelectedJob] = useState(null)

  const stats = serverStats?.stats ?? {}
  const server = serverStats?.server ?? {}
  const slowQueryMs = settings.slowQueryMs

  const activeSessions = toNumber(stats.active_sessions) || activeProcesses.length
  const activeRequests = toNumber(stats.active_requests) || activeProcesses.length
  const blockedSessions = toNumber(stats.blocked_sessions)
  const cpuPercent = serverStats?.sql_cpu_percent
  const avgCpu = toNumber(stats.avg_cpu_ms)
  const totalLogicalReads = toNumber(stats.total_logical_reads)
  const totalWrites = toNumber(stats.total_writes)

  // Jobs del Agente: el endpoint puede responder `available: false` cuando el
  // login no tiene permisos sobre msdb; en ese caso se muestra "—" sin ruido.
  const jobsUnavailable = jobs !== null && jobs.available === false
  const jobsSummary = jobs?.summary ?? {}
  const jobRows = Array.isArray(jobs?.jobs) ? jobs.jobs : []
  const runningJobs = toNumber(jobsSummary.running_jobs) || jobRows.filter((j) => j.is_running).length
  const enabledJobs = toNumber(jobsSummary.enabled_jobs)
  const failedJobs = toNumber(jobsSummary.failed_last_24h)

  const liveSelectedJob = selectedJob
    ? jobRows.find((job) => job.job_id === selectedJob.job_id) ?? selectedJob
    : null

  const slowCount = activeProcesses.filter((row) =>
    isSlowQuery(row.elapsed_time_ms, slowQueryMs),
  ).length

  const firstLoad = lastUpdated === null && connection === 'connecting'

  const handleView = (row) => open(describeActiveProcess(row))
  const handleKill = async (row) => terminate(describeActiveProcess(row))
  const handleViewJobScript = (job) => setSelectedJob(job)
  const handleStopJob = async (job) => {
    await stopAgentJob(job)
  }

  return (
    <>
      {connection === 'offline' ? (
        <div className="banner banner--danger" role="alert">
          <FaTriangleExclamation aria-hidden="true" />
          <span className="grow">
            Sin conexión con el backend. {error ?? 'Revisa que el servidor esté en marcha.'}
          </span>
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={refresh}>
            Reintentar
          </button>
        </div>
      ) : connection === 'degraded' ? (
        <div className="banner banner--warning" role="status">
          <FaTriangleExclamation aria-hidden="true" />
          <span className="grow">Datos parciales: algunas consultas no respondieron. {error ?? ''}</span>
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={refresh}>
            Reintentar
          </button>
        </div>
      ) : null}

      {firstLoad ? (
        <DashboardLoading />
      ) : (
        <>
          <EngineStrip server={server} />

          <div className="stat-grid">
            <StatCard
              label="Sesiones activas"
              value={formatNumber(activeSessions)}
              unit="sesiones"
              icon={<FaPlug aria-hidden="true" />}
              tone="primary"
              hint={`${formatNumber(activeRequests)} solicitudes en ejecución`}
            />
            <StatCard
              label="Procesos bloqueados"
              value={formatNumber(blockedSessions)}
              unit={blockedSessions === 1 ? 'bloqueo' : 'bloqueos'}
              icon={<FaLinkSlash aria-hidden="true" />}
              tone={blockedSessions > 0 ? 'danger' : 'success'}
              pulse={blockedSessions > 0}
              hint={blockedSessions > 0 ? 'Requieren atención inmediata' : 'Sin contención detectada'}
            />
            <StatCard
              label="CPU del motor"
              value={cpuPercent === null || cpuPercent === undefined ? '—' : Math.round(cpuPercent)}
              unit="%"
              icon={<FaMicrochip aria-hidden="true" />}
              tone="warning"
              meter={cpuPercent === null || cpuPercent === undefined ? null : cpuPercent / 100}
              hint={`CPU medio por consulta ${formatMs(avgCpu)}`}
            />
            <StatCard
              label="Jobs del Agente"
              value={jobsUnavailable ? '—' : formatNumber(runningJobs)}
              unit={jobsUnavailable ? undefined : 'en curso'}
              icon={<FaGears aria-hidden="true" />}
              tone={jobsUnavailable ? 'info' : failedJobs > 0 ? 'warning' : 'success'}
              pulse={runningJobs > 0}
              hint={
                jobsUnavailable
                  ? 'Sin acceso a msdb o Agente no disponible'
                  : `${formatNumber(enabledJobs)} habilitados · ${formatNumber(failedJobs)} fallidos (24 h)`
              }
            />
            <StatCard
              label="Carga de E/S"
              value={formatCompact(totalLogicalReads)}
              unit="lecturas"
              icon={<FaDatabase aria-hidden="true" />}
              tone="info"
              hint={`${formatNumber(totalWrites)} escrituras · ${formatNumber(slowCount)} lentas`}
            />
          </div>

          <div className="vitals">
            <Vital
              label="Sesiones"
              value={activeSessions}
              data={history.map((point) => point.sessions)}
              color="var(--primary)"
            />
            <Vital
              label="Bloqueos"
              value={blockedSessions}
              data={history.map((point) => point.blocked)}
              color="var(--danger)"
            />
            <Vital
              label="CPU %"
              value={cpuPercent === null || cpuPercent === undefined ? '—' : Math.round(cpuPercent)}
              data={history.map((point) => point.cpu)}
              color="var(--warning)"
            />
            <Vital
              label="Jobs"
              value={jobsUnavailable ? '—' : runningJobs}
              data={history.map((point) => point.jobs)}
              color="var(--info)"
            />
          </div>

          <AgentJobsPanel
            rows={jobRows}
            available={!jobsUnavailable}
            detail={jobs?.detail ?? null}
            onViewScript={handleViewJobScript}
            onStop={handleStopJob}
            stoppingJob={stoppingJob}
          />

          <ActiveProcessesTable
            rows={activeProcesses}
            slowQueryMs={slowQueryMs}
            onView={handleView}
            onKill={handleKill}
            killingSpid={killingSpid}
          />
        </>
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

      <JobDetailModal
        show={liveSelectedJob !== null}
        job={liveSelectedJob}
        stopping={stoppingJob !== null && stoppingJob === liveSelectedJob?.job_name}
        onHide={() => setSelectedJob(null)}
        onStop={handleStopJob}
      />
    </>
  )
}
