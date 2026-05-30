// modules/ai-decision-support.js — Feature C: pre-send decision support.
//
// Runs as a distinct pipeline from Features A/B (spec §C.1): triggered at Send,
// after the bundle is built, it evaluates the whole request across four
// dimensions and returns a structured result that drives the two-tier UI
// (advisory panel + serious-review modal). All output is advisory — the
// clinician can always proceed (spec §C.1, §C.9).

import { state } from './state.js';
import { getAiSettings, isDecisionSupportEnabled } from './settings-ai.js';
import { runAgent } from './ai-agent.js';
import { getTools, searchConcepts, lookupConcept } from './ontoserver-tools.js';
import { gatherPatientContext, combineGuidance } from './ai-context.js';
import { fetchAndSummarisePrior } from './prior-requests.js';

const VALID_SEVERITY = new Set(['advisory', 'serious']);
const VALID_DIMENSION = new Set(['appropriateness', 'suggestion', 'duplicate', 'context']);

// Spec §C.7 (system prompt) + §C.8 (output format). {guidelines} is substituted
// with the operator's COMMON + decision-support guidance (combineGuidance); it is
// '(none)' when both are empty so the slot never dangles, and the feature then
// runs on the model's general clinical training alone (spec §C.4).
const SYSTEM_PROMPT = [
  'You are a clinical decision support assistant for a general practice requesting clinician. You will be given a draft pathology or radiology request and must evaluate it across four dimensions: appropriateness, missed tests, duplicates, and context completeness.',
  '',
  'Apply the following clinical guidelines and local rules as authoritative where they conflict with your general training:',
  '{guidelines}',
  '',
  'For each finding, assign a severity:',
  '- "advisory" — informational, non-urgent; the clinician may proceed without action.',
  '- "serious" — warrants clinician review before sending; one or more of: the test is clinically inappropriate for the patient\'s demographics; the combination of tests or implied diagnoses carries potential clinical risk; critical context is missing that would affect how the request is actioned; a high-risk test has been ordered without documented clinical justification.',
  '',
  'You have an Ontoserver tool (search_concepts / lookup_concept) available to validate a SNOMED concept if useful; using it is optional.',
  '',
  'Return a JSON object ONLY (no prose, no markdown) in exactly this shape:',
  '{',
  '  "overall_severity": "advisory | serious | none",',
  '  "findings": [',
  '    {',
  '      "severity": "advisory | serious",',
  '      "dimension": "appropriateness | suggestion | duplicate | context",',
  '      "summary": "Brief plain-English summary, 1-2 sentences, for a clinician — no jargon, no alarm language",',
  '      "detail": "Optional longer explanation",',
  '      "related_tests": ["<SNOMED concept id>"],',
  '      "kind": "PATH | IMAG"',
  '    }',
  '  ]',
  '}',
  'overall_severity is "serious" if any finding is serious, otherwise "advisory" if any findings exist, otherwise "none". findings may be an empty array.',
  'For most findings related_tests holds SNOMED ids from the CURRENT request that the finding relates to (may be empty). For a "suggestion" finding, related_tests holds the SNOMED id(s) of the test(s) you are suggesting be ADDED, and "kind" is that test\'s category — "IMAG" for imaging/radiology or "PATH" for pathology/laboratory. Omit "kind" for non-suggestion findings.',
].join('\n');

/**
 * Gating per spec §C.3: run only when the toggle is on AND there is at least one
 * test AND clinical notes are present.
 */
export function shouldRunDecisionSupport(bundle, clinicalNotes) {
  if (!isDecisionSupportEnabled()) return false;
  if (countServiceRequests(bundle) < 1) return false;
  if (!String(clinicalNotes || '').trim()) return false;
  return true;
}

/**
 * Top-level evaluation invoked by the send pre-hook.
 * @returns {Promise<{result: object|null, error: string|null}>}
 */
export async function evaluateRequest(bundle) {
  try {
    const s = getAiSettings();
    const { selectedTests, clinicalNotes, reasonTags } = extractFromBundle(bundle);

    // Prior requests only when the patient is server-resolved (has an id) — a
    // newly-entered patient has nothing to query. Best-effort; never blocks.
    const pid = state.currentPatientResource && state.currentPatientResource.id;
    const priorRequests = pid ? await fetchAndSummarisePrior(pid) : [];

    // Function replacer so a literal `$` in operator guidance isn't treated as a
    // String.replace special pattern ($&, $1, …).
    const guidance = combineGuidance(s.COMMON_PROMPT_SUPPLEMENTS, s.GUIDELINES_SUMMARY);
    const systemPrompt = SYSTEM_PROMPT.replace('{guidelines}', () => guidance);

    const userMessage = JSON.stringify({
      selected_tests: selectedTests,
      clinical_notes: clinicalNotes,
      reason_tags: reasonTags,
      patient: gatherPatientContext(),
      prior_requests: priorRequests,
    });

    const toolImpl = {
      search_concepts: (args) => searchConcepts(args),
      lookup_concept: (args) => lookupConcept(args),
    };

    const { parsed, error } = await runAgent({
      systemPrompt,
      userMessage,
      tools: getTools(),
      toolImpl,
      model: s.OPENROUTER_MODEL,
    });

    if (error) return { result: null, error };

    const result = validateDecisionResult(parsed);
    if (!result) return { result: null, error: 'Decision support returned an unrecognised response.' };
    return { result, error: null };
  } catch (e) {
    if (e && e.name === 'AbortError') return { result: null, error: 'Cancelled.' };
    return { result: null, error: String((e && e.message) || e) };
  }
}

