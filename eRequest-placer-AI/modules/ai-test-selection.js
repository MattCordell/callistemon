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
import { gatherPatientContext, confirmInScope, combineGuidance, SCT } from './ai-context.js';

// Spec §5.6, verbatim, with {pre_prompt_supplements} + {test_ecl} substituted,
// plus the §5.7 output shape extended with a `kind` field (PATH/IMAG).
const SYSTEM_PROMPT = [
  'You are a clinical test coding assistant. Your task is to derive a set of SNOMED CT procedure codes representing the diagnostic tests described in the clinician\'s free-text input.',
  '',
  'Operator guidance — apply any of the following that applies to this request:',
  '{guidance}',
  '',
  'Prioritise accuracy over completeness. Do not speculate. Do not use concept IDs from memory.',
  '',
  'You have access to an Ontoserver MCP tool. Use `search_concepts` with the ECL expression `{test_ecl}` to find and confirm every concept. Only include a code if Ontoserver confirms it is valid, active, and within the ECL scope. If no match is found, omit the concept.',
  '',
  'Each array element must be an object with keys "code", "display", "system" (always "http://snomed.info/sct"), and "kind" — "PATH" for pathology/laboratory tests or "IMAG" for imaging/radiology. If unsure, use "PATH".',
  '',
  'Return a JSON array only, no prose or markdown formatting.',
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
    // as a String.replace special pattern ($&, $1, …).
    const guidance = combineGuidance(s.COMMON_PROMPT_SUPPLEMENTS, s.PRE_PROMPT_SUPPLEMENTS);
    const systemPrompt = SYSTEM_PROMPT
      .replace('{guidance}', () => guidance)
      .replace('{test_ecl}', () => testEcl);

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
