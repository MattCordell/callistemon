/**
 * @module formatters
 * @description Pure display formatting functions (no FHIR-specific logic, no network calls)
 *
 * Provides functions for:
 * - Name formatting
 * - Address formatting
 * - Date/time formatting
 * - Age calculation
 * - Time since display
 * - Image source generation
 * - HTML escaping for XSS prevention
 */

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
export function escapeHtml(text) {
  if (text == null) return '';
  const str = String(text);
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return str.replace(/[&<>"']/g, m => map[m]);
}

/**
 * Format a FHIR HumanName to a string
 * @param {Object|Array} name - FHIR HumanName or array of HumanNames
 * @returns {string} Formatted name
 */
export function fmtName(name) {
  if (!name) return '';

  // Handle array of names
  if (Array.isArray(name)) {
    if (name.length === 0) return '';
    const n = name.find(x => x.use === 'official') || name[0];
    return fmtName(n);
  }

  // Use text if available
  if (name.text && String(name.text).trim()) {
    return String(name.text).trim();
  }

  // Build from parts
  const family = (name.family ? String(name.family) : '').trim();
  const givenArr = (Array.isArray(name.given)
    ? name.given
    : (name.given ? [name.given] : []))
    .map(g => String(g).trim())
    .filter(Boolean);
  const given = givenArr.join(' ');

  const parts = [family, given].filter(Boolean);
  return parts.join(', ').trim();
}

/**
 * Format a patient name with fallback
 * @param {Object} patient - FHIR Patient resource
 * @returns {string} Patient name or "(no name)"
 */
export function fmtPatientName(patient) {
  if (!patient) return '(no name)';
  return fmtName(patient.name) || '(no name)';
}

/**
 * Calculate age from birth date
 * @param {string} birthDate - ISO date string
 * @returns {string} Age in years
 */
export function calcAge(birthDate) {
  if (!birthDate) return '';
  const dob = new Date(birthDate);
  if (Number.isNaN(dob.getTime())) return '';

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return String(age);
}

/**
 * Format a FHIR Address to a string
 * @param {Object|Array} address - FHIR Address or array of Addresses
 * @returns {string} Formatted address
 */
export function fmtAddress(address) {
  if (!address) return '';

  const a = Array.isArray(address) ? address[0] : address;
  if (!a) return '';

  // Use text if available
  if (a.text && String(a.text).trim()) {
    return String(a.text).trim();
  }

  // Build from parts
  const parts = [];
  if (Array.isArray(a.line) && a.line.length) {
    parts.push(a.line.join(', '));
  }
  if (a.city) parts.push(a.city);
  if (a.state) parts.push(a.state);
  if (a.postalCode) parts.push(a.postalCode);
  if (a.country) parts.push(a.country);

  return parts.filter(Boolean).join(', ');
}

/**
 * Format ISO datetime to locale string
 * @param {string} dtStr - ISO datetime string
 * @returns {string} Formatted datetime
 */
export function fmtDateTime(dtStr) {
  if (!dtStr) return '';
  const d = new Date(dtStr);
  if (Number.isNaN(d.getTime())) return dtStr;
  return d.toLocaleString();
}

/**
 * Format time elapsed since a timestamp
 * @param {string} ts - ISO timestamp
 * @returns {string} Formatted time since (e.g., "2d 3h", "5h 20m", "45m")
 */
export function fmtTimeSince(ts) {
  if (!ts) return '';
  const then = new Date(ts).getTime();
  if (Number.isNaN(then)) return '';

  let ms = Date.now() - then;
  if (ms < 0) ms = 0;

  const min = Math.floor(ms / 60000);
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;

  if (d > 0) return d + 'd ' + h + 'h';
  if (h > 0) return h + 'h ' + m + 'm';
  return m + 'm';
}

/**
 * Build absolute URL from base and path
 * @param {string} base - Base URL
 * @param {string} path - Path
 * @returns {string} Absolute URL
 */
export function absUrl(base, path) {
  const b = String(base || '').replace(/\/$/, '');
  const p = String(path || '').replace(/^\//, '');
  return b + '/' + p;
}

/**
 * Convert a FHIR Attachment to an image src
 * @param {Object} att - FHIR Attachment
 * @param {string} baseUrl - FHIR server base URL
 * @returns {string} Image source URL or data URI
 */
export function attachmentToImgSrc(att, baseUrl) {
  if (!att) return '';

  const data = att.data;
  const url = att.url;
  const ctype = att.contentType || 'image/*';

  // Data URI from base64
  if (data && typeof data === 'string' && data.length > 0) {
    return 'data:' + ctype + ';base64,' + data;
  }

  // URL
  if (url && typeof url === 'string') {
    const s = url.trim();
    if (s.startsWith('data:')) return s;
    if (/^https?:\/\//i.test(s)) return s;
    if (s.startsWith('/')) return baseUrl.replace(/\/$/, '') + s;
    return absUrl(baseUrl, s);
  }

  return '';
}

/**
 * Get patient photo source
 * @param {Object} patient - FHIR Patient resource
 * @param {string} baseUrl - FHIR server base URL
 * @returns {string} Photo source URL or data URI
 */
export function getPatientPhotoSrc(patient, baseUrl) {
  if (!patient || !patient.photo || !Array.isArray(patient.photo) || patient.photo.length === 0) {
    return '';
  }

  for (let i = 0; i < patient.photo.length; i++) {
    const src = attachmentToImgSrc(patient.photo[i], baseUrl);
    if (src) return src;
  }

  return '';
}
