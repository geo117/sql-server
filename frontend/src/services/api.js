/**
 * Cliente del API de SQL Server Monitor.
 *
 * - Base URL y API key se leen de las preferencias del operador.
 * - Toda petición tiene timeout mediante AbortController.
 * - Los errores se normalizan a ApiError con `status` y mensaje del backend.
 */

import { getSettings, sanitizeBaseUrl } from './settings'

const DEFAULT_TIMEOUT_MS = 12000

export class ApiError extends Error {
  constructor(message, { status = 0, cause = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.cause = cause
  }
}

function resolveBase(overrideBase) {
  if (typeof overrideBase === 'string') {
    return sanitizeBaseUrl(overrideBase) || (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')
  }
  const settings = getSettings()
  return (settings.apiBaseUrl || import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '')
}

function resolveKey(overrideKey) {
  if (typeof overrideKey === 'string') return overrideKey
  return getSettings().apiKey
}

async function request(path, options = {}) {
  const { method = 'GET', signal, timeoutMs = DEFAULT_TIMEOUT_MS, baseUrl, apiKey } = options
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)

  const forwardAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', forwardAbort, { once: true })
  }

  const headers = { Accept: 'application/json' }
  const key = resolveKey(apiKey)
  if (key) headers['X-API-Key'] = key

  try {
    const response = await fetch(`${resolveBase(baseUrl)}${path}`, {
      method,
      headers,
      signal: controller.signal,
    })

    if (!response.ok) {
      let detail = `El servidor respondió ${response.status}.`
      try {
        const body = await response.json()
        if (body && typeof body.detail === 'string') detail = body.detail
      } catch {
        /* respuesta sin cuerpo JSON */
      }
      throw new ApiError(detail, { status: response.status })
    }

    if (response.status === 204) return null
    return await response.json()
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (error?.name === 'AbortError') {
      throw new ApiError('La solicitud tardó demasiado o fue cancelada.', { status: 0, cause: error })
    }
    throw new ApiError('No se pudo contactar con el backend.', { status: 0, cause: error })
  } finally {
    window.clearTimeout(timer)
    if (signal) signal.removeEventListener('abort', forwardAbort)
  }
}

export function getHealth(signal) {
  return request('/api/health', { signal, timeoutMs: 5000 })
}

export function getActiveProcesses(signal) {
  return request('/api/active-processes', { signal })
}

export function getBlockedProcesses(signal) {
  return request('/api/blocked-processes', { signal })
}

export function getServerStats(signal) {
  return request('/api/server-stats', { signal })
}

/**
 * Ejecuta las tres lecturas en paralelo. Nunca rechaza: informa qué respondió.
 */
export async function fetchSnapshot(signal) {
  const [active, blocked, stats] = await Promise.allSettled([
    getActiveProcesses(signal),
    getBlockedProcesses(signal),
    getServerStats(signal),
  ])

  return {
    activeProcesses: active.status === 'fulfilled' ? active.value?.data ?? [] : null,
    blockedProcesses: blocked.status === 'fulfilled' ? blocked.value?.data ?? [] : null,
    serverStats: stats.status === 'fulfilled' ? stats.value ?? null : null,
    errors: [
      active.status === 'rejected' ? active.reason : null,
      blocked.status === 'rejected' ? blocked.reason : null,
      stats.status === 'rejected' ? stats.reason : null,
    ].filter(Boolean),
  }
}

export function killProcess(spid) {
  const normalized = Number.parseInt(spid, 10)
  if (!Number.isInteger(normalized) || normalized <= 0) {
    return Promise.reject(new ApiError('SPID inválido.', { status: 0 }))
  }
  return request(`/api/kill-process/${normalized}`, { method: 'POST', timeoutMs: 15000 })
}

/** Prueba una configuración concreta sin guardarla. */
export async function testConnection({ baseUrl, apiKey } = {}) {
  return request('/api/health', { baseUrl, apiKey, timeoutMs: 6000 })
}
