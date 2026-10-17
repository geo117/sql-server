const LABELS = {
  online: 'En línea',
  degraded: 'Parcial',
  offline: 'Sin conexión',
  connecting: 'Conectando',
}

/**
 * Indicador del estado del backend. Nunca depende solo del color:
 * incluye texto y un `title` descriptivo.
 */
export default function ConnectionBadge({ state = 'connecting', detail }) {
  const label = LABELS[state] ?? LABELS.connecting
  const title = detail ? `${label} · ${detail}` : label

  return (
    <span className="conn-pill" data-state={state} role="status" title={title}>
      <span className="conn-pill__dot" aria-hidden="true" />
      <span>{label}</span>
    </span>
  )
}
