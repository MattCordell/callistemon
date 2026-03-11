// modules/terminology.js — Ontoserver expand, SNOMED $subsumes, supplement properties, fasting preload
'use strict';

window.App = window.App || {};

App.fastingCodeSet = new Set();
App.subsumesCache = new Map();

// ----- Extract supplement properties from R5 backport extensions -----
App.extractSupplementProperties = function(concept) {
  var props = {};
  (concept.extension || []).forEach(function(ext) {
    if (ext.url !== App.R5_PROP_EXT) return;
    var subExts = ext.extension || [];
    var codeExt  = subExts.find(function(e) { return e.url === 'code'; });
    var valueExt = subExts.find(function(e) { return e.url === 'value'; });
    if (!codeExt) return;
    var code = codeExt.valueCode;
    var value = (valueExt && (valueExt.valueString || valueExt.valueCode)) || '';
    if (['pathologyTestsExplainedUrl', 'rcpaManualUrl', 'requiredSpecimen'].includes(code)) {
      props[code] = value;
    }
  });
  return props;
};

// ----- Ontoserver ValueSet $expand -----
App.expandFromOntoserver = async function(vsCanonicalUrl, filter, opts) {
  opts = opts || {};
  try {
    var base = new URL(opts.base || App.TX_BASE);
    base.searchParams.set('url', vsCanonicalUrl);
    if (filter && filter.trim().length) base.searchParams.set('filter', filter);
    base.searchParams.set('count', opts.count || '50');
    if (opts.includeDesignations) base.searchParams.set('includeDesignations', 'true');
    if (opts.useSupplement) base.searchParams.set('useSupplement', opts.useSupplement);
    if (opts.properties) opts.properties.forEach(function(p) { base.searchParams.append('property', p); });
    if (opts.boost) base.searchParams.set('_boost', opts.boost);
    var url = base.toString();
    App.setDebugUrl(url);
    var r = await fetch(url, { headers: { Accept: 'application/fhir+json' } });
    if (!r.ok) throw new Error('Ontoserver ' + r.status);
    var j = await r.json();
    return (j && j.expansion && j.expansion.contains) ? j.expansion.contains : [];
  } catch (e) { console.warn('Ontoserver expand failed', e); return []; }
};

// ----- Preload fasting codes from ECL -----
App.preloadFastingCodes = async function() {
  try {
    var items = await App.expandFromOntoserver(App.VS_ECL_FASTING);
    items.forEach(function(i) { if (i.code) App.fastingCodeSet.add(i.code); });
  } catch (e) { console.warn('preloadFastingCodes', e); }
};

// ----- SNOMED $subsumes -----
function readOutcomeFromParameters(j) {
  try {
    if (j && j.resourceType === 'Parameters' && Array.isArray(j.parameter)) {
      var outParam = j.parameter.find(function(p) { return p.name === 'outcome'; });
      var resParam = j.parameter.find(function(p) { return p.name === 'result'; });
      if (outParam) {
        var val = outParam.valueCode || outParam.valueString || (outParam.value && outParam.value.code);
        if (typeof val === 'string') return { outcome: val };
      }
      if (resParam && typeof resParam.valueBoolean === 'boolean') {
        return { result: !!resParam.valueBoolean };
      }
    }
  } catch (_e) {}
  return {};
}

async function callSubsumes(codeA, codeB) {
  var url = App.TERM_BASE + '/CodeSystem/$subsumes?system=http://snomed.info/sct&codeA=' +
    encodeURIComponent(codeA) + '&codeB=' + encodeURIComponent(codeB);
  App.setDebugUrl(url);
  var r = await fetch(url, { headers: { Accept: 'application/fhir+json' } });
  if (!r.ok) throw new Error('subsumes ' + r.status);
  var j = await r.json();
  return readOutcomeFromParameters(j);
}

App.snomedSubsumes = async function(parent, child) {
  if (!parent || !child) return false;
  var key = parent + '|' + child;
  if (App.subsumesCache.has(key)) return App.subsumesCache.get(key);
  try {
    var resp = await callSubsumes(parent, child);
    var match = (resp.outcome === 'subsumes' || resp.outcome === 'equivalent' || resp.result === true);
    if (!match) {
      resp = await callSubsumes(child, parent);
      match = (resp.outcome === 'specializes' || resp.outcome === 'equivalent' || resp.result === true);
    }
    App.subsumesCache.set(key, !!match);
    return !!match;
  } catch (e) { console.warn('subsumes', e); App.subsumesCache.set(key, false); return false; }
};
