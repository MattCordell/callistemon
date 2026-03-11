/**
 * @module auth
 * @description Basic Auth credential management and fetch monkey-patching
 *
 * Intercepts fetch calls to known servers and injects Authorization headers.
 * Credentials are stored in localStorage — never in source.
 */

import { CONFIG } from '../config.js';

function matchAuthConfig(url) {
  if (!url) return null;
  for (const cfg of CONFIG.AUTH_CONFIGS) {
    if (url.includes(cfg.match)) return cfg;
  }
  return null;
}

function getPwd(key) {
  try { return localStorage.getItem(key) || ''; } catch (_e) { return ''; }
}

function setPwd(key, val) {
  try { localStorage.setItem(key, val); } catch (_e) {}
}

function basicHeader(user, pwd) {
  if (!user || !pwd) return null;
  return 'Basic ' + btoa(user + ':' + pwd);
}

/**
 * Monkey-patch window.fetch to inject Basic Auth headers for known servers.
 * Safe to call multiple times — only patches once.
 */
export function initAuthFetch() {
  if (window.__origFetch) return;
  window.__origFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    init = init || {};
    try {
      const url = typeof input === 'string' ? input : (input?.url || '');
      const cfg = matchAuthConfig(url);
      if (cfg) {
        const pwd = getPwd(cfg.storageKey);
        const auth = basicHeader(cfg.user, pwd);
        if (auth) {
          const newInit = { ...init, headers: { ...init.headers, Authorization: auth } };
          return window.__origFetch(input, newInit);
        }
      }
    } catch (_e) { /* fall through */ }
    return window.__origFetch(input, init);
  };
}

/**
 * Return a hint string for the given URL (e.g. "Auth ready for Sparked (filler)")
 * or null if no auth config applies.
 * @param {string} url
 * @returns {string|null}
 */
export function authHintFor(url) {
  const cfg = matchAuthConfig(url);
  if (!cfg) return null;
  const stored = getPwd(cfg.storageKey);
  return stored ? `Auth ready for ${cfg.nice}` : `${cfg.nice} needs a password`;
}

/**
 * Prompt the user to enter/clear a password for the server matching the given URL.
 * @param {string} url
 * @returns {string|null} Updated hint string, or null if no auth config applies.
 */
export function promptPasswordFor(url) {
  const cfg = matchAuthConfig(url);
  if (!cfg) return null;
  const entered = prompt(`Password for ${cfg.nice} (${cfg.user}):`, getPwd(cfg.storageKey));
  if (entered === null) return authHintFor(url); // cancelled
  const trimmed = String(entered).trim();
  if (trimmed) {
    setPwd(cfg.storageKey, trimmed);
    return `Saved password for ${cfg.nice}`;
  } else {
    setPwd(cfg.storageKey, '');
    return `Cleared saved password for ${cfg.nice}`;
  }
}
