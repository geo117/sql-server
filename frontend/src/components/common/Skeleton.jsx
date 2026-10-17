/** Bloque de carga con efecto shimmer. Puramente decorativo. */
export default function Skeleton({ width = '100%', height = 14, radius = 6, style }) {
  return (
    <span
      className="skeleton"
      aria-hidden="true"
      style={{ display: 'block', width, height, borderRadius: radius, ...style }}
    />
  )
}
