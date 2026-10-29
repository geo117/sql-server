/**
 * Formateadores compartidos.
 * Todas las cifras usan notación tabular para que no "salten" al actualizarse.
 */

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

export function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return new Intl.NumberFormat('es-ES').format(Number(value))
}

export function formatCompact(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return new Intl.NumberFormat('es-ES', { notation: 'compact', maximumFractionDigits: 1 }).format(
    Number(value),
  )
}

export function formatPercent(value, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return `${Number(value).toFixed(digits)}%`
}

/**
 * Convierte milisegundos a una etiqueta legible: 820 ms, 1,4 s, 2m 14s.
 */
export function formatMs(ms) {
  const value = Number(ms)
  if (ms === null || ms === undefined || Number.isNaN(value)) return '—'
  if (value < 1000) return `${Math.round(value)} ms`

  const seconds = value / 1000
  if (seconds < 60) return `${seconds.toFixed(1).replace('.', ',')} s`

  const minutes = Math.floor(seconds / 60)
  const restSeconds = Math.round(seconds % 60)
  if (minutes < 60) return `${minutes}m ${restSeconds}s`

  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60
  return `${hours}h ${restMinutes}m`
}

/** Hora exacta local en formato HH:MM:SS. */
export function formatClock(timestamp) {
  if (!timestamp) return '—'
  return new Date(timestamp).toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

/** Fecha y hora cortas: "31/01, 10:15". Para la última ejecución de un job. */
export function formatShortDateTime(timestamp) {
  if (!timestamp) return '—'
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Tiempo relativo corto: "hace 3 s". */
export function timeAgo(timestamp, now = Date.now()) {
  if (!timestamp) return '—'
  const diff = Math.max(0, Math.round((now - timestamp) / 1000))
  if (diff < 2) return 'ahora'
  if (diff < 60) return `hace ${diff} s`
  const minutes = Math.floor(diff / 60)
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  return `hace ${hours} h`
}

export function truncate(text, max = 60) {
  if (!text) return ''
  const clean = String(text).replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

/** Normaliza un valor de BD que puede venir como string de número. */
export function toNumber(value) {
  if (value === null || value === undefined) return 0
  const parsed = Number(value)
  return Number.isNaN(parsed) ? 0 : parsed
}
