import { createContext } from 'react'

/**
 * Contexto de monitoreo. Vive en su propio módulo (sin componentes)
 * para no romper el fast refresh y permitir que el hook y el provider
 * se importen desde cualquier lugar.
 */
export const MonitorContext = createContext(null)
