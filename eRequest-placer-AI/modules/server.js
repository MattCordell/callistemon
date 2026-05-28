// modules/server.js — Send to FHIR server, resolve Task Group URL, QR modal, auth

import { state } from './state.js';
import { showStatus, setDebugUrl } from './utils.js';
import { AU_PROFILES } from '../config.js';
import { buildBundle } from './bundle-builder.js';

// ----- Auth config -----
export const AUTH_CONFIGS = [
  { match: 'aidbox.beda.software', user: 'root', storageKey: 'aidbox_pwd', nice: 'Aidbox' },
  { match: 'smile.sparked-fhir.com', user: 'placer', storageKey: 'sparked_pwd', nice: 'Sparked' },
];

function matchAuthConfig(base) {
  if (!base) return null;
  for (let i = 0; i < AUTH_CONFIGS.length; i++) {
    if (base.indexOf(AUTH_CONFIGS[i].match) > -1) return AUTH_CONFIGS[i];
  }
  return null;
}

function getPwd(key) { try { return localStorage.getItem(key) || ''; } catch (_e) { return ''; } }
function setPwd(key, val) { try { localStorage.setItem(key, val); } catch (_e) { /* storage blocked */ } }

function basicHeader(user, pwd) {
  if (!user || !pwd) return null;
  return 'Basic ' + btoa(user + ':' + pwd);
}

// ----- Monkey-patch fetch for Basic Auth -----
// Wraps window.fetch once; injects Basic Auth on requests targeting state.FHIR_BASE.
// state.FHIR_BASE is read on each call so changing the configured server is honoured.
export function initAuthFetch() {
  if (!window.__origFetch) {
    window.__origFetch = window.fetch.bind(window);
    window.fetch = function(input, init) {
      init = init || {};
      try {
        const url = (typeof input === 'string') ? input : (input && input.url) || '';
        if (url && state.FHIR_BASE && url.toLowerCase().startsWith(state.FHIR_BASE.replace(/\/+$/, '').toLowerCase())) {
          const cfg = matchAuthConfig(state.FHIR_BASE);
          if (cfg) {
            const pwd = getPwd(cfg.storageKey);
            const auth = basicHeader(cfg.user, pwd);
            if (auth) {
              const newInit = Object.assign({}, init);
              newInit.headers = Object.assign({ Accept: 'application/fhir+json' }, (init && init.headers) || {}, { Authorization: auth });
              return window.__origFetch(input, newInit);
            }
          }
        }
      } catch (_e) { /* fall through to bare fetch */ }
      return window.__origFetch(input, init);
    };
  }
}

export function maybePromptPasswordFor(base) {
  const cfg = matchAuthConfig(base);
  const hint = document.getElementById('auth-hint');
  if (!cfg) { if (hint) hint.textContent = ''; return; }
  const stored = getPwd(cfg.storageKey);
  if (hint) hint.textContent = stored ? ('Auth ready for ' + cfg.nice) : (cfg.nice + ' needs a password');
}

export function initAuthManage() {
  const btn = document.getElementById('auth-manage');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const cfg = matchAuthConfig(state.FHIR_BASE);
    if (!cfg) { showStatus('No auth needed for this server'); return; }
    const entered = prompt('Password for ' + cfg.nice + ' (' + cfg.user + '):', getPwd(cfg.storageKey));
    if (entered === null) return;
    if (String(entered).trim()) {
      setPwd(cfg.storageKey, String(entered).trim());
      showStatus('Saved password for ' + cfg.nice);
    } else {
      setPwd(cfg.storageKey, '');
      showStatus('Cleared saved password for ' + cfg.nice);
    }
    maybePromptPasswordFor(state.FHIR_BASE);
  });
}

// ----- QR modal -----
export function showQr(url) {
  const qrUrlEl = document.getElementById('qr-url');
  qrUrlEl.textContent = url || '';
  const box = document.getElementById('qrcode');
  box.innerHTML = '';
  // QRCode is loaded via CDN; remains a global.
  new QRCode(box, { text: url || '', width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M });
  document.getElementById('qr-backdrop').style.display = 'flex';
}

