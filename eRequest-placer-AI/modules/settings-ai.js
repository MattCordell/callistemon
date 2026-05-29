// modules/settings-ai.js — localStorage-backed AI settings store + settings UI extension.
//
// SECURITY / KEY-EXPOSURE NOTE
// ----------------------------
// Two routes, selected by the USE_OWN_OPENROUTER_KEY toggle:
//
//   Default mode (USE_OWN_OPENROUTER_KEY = false):
//     The browser holds NO OpenRouter API key. Chat-completion calls go to the
//     managed Cloudflare Worker proxy, which injects the key server-side. Nothing
//     sensitive is stored client-side.
//
//   Override mode (USE_OWN_OPENROUTER_KEY = true):
//     The user's own OpenRouter API key is stored in localStorage under
//     AI_SETTINGS_KEY and sent directly to OpenRouter as `Authorization: Bearer`.
//     This carries the SAME risk posture as the FHIR auth passwords this app
//     already stores (see modules/server.js): readable by any script on this
//     origin and by anyone with access to the browser. Acceptable for a
//     demo/reference app; production adopters should be warned (spec §9, §9.1).
//
// All settings are a single JSON blob keyed by AI_SETTINGS_KEY, layered over
// AI_DEFAULTS so newly-added defaults appear automatically for existing users.

import { AI_DEFAULTS, AI_SETTINGS_KEY } from '../config.js';

// Models offered in the settings dropdown. The stored model is added on top if
// it isn't already listed, so an operator-set custom model is never lost.
const MODEL_OPTIONS = [
  'google/gemma-4-31b-it:free',
  'anthropic/claude-haiku-4-5',
  'anthropic/claude-sonnet-4-5',
  'openai/gpt-4o-mini',
];

// ----- Store -----

/** Read the merged settings object (defaults overlaid with stored overrides). */
export function getAiSettings() {
  let stored = {};
  try {
    const raw = localStorage.getItem(AI_SETTINGS_KEY);
    if (raw) stored = JSON.parse(raw) || {};
  } catch (_e) { stored = {}; }
  return { ...AI_DEFAULTS, ...stored };
}

/** Persist a single setting, merged into the existing blob. */
export function setAiSetting(key, value) {
  let stored = {};
  try {
    const raw = localStorage.getItem(AI_SETTINGS_KEY);
    if (raw) stored = JSON.parse(raw) || {};
  } catch (_e) { stored = {}; }
  stored[key] = value;
  try { localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(stored)); }
  catch (_e) { /* storage blocked — settings stay in-memory for this load only */ }
}

/** Clear all stored overrides, reverting to AI_DEFAULTS. */
export function resetAiSettings() {
  try { localStorage.removeItem(AI_SETTINGS_KEY); }
  catch (_e) { /* storage blocked */ }
}

/** Master AI toggle. */
export function isAiEnabled() {
  return !!getAiSettings().AI_FEATURES_ENABLED;
}

/** Decision support is gated by both its own toggle and the master toggle. */
export function isDecisionSupportEnabled() {
  const s = getAiSettings();
  return !!s.AI_FEATURES_ENABLED && !!s.DECISION_SUPPORT_ENABLED;
}

// ----- UI extension -----

let panelInitialised = false;

/**
 * Extend the existing #server-panel popout with an "AI Settings" <details> block.
 * Idempotent. Does NOT introduce a new floating button (spec / issue requirement).
 */
export function initAiSettingsPanel() {
  if (panelInitialised) return;
  const host = document.getElementById('server-panel-body');
  if (!host) return;

  const s = getAiSettings();
  const details = document.createElement('details');
  details.className = 'ai-settings mt-2';
  details.innerHTML = buildPanelHtml(s);
  host.appendChild(details);

  wirePanel(details, s);
  panelInitialised = true;
}

function modelOptionsHtml(current) {
  const opts = MODEL_OPTIONS.slice();
  if (current && !opts.includes(current)) opts.unshift(current);
  return opts.map((m) =>
    `<option value="${escapeAttr(m)}"${m === current ? ' selected' : ''}>${escapeHtml(m)}</option>`
  ).join('');
}

