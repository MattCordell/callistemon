// modules/server.js — Send to FHIR server, resolve Task Group URL, QR modal, auth
'use strict';

window.App = window.App || {};

// ----- Auth config -----
App.AUTH_CONFIGS = [
  { match: 'aidbox.beda.software', user: 'root', storageKey: 'aidbox_pwd', nice: 'Aidbox' },
  { match: 'smile.sparked-fhir.com', user: '$erequesting-admin', storageKey: 'smile_pwd', nice: 'Smile' }
];

function matchAuthConfig(base) {
  if (!base) return null;
  for (var i = 0; i < App.AUTH_CONFIGS.length; i++) {
    if (base.indexOf(App.AUTH_CONFIGS[i].match) > -1) return App.AUTH_CONFIGS[i];
  }
  return null;
}

function getPwd(key) { try { return localStorage.getItem(key) || ''; } catch (_e) { return ''; } }
function setPwd(key, val) { try { localStorage.setItem(key, val); } catch (_e) {} }

function basicHeader(user, pwd) {
  if (!user || !pwd) return null;
  return 'Basic ' + btoa(user + ':' + pwd);
}

// ----- Monkey-patch fetch for Basic Auth -----
App.initAuthFetch = function() {
  if (!window.__origFetch) {
    window.__origFetch = window.fetch.bind(window);
    window.fetch = function(input, init) {
      init = init || {};
      try {
        var url = (typeof input === 'string') ? input : (input && input.url) || '';
        if (url && App.FHIR_BASE && url.toLowerCase().startsWith(App.FHIR_BASE.replace(/\/+$/, '').toLowerCase())) {
          var cfg = matchAuthConfig(App.FHIR_BASE);
          if (cfg) {
            var pwd = getPwd(cfg.storageKey);
            var auth = basicHeader(cfg.user, pwd);
            if (auth) {
              var newInit = Object.assign({}, init);
              newInit.headers = Object.assign({ Accept: 'application/fhir+json' }, init && init.headers || {}, { Authorization: auth });
              return window.__origFetch(input, newInit);
            }
          }
        }
      } catch (_e) { /* fall through */ }
      return window.__origFetch(input, init);
    };
  }
};

App.maybePromptPasswordFor = function(base) {
  var cfg = matchAuthConfig(base);
  var hint = document.getElementById('auth-hint');
  if (!cfg) { if (hint) hint.textContent = ''; return; }
  var stored = getPwd(cfg.storageKey);
  if (hint) hint.textContent = stored ? ('Auth ready for ' + cfg.nice) : (cfg.nice + ' needs a password');
};

App.initAuthManage = function() {
  var btn = document.getElementById('auth-manage');
  if (!btn) return;
  btn.addEventListener('click', function() {
    var cfg = matchAuthConfig(App.FHIR_BASE);
    if (!cfg) { App.showStatus('No auth needed for this server'); return; }
    var entered = prompt('Password for ' + cfg.nice + ' (' + cfg.user + '):', getPwd(cfg.storageKey));
    if (entered === null) return;
    if (String(entered).trim()) {
      setPwd(cfg.storageKey, String(entered).trim());
      App.showStatus('Saved password for ' + cfg.nice);
    } else {
      setPwd(cfg.storageKey, '');
      App.showStatus('Cleared saved password for ' + cfg.nice);
    }
    App.maybePromptPasswordFor(App.FHIR_BASE);
  });
};

// ----- QR modal -----
App.showQr = function(url) {
  var qrUrlEl = document.getElementById('qr-url');
  qrUrlEl.textContent = url || '';
  var box = document.getElementById('qrcode');
  box.innerHTML = '';
  new QRCode(box, { text: url || '', width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M });
  document.getElementById('qr-backdrop').style.display = 'flex';
};

App.initQrModal = function() {
  var backdrop = document.getElementById('qr-backdrop');
  var close = document.getElementById('qr-close');
  var open = document.getElementById('qr-open');
  var copy = document.getElementById('qr-copy');
  var urlEl = document.getElementById('qr-url');

  close.addEventListener('click', function() { backdrop.style.display = 'none'; });
  open.addEventListener('click', function() { var u = (urlEl.textContent || '').trim(); if (u) window.open(u, '_blank'); });
  copy.addEventListener('click', async function() {
    try {
      await navigator.clipboard.writeText((urlEl.textContent || '').trim());
      var t = copy.textContent; copy.textContent = 'Copied!'; setTimeout(function() { copy.textContent = t; }, 1200);
    } catch (_e) {}
  });
};

// ----- Resolve Task Group URL -----
App.resolveTaskGroupUrlFromServer = async function() {
  try {
    if (!App.lastRequisitionId) return null;
    var url = new URL(App.FHIR_BASE + '/Task');
    url.searchParams.set('identifier', App.lastRequisitionId);
    url.searchParams.set('_count', '5');
    var r = await fetch(url.toString(), { headers: { Accept: 'application/fhir+json' } });
    if (!r.ok) return null;
    var j = await r.json();
    var entries = Array.isArray(j.entry) ? j.entry : [];
    var group = null;
    for (var i = 0; i < entries.length; i++) {
      var res = entries[i].resource;
      var profiles = (res && res.meta && res.meta.profile) || [];
      if (profiles.indexOf(App.AU_PROFILES.TASK_GROUP) > -1) { group = res; break; }
    }
    if (!group) {
      for (var i2 = 0; i2 < entries.length; i2++) {
        var res2 = entries[i2].resource;
        if (res2 && !res2.focus) { group = res2; break; }
      }
    }
    if (!group || !group.id) return null;
    return App.FHIR_BASE.replace(/\/$/, '') + '/Task/' + group.id;
  } catch (e) { console.warn('resolveTaskGroupUrlFromServer', e); return null; }
};

// ----- Send to server -----
App.initSendButton = function() {
  var sendingOverlay = document.getElementById('sending-overlay');
  var sendBtn = document.getElementById('send-btn');
  var newRequestBtn = document.getElementById('new-request-btn');

  sendBtn.addEventListener('click', async function() {
    var out = document.getElementById('server-response');
    out.textContent = 'Sending...';
    var built = App.buildBundle();
    var bundle = built.bundle;

    sendingOverlay.style.display = 'flex';
    sendBtn.classList.add('btn-disabled');

    try {
      var r = await fetch(App.FHIR_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/fhir+json', 'Accept': 'application/fhir+json' },
        body: JSON.stringify(bundle)
      });
      var text = await r.text();
      out.textContent = 'Response ' + r.status + ':\n' + text;

      if (r.status === 200) {
        var groupUrl = await App.resolveTaskGroupUrlFromServer();

        if (!groupUrl) {
          try {
            var j = JSON.parse(text);
            var respEntries = Array.isArray(j && j.entry ? j.entry : []) ? j.entry : [];
            for (var i = 0; i < respEntries.length; i++) {
              var loc = (respEntries[i] && respEntries[i].response && respEntries[i].response.location) ||
                        (respEntries[i] && respEntries[i].location) || null;
              if (loc && /\/Task\/.+/.test(loc)) {
                groupUrl = loc.indexOf('http') === 0 ? loc : (App.FHIR_BASE.replace(/\/$/, '') + '/' + loc.replace(/^\//, ''));
                break;
              }
            }
          } catch (err) { console.warn('Could not parse response JSON for location', err); }
        }

        if (groupUrl) { App.showQr(groupUrl); }
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
};