export function initQrModal() {
  const backdrop = document.getElementById('qr-backdrop');
  const close = document.getElementById('qr-close');
  const open = document.getElementById('qr-open');
  const copy = document.getElementById('qr-copy');
  const urlEl = document.getElementById('qr-url');

  close.addEventListener('click', () => { backdrop.style.display = 'none'; });
  open.addEventListener('click', () => { const u = (urlEl.textContent || '').trim(); if (u) window.open(u, '_blank'); });
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText((urlEl.textContent || '').trim());
      const t = copy.textContent;
      copy.textContent = 'Copied!';
      setTimeout(() => { copy.textContent = t; }, 1200);
    } catch (_e) { /* clipboard blocked */ }
  });
}

// ----- Resolve Task Group URL -----
export async function resolveTaskGroupUrlFromServer() {
  try {
    if (!state.lastRequisitionId) return null;
    const url = new URL(state.FHIR_BASE + '/Task');
    url.searchParams.set('identifier', state.lastRequisitionId);
    url.searchParams.set('_count', '5');
    setDebugUrl(url.toString());
    const r = await fetch(url.toString(), { headers: { Accept: 'application/fhir+json' } });
    if (!r.ok) return null;
    const j = await r.json();
    const entries = Array.isArray(j.entry) ? j.entry : [];
    let group = null;
    for (let i = 0; i < entries.length; i++) {
      const res = entries[i].resource;
      const profiles = (res && res.meta && res.meta.profile) || [];
      if (profiles.indexOf(AU_PROFILES.TASK_GROUP) > -1) { group = res; break; }
    }
    if (!group) {
      for (let i2 = 0; i2 < entries.length; i2++) {
        const res2 = entries[i2].resource;
        if (res2 && !res2.focus) { group = res2; break; }
      }
    }
    if (!group || !group.id) return null;
    return state.FHIR_BASE.replace(/\/$/, '') + '/Task/' + group.id;
  } catch (e) { console.warn('resolveTaskGroupUrlFromServer', e); return null; }
}

// ----- Send to server -----
export function initSendButton() {
  const sendingOverlay = document.getElementById('sending-overlay');
  const sendBtn = document.getElementById('send-btn');
  const newRequestBtn = document.getElementById('new-request-btn');

  sendBtn.addEventListener('click', async () => {
    const out = document.getElementById('server-response');
    out.textContent = 'Sending...';
    const built = buildBundle();
    const bundle = built.bundle;

    sendingOverlay.style.display = 'flex';
    sendBtn.classList.add('btn-disabled');

    try {
      const r = await fetch(state.FHIR_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/fhir+json', Accept: 'application/fhir+json' },
        body: JSON.stringify(bundle),
      });
      const text = await r.text();
      out.textContent = 'Response ' + r.status + ':\n' + text;

      if (r.status === 200) {
        let groupUrl = await resolveTaskGroupUrlFromServer();

        if (!groupUrl) {
          try {
            const j = JSON.parse(text);
            const respEntries = Array.isArray(j && j.entry ? j.entry : []) ? j.entry : [];
            for (let i = 0; i < respEntries.length; i++) {
              const loc = (respEntries[i] && respEntries[i].response && respEntries[i].response.location) ||
                          (respEntries[i] && respEntries[i].location) || null;
              if (loc && /\/Task\/.+/.test(loc)) {
                groupUrl = loc.indexOf('http') === 0 ? loc : (state.FHIR_BASE.replace(/\/$/, '') + '/' + loc.replace(/^\//, ''));
                break;
              }
            }
          } catch (err) { console.warn('Could not parse response JSON for location', err); }
        }

        if (groupUrl) { showQr(groupUrl); }
        newRequestBtn.classList.remove('hidden');
      }
    } catch (e) {
      console.error(e);
      out.textContent = 'Network error: ' + e.message;
    } finally {
      sendingOverlay.style.display = 'none';
      sendBtn.classList.remove('btn-disabled');
    }
  });
}
