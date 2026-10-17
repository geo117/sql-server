/**
 * Estado vacío con dirección: explica qué pasa y qué puede hacer el operador.
 */
export default function EmptyState({ icon, title, text, action, variant = 'neutral' }) {
  const classes = ['state-block']
  if (variant === 'danger') classes.push('state-block--danger')

  return (
    <div className={classes.join(' ')}>
      {icon ? (
        <div className="state-block__icon" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <p className="state-block__title">{title}</p>
      {text ? <p className="state-block__text">{text}</p> : null}
      {action}
    </div>
  )
}
