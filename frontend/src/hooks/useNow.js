import { useEffect, useState } from 'react'

/**
 * Devuelve un timestamp que se actualiza cada `intervalMs`.
 * Se usa para que las etiquetas relativas ("hace 3 s") sigan avanzando
 * aunque no haya nuevos datos.
 */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])

  return now
}
