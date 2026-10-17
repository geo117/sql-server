import { useMemo, useState } from 'react'
import Form from 'react-bootstrap/Form'
import { FaCode, FaMagnifyingGlass, FaSkull, FaSortDown, FaSortUp } from 'react-icons/fa6'

import { formatMs, formatNumber, toNumber } from '../../utils/format'
import { isSlowQuery } from '../../utils/process'
import EmptyState from '../common/EmptyState'
import { StatusPill } from '../common/Pill'

const COLUMNS = [
  { key: 'session_id', label: 'SPID', numeric: true },
  { key: 'login_name', label: 'Usuario' },
  { key: 'host_name', label: 'Host' },
  { key: 'program_name', label: 'Programa' },
  { key: 'database_name', label: 'BD' },
  { key: 'status', label: 'Estado' },
  { key: 'cpu_time', label: 'CPU (ms)', numeric: true },
  { key: 'logical_reads', label: 'Lecturas lógicas', numeric: true },
  { key: 'elapsed_time_ms', label: 'Transcurrido', numeric: true },
]

const FILTERS = {
  all: 'Todos',
  blocked: 'Solo bloqueados',
  slow: 'Solo consultas lentas',
}

function compare(a, b, key, numeric) {
  if (numeric) return toNumber(a[key]) - toNumber(b[key])
  return String(a[key] ?? '').localeCompare(String(b[key] ?? ''), 'es')
}

export default function ActiveProcessesTable({
  rows = [],
  slowQueryMs = 5000,
  onView,
  onKill,
  killingSpid = null,
}) {
  const [sort, setSort] = useState({ key: 'cpu_time', dir: 'desc' })
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')

  const maxElapsed = useMemo(
    () => rows.reduce((max, row) => Math.max(max, toNumber(row.elapsed_time_ms)), 0),
    [rows],
  )

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase()

    const filtered = rows.filter((row) => {
      if (filter === 'blocked' && toNumber(row.blocking_session_id) <= 0) return false
      if (filter === 'slow' && !isSlowQuery(row.elapsed_time_ms, slowQueryMs)) return false
      if (!needle) return true

      return [row.session_id, row.login_name, row.host_name, row.program_name, row.database_name, row.statement_text]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    })

    const column = COLUMNS.find((item) => item.key === sort.key)
    const sorted = [...filtered].sort((a, b) => {
      const result = compare(a, b, sort.key, column?.numeric)
      return sort.dir === 'asc' ? result : -result
    })

    return sorted
  }, [rows, query, filter, sort, slowQueryMs])

  const toggleSort = (key) => {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'desc' },
    )
  }

  // Se limita el render para no congelar la interfaz con listas enormes.
  const MAX_ROWS = 300
  const shownRows = visibleRows.slice(0, MAX_ROWS)
  const truncated = visibleRows.length > MAX_ROWS

  return (
    <section className="panel" aria-labelledby="active-table-title">
      <div className="panel__head">
        <h2 className="panel__title" id="active-table-title">
          Procesos activos
        </h2>
        <span className="count-chip">{formatNumber(rows.length)}</span>

        <div className="panel__tools">
          <div className="position-relative">
            <FaMagnifyingGlass
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-dim)',
                fontSize: '0.75rem',
                pointerEvents: 'none',
              }}
            />
            <Form.Control
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar usuario, host, BD o SPID"
              aria-label="Buscar en procesos activos"
              style={{ paddingLeft: 32, width: 240, maxWidth: '100%' }}
            />
          </div>

          <Form.Select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            aria-label="Filtrar procesos"
            style={{ width: 200 }}
          >
            {Object.entries(FILTERS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Form.Select>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<FaCode aria-hidden="true" />}
          title="Sin procesos activos"
          text="Ahora mismo no hay solicitudes de usuario en ejecución. Es un buen momento para respirar."
        />
      ) : visibleRows.length === 0 ? (
        <EmptyState
          icon={<FaMagnifyingGlass aria-hidden="true" />}
          title="Ningún proceso coincide"
          text="Ajusta la búsqueda o cambia el filtro para ver otros procesos."
        />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <caption className="visually-hidden">
              Procesos activos de SQL Server, ordenables y filtrables.
            </caption>
            <thead>
              <tr>
                {COLUMNS.map((column) => {
                  const isSorted = sort.key === column.key
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      className="is-sortable"
                      aria-sort={isSorted ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      style={column.numeric ? { textAlign: 'right' } : undefined}
                    >
                      <button
                        type="button"
                        className="th-sort-btn"
                        onClick={() => toggleSort(column.key)}
                        title={`Ordenar por ${column.label}`}
                      >
                        {column.label}
                        {isSorted ? sort.dir === 'asc' ? <FaSortUp /> : <FaSortDown /> : null}
                      </button>
                    </th>
                  )
                })}
                <th scope="col" style={{ textAlign: 'right' }}>
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {shownRows.map((row) => {
                const elapsed = toNumber(row.elapsed_time_ms)
                const blocked = toNumber(row.blocking_session_id) > 0
                const slow = isSlowQuery(elapsed, slowQueryMs)
                const rowClass = blocked ? 'row-danger' : slow ? 'row-warning' : undefined
                const ratio = maxElapsed > 0 ? elapsed / maxElapsed : 0
                const barColor = blocked
                  ? 'var(--danger)'
                  : slow
                    ? 'var(--warning)'
                    : 'var(--primary)'

                return (
                  <tr key={row.session_id ?? `${row.login_name}-${elapsed}`} className={rowClass}>
                    <td className="mono">{row.session_id}</td>
                    <td>{row.login_name ?? '—'}</td>
                    <td className="cell-truncate" title={row.host_name ?? ''}>
                      {row.host_name ?? '—'}
                    </td>
                    <td className="cell-truncate" title={row.program_name ?? ''}>
                      {row.program_name ?? '—'}
                    </td>
                    <td className="cell-truncate" title={row.database_name ?? ''}>
                      {row.database_name ?? '—'}
                    </td>
                    <td>
                      <StatusPill status={row.status} />
                    </td>
                    <td className="cell-num">{formatNumber(toNumber(row.cpu_time))}</td>
                    <td className="cell-num">{formatNumber(toNumber(row.logical_reads))}</td>
                    <td className="cell-num">
                      <span className="elapsed">
                        <span className="elapsed__bar" aria-hidden="true">
                          <span style={{ width: `${Math.round(ratio * 100)}%`, background: barColor }} />
                        </span>
                        {formatMs(elapsed)}
                      </span>
                    </td>
                    <td>
                      <span className="row-actions">
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => onView(row)}
                          aria-label={`Ver la consulta del SPID ${row.session_id}`}
                          title="Ver consulta y plan"
                        >
                          <FaCode aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="icon-btn icon-btn--danger"
                          onClick={() => onKill(row)}
                          disabled={killingSpid !== null}
                          aria-label={`Terminar la sesión ${row.session_id}`}
                          title={`Terminar sesión ${row.session_id}`}
                        >
                          <FaSkull aria-hidden="true" />
                        </button>
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {truncated ? (
            <p className="panel__subtitle" style={{ padding: 'var(--sp-3) var(--sp-4)' }}>
              Mostrando {formatNumber(MAX_ROWS)} de {formatNumber(visibleRows.length)} procesos. Afina la
              búsqueda para ver el resto.
            </p>
          ) : null}
        </div>
      )}
    </section>
  )
}
