import { useState } from 'react'
import Button from 'react-bootstrap/Button'
import Form from 'react-bootstrap/Form'
import { FaPlugCircleCheck, FaRotateLeft, FaFloppyDisk, FaShieldHalved } from 'react-icons/fa6'

import { useMonitor } from '../context/useMonitor'
import { ApiError, testConnection } from '../services/api'
import { REFRESH_OPTIONS } from '../services/settings'
import { toastError, toastSuccess } from '../utils/alerts'

export default function SettingsPage() {
  const { settings, updateSettings, resetAllSettings, lastUpdated, connection } = useMonitor()
  const [form, setForm] = useState(() => ({ ...settings }))
  const [testing, setTesting] = useState(false)

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const handleSave = async () => {
    updateSettings(form)
    await toastSuccess('Ajustes guardados.')
  }

  const handleTest = async () => {
    setTesting(true)
    try {
      const result = await testConnection({ baseUrl: form.apiBaseUrl, apiKey: form.apiKey })
      const database = result?.database === 'reachable' ? 'base de datos accesible' : 'base de datos no accesible'
      await toastSuccess(`El backend responde y la ${database}.`)
    } catch (failure) {
      const message =
        failure instanceof ApiError
          ? failure.status === 401
            ? 'El backend rechazó la API key (401).'
            : failure.message
          : 'No se pudo contactar con el backend.'
      await toastError(message)
    } finally {
      setTesting(false)
    }
  }

  const handleReset = async () => {
    resetAllSettings()
    setForm((current) => ({
      ...current,
      apiBaseUrl: '',
      apiKey: '',
      slowQueryMs: 5000,
      waitWarnMs: 10000,
      waitCritMs: 30000,
      refreshInterval: 5000,
    }))
    await toastSuccess('Ajustes restaurados a sus valores por defecto.')
  }

  return (
    <div className="settings-grid">
      <div className="stack">
        {/*<section className="panel">
          <div className="panel__head">
            <h2 className="panel__title">Conexión al backend</h2>
            <span className="count-chip" data-tone={connection === 'offline' ? 'danger' : undefined}>
              {connection}
            </span>
          </div>
          <div className="panel__body">
            <div className="field-row">
              <label className="field-label" htmlFor="apiBaseUrl">
                URL del API
              </label>
              <Form.Control
                id="apiBaseUrl"
                type="text"
                inputMode="url"
                value={form.apiBaseUrl}
                onChange={(event) => update('apiBaseUrl', event.target.value)}
                placeholder="https://servidor:8000"
                spellCheck={false}
              />
              <p className="field-hint">
                Déjalo vacío para usar el mismo origen (el proxy de desarrollo redirige a
                localhost:8000). Solo se admiten rutas relativas o URLs http/https.
              </p>
            </div>

            <div className="field-row">
              <label className="field-label" htmlFor="apiKey">
                API key
              </label>
              <Form.Control
                id="apiKey"
                type="password"
                value={form.apiKey}
                onChange={(event) => update('apiKey', event.target.value)}
                placeholder="Se envía en la cabecera X-API-Key"
                autoComplete="off"
                spellCheck={false}
              />
              <p className="field-hint">
                Solo es necesaria si el backend define <code>API_KEY</code>.
              </p>
            </div>

            <div className="row-wrap" style={{ marginTop: 'var(--sp-5)' }}>
              <Button
                variant="primary"
                onClick={handleSave}
                className="d-inline-flex align-items-center gap-2"
              >
                <FaFloppyDisk aria-hidden="true" />
                Guardar cambios
              </Button>
              <Button
                variant="outline-secondary"
                onClick={handleTest}
                disabled={testing}
                className="d-inline-flex align-items-center gap-2"
              >
                <FaPlugCircleCheck aria-hidden="true" />
                {testing ? 'Probando…' : 'Probar conexión'}
              </Button>
            </div>
          </div>
        </section>*/}

        <section className="panel">
          <div className="panel__head">
            <h2 className="panel__title">Umbrales de alerta</h2>
          </div>
          <div className="panel__body">
            <div className="field-row">
              <label className="field-label" htmlFor="slowQueryMs">
                Consulta lenta (ms)
              </label>
              <Form.Control
                id="slowQueryMs"
                type="number"
                min="100"
                step="500"
                value={form.slowQueryMs}
                onChange={(event) => update('slowQueryMs', event.target.value)}
              />
              <p className="field-hint">
                Las filas que superan este tiempo se resaltan en ámbar. Por defecto 5000 ms.
              </p>
            </div>

            <div className="field-row">
              <label className="field-label" htmlFor="waitWarnMs">
                Advertencia de espera (ms)
              </label>
              <Form.Control
                id="waitWarnMs"
                type="number"
                min="100"
                step="1000"
                value={form.waitWarnMs}
                onChange={(event) => update('waitWarnMs', event.target.value)}
              />
              <p className="field-hint">Bloqueos que superan este tiempo pasan a ámbar.</p>
            </div>

            <div className="field-row">
              <label className="field-label" htmlFor="waitCritMs">
                Espera crítica (ms)
              </label>
              <Form.Control
                id="waitCritMs"
                type="number"
                min="100"
                step="1000"
                value={form.waitCritMs}
                onChange={(event) => update('waitCritMs', event.target.value)}
              />
              <p className="field-hint">Bloqueos que superan este tiempo pasan a rojo.</p>
            </div>

            <div className="field-row">
              <label className="field-label" htmlFor="refreshInterval">
                Auto-refresco
              </label>
              <Form.Select
                id="refreshInterval"
                value={form.refreshInterval}
                onChange={(event) => update('refreshInterval', Number(event.target.value))}
              >
                {REFRESH_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.value === 0 ? 'Pausa' : `Cada ${option.label}`}
                  </option>
                ))}
              </Form.Select>
            </div>

            <div className="row-wrap" style={{ marginTop: 'var(--sp-5)' }}>
              <Button
                variant="primary"
                onClick={handleSave}
                className="d-inline-flex align-items-center gap-2"
              >
                <FaFloppyDisk aria-hidden="true" />
                Guardar cambios
              </Button>
            </div>
          </div>
        </section>
      </div>

      <div className="stack">
        <section className="panel">
          <div className="panel__head">
            <h2 className="panel__title">
              <FaShieldHalved aria-hidden="true" style={{ color: 'var(--success)' }} />
              Seguridad
            </h2>
          </div>
          <div className="panel__body stack">
            <div className="note note--warning">
              <FaShieldHalved className="note__icon" aria-hidden="true" />
              <span>
                Esta consola puede ejecutar <code>KILL</code> y muestra texto de consultas. No la
                expongas a Internet sin protegerla.
              </span>
            </div>
            <p className="field-hint" style={{ margin: 0 }}>
              La API key se guarda en este navegador y viaja en la cabecera <code>X-API-Key</code>.
              Úsala siempre junto con HTTPS, una red interna o VPN, y un login de base de datos con
              el mínimo privilegio (<code>VIEW SERVER STATE</code>, <code>ALTER ANY CONNECTION</code>).
            </p>
            <p className="field-hint" style={{ margin: 0 }}>
              Última lectura: {lastUpdated ? new Date(lastUpdated).toLocaleString('es-ES') : '—'}
            </p>
          </div>
        </section>

        <section className="panel">
          <div className="panel__head">
            <h2 className="panel__title">Restablecer</h2>
          </div>
          <div className="panel__body">
            <p className="field-hint" style={{ marginTop: 0 }}>
              Vuelve a los valores por defecto y borra la configuración guardada en este navegador.
            </p>
            <Button
              variant="outline-secondary"
              onClick={handleReset}
              className="d-inline-flex align-items-center gap-2"
            >
              <FaRotateLeft aria-hidden="true" />
              Restaurar valores por defecto
            </Button>
          </div>
        </section>
      </div>
    </div>
  )
}
