// modules/test-list.js — Selected tests state, add/remove/render, supplement props, favourites

import { state } from './state.js';
import { newUUID } from './utils.js';
import { SUPPLEMENT_URL, R4_BASE, VS, VS_ECL_BODY_SITE } from '../config.js';
import { userFavourites } from '../clinicians.js';
import {
  expandFromOntoserver, extractSupplementProperties, siteSpecificCodeSet,
} from './terminology.js';
import {
  ensureWarnSet, warnText, checkTestHistoryWarning, applyAllWarnings,
} from './warnings.js';
import { computeAndRenderSuggestions } from './suggestions.js';

// ----- Fetch supplement properties for a single code -----
export async function fetchSupplementProps(test) {
  try {
    const supplements = state.activeProviderSupplement
      ? [SUPPLEMENT_URL, state.activeProviderSupplement]
      : [SUPPLEMENT_URL];
    const items = await expandFromOntoserver(VS.PATH, test.display, {
      base: R4_BASE,
      useSupplement: supplements,
      properties: ['pathologyTestsExplainedUrl', 'rcpaManualUrl', 'requiredSpecimen', 'collectionCentreRequirements'],
      count: '20',
    });
    const match = items.find((it) => it.code === test.code);
    if (match) {
      const props = extractSupplementProperties(match);
      if (Object.keys(props).length) {
        test.supplementProps = props;
        renderSelectedTests();
      }
    }
  } catch (e) { console.warn('fetchSupplementProps', e); }
}

// ----- Add / Remove -----
export function addSelectedTest(test) {
  if (!test._key) test._key = newUUID();

  const exists = test.code
    ? state.selectedTests.some((t) => t.code === test.code)
    : state.selectedTests.some((t) => !t.code && t.display.trim().toLowerCase() === test.display.trim().toLowerCase() && t.kind === test.kind);

  if (!exists) {
    if (!test.priority) test.priority = 'routine';
    ensureWarnSet(test);
    state.selectedTests.push(test);
    checkTestHistoryWarning(test).then((changed) => { if (changed) renderSelectedTests(); });
    applyAllWarnings();
    if (test.kind === 'PATH' && test.code && !test.supplementProps) {
      fetchSupplementProps(test);
    }
  }
  renderSelectedTests();
  computeAndRenderSuggestions();
  if (test.code) {
    document.querySelectorAll('.fav[data-code="' + test.code + '"]').forEach((cb) => { cb.checked = true; });
  }
}

export function removeSelectedTestByIdOrCode(idOrCode) {
  state.selectedTests = state.selectedTests.filter((t) => {
    if (idOrCode && idOrCode.startsWith && idOrCode.length > 20) { return t._key !== idOrCode; }
    return t.code !== idOrCode;
  });
  renderSelectedTests();
  computeAndRenderSuggestions();
  applyAllWarnings();
  if (idOrCode && !(idOrCode.startsWith && idOrCode.length > 20)) {
    document.querySelectorAll('.fav[data-code="' + idOrCode + '"]').forEach((cb) => { cb.checked = false; });
  }
}

