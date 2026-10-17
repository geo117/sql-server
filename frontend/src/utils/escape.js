const ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/**
 * Escapa texto que proviene de la base de datos antes de insertarlo en HTML.
 * Necesario para los diálogos de SweetAlert2, que renderizan HTML crudo.
 */
export function escapeHtml(value) {
  if (value === null || value === undefined) return ''
  return String(value).replace(/[&<>"']/g, (character) => ENTITIES[character])
}
