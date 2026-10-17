/**
 * Gráfico de línea compacto, sin dependencias.
 * Dibuja un área suave y una línea de tendencia a partir de una serie corta.
 */
export default function Sparkline({
  data = [],
  color = 'var(--primary)',
  height = 46,
  label,
  emptyLabel = 'Recopilando datos…',
}) {
  const series = data.filter((point) => Number.isFinite(point))

  if (series.length < 2) {
    return (
      <div
        className="sparkline"
        style={{ height, display: 'grid', placeItems: 'center' }}
        role="img"
        aria-label={label ? `${label}: ${emptyLabel}` : emptyLabel}
      >
        <span className="mono" style={{ fontSize: '0.6875rem', color: 'var(--text-dim)' }}>
          {emptyLabel}
        </span>
      </div>
    )
  }

  const width = 100
  const max = Math.max(...series)
  const min = Math.min(...series)
  const span = max - min || 1

  const points = series.map((value, index) => {
    const x = (index / (series.length - 1)) * width
    const y = height - ((value - min) / span) * (height - 8) - 4
    return [x, y]
  })

  const line = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
  const area = `${line} L${width},${height} L0,${height} Z`

  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label ?? 'Tendencia'}
    >
      <path className="sparkline__area" d={area} fill={color} stroke="none" />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
