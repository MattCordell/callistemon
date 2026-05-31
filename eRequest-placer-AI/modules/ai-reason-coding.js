// modules/ai-reason-coding.js — Feature A: derive SNOMED CT reason codes from the
// free-text Clinical Notes via the shared agent loop, scoped to REASON_ECL.
//
// Accuracy over completeness (spec §3.4, §10.3): the search tool is hard-coerced
// to REASON_ECL regardless of what the model asks for, and every returned code is
// re-confirmed in-scope against Ontoserver before being surfaced — so a
// hallucinated code can't slip through even if the model invented it post-search.

import { getAiSettings } from './settings-ai.js';
import { runAgent } from './ai-agent.js';
import { getTools, searchConcepts, lookupConcept } from './ontoserver-tools.js';
import { gatherPatientContext, confirmInScope, guidanceBlock, SCT } from './ai-context.js';

const GUIDANCE_HEADING = 'Operator guidance — apply any of the following that applies to this request:';

// Based on spec §4.5/§4.6, extended (so not verbatim) with: an explicit element
// schema, a pre-search parsing step, search-strategy guidance, demographic
// disambiguation, and an "Operator guidance" block. {reason_ecl} and
// {guidance_block} are substituted at call time; {guidance_block} is '' when the
// operator set no guidance, and the surrounding blank run is then collapsed.
const SYSTEM_PROMPT = [
  'You are a clinical coding assistant. Your task is to derive a minimal, accurate set of SNOMED CT codes representing the clinical meaning of a clinician\'s free-text notes.',
  '',
  'Prioritise accuracy over completeness. Return only codes you are confident are correct. Do not speculate. Do not use concept IDs from memory.',
  '',
  'Before searching, identify each distinct clinical concept in the notes. For each, note your interpretation of any abbreviation, acronym, or apparent typo, and determine the preferred clinical terminology to search with. Use the patient age, sex, and pregnancy status to disambiguate where the meaning would differ across populations, and do not include concepts that are clinically inconsistent with those demographics.',
  '',
  'You have access to an Ontoserver MCP tool. For each concept, use `search_concepts` with the ECL expression `{reason_ecl}` to find and confirm it before including it. Try at least two search terms — a lay phrasing and a formal clinical equivalent — and if the first search returns nothing useful, rephrase using formal clinical terminology. Prefer the most specific valid concept that accurately reflects the clinical text; do not broaden to a parent concept unless no specific match exists. Only include a code if Ontoserver confirms it is valid, active, and within the ECL scope. The ECL scope is intentionally limited (typically to clinical findings and disorders); if a concept falls outside it or has no valid match, omit that concept.',
  '',
  '{guidance_block}',
  '',
  'Return a JSON array only (an empty array if no codes can be confidently derived), with no prose or markdown formatting. Each element must be an object with these keys:',
  '- "code": string — the SNOMED CT concept ID confirmed by Ontoserver',
  '- "display": string — the preferred term exactly as returned by Ontoserver, not paraphrased',
  '- "system": string — always "http://snomed.info/sct"',
].join('\n');

function gatherContext() {
  const notes = (document.getElementById('clinical-notes').value || '').trim();
  return { clinical_notes: notes, ...gatherPatientContext() };
}

/**
 * Derive validated reason codes from the current Clinical Notes + patient context.
 * @returns {Promise<{codes: Array<{code,display,system}>, error: string|null}>}
 */
export async function suggestReasonCodes() {
  try {
    const s = getAiSettings();
    const reasonEcl = (s.REASON_ECL || '').trim();
    if (!reasonEcl) {
      return { codes: [], error: 'Reason coding ECL is not set — add one in AI Settings.' };
    }

    const ctx = gatherContext();
    if (!ctx.clinical_notes) {
      return { codes: [], error: 'Enter clinical notes before suggesting codes.' };
    }

    // Function replacers so a literal `$` in operator guidance / ECL isn't treated
    // as a String.replace special pattern ($&, $1, …). When there's no operator
    // guidance the block is '' — collapse the resulting blank run so the prompt
    // doesn't carry a dangling gap.
    const guidance = guidanceBlock(GUIDANCE_HEADING, s.COMMON_PROMPT_SUPPLEMENTS, s.REASON_PROMPT_SUPPLEMENTS);
    const systemPrompt = SYSTEM_PROMPT
      .replace('{reason_ecl}', () => reasonEcl)
      .replace('{guidance_block}', () => guidance)
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    const userMessage = JSON.stringify(ctx);

    // search_concepts is hard-coerced to REASON_ECL no matter what the model passes.
    const toolImpl = {
      search_concepts: (args) => searchConcepts({ ...args, valueSetEcl: reasonEcl }),
      lookup_concept: (args) => lookupConcept(args),
    };

    const { parsed, error } = await runAgent({
      systemPrompt,
      userMessage,
      tools: getTools(),
      toolImpl,
      model: s.OPENROUTER_MODEL,
    });

    if (error) return { codes: [], error };
    if (!Array.isArray(parsed)) return { codes: [], error: null }; // empty/non-array → nothing usable

    // Validate, normalise, dedupe by code.
    const seen = new Set();
    const unique = parsed
      .filter((e) => e && e.code && e.display)
      .map((e) => ({ code: String(e.code), display: String(e.display), system: e.system || SCT }))
      .filter((c) => (seen.has(c.code) ? false : (seen.add(c.code), true)));

    // Confirm each in-scope (parallel); keep only confirmed.
    const oks = await Promise.all(unique.map((c) => confirmInScope(c, reasonEcl)));
    const codes = unique.filter((_, i) => oks[i]);

    return { codes, error: null };
  } catch (e) {
    if (e && e.name === 'AbortError') return { codes: [], error: 'Cancelled.' };
    return { codes: [], error: String((e && e.message) || e) };
  }
}
