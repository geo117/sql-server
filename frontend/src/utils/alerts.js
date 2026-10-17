import Swal from 'sweetalert2'

import { escapeHtml } from './escape'
import { formatMs } from './format'

const BASE = {
  customClass: { popup: 'swal-theme' },
  buttonsStyling: true,
  reverseButtons: true,
  allowOutsideClick: false,
}

function detailRow(label, value) {
  if (value === null || value === undefined || value === '') return ''
  return `<div><b>${escapeHtml(label)}:</b> ${escapeHtml(value)}</div>`
}

/**
 * Confirmación en dos pasos antes de terminar una sesión.
 * Paso 1: advertencia con el contexto. Paso 2: confirmación destructiva.
 * Devuelve `true` solo si el operador confirma ambos pasos.
 */
export async function confirmKillProcess({ spid, role, user, host, program, database, waitMs }) {
  const detail = `
    <div class="swal-detail">
      ${detailRow('SPID', spid)}
      ${detailRow('Tipo', role)}
      ${detailRow('Usuario', user)}
      ${detailRow('Host', host)}
      ${detailRow('Programa', program)}
      ${detailRow('Base de datos', database)}
      ${waitMs ? detailRow('Espera', formatMs(waitMs)) : ''}
    </div>`

  const first = await Swal.fire({
    ...BASE,
    icon: 'warning',
    title: '¿Terminar esta sesión?',
    html: `Estás a punto de ejecutar <b>KILL ${escapeHtml(spid)}</b> sobre SQL Server. La transacción en curso se revertirá.${detail}`,
    showCancelButton: true,
    confirmButtonText: 'Continuar',
    cancelButtonText: 'Cancelar',
    focusCancel: true,
    customClass: { popup: 'swal-theme', confirmButton: 'swal-btn-primary', cancelButton: 'swal-btn-ghost' },
  })

  if (!first.isConfirmed) return false

  const second = await Swal.fire({
    ...BASE,
    icon: 'error',
    title: `Confirmar KILL ${escapeHtml(spid)}`,
    html: `Esta acción no se puede deshacer. Confirma una vez más para terminar la sesión <b>${escapeHtml(spid)}</b>.`,
    showCancelButton: true,
    confirmButtonText: `Terminar sesión ${escapeHtml(spid)}`,
    cancelButtonText: 'Detener',
    focusCancel: true,
    customClass: { popup: 'swal-theme', confirmButton: 'swal-btn-danger', cancelButton: 'swal-btn-ghost' },
  })

  return second.isConfirmed
}

export function toastSuccess(message) {
  return Swal.fire({
    ...BASE,
    icon: 'success',
    title: 'Hecho',
    text: message,
    timer: 3200,
    timerProgressBar: true,
    showConfirmButton: false,
    allowOutsideClick: true,
    customClass: { popup: 'swal-theme' },
  })
}

export function toastError(message) {
  return Swal.fire({
    ...BASE,
    icon: 'error',
    title: 'No se pudo completar',
    text: message,
    confirmButtonText: 'Entendido',
    allowOutsideClick: true,
    customClass: { popup: 'swal-theme', confirmButton: 'swal-btn-danger' },
  })
}

export function toastInfo(message) {
  return Swal.fire({
    ...BASE,
    icon: 'info',
    title: 'Información',
    text: message,
    toast: true,
    position: 'bottom-end',
    timer: 2800,
    timerProgressBar: true,
    showConfirmButton: false,
    allowOutsideClick: true,
    customClass: { popup: 'swal-theme' },
  })
}