// ----- Render selected tests list -----
export function renderSelectedTests() {
  const ul = document.querySelector('#selected-tests');
  ul.innerHTML = '';
  state.selectedTests.forEach((t) => {
    const li = document.createElement('li');
    li.className = 'flex items-center justify-between py-1 gap-3';

    const leftWrap = document.createElement('div');
    leftWrap.className = 'flex flex-col';
    const titleRow = document.createElement('div');
    titleRow.className = 'flex items-center';

    const title = document.createElement('span');
    title.textContent = t.display + (t.code ? '' : ' (custom test)');
    titleRow.appendChild(title);
    const warningStr = warnText(t);
    if (warningStr) {
      const icon = document.createElement('span');
      icon.textContent = '⚠️';
      icon.className = 'ml-2';
      icon.title = warningStr;
      titleRow.appendChild(icon);
    }
    leftWrap.appendChild(titleRow);
    if (warningStr) {
      const note = document.createElement('div');
      note.className = 'text-xs text-amber-700';
      note.textContent = warningStr;
      leftWrap.appendChild(note);
    }

    // Supplement info (specimen, links)
    if (t.supplementProps && Object.keys(t.supplementProps).length) {
      const suppRow = document.createElement('div');
      suppRow.className = 'flex flex-wrap gap-3 mt-0.5 text-xs text-gray-500';
      if (t.supplementProps.requiredSpecimen) {
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'text-indigo-500 hover:underline';
        toggle.textContent = '🧪 Specimen';
        const specDetail = document.createElement('span');
        specDetail.textContent = ' — ' + t.supplementProps.requiredSpecimen;
        specDetail.style.display = 'none';
        toggle.onclick = () => { specDetail.style.display = specDetail.style.display === 'none' ? 'inline' : 'none'; };
        const specWrap = document.createElement('span');
        specWrap.appendChild(toggle);
        specWrap.appendChild(specDetail);
        suppRow.appendChild(specWrap);
      }
      if (t.supplementProps.pathologyTestsExplainedUrl) {
        const a = document.createElement('a');
        a.href = t.supplementProps.pathologyTestsExplainedUrl;
        a.target = '_blank'; a.rel = 'noopener';
        a.className = 'text-indigo-500 hover:underline';
        a.textContent = 'Patient info ↗';
        suppRow.appendChild(a);
      }
      if (t.supplementProps.rcpaManualUrl) {
        const a2 = document.createElement('a');
        a2.href = t.supplementProps.rcpaManualUrl;
        a2.target = '_blank'; a2.rel = 'noopener';
        a2.className = 'text-indigo-500 hover:underline';
        a2.textContent = 'RCPA Manual ↗';
        suppRow.appendChild(a2);
      }
      if (t.supplementProps.collectionCentreRequirements) {
        const ccToggle = document.createElement('button');
        ccToggle.type = 'button';
        ccToggle.className = 'text-blue-600 hover:underline';
        ccToggle.textContent = 'ℹ️ Collection requirements';
        const ccVal = t.supplementProps.collectionCentreRequirements;
        const ccDetail = document.createElement('span');
        if (/^https?:\/\//.test(ccVal)) {
          const ccLink = document.createElement('a');
          ccLink.href = ccVal;
          ccLink.target = '_blank'; ccLink.rel = 'noopener';
          ccLink.className = 'text-indigo-500 hover:underline';
          ccLink.textContent = ' — ' + ccVal + ' ↗';
          ccDetail.appendChild(ccLink);
        } else {
          const urlRe = /(https?:\/\/[^\s]+)/g;
          const parts = (' — ' + ccVal).split(urlRe);
          for (let pi = 0; pi < parts.length; pi++) {
            if (/^https?:\/\//.test(parts[pi])) {
              const inlineLink = document.createElement('a');
              inlineLink.href = parts[pi];
              inlineLink.target = '_blank'; inlineLink.rel = 'noopener';
              inlineLink.className = 'text-indigo-500 hover:underline';
              inlineLink.textContent = 'website ↗';
              ccDetail.appendChild(inlineLink);
            } else if (parts[pi]) {
              ccDetail.appendChild(document.createTextNode(parts[pi]));
            }
          }
        }
        ccDetail.style.display = 'none';
        ccToggle.onclick = () => { ccDetail.style.display = ccDetail.style.display === 'none' ? 'inline' : 'none'; };
        const ccWrap = document.createElement('span');
        ccWrap.appendChild(ccToggle);
        ccWrap.appendChild(ccDetail);
        suppRow.appendChild(ccWrap);
      }
      if (suppRow.children.length) leftWrap.appendChild(suppRow);
    }

    // Body site chooser (site-specific procedures)
    if (t.code && siteSpecificCodeSet.has(t.code)) {
      const siteRow = document.createElement('div');
      siteRow.className = 'flex items-center gap-2 mt-0.5 text-xs';
      const siteBtn = document.createElement('button');
      siteBtn.type = 'button';
      siteBtn.className = 'text-indigo-500 hover:underline';
      if (t.bodySite) {
        siteBtn.textContent = 'Site: ' + t.bodySite.display + ' ✏️';
      } else {
        siteBtn.textContent = '+ Choose site';
      }
      siteBtn.onclick = () => { openBodySiteModal(t); };
      siteRow.appendChild(siteBtn);
      if (t.bodySite) {
        const clearSite = document.createElement('button');
        clearSite.type = 'button';
        clearSite.className = 'text-gray-400 hover:text-red-500 text-xs';
        clearSite.textContent = '✕';
        clearSite.title = 'Clear body site';
        clearSite.onclick = (e) => { e.stopPropagation(); delete t.bodySite; renderSelectedTests(); };
        siteRow.appendChild(clearSite);
      }
      leftWrap.appendChild(siteRow);
    }

    const controls = document.createElement('div');
    controls.className = 'flex items-center gap-2';

    const PRIORITIES = ['routine', 'urgent', 'asap', 'stat'];
    const pBtn = document.createElement('button');
    pBtn.className = 'text-xs px-2 py-1 rounded border';
    pBtn.title = 'Toggle priority';
    pBtn.textContent = 'priority: ' + (t.priority || 'routine');
    pBtn.onclick = () => {
      const idx = PRIORITIES.indexOf(t.priority || 'routine');
      t.priority = PRIORITIES[(idx + 1) % PRIORITIES.length];
      pBtn.textContent = 'priority: ' + t.priority;
    };

    const rm = document.createElement('button');
    rm.textContent = 'Remove';
    rm.className = 'text-red-600 text-sm';
    rm.onclick = () => { removeSelectedTestByIdOrCode(t.code || t._key); };

    controls.appendChild(pBtn);
    controls.appendChild(rm);

    li.appendChild(leftWrap);
    li.appendChild(controls);
    ul.appendChild(li);
  });
}

