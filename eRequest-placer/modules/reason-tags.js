// modules/reason-tags.js — Reason tag chips, clinical notes autocomplete
'use strict';

window.App = window.App || {};

App.reasonTags = [];
App.notesAnchor = 0;

App.renderReasonTags = function() {
  var wrap = document.querySelector('#notes-tags');
  wrap.innerHTML = '';
  App.reasonTags.forEach(function(t, idx) {
    var chip = document.createElement('span');
    chip.className = 'inline-flex items-center gap-1.5 border border-emerald-100 bg-emerald-50 text-emerald-800 rounded-full px-2 py-0.5 text-xs';
    chip.innerHTML = '<span>' + t.display + '</span>';
    var x = document.createElement('button');
    x.type = 'button'; x.textContent = '\u2715'; x.className = 'opacity-70 hover:opacity-100';
    x.onclick = function() { App.reasonTags.splice(idx, 1); App.renderReasonTags(); };
    chip.appendChild(x);
    wrap.appendChild(chip);
  });
  App.computeAndRenderSuggestions();
};

App.buildReasonCodeArray = function() {
  if (!App.reasonTags.length) return undefined;
  return App.reasonTags.map(function(t) {
    return { coding: [{ system: t.system || 'http://snomed.info/sct', code: t.code, display: t.display }], text: t.display };
  });
};

App.buildCombinedNoteText = function() {
  return (document.querySelector('#clinical-notes').value || '').trim();
};

App.fetchReasonSuggestions = async function(filter) {
  if (!filter || filter.length < 4) return [];
  try {
    var url = App.TX_BASE + '?url=' + encodeURIComponent(App.VS.REASON) + '&count=20&filter=' + encodeURIComponent(filter);
    App.setDebugUrl(url);
    var r = await fetch(url, { headers: { Accept: 'application/fhir+json' } });
    if (!r.ok) throw new Error(r.status);
    var j = await r.json();
    return (j && j.expansion && j.expansion.contains) ? j.expansion.contains : [];
  } catch (e) { console.warn(e); return []; }
};

App.showReasonSuggestions = function(items) {
  var box = document.getElementById('notes-suggestions');
  var list = document.getElementById('notes-suggestion-list');
  list.innerHTML = '';
  var top = items.slice(0, App.MAX_NOTE_SUG);
  if (!top.length) { box.classList.add('hidden'); return; }
  top.forEach(function(it) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'px-2 py-1 rounded border text-xs hover:bg-gray-50';
    btn.textContent = it.display || it.code || '\u2014';
    btn.onclick = function() {
      var code = it.code;
      var system = it.system || 'http://snomed.info/sct';
      var display = it.display || it.code;

      if (!App.reasonTags.some(function(t) { return t.code === code && t.system === system; })) {
        App.reasonTags.push({ system: system, code: code, display: display });
        App.renderReasonTags();
      }

      var notes = document.getElementById('clinical-notes');
      var start = notes.selectionStart;
      var text = notes.value;
      var before = text.slice(0, App.notesAnchor);
      var insertion = display + ' ';
      var after = text.slice(start);
      notes.value = before + insertion + after;
      var newPos = before.length + insertion.length;
      notes.focus();
      requestAnimationFrame(function() {
        try { notes.setSelectionRange(newPos, newPos); } catch (_e) {}
      });
      App.notesAnchor = newPos;
      box.classList.add('hidden');
    };
    list.appendChild(btn);
  });
  box.classList.remove('hidden');
};

App.wireNotesAutocomplete = function() {
  var notes = document.getElementById('clinical-notes');
  var debounce = null;
  notes.addEventListener('input', function() {
    var text = notes.value || '';
    var caret = (notes.selectionStart != null ? notes.selectionStart : text.length);
    var since = (text.slice(App.notesAnchor, caret) || '').trim();
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(async function() {
      if (since.length < 4) { document.getElementById('notes-suggestions').classList.add('hidden'); return; }
      var items = await App.fetchReasonSuggestions(since);
      App.showReasonSuggestions(items);
    }, 250);
  });
};
