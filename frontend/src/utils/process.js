import { toNumber } from './format'

export const SEVERITY = {
  OK: 'ok',
  WARNING: 'warning',
  CRITICAL: 'critical',
}

/** Severidad de un tiempo de espera de bloqueo. */
export function waitSeverity(waitMs, { waitWarnMs, waitCritMs }) {
  const value = toNumber(waitMs)
  if (value >= waitCritMs) return SEVERITY.CRITICAL
  if (value >= waitWarnMs) return SEVERITY.WARNING
  return SEVERITY.OK
}

/** ¿La consulta supera el umbral de consulta lenta? */
export function isSlowQuery(elapsedMs, slowQueryMs) {
  return toNumber(elapsedMs) > slowQueryMs
}

/** Normaliza un proceso activo del endpoint /api/active-processes. */
export function describeActiveProcess(row) {
  return {
    role: 'Proceso activo',
    spid: toNumber(row.session_id),
    user: row.login_name ?? '—',
    host: row.host_name ?? '—',
    program: row.program_name ?? '—',
    status: row.status ?? '—',
    command: row.command ?? '—',
    cpuMs: toNumber(row.cpu_time),
    elapsedMs: toNumber(row.elapsed_time_ms),
    reads: toNumber(row.reads),
    writes: toNumber(row.writes),
    logicalReads: toNumber(row.logical_reads),
    blockingSessionId: toNumber(row.blocking_session_id),
    database: null,
    waitType: null,
    waitMs: null,
    sqlText: row.statement_text ?? '',
    queryPlan: row.query_plan ?? null,
  }
}

/** Normaliza el proceso bloqueador de una fila de /api/blocked-processes. */
export function describeBlocker(item) {
  return {
    role: 'Proceso bloqueador',
    spid: toNumber(item.BlockingSpid),
    user: item.BlockingUser ?? '—',
    host: item.BlockingHost ?? '—',
    program: item.BlockingProgram ?? '—',
    status: item.BlockingSessionStatus ?? '—',
    command: null,
    cpuMs: null,
    elapsedMs: toNumber(item.WaitTime_ms),
    reads: null,
    writes: null,
    logicalReads: null,
    blockingSessionId: null,
    database: item.DBName ?? null,
    waitType: item.wait_type ?? null,
    waitMs: toNumber(item.WaitTime_ms),
    sqlText: item.BlockingQuery ?? '',
    queryPlan: null,
  }
}

/** Normaliza el proceso que espera en una fila de /api/blocked-processes. */
export function describeWaiter(item) {
  return {
    role: 'Proceso bloqueado',
    spid: toNumber(item.WaitingSpid),
    user: '—',
    host: '—',
    program: '—',
    status: 'suspended',
    command: null,
    cpuMs: null,
    elapsedMs: toNumber(item.WaitTime_ms),
    reads: null,
    writes: null,
    logicalReads: null,
    blockingSessionId: toNumber(item.BlockingSpid),
    database: item.DBName ?? null,
    waitType: item.wait_type ?? null,
    waitMs: toNumber(item.WaitTime_ms),
    sqlText: '',
    queryPlan: null,
  }
}
