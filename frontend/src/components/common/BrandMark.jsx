/**
 * Marca de la aplicación: el pulso de un monitor sobre un panel oscuro.
 */
export default function BrandMark({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="brandPulse" x1="6" y1="32" x2="58" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2563EB" />
          <stop offset="1" stopColor="#38BDF8" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="#0F172A" />
      <rect x="1.5" y="1.5" width="61" height="61" rx="15" stroke="#2A3A52" strokeWidth="2.5" />
      <path
        d="M8 36h10l6-14 8 24 5-12h19"
        stroke="url(#brandPulse)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="13" cy="52" r="3" fill="#10B981" />
    </svg>
  )
}
