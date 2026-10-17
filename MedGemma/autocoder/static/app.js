// AutoCoder front end. Plain script, no build step.
(function () {
  const C = window.AC_CONFIG;
  const SCT = 'http://snomed.info/sct';
  const $ = (id) => document.getElementById(id);

  // Selected codes for each Part 1 field. Each item is {system, code, display}.
  const state = { gender: null, age: '', reason: null, clinical: [], meds: [] };

  // ---------- Terminology ----------

  function eclUrl(ecl) {
    return SCT + '?fhir_vs=ecl/' + encodeURIComponent(ecl);
  }

  async function expand(vsUrl, filter, signal, withSynonyms) {
    const u = new URL(C.TX_BASE + '/ValueSet/$expand');
    u.searchParams.set('url', vsUrl);
    if (filter) u.searchParams.set('filter', filter);
    u.searchParams.set('count', String(C.SEARCH_COUNT));
    if (withSynonyms) u.searchParams.set('includeDesignations', 'true');
    const r = await fetch(u, { headers: { Accept: 'application/fhir+json' }, signal });
    if (!r.ok) throw new Error('Terminology server returned ' + r.status);
    const j = await r.json();
    return (j.expansion && j.expansion.contains) || [];
  }

  // Runs a debounced search; a newer search cancels the one in flight.
  function makeSearcher(vsUrl, onResults) {
    let timer = null;
    let controller = null;
    return function (text) {
      clearTimeout(timer);
      if (!text || text.length < C.MIN_CHARS) { onResults([]); return; }
      timer = setTimeout(async () => {
        if (controller) controller.abort();
        controller = new AbortController();
        const sig = controller.signal;
        try {
          const items = await expand(vsUrl, text, sig);
          if (!sig.aborted) onResults(items);
        } catch (e) {
          if (e.name !== 'AbortError') console.warn(e);
        }
      }, C.DEBOUNCE_MS);
    };
  }

  // ---------- Chips ----------

  function renderChips(container, items, onRemove) {
    container.innerHTML = '';
    items.forEach((it, i) => {
      const chip = document.createElement('span');
      chip.className = 'chip chip-sel';
      chip.title = it.code;
      chip.innerHTML = '<span></span><span class="x" title="Remove">&#x2715;</span>';
      chip.firstChild.textContent = it.display;
      chip.lastChild.onclick = () => onRemove(i);
      container.appendChild(chip);
    });
  }

  function pickItem(it) {
    return { system: it.system || SCT, code: it.code, display: it.display || it.code };
  }

  function addUnique(list, item) {
    if (!list.some((x) => x.code === item.code)) list.push(item);
  }

  // ---------- Typeahead (reason, medicines) ----------

  function setupTypeahead(inputId, vsUrl, onPick) {
    const input = $(inputId);
    const dropdown = document.createElement('div');
    dropdown.className = 'dropdown hidden';
    input.parentElement.appendChild(dropdown);
    let items = [];
    let active = 0;

    function close() { dropdown.classList.add('hidden'); items = []; }
    function choose(it) { onPick(pickItem(it)); input.value = ''; close(); }
    function render() {
      dropdown.innerHTML = '';
      if (!items.length) { dropdown.classList.add('hidden'); return; }
      items.forEach((it, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        if (i === active) b.className = 'active';
        b.innerHTML = '<span></span> <span class="code"></span>';
        b.firstChild.textContent = it.display;
        b.lastChild.textContent = it.code;
        b.onmousedown = (e) => { e.preventDefault(); choose(it); };
        dropdown.appendChild(b);
      });
      dropdown.classList.remove('hidden');
    }

    const search = makeSearcher(vsUrl, (res) => { items = res; active = 0; render(); });
    input.addEventListener('input', () => search(input.value.trim()));
    input.addEventListener('blur', () => setTimeout(close, 100));
    input.addEventListener('keydown', (e) => {
      if (!items.length) return;
      if (e.key === 'ArrowDown') { active = Math.min(active + 1, items.length - 1); render(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { active = Math.max(active - 1, 0); render(); e.preventDefault(); }
      else if (e.key === 'Enter') { choose(items[active]); e.preventDefault(); }
      else if (e.key === 'Escape') { close(); }
    });
  }

  // ---------- Clinical notes field with match chips ----------
  // The words just before the cursor are searched, and matches show as chips. Picking a
  // chip codes it and removes the matched words from the box. Text left in the box is
  // uncoded free text, which is added to the clinical record as typed.

  const MAX_SEARCH_WORDS = 6;

  // How well a result matches the typed words (lower is better), or -1 if it does not.
  // Every typed word must start a word in the term or one of its synonyms; Ontoserver
  // matches long phrases loosely, so this drops matches on only some of the words.
  function matchRank(item, phrase) {
    const words = (s) => (s || '').toLowerCase().match(/[a-z0-9]+/g) || [];
    const typed = words(phrase);
    const allIn = (name) => { const w = words(name); return typed.every((t) => w.some((x) => x.startsWith(t))); };
    const exact = (name) => words(name).join(' ') === typed.join(' ');
    const synonyms = (item.designation || []).map((d) => d.value);
    if (exact(item.display)) return 0;
    if (synonyms.some(exact)) return 1;
    if (allIn(item.display)) return 2;
    if (synonyms.some(allIn)) return 3;
    return -1;
  }

  // A run of words starting with one of these is not searched ("with chest pain" -> "chest pain")
  const LINK_WORDS = new Set(['a', 'an', 'and', 'or', 'of', 'the', 'with', 'in', 'on', 'at', 'for', 'to', 'from',
    'has', 'had', 'have', 'is', 'was', 'are', 'were', 'his', 'her', 'their', 'some', 'also']);

  // Search the runs of words before the cursor (back to the last punctuation) and use the
  // longest run that matches, so earlier free text does not stop a match on the words just typed.
  async function searchTail(vsUrl, text, caret, signal) {
    const segStart = Math.max(text.lastIndexOf(',', caret - 1), text.lastIndexOf('.', caret - 1),
      text.lastIndexOf(';', caret - 1), text.lastIndexOf('\n', caret - 1)) + 1;
    const segment = text.slice(segStart, caret);
    const runs = [...segment.matchAll(/\S+/g)].slice(-MAX_SEARCH_WORDS)
      .map((w) => ({ start: segStart + w.index, phrase: segment.slice(w.index).trim() }))
      .filter((r) => r.phrase.length >= C.MIN_CHARS && !LINK_WORDS.has(r.phrase.split(/\s+/)[0].toLowerCase()));
    const results = await Promise.all(runs.map((r) => expand(vsUrl, r.phrase, signal, true)));
    const ranked = runs.map((r, i) => {
      const hits = results[i]
        .map((it) => ({ it, rank: matchRank(it, r.phrase) }))
        .filter((x) => x.rank >= 0)
        .sort((a, b) => a.rank - b.rank);  // stable, so server order is kept within a rank
      const good = hits.length && (hits[0].rank <= 2 || r.phrase.split(/\s+/).length <= 3);
      return { items: hits.map((x) => x.it), good, found: hits.length > 0, start: r.start, end: caret };
    });
    // Longest run with a good match: on the preferred term, or (for up to 3 words) a synonym.
    // A long run that only matches a synonym ("no fever with productive cough") is a last resort.
    return ranked.find((r) => r.good) || ranked.find((r) => r.found) || { items: [] };
  }

  function dropTrailingLinkWords(text) {
    let words = text.replace(/\s+$/, '').split(/(\s+)/);
    while (words.length && LINK_WORDS.has(words[words.length - 1].toLowerCase())) words = words.slice(0, -2);
    return words.join('');
  }

  function cleanFreeText(text) {
    return text.replace(/\s+/g, ' ').replace(/\s*([,.;])(\s*[,.;])+/g, '$1')
      .replace(/^[\s,.;]+|[\s,.;]+$/g, '');
  }

  function setupNotesField(key, vsUrl) {
    const ta = $(key + '-text');
    const sugBox = $(key + '-sug');
    let timer = null;
    let controller = null;

    function showMatches(res) {
      sugBox.innerHTML = '';
      res.items.slice(0, C.MAX_CHIPS).forEach((it) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip chip-sug';
        b.textContent = '+ ' + it.display;
        b.title = it.code + '  (matched "' + ta.value.slice(res.start, res.end).trim() + '")';
        b.onclick = () => {
          addUnique(state[key], pickItem(it));
          // Remove the matched words; what is left stays as free text
          const before = dropTrailingLinkWords(ta.value.slice(0, res.start));
          const after = ta.value.slice(res.end).replace(/^\s+/, '');
          ta.value = before + (before && after ? ' ' : '') + after;
          const pos = before.length + (before ? 1 : 0);
          if (before && !after) ta.value += ' ';
          ta.focus();
          ta.setSelectionRange(pos, pos);
          sugBox.innerHTML = '';
          changed();
        };
        sugBox.appendChild(b);
      });
    }

    ta.addEventListener('input', () => {
      clearTimeout(timer);
      changed();  // free text is part of the notes
      const text = ta.value;
      const caret = ta.selectionStart != null ? ta.selectionStart : text.length;
      timer = setTimeout(async () => {
        if (controller) controller.abort();
        controller = new AbortController();
        const sig = controller.signal;
        try {
          const res = await searchTail(vsUrl, text, caret, sig);
          if (!sig.aborted) showMatches(res);
        } catch (e) {
          if (e.name !== 'AbortError') console.warn(e);
        }
      }, C.DEBOUNCE_MS);
    });
    return {
      freeText() { return cleanFreeText(ta.value); },
      set(text) { ta.value = text || ''; sugBox.innerHTML = ''; },
    };
  }

  // ---------- Clinical record (input to MedGemma) ----------

  function terms(list) {
    return list.map((x) => x.display).join(', ');
  }

  // Coded terms first, then any uncoded free text from the same field
  function codedPlusFree(key) {
    const free = notesFields[key] ? notesFields[key].freeText() : '';
    return [terms(state[key]), free].filter(Boolean).join('. ');
  }

  function buildNotes() {
    const lines = [];
    state.gender = genderOptions.find((g) => g.code === $('gender').value) || null;
    state.age = $('age').value.replace(/\D/g, '');
    const age = state.age;
    const g = state.gender && (state.gender.code === 'male' || state.gender.code === 'female')
      ? state.gender.code : (state.gender ? 'patient (gender: ' + state.gender.display.toLowerCase() + ')' : '');
    if (age || g) {
      lines.push('Patient Demographics: ' + (age ? age + '-year-old ' : '') + (g || 'patient') + '.');
    }
    if (state.reason) lines.push('Reason for Presentation: ' + state.reason.display + '.');
    const clinical = codedPlusFree('clinical');
    if (clinical) lines.push('Clinical Notes: ' + clinical + '.');
    if (state.meds.length) lines.push('Current Medicines: ' + terms(state.meds));
    return lines.join('\n');
  }

  function render() {
    renderChips($('reason-chips'), state.reason ? [state.reason] : [], () => { state.reason = null; changed(); });
    ['clinical', 'meds'].forEach((key) => {
      renderChips($(key + '-chips'), state[key], (i) => { state[key].splice(i, 1); changed(); });
    });
    const notes = buildNotes();
    const preview = $('notes-preview');
    preview.textContent = notes || 'Complete the fields to build the clinical record.';
    preview.classList.toggle('text-slate-400', !notes);
  }

  function changed() {
    render();
    resetDiagnoses();
  }

  // ---------- Part 2: diagnosis suggester ----------

  const RANKS = ['Most likely', 'Second', 'Third'];
  const dx = { list: [], selected: -1, endorsed: -1, notes: '' };

  async function postJson(url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.detail || 'Server returned ' + r.status);
    return j;
  }

  function setStatus(el, text, busy, isError) {
    el.innerHTML = (busy ? '<span class="spinner"></span>' : '') + '<span></span>';
    el.lastChild.textContent = text || '';
    el.classList.toggle('err', !!isError);
  }

  // Called when Part 1 changes: earlier suggestions no longer match the notes
  function resetDiagnoses() {
    const hasNotes = !!buildNotes();
    $('part2').classList.toggle('disabled', !hasNotes);
    $('dx-run').disabled = !hasNotes;
    if (!dx.list.length) return;
    dx.list = [];
    dx.selected = -1;
    renderDiagnoses();
    setStatus($('dx-status'), 'Patient details changed - suggest diagnoses again.');
    resetCoding();
  }

  function renderDiagnoses() {
    const list = $('dx-list');
    list.innerHTML = '';
    dx.list.forEach((d, i) => {
      const card = document.createElement('div');
      card.className = 'dx' + (i === dx.selected ? ' sel' : '') + (i === dx.endorsed ? ' endorsed' : '');
      card.innerHTML = '<div class="flex items-center gap-2"><input type="radio" name="dx"/><span class="rank"></span></div>' +
        '<div class="term"></div><div class="why"></div>';
      card.querySelector('input').checked = i === dx.selected;
      card.querySelector('.rank').textContent = (i + 1) + ' - ' + (RANKS[i] || '');
      card.querySelector('.term').textContent = d.term;
      card.querySelector('.why').textContent = d.rationale || 'No rationale given.';
      card.onclick = () => { dx.selected = i; renderDiagnoses(); };
      list.appendChild(card);
    });
    $('dx-footer').classList.toggle('hidden', !dx.list.length);
    $('dx-endorse').disabled = dx.selected < 0;
  }

  async function suggestDiagnoses() {
    const btn = $('dx-run');
    const status = $('dx-status');
    dx.notes = buildNotes();
    dx.list = [];
    dx.selected = -1;
    resetCoding();
    renderDiagnoses();
    btn.disabled = true;
    setStatus(status, 'Asking MedGemma...', true);
    const t0 = performance.now();
    try {
      const temperature = parseFloat($('dx-temp').value);  // Part 2 only
      const res = await postJson('/api/diagnose', { notes: dx.notes, temperature });
      dx.list = res.diagnoses;
      $('dx-reasoning').textContent = res.reasoning || '';
      setStatus(status, 'MedGemma suggested ' + dx.list.length + ' diagnoses in ' +
        ((performance.now() - t0) / 1000).toFixed(0) + ' s.');
    } catch (e) {
      setStatus(status, e.message, false, true);
    } finally {
      btn.disabled = false;
      btn.textContent = dx.list.length ? 'Suggest again' : 'Suggest diagnoses';
      renderDiagnoses();
    }
  }

  // ---------- Part 3: auto coding ----------

  let codingRun = 0;  // ignores a reply for a diagnosis that is no longer endorsed

  function resetCoding() {
    codingRun++;
    dx.endorsed = -1;
    $('part3').classList.add('disabled');
    $('code-result').classList.add('hidden');
    setStatus($('code-status'), 'Endorse a diagnosis in Part 2 to code it.');
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // One coded result row: code, term, badge and optional detail line / link
  function hitRow(opts) {
    const row = el('div', 'hit ' + (opts.best ? 'best' : 'alt'));
    row.appendChild(el('span', 'cd', opts.code));
    const mid = el('div', 'flex-1 min-w-0');
    mid.appendChild(el('div', 'ds', opts.display));
    const meta = el('div', 'hint');
    if (opts.method) meta.appendChild(el('span', null, opts.method));
    if (opts.link) {
      const a = el('a', 'text-blue-700 hover:underline ml-2', 'ICD-11 browser');
      a.href = opts.link;
      a.target = '_blank';
      a.rel = 'noopener';
      meta.appendChild(a);
    }
    mid.appendChild(meta);
    row.appendChild(mid);
    row.appendChild(el('span', 'badge ' + (opts.best ? 'badge-auto' : 'badge-muted'), opts.best ? 'Autocoded' : 'Alternative'));
    return row;
  }

  function noMatch(text) {
    return el('div', 'hit alt hint', text);
  }

  function renderCoding(res) {
    $('code-term').textContent = res.term;
    $('code-search').textContent = 'Searched as: ' + res.search_terms.join(' / ');

    const sn = $('snomed-body');
    sn.innerHTML = '';
    sn.appendChild(res.snomed
      ? hitRow({ code: res.snomed.code, display: res.snomed.display, best: true,
        method: 'Best of ' + res.snomed_candidates + ' candidates' })
      : noMatch(res.snomed_candidates ? 'No match: MedGemma found none of the ' + res.snomed_candidates + ' candidates fit.'
        : 'No match: Ontoserver returned no candidates.'));

    const icd = $('icd-body');
    icd.innerHTML = '';
    $('icd-release').textContent = 'Release ' + (res.icd_release || '');
    const agree = $('icd-agree');
    agree.innerHTML = '';
    if (res.icd_agree) agree.appendChild(el('span', 'badge badge-agree', 'A and B agree'));

    const rows = [
      { key: 'B', hit: res.icd_b, method: 'B: ICD-API search + MedGemma (best of ' + res.icd_b_candidates + ')' },
      { key: 'A', hit: res.icd_a, method: 'A: WHO ICD-API autocode' },
    ];
    // Best first; when A and B agree, one row is enough
    rows.sort((x, y) => (y.key === res.icd_best) - (x.key === res.icd_best));
    rows.forEach((r, i) => {
      if (res.icd_agree && i > 0) return;
      if (!r.hit) { icd.appendChild(noMatch(r.method + ': no match')); return; }
      const d = r.hit.details || {};
      // A combined code (stem/extension) is looked up by its stem only, so keep its own full title
      const display = d.title && d.code === r.hit.code ? d.title : r.hit.display;
      icd.appendChild(hitRow({
        code: r.hit.code, display, best: r.key === res.icd_best,
        method: res.icd_agree ? 'A: WHO autocode and B: search + MedGemma' : r.method, link: d.browser_url,
      }));
    });
    $('code-result').classList.remove('hidden');
  }

  async function codeDiagnosis() {
    if (dx.selected < 0) return;
    resetCoding();
    const run = codingRun;
    dx.endorsed = dx.selected;
    renderDiagnoses();
    const term = dx.list[dx.endorsed].term;
    $('part3').classList.remove('disabled');
    $('dx-endorse').disabled = true;
    setStatus($('code-status'), 'Coding "' + term + '" to SNOMED CT and ICD-11 (rewording, searching, MedGemma choosing)...', true);
    const t0 = performance.now();
    try {
      const res = await postJson('/api/code', { term });  // the endorsed term only
      if (run !== codingRun) return;
      renderCoding(res);
      setStatus($('code-status'), 'Coded in ' + ((performance.now() - t0) / 1000).toFixed(0) + ' s.');
    } catch (e) {
      if (run === codingRun) setStatus($('code-status'), e.message, false, true);
    } finally {
      if (run === codingRun) $('dx-endorse').disabled = dx.selected < 0;
    }
  }

  // ---------- Gender ----------

  const GENDER_FALLBACK = [
    { code: 'female', display: 'Female' }, { code: 'male', display: 'Male' },
    { code: 'other', display: 'Other' }, { code: 'unknown', display: 'Unknown' },
  ];
  let genderOptions = GENDER_FALLBACK;

  async function loadGender() {
    try {
      const items = await expand(C.GENDER_VS);
      if (items.length) genderOptions = items;
    } catch (e) {
      console.warn('Using built-in gender list:', e);
    }
    const sel = $('gender');
    genderOptions.forEach((g) => {
      const o = document.createElement('option');
      o.value = g.code;
      o.textContent = g.display;
      sel.appendChild(o);
    });
  }

  // ---------- Sample case (from test_medgemma.py) ----------

  async function firstMatch(vsUrl, text) {
    const items = await expand(vsUrl, text);
    return items.length ? pickItem(items[0]) : null;
  }

  async function loadSample() {
    const btn = $('load-sample');
    btn.textContent = 'Loading...';
    try {
      $('gender').value = 'male';
      state.gender = genderOptions.find((g) => g.code === 'male');
      $('age').value = state.age = '28';
      const [reason, hist, med, ex1, ex2] = await Promise.all([
        firstMatch(eclUrl(C.ECL.reason), 'anxiety'),
        firstMatch(eclUrl(C.ECL.clinical), 'cocaine abuse'),
        firstMatch(eclUrl(C.ECL.meds), 'ibuprofen 200 mg tablet'),
        firstMatch(eclUrl(C.ECL.clinical), 'tachycardia'),
        firstMatch(eclUrl(C.ECL.clinical), 'hypertension'),
      ]);
      state.reason = reason;
      state.meds = med ? [med] : [];
      state.clinical = [hist, ex1, ex2].filter(Boolean);
      notesFields.clinical.set('urine toxicology results negative');  // free text, as in the script
      changed();
    } finally {
      btn.textContent = 'Load sample case';
    }
  }

  // ---------- Wiring ----------

  const notesFields = {};

  function init() {
    loadGender();
    $('gender').addEventListener('change', (e) => {
      state.gender = genderOptions.find((g) => g.code === e.target.value) || null;
      changed();
    });
    $('age').addEventListener('input', (e) => {
      const v = e.target.value.replace(/\D/g, '');
      if (v !== e.target.value) e.target.value = v;
      state.age = v;
      changed();
    });
    setupTypeahead('reason-search', eclUrl(C.ECL.reason), (it) => { state.reason = it; changed(); });
    setupTypeahead('meds-search', eclUrl(C.ECL.meds), (it) => { addUnique(state.meds, it); changed(); });
    notesFields.clinical = setupNotesField('clinical', eclUrl(C.ECL.clinical));
    $('load-sample').onclick = loadSample;
    $('dx-run').onclick = suggestDiagnoses;
    $('dx-endorse').onclick = codeDiagnosis;
    render();
    resetDiagnoses();
  }

  init();
})();
