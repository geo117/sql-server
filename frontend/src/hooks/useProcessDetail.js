import { useCallback, useState } from 'react'

/** Estado compartido para abrir/cerrar el modal de detalle de un proceso. */
export function useProcessDetail() {
  const [process, setProcess] = useState(null)

  const open = useCallback((value) => setProcess(value), [])
  const close = useCallback(() => setProcess(null), [])

  return { process, open, close, isOpen: process !== null }
}
