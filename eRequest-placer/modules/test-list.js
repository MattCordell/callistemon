// modules/test-list.js — Selected tests state, add/remove/render, supplement props, favourites
'use strict';

window.App = window.App || {};

App.selectedTests = [];

// ----- Fetch supplement properties for a single code -----
App.fetchSupplementProps = async function(test) {
  try {
    var items = await App.expandFromOntoserver(App.VS.PATH, test.display, {
      base: App.R4_BASE,
      useSupplement: App.SUPPLEMENT_URL + '|1.0.0',
      properties: ['pathologyTestsExplainedUrl', 'rcpaManualUrl', 'requiredSpecimen'],
      count: '20'
    });
    var match = items.find(function(it) { return it.code === test.code; });
    if (match) {
      var props = App.extractSupplementProperties(match);
      if (Object.keys(props).length) {
        test.supplementProps = props;
        App.renderSelectedTests();
      }
    }
  } catch (e) { console.warn('fetchSupplementProps', e); }
};

// ----- Add / Remove -----
App.addSelectedTest = function(test) {
  if (!test._key) test._key = App.newUUID();

  var exists = test.code
    ? App.selectedTests.some(function(t) { return t.code === test.code; })
    : App.selectedTests.some(function(t) { return !t.code && t.display.trim().toLowerCase() === test.display.trim().toLowerCase() && t.kind === test.kind; });

  if (!exists) {
    if (!test.priority) test.priority = 'routine';
    App.ensureWarnSet(test);
    App.selectedTests.push(test);
    App.checkTestHistoryWarning(test).then(function(changed) { if (changed) App.renderSelectedTests(); });
    App.applyAllWarnings();
    if (test.kind === 'PATH' && test.code && !test.supplementProps) {
      App.fetchSupplementProps(test);
    }
  }
  App.renderSelectedTests();
  App.computeAndRenderSuggestions();
  if (test.code) {
    document.querySelectorAll('.fav[data-code="' + test.code + '"]').forEach(function(cb) { cb.checked = true; });
  }
};

App.removeSelectedTestByIdOrCode = function(idOrCode) {
  App.selectedTests = App.selectedTests.filter(function(t) {
    if (idOrCode && idOrCode.startsWith && idOrCode.length > 20) { return t._key !== idOrCode; }
    return t.code !== idOrCode;
  });
  App.renderSelectedTests();
  App.computeAndRenderSuggestions();
  App.applyAllWarnings();
  if (idOrCode && !(idOrCode.startsWith && idOrCode.length > 20)) {
    document.querySelectorAll('.fav[data-code="' + idOrCode + '"]').forEach(function(cb) { cb.checked = false; });
  }
};

