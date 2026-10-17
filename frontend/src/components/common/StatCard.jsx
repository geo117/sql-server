import { useEffect, useRef, useState } from 'react'

/**
 * Tarjeta de métrica. El valor parpadea suavemente cuando cambia,
 * de modo que el operador percibe que los datos están vivos.
 */
export default function StatCard({
  label,
  value,
  unit,
  icon,
  tone = 'primary',
  hint,
  pulse = false,
  meter = null,
}) {
  const [flash, setFlash] = useState(false)
  const previous = useRef(value)

  useEffect(() => {
    if (previous.current !== value) {
      previous.current = value
      setFlash(true)
      const id = window.setTimeout(() => setFlash(false), 700)
      return () => window.clearTimeout(id)
    }
    return undefined
  }, [value])

  const classes = ['stat-card']
  if (pulse) classes.push('stat-card--alert')
  if (flash) classes.push('flash')

  return (
    <article className={classes.join(' ')} data-tone={tone}>
      <div className="stat-card__top">
        <span className="stat-card__label">{label}</span>
        {icon ? (
          <span className="stat-card__icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
      </div>

      <div className="stat-card__value">
        <span className="stat-card__number">{value}</span>
        {unit ? <span className="stat-card__unit">{unit}</span> : null}
      </div>

      {meter !== null ? (
        <div
          className="stat-card__meter"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(meter * 100)}
          aria-label={label}
        >
          <span style={{ width: `${Math.round(Math.min(Math.max(meter, 0), 1) * 100)}%` }} />
        </div>
      ) : null}

      {hint ? <p className="stat-card__hint">{hint}</p> : null}
    </article>
  )
}