/**
 * Validate + normalise the agent's parsed output against spec §C.8. Pure (no IO)
 * so it can be unit-tested. Drops malformed findings, and derives
 * overall_severity from the surviving findings rather than trusting the model's
 * own field (keeps the contract: serious > advisory > none). Returns null only
 * when the top-level shape is unusable.
 */
export function validateDecisionResult(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const rawFindings = Array.isArray(parsed.findings) ? parsed.findings : [];

  const findings = [];
  for (const f of rawFindings) {
    if (!f || typeof f !== 'object') continue;
    if (!VALID_SEVERITY.has(f.severity)) continue;
    if (!VALID_DIMENSION.has(f.dimension)) continue;
    const summary = String(f.summary || '').trim();
    if (!summary) continue;

    const finding = { severity: f.severity, dimension: f.dimension, summary };
    if (f.detail != null && String(f.detail).trim()) finding.detail = String(f.detail).trim();
    if (Array.isArray(f.related_tests)) {
      finding.related_tests = f.related_tests.map((t) => String(t)).filter(Boolean);
    } else {
      finding.related_tests = [];
    }
    // Optional category for a suggested test (drives the "Add test" affordance so
    // an imaging suggestion isn't silently added as pathology). Only kept when the
    // model gives a recognisable value; left undefined otherwise.
    // Lenient prefix match (as Feature B's normaliseKind): IMAG/IMAGING/RAD… ->
    // IMAG; PATH/PATHOLOGY/LAB… -> PATH; anything else leaves kind undefined.
    const k = String(f.kind || '').trim().toUpperCase();
    if (k.startsWith('IMAG') || k.startsWith('RAD')) finding.kind = 'IMAG';
    else if (k.startsWith('PATH') || k.startsWith('LAB')) finding.kind = 'PATH';
    findings.push(finding);
  }

  const overall_severity = findings.some((f) => f.severity === 'serious')
    ? 'serious'
    : (findings.length ? 'advisory' : 'none');

  return { overall_severity, findings };
}

/**
 * Spec §C.10: record that serious flags were reviewed and overridden by appending
 * a note to every ServiceRequest in the bundle. Mutates in place; no profile or
 * structural change.
 */
export function appendAcknowledgementNote(bundle, seriousFindings) {
  const iso = new Date().toISOString();
  const summaries = (seriousFindings || [])
    .map((f) => (f && f.summary) || '')
    .filter(Boolean)
    .join('; ');
  const text = 'Decision support flags reviewed and overridden by requesting clinician on '
    + iso + (summaries ? ': ' + summaries : '');

  forEachServiceRequest(bundle, (res) => {
    if (!Array.isArray(res.note)) res.note = [];
    res.note.push({ text });
  });
  return bundle;
}

// ----- bundle helpers -----

function extractFromBundle(bundle) {
  const selectedTests = [];
  let clinicalNotes = '';
  let reasonTags = [];

  forEachServiceRequest(bundle, (res) => {
    const coding = (res.code && Array.isArray(res.code.coding) && res.code.coding[0]) || null;
    selectedTests.push({
      code: coding ? (coding.code || null) : null,
      display: (coding && coding.display) || (res.code && res.code.text) || null,
    });
    // Notes + reason codes are identical across this bundle's SRs (built once);
    // capture from the first SR that carries them.
    if (!clinicalNotes && Array.isArray(res.note) && res.note[0] && res.note[0].text) {
      clinicalNotes = String(res.note[0].text);
    }
    if (!reasonTags.length && Array.isArray(res.reasonCode) && res.reasonCode.length) {
      reasonTags = res.reasonCode.map((rc) => {
        const c = (rc && Array.isArray(rc.coding) && rc.coding[0]) || null;
        return { code: c ? (c.code || null) : null, display: (c && c.display) || (rc && rc.text) || null };
      });
    }
  });

  return { selectedTests, clinicalNotes, reasonTags };
}

function forEachServiceRequest(bundle, fn) {
  const entries = (bundle && Array.isArray(bundle.entry)) ? bundle.entry : [];
  for (const e of entries) {
    const res = e && e.resource;
    if (res && res.resourceType === 'ServiceRequest') fn(res);
  }
}

function countServiceRequests(bundle) {
  let n = 0;
  forEachServiceRequest(bundle, () => { n++; });
  return n;
}