// ----- Favourites -----
function renderFavColumn(items, kind) {
  const col = document.createElement('div');
  col.className = 'flex flex-col space-y-2';
  items.forEach((f) => {
    const row = document.createElement('label');
    row.className = 'flex items-center space-x-2';
    const od = f.officialDisplay ? '" data-official-display="' + f.officialDisplay : '';
    row.innerHTML = '<input type="checkbox" class="fav" data-kind="' + kind + '" data-code="' + f.code + '" data-display="' + f.display + od + '" data-system="http://snomed.info/sct"> <span>' + f.display + '</span>';
    col.appendChild(row);
  });
  return col;
}

export function renderFavsForUser(user) {
  const def = userFavourites[user];
  if (!def) return;
  const renderSet = (containerId, favs, kind) => {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    const half = Math.ceil(favs.length / 2);
    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-2 gap-4';
    grid.appendChild(renderFavColumn(favs.slice(0, half), kind));
    grid.appendChild(renderFavColumn(favs.slice(half), kind));
    container.appendChild(grid);
  };
  renderSet('pathology-favs', def.pathology, 'PATH');
  renderSet('radiology-favs', def.radiology, 'IMAG');
  document.querySelectorAll('.fav').forEach((cb) => {
    cb.addEventListener('change', (e) => {
      const ds = e.target.dataset;
      if (e.target.checked) {
        const test = { code: ds.code, system: ds.system, display: ds.display, kind: ds.kind };
        if (ds.officialDisplay) test.officialDisplay = ds.officialDisplay;
        addSelectedTest(test);
      } else removeSelectedTestByIdOrCode(ds.code);
    });
  });
  document.querySelectorAll('.fav').forEach((cb) => {
    const code = cb.dataset.code;
    cb.checked = state.selectedTests.some((t) => t.code === code);
  });
}

