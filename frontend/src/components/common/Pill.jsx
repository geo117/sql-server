const STATUS_TONES = {
  running: 'success',
  runnable: 'success',
  suspended: 'warning',
  sleeping: 'neutral',
  dormant: 'neutral',
  background: 'info',
  rollback: 'danger',
  pending: 'info',
  blocked: 'danger',
}

/** Píldora de estado con color y punto: nunca comunica solo por color. */
export function StatusPill({ status }) {
  const key = String(status ?? '').toLowerCase()
  const tone = STATUS_TONES[key] ?? 'neutral'
  return (
    <span className={`pill pill--${tone}`}>
      <span className="pill__dot" aria-hidden="true" />
      {status ?? '—'}
    </span>
  )
}

export function Pill({ tone = 'neutral', children }) {
  return <span className={`pill pill--${tone}`}>{children}</span>
}

export default Pill