// ----- Render selected tests list -----
App.renderSelectedTests = function() {
  var ul = document.querySelector('#selected-tests');
  ul.innerHTML = '';
  App.selectedTests.forEach(function(t) {
    var li = document.createElement('li');
    li.className = 'flex items-center justify-between py-1 gap-3';

    var leftWrap = document.createElement('div');
    leftWrap.className = 'flex flex-col';
    var titleRow = document.createElement('div');
    titleRow.className = 'flex items-center';

    var title = document.createElement('span');
    title.textContent = t.display + (t.code ? '' : ' (custom test)');
    titleRow.appendChild(title);
    var warningStr = App.warnText(t);
    if (warningStr) {
      var icon = document.createElement('span');
      icon.textContent = '\u26A0\uFE0F';
      icon.className = 'ml-2';
      icon.title = warningStr;
      titleRow.appendChild(icon);
    }
    leftWrap.appendChild(titleRow);
    if (warningStr) {
      var note = document.createElement('div');
      note.className = 'text-xs text-amber-700';
      note.textContent = warningStr;
      leftWrap.appendChild(note);
    }

    // Supplement info (specimen, links)
    if (t.supplementProps && Object.keys(t.supplementProps).length) {
      var suppRow = document.createElement('div');
      suppRow.className = 'flex flex-wrap gap-3 mt-0.5 text-xs text-gray-500';
      if (t.supplementProps.requiredSpecimen) {
        var toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'text-indigo-500 hover:underline';
        toggle.textContent = '\uD83E\uDDEA Specimen';
        var specDetail = document.createElement('span');
        specDetail.textContent = ' \u2014 ' + t.supplementProps.requiredSpecimen;
        specDetail.style.display = 'none';
        toggle.onclick = function() { specDetail.style.display = specDetail.style.display === 'none' ? 'inline' : 'none'; };
        var specWrap = document.createElement('span');
        specWrap.appendChild(toggle);
        specWrap.appendChild(specDetail);
        suppRow.appendChild(specWrap);
      }
      if (t.supplementProps.pathologyTestsExplainedUrl) {
        var a = document.createElement('a');
        a.href = t.supplementProps.pathologyTestsExplainedUrl;
        a.target = '_blank'; a.rel = 'noopener';
        a.className = 'text-indigo-500 hover:underline';
        a.textContent = 'Patient info \u2197';
        suppRow.appendChild(a);
      }
      if (t.supplementProps.rcpaManualUrl) {
        var a2 = document.createElement('a');
        a2.href = t.supplementProps.rcpaManualUrl;
        a2.target = '_blank'; a2.rel = 'noopener';
        a2.className = 'text-indigo-500 hover:underline';
        a2.textContent = 'RCPA Manual \u2197';
        suppRow.appendChild(a2);
      }
      if (suppRow.children.length) leftWrap.appendChild(suppRow);
    }

    // Body site chooser (site-specific procedures)
    if (t.code && App.siteSpecificCodeSet.has(t.code)) {
      var siteRow = document.createElement('div');
      siteRow.className = 'flex items-center gap-2 mt-0.5 text-xs';
      var siteBtn = document.createElement('button');
      siteBtn.type = 'button';
      siteBtn.className = 'text-indigo-500 hover:underline';
      if (t.bodySite) {
        siteBtn.textContent = 'Site: ' + t.bodySite.display + ' \u270F\uFE0F';
      } else {
        siteBtn.textContent = '+ Choose site';
      }
      siteBtn.onclick = function() { App.openBodySiteModal(t); };
      siteRow.appendChild(siteBtn);
      if (t.bodySite) {
        var clearSite = document.createElement('button');
        clearSite.type = 'button';
        clearSite.className = 'text-gray-400 hover:text-red-500 text-xs';
        clearSite.textContent = '\u2715';
        clearSite.title = 'Clear body site';
        clearSite.onclick = function(e) { e.stopPropagation(); delete t.bodySite; App.renderSelectedTests(); };
        siteRow.appendChild(clearSite);
      }
      leftWrap.appendChild(siteRow);
    }

    var controls = document.createElement('div');
    controls.className = 'flex items-center gap-2';

    var PRIORITIES = ['routine', 'urgent', 'asap', 'stat'];
    var pBtn = document.createElement('button');
    pBtn.className = 'text-xs px-2 py-1 rounded border';
    pBtn.title = 'Toggle priority';
    pBtn.textContent = 'priority: ' + (t.priority || 'routine');
    pBtn.onclick = function() {
      var idx = PRIORITIES.indexOf(t.priority || 'routine');
      t.priority = PRIORITIES[(idx + 1) % PRIORITIES.length];
      pBtn.textContent = 'priority: ' + t.priority;
    };

    var rm = document.createElement('button');
    rm.textContent = 'Remove';
    rm.className = 'text-red-600 text-sm';
    rm.onclick = function() { App.removeSelectedTestByIdOrCode(t.code || t._key); };

    controls.appendChild(pBtn);
    controls.appendChild(rm);

    li.appendChild(leftWrap);
    li.appendChild(controls);
    ul.appendChild(li);
  });
};

// ----- Favourites -----
function renderFavColumn(items, kind) {
  var col = document.createElement('div');
  col.className = 'flex flex-col space-y-2';
  items.forEach(function(f) {
    var row = document.createElement('label');
    row.className = 'flex items-center space-x-2';
    var od = f.officialDisplay ? '" data-official-display="' + f.officialDisplay : '';
    row.innerHTML = '<input type="checkbox" class="fav" data-kind="' + kind + '" data-code="' + f.code + '" data-display="' + f.display + od + '" data-system="http://snomed.info/sct"> <span>' + f.display + '</span>';
    col.appendChild(row);
  });
  return col;
}

App.renderFavsForUser = function(user) {
  var def = App.userFavourites[user];
  if (!def) return;
  var renderSet = function(containerId, favs, kind) {
    var container = document.getElementById(containerId);
    container.innerHTML = '';
    var half = Math.ceil(favs.length / 2);
    var grid = document.createElement('div');
    grid.className = 'grid grid-cols-2 gap-4';
    grid.appendChild(renderFavColumn(favs.slice(0, half), kind));
    grid.appendChild(renderFavColumn(favs.slice(half), kind));
    container.appendChild(grid);
  };
  renderSet('pathology-favs', def.pathology, 'PATH');
  renderSet('radiology-favs', def.radiology, 'IMAG');
  document.querySelectorAll('.fav').forEach(function(cb) {
    cb.addEventListener('change', function(e) {
      var ds = e.target.dataset;
      if (e.target.checked) {
        var test = { code: ds.code, system: ds.system, display: ds.display, kind: ds.kind };
        if (ds.officialDisplay) test.officialDisplay = ds.officialDisplay;
        App.addSelectedTest(test);
      } else App.removeSelectedTestByIdOrCode(ds.code);
    });
  });
  document.querySelectorAll('.fav').forEach(function(cb) {
    var code = cb.dataset.code;
    cb.checked = App.selectedTests.some(function(t) { return t.code === code; });
  });
};

