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
import { gatherPatientContext, confirmInScope, SCT } from './ai-context.js';

// Spec §4.5, verbatim. {reason_ecl} is substituted at call time.
const SYSTEM_PROMPT = [
  'You are a clinical coding assistant. Your task is to derive a minimal, accurate set of SNOMED CT codes representing the clinical meaning of a clinician\'s free-text notes.',
  '',
  'Prioritise accuracy over completeness. Return only codes you are confident are correct. Do not speculate. Do not use concept IDs from memory.',
  '',
  'You have access to an Ontoserver MCP tool. Use `search_concepts` with the ECL expression `{reason_ecl}` to find and confirm every concept before including it. Only include a code if Ontoserver confirms it is valid, active, and within the ECL scope. If no match is found, omit the concept.',
  '',
  'Return a JSON array only, no prose or markdown formatting.',
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

    const systemPrompt = SYSTEM_PROMPT.replace('{reason_ecl}', reasonEcl);
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
