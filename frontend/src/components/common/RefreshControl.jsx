import { REFRESH_OPTIONS } from '../../services/settings'

/**
 * Selector de intervalo de auto-refresco (3 s / 5 s / 10 s / Pausa).
 */
export default function RefreshControl({ value, onChange, disabled = false }) {
  return (
    <div className="segmented" role="group" aria-label="Intervalo de auto-refresco">
      {REFRESH_OPTIONS.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            className="segmented__btn"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            title={
              option.value === 0
                ? 'Detener la actualización automática'
                : `Actualizar cada ${option.label}`
            }
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