// ----- Search boxes -----
App.setupSearch = function(inputSel, listSel, vsCanonicalUrl, kind, expandOpts) {
  var inp = document.querySelector(inputSel);
  var list = document.querySelector(listSel);
  var to = null;
  inp.addEventListener('input', function() {
    if (to) clearTimeout(to);
    var q = inp.value;
    if (!q || q.length < 2) { list.innerHTML = ''; return; }
    list.innerHTML = '<li class="p-2 text-gray-400 italic">Loading...</li>';
    to = setTimeout(async function() {
      var items = await App.expandFromOntoserver(vsCanonicalUrl, q, expandOpts);
      list.innerHTML = '';
      var top = items.slice(0, 5);
      if (!top.length) { list.innerHTML = '<li class="p-2 text-gray-500">No matches</li>'; return; }
      top.forEach(function(it) {
        var li = document.createElement('li');
        li.className = 'p-2 hover:bg-gray-100 cursor-pointer';
        li.textContent = it.display || it.code || '\u2014';
        li.onclick = function() {
          var test = { system: it.system || 'http://snomed.info/sct', code: it.code, display: it.display || it.code, kind: kind };
          if (expandOpts && expandOpts.useSupplement) {
            test.supplementProps = App.extractSupplementProperties(it);
          }
          App.addSelectedTest(test);
          list.innerHTML = ''; inp.value = '';
        };
        list.appendChild(li);
      });
    }, 250);
  });
};

// ----- Body site modal -----
App._bodySiteTarget = null;

App.openBodySiteModal = function(test) {
  App._bodySiteTarget = test;
  var backdrop = document.getElementById('body-site-backdrop');
  document.getElementById('body-site-test-name').textContent = test.display;
  document.getElementById('body-site-search').value = '';
  document.getElementById('body-site-results').innerHTML = '';
  backdrop.style.display = 'flex';
  document.getElementById('body-site-search').focus();
};

App.initBodySiteModal = function() {
  var backdrop = document.getElementById('body-site-backdrop');
  var close = function() { backdrop.style.display = 'none'; App._bodySiteTarget = null; };
  document.getElementById('body-site-close').onclick = close;
  document.getElementById('body-site-cancel').onclick = close;
  backdrop.addEventListener('click', function(e) { if (e.target === backdrop) close(); });

  var searchInput = document.getElementById('body-site-search');
  var resultsList = document.getElementById('body-site-results');
  var to = null;
  searchInput.addEventListener('input', function() {
    if (to) clearTimeout(to);
    var q = searchInput.value;
    if (!q || q.length < 2) { resultsList.innerHTML = ''; return; }
    resultsList.innerHTML = '<li class="p-2 text-gray-400 italic">Loading...</li>';
    to = setTimeout(async function() {
      var items = await App.expandFromOntoserver(App.VS_ECL_BODY_SITE, q, { count: '10' });
      resultsList.innerHTML = '';
      if (!items.length) { resultsList.innerHTML = '<li class="p-2 text-gray-500">No matches</li>'; return; }
      items.forEach(function(it) {
        var li = document.createElement('li');
        li.className = 'p-2 hover:bg-indigo-50 cursor-pointer';
        li.textContent = it.display || it.code;
        li.onclick = function() {
          if (App._bodySiteTarget) {
            App._bodySiteTarget.bodySite = { code: it.code, display: it.display || it.code };
          }
          backdrop.style.display = 'none';
          App._bodySiteTarget = null;
          App.renderSelectedTests();
        };
        resultsList.appendChild(li);
      });
    }, 250);
  });
};

// ----- Free-text custom adders -----
App.setupCustomAdder = function(inputSel, btnSel, kind) {
  var inp = document.querySelector(inputSel);
  var btn = document.querySelector(btnSel);
  var add = function() {
    var txt = (inp.value || '').trim();
    if (!txt) return;
    App.addSelectedTest({ display: txt, kind: kind, _key: App.newUUID() });
    inp.value = '';
  };
  btn.addEventListener('click', add);
  inp.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); add(); }
  });
};
