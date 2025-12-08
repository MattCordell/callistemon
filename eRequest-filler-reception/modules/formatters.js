/**
 * @module formatters
 * @description Pure formatting functions for display (dates, names, addresses, HTML escaping)
 *
 * Provides functions for:
 * - HTML escaping for XSS prevention
 * - Date and time formatting
 * - Name and address formatting
 * - Status and priority badge formatting
 *
 * No dependencies - all pure functions
 */

/**
 * Escapes HTML special characters to prevent XSS attacks
 * @param {string} s - String to escape
 * @returns {string} HTML-safe string
 */
export function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Format a date/time string for display
 * @param {string} s - ISO date string
 * @returns {string} Formatted date/time or '—' if invalid
 */
export function fmtDateTime(s) {
  if (!s) return '—';
  const d = new Date(s);
  return isNaN(d) ? s : d.toLocaleString();
}

/**
 * Format a FHIR HumanName into a readable string
 * @param {Object} hn - FHIR HumanName object
 * @returns {string} Formatted name or '—' if unavailable
 */
export function fmtName(hn) {
  if (!hn) return '—';
  const g = Array.isArray(hn.given) ? hn.given.join(' ') : (hn.given || '');
  const f = hn.family || '';
  return hn.text || [g, f].filter(Boolean).join(' ') || '—';
}

/**
 * Calculate age from date of birth
 * @param {string} dobStr - Date of birth in ISO format
 * @returns {string|number} Age in years or '—' if invalid
 */
export function calcAge(dobStr) {
  if (!dobStr) return '—';
  const dob = new Date(dobStr);
  if (isNaN(dob)) return '—';
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age >= 0 ? age : '—';
}

/**
 * Format a FHIR Address into a readable string
 * @param {Object|Array} addr - FHIR Address object or array of addresses
 * @returns {string} Formatted address or '—' if unavailable
 */
export function fmtAddress(addr) {
  const a = Array.isArray(addr) ? addr[0] : addr;
  if (!a) return '—';
  const p = [];
  if (a.line?.length) p.push(a.line.join(', '));
  if (a.city) p.push(a.city);
  if (a.state) p.push(a.state);
  if (a.postalCode) p.push(a.postalCode);
  if (a.country) p.push(a.country);
  return p.join(', ') || '—';
}

/**
 * Convert a FHIR Attachment to a data URI
 * @param {Object} att - FHIR Attachment object
 * @returns {string|null} Data URI or null if unavailable
 */
export function toDataUri(att) {
  if (!att) return null;
  if (att.data) {
    const ct = att.contentType || 'image/jpeg';
    const raw = att.data.trim();
    return /^data:image\/[a-zA-Z+.-]+;base64,/.test(raw) ? raw : `data:${ct};base64,${raw}`;
  }
  return att.url || null;
}

/**
 * Create a DOM-safe ID from a string
 * @param {string} s - String to convert
 * @returns {string} Safe ID string
 */
export function safeId(s) {
  return 'g_' + String(s ?? '').toLowerCase().replace(/[^a-z0-9\-_]+/g, '_');
}

/**
 * Convert a FHIR status code to human-readable format with color tone
 * @param {string} s - FHIR status code
 * @returns {Array} [human readable label, color tone class]
 */
export function humanStatus(s) {
  if (!s) return ['Unknown', 'err'];
  const map = {
    draft: ['Draft', 'warn'],
    active: ['Active', 'ok'],
    'on-hold': ['On hold', 'warn'],
    revoked: ['Revoked', 'err'],
    completed: ['Completed', 'ok'],
    'entered-in-error': ['Entered in error', 'err'],
    unknown: ['Unknown', 'err'],
    requested: ['Requested', 'warn'],
    'in-progress': ['In progress', 'ok']
  };
  return map[s] || [s, 'warn'];
}

/**
 * Convert a FHIR priority code to human-readable format with color tone
 * @param {string} p - FHIR priority code
 * @returns {Array} [human readable label, color tone class]
 */
export function humanPriority(p) {
  const map = {
    routine: ['Routine', ''],
    urgent: ['Urgent', 'warn'],
    asap: ['ASAP', 'warn'],
    stat: ['STAT', 'err']
  };
  return map[p] || [p || 'Routine', ''];
}
