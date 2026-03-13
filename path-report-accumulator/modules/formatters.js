/**
 * @module formatters
 * @description Pure formatting functions for display (dates, names, addresses, HTML escaping)
 *
 * No dependencies - all pure functions
 */

export function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function fmtDateTime(s) {
  if (!s) return '\u2014';
  const d = new Date(s);
  return isNaN(d) ? s : d.toLocaleString();
}

export function fmtDate(s) {
  if (!s) return '\u2014';
  const d = new Date(s);
  return isNaN(d) ? s : d.toLocaleDateString();
}

export function fmtTime(s) {
  if (!s) return '';
  const d = new Date(s);
  return isNaN(d) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function fmtName(hn) {
  if (!hn) return '\u2014';
  const g = Array.isArray(hn.given) ? hn.given.join(' ') : (hn.given || '');
  const f = hn.family || '';
  return hn.text || [g, f].filter(Boolean).join(' ') || '\u2014';
}

export function calcAge(dobStr) {
  if (!dobStr) return '\u2014';
  const dob = new Date(dobStr);
  if (isNaN(dob)) return '\u2014';
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age >= 0 ? age : '\u2014';
}

export function fmtAddress(addr) {
  const a = Array.isArray(addr) ? addr[0] : addr;
  if (!a) return '\u2014';
  const p = [];
  if (a.line?.length) p.push(a.line.join(', '));
  if (a.city) p.push(a.city);
  if (a.state) p.push(a.state);
  if (a.postalCode) p.push(a.postalCode);
  return p.join(', ') || '\u2014';
}

export function safeId(s) {
  return 'g_' + String(s ?? '').toLowerCase().replace(/[^a-z0-9\-_]+/g, '_');
}

export function fmtRefRange(refRange) {
  if (!refRange) return '\u2014';
  const { low, high } = refRange;
  if (low != null && high != null) return `${low}\u2013${high}`;
  if (low != null) return `\u2265${low}`;
  if (high != null) return `\u2264${high}`;
  return '\u2014';
}
