// modules/ai-test-selection.js — Feature B: derive SNOMED CT procedure codes from
// a free-text test description via the shared agent loop, scoped to TEST_ECL.
//
// Mirrors ai-reason-coding.js (same accuracy-over-completeness posture: search
// hard-coerced to TEST_ECL + every code re-confirmed in-scope). Accepted tests
// are added through the existing addSelectedTest(), so warnings / supplement
// props / body-site / favourites all flow automatically and the FHIR bundle is
// unchanged.

import { state } from './state.js';
import { getAiSettings } from './settings-ai.js';
import { runAgent } from './ai-agent.js';
import { getTools, searchConcepts, lookupConcept } from './ontoserver-tools.js';
import { gatherPatientContext, confirmInScope, guidanceBlock, SCT } from './ai-context.js';

const GUIDANCE_HEADING = 'Operator guidance — apply any of the following that applies to this request:';

// Based on spec §5.6 (not verbatim): the §5.6 "default assumptions" line is
// generalised to an "Operator guidance" block ({guidance_block}, omitted when the
// operator set none); {test_ecl} is substituted; the §5.7 output shape is extended
// with a `kind` field (PATH/IMAG); and — mirroring Feature A — a pre-search parsing
// step, search-strategy guidance, and demographic disambiguation are added.
const SYSTEM_PROMPT = [
  'You are a clinical test coding assistant. Your task is to derive a set of SNOMED CT procedure codes representing the diagnostic tests described in the clinician\'s free-text input.',
  '',
  'Prioritise accuracy over completeness. Do not speculate. Do not use concept IDs from memory.',
  '',
  'Before searching, identify each distinct test described in the input. For each, note your interpretation of any abbreviation, acronym, or apparent typo, and determine the preferred clinical terminology to search with. Use the patient age, sex, and pregnancy status to disambiguate where the meaning would differ across populations, and do not include tests that are clinically inconsistent with those demographics. Do not re-add a test that is already selected.',
  '',
  'You have access to an Ontoserver MCP tool. For each test, use `search_concepts` with the ECL expression `{test_ecl}` to find and confirm it. Try at least two search terms — a lay phrasing and a formal clinical equivalent — and if the first search returns nothing useful, rephrase using formal clinical terminology. Prefer the most specific valid concept that accurately reflects the requested test; do not broaden to a parent concept unless no specific match exists. Only include a code if Ontoserver confirms it is valid, active, and within the ECL scope. If a test falls outside the scope or has no valid match, omit it.',
  '',
  '{guidance_block}',
  '',
  'Return a JSON array only (an empty array if no tests can be confidently derived), with no prose or markdown formatting. Each element must be an object with keys "code" (the confirmed SNOMED CT concept ID), "display" (the preferred term exactly as returned by Ontoserver), "system" (always "http://snomed.info/sct"), and "kind" — "PATH" for pathology/laboratory tests or "IMAG" for imaging/radiology. If unsure, use "PATH".',
].join('\n');

// Map a model-supplied kind to PATH/IMAG. The prompt constrains output to those
// two, but be defensive: IMAG/RAD prefixes -> IMAG; anything else -> PATH, warning
// on an unrecognised value (a misclassified imaging test would otherwise be coded
// as Laboratory and wrongly trigger the PATH-only supplement fetch).
export function normaliseKind(k) {
  const v = String(k || '').trim().toUpperCase();
  if (v.startsWith('IMAG') || v.startsWith('RAD')) return 'IMAG';
  // PATH / PATHOLOGY / LAB / LABORATORY (and blank) -> PATH silently; warn otherwise.
  if (v && !v.startsWith('PATH') && !v.startsWith('LAB')) {
    console.warn('ai-test-selection: unrecognised test kind "' + k + '" coerced to PATH');
  }
  return 'PATH';
}

/**
 * Derive validated procedure codes from the free-text test description.
 * @returns {Promise<{tests: Array<{code,display,system,kind}>, error: string|null}>}
 */
export async function suggestTests() {
  try {
    const s = getAiSettings();
    const testEcl = (s.TEST_ECL || '').trim();
    if (!testEcl) {
      return { tests: [], error: 'Test selection ECL is not set — add one in AI Settings.' };
    }

    const freeText = (document.getElementById('ai-test-input').value || '').trim();
    if (!freeText) {
      return { tests: [], error: 'Describe the tests you want before encoding.' };
    }

    // Summarise already-selected tests (code + display + kind) to avoid bloating
    // the prompt while giving the agent duplicate-avoidance context (spec §5.5).
    const alreadySelected = (state.selectedTests || []).map((t) => ({ code: t.code, display: t.display, kind: t.kind }));
    const userMessage = JSON.stringify({
      free_text: freeText,
      already_selected: alreadySelected,
      patient: gatherPatientContext(),
    });

    // Function replacers so a literal `$` in operator guidance / ECL isn't treated
    // as a String.replace special pattern ($&, $1, …). When there's no operator
    // guidance the block is '' — collapse the resulting blank run.
    const guidance = guidanceBlock(GUIDANCE_HEADING, s.COMMON_PROMPT_SUPPLEMENTS, s.PRE_PROMPT_SUPPLEMENTS);
    const systemPrompt = SYSTEM_PROMPT
      .replace('{guidance_block}', () => guidance)
      .replace('{test_ecl}', () => testEcl)
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // search_concepts is hard-coerced to TEST_ECL no matter what the model passes.
    const toolImpl = {
      search_concepts: (args) => searchConcepts({ ...args, valueSetEcl: testEcl }),
      lookup_concept: (args) => lookupConcept(args),
    };

    const { parsed, error } = await runAgent({
      systemPrompt,
      userMessage,
      tools: getTools(),
      toolImpl,
      model: s.OPENROUTER_MODEL,
      // See ai-reason-coding.js: same multi-term search strategy, same need for
      // headroom over the default 8 so a sequential-calling free model doesn't hit
      // the iteration cap on a multi-test request and return nothing.
      maxIterations: 12,
    });

    if (error) return { tests: [], error };
    if (!Array.isArray(parsed)) return { tests: [], error: null };

    // Validate, normalise (incl. kind), dedupe by code.
    const seen = new Set();
    const unique = parsed
      .filter((e) => e && e.code && e.display)
      .map((e) => ({
        code: String(e.code),
        display: String(e.display),
        system: e.system || SCT,
        kind: normaliseKind(e.kind),
      }))
      .filter((c) => (seen.has(c.code) ? false : (seen.add(c.code), true)));

    // Confirm each in-scope (parallel); keep only confirmed.
    const oks = await Promise.all(unique.map((c) => confirmInScope(c, testEcl)));
    const tests = unique.filter((_, i) => oks[i]);

    return { tests, error: null };
  } catch (e) {
    if (e && e.name === 'AbortError') return { tests: [], error: 'Cancelled.' };
    return { tests: [], error: String((e && e.message) || e) };
  }
}