function buildPanelHtml(s) {
  const ta = 'border rounded w-full p-2 mono text-xs';
  return `
    <summary class="text-sm font-semibold text-blue-900">AI Settings</summary>
    <div class="mt-2 space-y-3 text-sm">
      <label class="flex items-center gap-2">
        <input type="checkbox" id="ai-enabled" class="accent-blue-600"${s.AI_FEATURES_ENABLED ? ' checked' : ''}>
        <span class="font-medium">Enable AI features</span>
      </label>
      <label class="flex items-center gap-2">
        <input type="checkbox" id="ai-decision-support-enabled" class="accent-blue-600"${s.DECISION_SUPPORT_ENABLED ? ' checked' : ''}>
        <span class="font-medium">Enable decision support</span>
      </label>

      <label class="block">
        <span class="block text-xs font-medium text-gray-600">Model</span>
        <select id="ai-model" class="border rounded w-full p-2 text-sm">${modelOptionsHtml(s.OPENROUTER_MODEL)}</select>
      </label>

      <label class="flex items-center gap-2">
        <input type="checkbox" id="ai-use-own-key" class="accent-blue-600"${s.USE_OWN_OPENROUTER_KEY ? ' checked' : ''}>
        <span class="font-medium">Use my own OpenRouter key</span>
      </label>
      <label class="block ${s.USE_OWN_OPENROUTER_KEY ? '' : 'hidden'}" id="ai-key-field">
        <span class="block text-xs font-medium text-gray-600">OpenRouter API key</span>
        <input type="password" id="ai-api-key" class="border rounded w-full p-2 mono text-xs" autocomplete="off"
               placeholder="sk-or-..." value="${escapeAttr(s.OPENROUTER_API_KEY || '')}">
        <span class="block text-[11px] text-gray-500 mt-1">Stored in localStorage on this device only — same risk posture as the FHIR auth password.</span>
      </label>

      <label class="block">
        <span class="block text-xs font-medium text-gray-600">Reason coding ECL (Feature A)</span>
        <textarea id="ai-reason-ecl" rows="2" class="${ta}">${escapeHtml(s.REASON_ECL || '')}</textarea>
      </label>
      <label class="block">
        <span class="block text-xs font-medium text-gray-600">Test selection ECL (Feature B)</span>
        <textarea id="ai-test-ecl" rows="2" class="${ta}">${escapeHtml(s.TEST_ECL || '')}</textarea>
      </label>

      <label class="block">
        <span class="block text-xs font-medium text-gray-600">Pre-prompt supplements</span>
        <textarea id="ai-supplements" rows="2" class="${ta}">${escapeHtml(s.PRE_PROMPT_SUPPLEMENTS || '')}</textarea>
      </label>
      <label class="block">
        <span class="block text-xs font-medium text-gray-600">Guidelines summary (decision support)</span>
        <textarea id="ai-guidelines" rows="3" class="${ta}">${escapeHtml(s.GUIDELINES_SUMMARY || '')}</textarea>
      </label>

      <div class="flex justify-end">
        <button type="button" id="ai-reset" class="text-xs px-2 py-1 rounded border bg-white">Reset AI settings</button>
      </div>
    </div>`;
}

function wirePanel(root, s) {
  const $ = (sel) => root.querySelector(sel);

  const enabled = $('#ai-enabled');
  const decision = $('#ai-decision-support-enabled');
  const model = $('#ai-model');
  const useOwnKey = $('#ai-use-own-key');
  const keyField = $('#ai-key-field');
  const apiKey = $('#ai-api-key');
  const reasonEcl = $('#ai-reason-ecl');
  const testEcl = $('#ai-test-ecl');
  const supplements = $('#ai-supplements');
  const guidelines = $('#ai-guidelines');
  const reset = $('#ai-reset');

  // Master + decision-support toggles fire ai-enabled-changed so app.js can
  // show/hide the .ai-feature-controls elements without a reload.
  function fireEnabledChanged() {
    document.dispatchEvent(new CustomEvent('ai-enabled-changed', {
      detail: { aiEnabled: isAiEnabled(), decisionSupportEnabled: isDecisionSupportEnabled() },
    }));
  }

  enabled.addEventListener('change', () => { setAiSetting('AI_FEATURES_ENABLED', enabled.checked); fireEnabledChanged(); });
  decision.addEventListener('change', () => { setAiSetting('DECISION_SUPPORT_ENABLED', decision.checked); fireEnabledChanged(); });
  model.addEventListener('change', () => setAiSetting('OPENROUTER_MODEL', model.value));
  useOwnKey.addEventListener('change', () => {
    setAiSetting('USE_OWN_OPENROUTER_KEY', useOwnKey.checked);
    keyField.classList.toggle('hidden', !useOwnKey.checked);
  });
  apiKey.addEventListener('input', () => setAiSetting('OPENROUTER_API_KEY', apiKey.value.trim()));
  reasonEcl.addEventListener('input', () => setAiSetting('REASON_ECL', reasonEcl.value));
  testEcl.addEventListener('input', () => setAiSetting('TEST_ECL', testEcl.value));
  supplements.addEventListener('input', () => setAiSetting('PRE_PROMPT_SUPPLEMENTS', supplements.value));
  guidelines.addEventListener('input', () => setAiSetting('GUIDELINES_SUMMARY', guidelines.value));
  reset.addEventListener('click', () => {
    resetAiSettings();
    panelInitialised = false;
    root.remove();
    initAiSettingsPanel();
    fireEnabledChanged();
  });
}

// ----- tiny HTML escapers (settings values are operator-controlled, but ECL /
// keys can contain <, >, &, " which must not break the injected markup) -----
function escapeHtml(v) {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(v) {
  return escapeHtml(v).replace(/"/g, '&quot;');
}
