// modules/utils.js — UUID, formatAddress, date helpers, DOM helpers, debug panel
'use strict';

window.App = window.App || {};

// ----- DOM helpers -----
App.$ = function(s) { return document.querySelector(s); };

// ----- UUID -----
App.uuidURN = function() {
  return 'urn:uuid:' + (crypto && crypto.randomUUID
    ? crypto.randomUUID()
    : (Date.now() + '-' + Math.random().toString(16).slice(2)));
};

App.newUUID = function() {
  return (crypto && crypto.randomUUID
    ? crypto.randomUUID()
    : (Date.now() + '-' + Math.random().toString(16).slice(2)));
};

// ----- Address formatting -----
App.formatAddress = function(addr) {
  if (!addr) return '';
  if (addr.text) return addr.text;
  var parts = [];
  if (Array.isArray(addr.line) && addr.line.length) parts.push(addr.line.join(', '));
  if (addr.city) parts.push(addr.city);
  if (addr.state) parts.push(addr.state);
  if (addr.postalCode) parts.push(addr.postalCode);
  if (addr.country) parts.push(addr.country);
  return parts.filter(Boolean).join(', ');
};

// ----- Date helpers -----
App.isoDateMonthsAgo = function(m) {
  var d = new Date();
  d.setMonth(d.getMonth() - m);
  return d.toISOString();
};

App.isoDateDaysAgo = function(dy) {
  return new Date(Date.now() - dy * 24 * 60 * 60 * 1000).toISOString();
};

// ----- Status / Error -----
App.showError = function(msg) {
  var box = App.$('#error-box');
  box.textContent = msg;
  box.classList.remove('hidden');
};

App.showStatus = function(msg) {
  var box = App.$('#status-box');
  box.textContent = msg;
  box.classList.remove('hidden');
  setTimeout(function() { box.classList.add('hidden'); }, 4000);
};

// ----- Debug panel -----
App.debug = { history: [], max: 50 };

App.setDebugUrl = function(url) {
  if (!url) return;
  var last = document.querySelector('#last-expand-url');
  if (!last) return;
  last.textContent = url;
  App.debug.history.unshift({ url: url, ts: new Date() });
  if (App.debug.history.length > App.debug.max) App.debug.history.pop();
  var ul = document.querySelector('#expand-history');
  if (!ul) return;
  ul.innerHTML = '';
  App.debug.history.forEach(function(i) {
    var li = document.createElement('li');
    li.className = 'break-all';
    li.textContent = '[' + i.ts.toLocaleTimeString() + '] ' + i.url;
    ul.appendChild(li);
  });
};

App.initDebugPanel = function() {
  var panel = document.getElementById('debug-panel');
  var toggle = document.getElementById('debug-toggle');
  var close = document.getElementById('debug-close');
  var copy = document.getElementById('debug-copy');

  if (toggle) toggle.addEventListener('click', function() { panel.classList.toggle('hidden'); });
  if (close) close.addEventListener('click', function() { panel.classList.add('hidden'); });
  if (copy) copy.addEventListener('click', async function() {
    var t = (document.querySelector('#last-expand-url') || {}).textContent || '';
    if (!t) return;
    try {
      await navigator.clipboard.writeText(t);
      var old = copy.textContent;
      copy.textContent = 'Copied!';
      setTimeout(function() { copy.textContent = old; }, 1200);
    } catch (_e) {}
  });
};