// ----- Search boxes -----
export function setupSearch(inputSel, listSel, vsCanonicalUrl, kind, expandOpts) {
  const inp = document.querySelector(inputSel);
  const list = document.querySelector(listSel);
  let to = null;
  inp.addEventListener('input', () => {
    if (to) clearTimeout(to);
    const q = inp.value;
    if (!q || q.length < 2) { list.innerHTML = ''; return; }
    list.innerHTML = '<li class="p-2 text-gray-400 italic">Loading...</li>';
    to = setTimeout(async () => {
      const items = await expandFromOntoserver(vsCanonicalUrl, q, expandOpts);
      list.innerHTML = '';
      const top = items.slice(0, 5);
      if (!top.length) { list.innerHTML = '<li class="p-2 text-gray-500">No matches</li>'; return; }
      top.forEach((it) => {
        const snomedDisplay = it.display || it.code || '—';
        const providerPreferred = (it.designation || []).find((d) => d.use && d.use.code === '900000000000548007');
        const label = providerPreferred ? providerPreferred.value : snomedDisplay;

        const li = document.createElement('li');
        li.className = 'p-2 hover:bg-gray-100 cursor-pointer';
        if (providerPreferred) {
          li.innerHTML = '';
          const nameSpan = document.createElement('span');
          nameSpan.textContent = label;
          const snomedSpan = document.createElement('span');
          snomedSpan.className = 'ml-2 text-xs text-gray-400';
          snomedSpan.textContent = '(' + snomedDisplay + ')';
          li.appendChild(nameSpan);
          li.appendChild(snomedSpan);
        } else {
          li.textContent = label;
        }
        li.onclick = () => {
          const test = { system: it.system || 'http://snomed.info/sct', code: it.code, display: label, kind };
          if (it.display && providerPreferred) test.officialDisplay = it.display;
          if (expandOpts && expandOpts.useSupplement) {
            test.supplementProps = extractSupplementProperties(it);
          }
          addSelectedTest(test);
          list.innerHTML = ''; inp.value = '';
        };
        list.appendChild(li);
      });
    }, 250);
  });
}

// ----- Body site modal -----
let bodySiteTarget = null;

export function openBodySiteModal(test) {
  bodySiteTarget = test;
  const backdrop = document.getElementById('body-site-backdrop');
  document.getElementById('body-site-test-name').textContent = test.display;
  document.getElementById('body-site-search').value = '';
  document.getElementById('body-site-results').innerHTML = '';
  backdrop.style.display = 'flex';
  document.getElementById('body-site-search').focus();
}

export function initBodySiteModal() {
  const backdrop = document.getElementById('body-site-backdrop');
  const close = () => { backdrop.style.display = 'none'; bodySiteTarget = null; };
  document.getElementById('body-site-close').onclick = close;
  document.getElementById('body-site-cancel').onclick = close;
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

  const searchInput = document.getElementById('body-site-search');
  const resultsList = document.getElementById('body-site-results');
  let to = null;
  searchInput.addEventListener('input', () => {
    if (to) clearTimeout(to);
    const q = searchInput.value;
    if (!q || q.length < 2) { resultsList.innerHTML = ''; return; }
    resultsList.innerHTML = '<li class="p-2 text-gray-400 italic">Loading...</li>';
    to = setTimeout(async () => {
      const items = await expandFromOntoserver(VS_ECL_BODY_SITE, q, { count: '10' });
      resultsList.innerHTML = '';
      if (!items.length) { resultsList.innerHTML = '<li class="p-2 text-gray-500">No matches</li>'; return; }
      items.forEach((it) => {
        const li = document.createElement('li');
        li.className = 'p-2 hover:bg-indigo-50 cursor-pointer';
        li.textContent = it.display || it.code;
        li.onclick = () => {
          if (bodySiteTarget) {
            bodySiteTarget.bodySite = { code: it.code, display: it.display || it.code };
          }
          backdrop.style.display = 'none';
          bodySiteTarget = null;
          renderSelectedTests();
        };
        resultsList.appendChild(li);
      });
    }, 250);
  });
}

// ----- Free-text custom adders -----
export function setupCustomAdder(inputSel, btnSel, kind) {
  const inp = document.querySelector(inputSel);
  const btn = document.querySelector(btnSel);
  const add = () => {
    const txt = (inp.value || '').trim();
    if (!txt) return;
    addSelectedTest({ display: txt, kind, _key: newUUID() });
    inp.value = '';
  };
  btn.addEventListener('click', add);
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); add(); }
  });
}
