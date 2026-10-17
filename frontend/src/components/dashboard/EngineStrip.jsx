import { formatClock, formatNumber, toNumber } from '../../utils/format'

function Item({ label, value, title }) {
  if (!value) return null
  return (
    <div className="engine-strip__item">
      <span className="engine-strip__key">{label}</span>
      <span className="engine-strip__val" title={title ?? value}>
        {value}
      </span>
    </div>
  )
}

/** Resumen de la instancia: qué motor, dónde y con cuántos recursos. */
export default function EngineStrip({ server = {} }) {
  const memory = toNumber(server.memory_mb)
  const cores = toNumber(server.cpu_count)
  const startedAt = server.start_time ? new Date(server.start_time) : null

  return (
    <div className="engine-strip" role="group" aria-label="Datos de la instancia">
      <Item label="Instancia" value={server.server_name ?? '—'} />
      <Item label="Edición" value={server.edition ?? '—'} title={server.edition} />
      <Item
        label="Versión"
        value={
          server.product_version
            ? `${server.product_version}${server.product_level ? ` (${server.product_level})` : ''}`
            : '—'
        }
      />
      <Item label="Arranque" value={startedAt ? formatClock(startedAt) : '—'} title={server.start_time} />
      <Item label="Núcleos" value={cores ? formatNumber(cores) : '—'} />
      <Item label="Memoria" value={memory ? `${formatNumber(memory)} MB` : '—'} />
    </div>
  )
}
