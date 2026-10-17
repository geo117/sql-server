/**
 * Preferencias del operador, persistidas en sessionStorage.
 * Se validan al cargar para no arrastrar valores corruptos.
 * Nota: sessionStorage se limpia al cerrar la pestaña/navegador, reduciendo
 * el periodo de exposición de la API key en caso de XSS.
 */

const STORAGE_KEY = 'sqlmon.settings.v1'

export const REFRESH_OPTIONS = [
  { value: 3000, label: '3 s' },
  { value: 5000, label: '5 s' },
  { value: 10000, label: '10 s' },
  { value: 0, label: 'Pausa' },
]

export const DEFAULT_SETTINGS = {
  apiBaseUrl: '',
  apiKey: '',
  refreshInterval: 5000,
  slowQueryMs: 5000,
  waitWarnMs: 10000,
  waitCritMs: 30000,
}

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/**
 * Acepta rutas relativas ("/api") o URLs http(s) absolutas.
 * Rechaza cualquier otro esquema para no permitir inyecciones de origen.
 */
export function sanitizeBaseUrl(raw) {
  const value = String(raw ?? '').trim()
  if (!value) return ''
  if (value.startsWith('/')) return value.replace(/\/+$/, '')
  try {
    const url = new URL(value)
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return value.replace(/\/+$/, '')
    }
  } catch {
    /* URL inválida */
  }
  return ''
}

function normalize(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const allowedIntervals = REFRESH_OPTIONS.map((option) => option.value)
  const interval = Number(source.refreshInterval)

  return {
    apiBaseUrl: sanitizeBaseUrl(source.apiBaseUrl),
    apiKey: typeof source.apiKey === 'string' ? source.apiKey : '',
    refreshInterval: allowedIntervals.includes(interval) ? interval : DEFAULT_SETTINGS.refreshInterval,
    slowQueryMs: toPositiveInt(source.slowQueryMs, DEFAULT_SETTINGS.slowQueryMs),
    waitWarnMs: toPositiveInt(source.waitWarnMs, DEFAULT_SETTINGS.waitWarnMs),
    waitCritMs: toPositiveInt(source.waitCritMs, DEFAULT_SETTINGS.waitCritMs),
  }
}

let cache = null

export function getSettings() {
  if (cache) return cache
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY)
    cache = stored ? normalize(JSON.parse(stored)) : { ...DEFAULT_SETTINGS }
  } catch {
    cache = { ...DEFAULT_SETTINGS }
  }
  return cache
}

export function saveSettings(partial) {
  cache = normalize({ ...getSettings(), ...partial })
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
  } catch {
    /* almacenamiento no disponible: se conserva solo en memoria */
  }
  return cache
}

export function resetSettings() {
  cache = { ...DEFAULT_SETTINGS }
  try {
    window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
  return cache
}
