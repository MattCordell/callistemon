// config.js — Constants, terminology URLs, ValueSets, AU profiles, SNOMED codes

// Terminology servers
// R4: CSIRO Ontoserver — used only for pathology (RCPA SPIA supplement)
// TX: HL7 AU tx server — used for all other ValueSet expansion + $subsumes
export const R4_BASE  = 'https://r4.ontoserver.csiro.au/fhir/ValueSet/$expand';
export const TX_BASE  = 'https://tx.dev.hl7.org.au/fhir/ValueSet/$expand';
export const TERM_BASE = 'https://tx.dev.hl7.org.au/fhir';

export const VS = {
  PATH: 'https://www.rcpa.edu.au/fhir/ValueSet/spia-requesting-refset-3',
  IMAG: 'https://ranzcr.com/fhir/ValueSet/radiology-referral-1',
  REASON: 'https://healthterminologies.gov.au/fhir/ValueSet/reason-for-procedure-1',
  PREGNANCY: 'http://hl7.org/fhir/uv/ips/ValueSet/pregnancy-status-uv-ips',
};

export const AU_PROFILES = {
  TASK_GROUP: 'http://hl7.org.au/fhir/ereq/StructureDefinition/au-erequesting-task-group',
  TASK_DIAG:  'http://hl7.org.au/fhir/ereq/StructureDefinition/au-erequesting-task-diagnosticrequest',
  SR_DIAG:    'http://hl7.org.au/fhir/ereq/StructureDefinition/au-erequesting-diagnosticrequest',
  SR_PATH:    'http://hl7.org.au/fhir/ereq/StructureDefinition/au-erequesting-servicerequest-path',
  SR_IMAG:    'http://hl7.org.au/fhir/ereq/StructureDefinition/au-erequesting-servicerequest-imag',
};

export const TASK_TAG_SYS = 'http://terminology.hl7.org.au/CodeSystem/resource-tag';
export const TASK_CODE = { coding: [{ system: 'http://hl7.org/fhir/CodeSystem/task-code', code: 'fulfill' }] };
export const PLACER_SYS = 'http://callistemon.test/placer/id/';
export const MAX_NOTE_SUG = 8;

// SNOMED codes for warning logic
export const XRAY_PARENT = '363680008';      // Radiographic imaging procedure
export const HBA1C_CODE = '43396009';        // HbA1c
export const OBSTETRIC_PARENT = '271992004';  // Obstetric investigation (procedure)
export const NOT_PREGNANT_CODE = '60001007';  // Not pregnant
export const PREG_CODES_WARN = new Set(['77386006', '146799005']); // Pregnancy, Possible pregnancy

// ECL for fasting instruction
export const ECL_FASTING = '^1072351000168102 {{ term = "fasting" }}';
export const VS_ECL_FASTING = 'http://snomed.info/sct?fhir_vs=ecl/' + encodeURIComponent(ECL_FASTING);

// ECL for site-specific procedures (require body site selection)
export const ECL_SITE_SPECIFIC = '( (^1072351000168102 AND <(252390002 OR 168132005 OR 117259009 OR 86273004 OR 104190003)) ) MINUS ( (*:*=<<(122575003 OR 119339001 OR 258450006)) )';
export const VS_ECL_SITE_SPECIFIC = 'http://snomed.info/sct?fhir_vs=ecl/' + encodeURIComponent(ECL_SITE_SPECIFIC);

// ECL for Australian body site refset
export const VS_ECL_BODY_SITE = 'http://snomed.info/sct?fhir_vs=ecl/' + encodeURIComponent('^32570061000036105');

// Boost + supplement for pathology search
export const BOOST_URL      = 'http://snomed.info/sct?fhir_vs=refset/933412481000036103';
export const SUPPLEMENT_URL = 'https://github.com/MattCordell/callistemon/fhir/CodeSystem/snomed-pathology-test-info-supplement';
export const R5_PROP_EXT    = 'http://hl7.org/fhir/5.0/StructureDefinition/extension-ValueSet.expansion.contains.property';

// Provider-specific preferred name supplements (designation overlays)
export const PROVIDER_SUPPLEMENTS = [
  { id: 'none',        label: 'No preference' },
  { id: 'bb',         label: 'BB Diagnostics',                   url: 'https://github.com/MattCordell/callistemon/fhir/CodeSystem/snomed-pathology-test-info-supplement-bb-diagnostics' },
  { id: 'callistemon', label: 'Callistemon Diagnostic Services', url: 'https://github.com/MattCordell/callistemon/fhir/CodeSystem/snomed-pathology-test-info-supplement-callistemon-diagnostic-services' },
];

export const CAT = {
  PATH: { coding: [{ system: 'http://snomed.info/sct', code: '108252007', display: 'Laboratory procedure' }] },
  IMAG: { coding: [{ system: 'http://snomed.info/sct', code: '363679005', display: 'Imaging' }] },
};

// ----- AI infrastructure defaults (Phase 1, spec §3, §6, §7) -----
// These seed the localStorage-backed AI settings store (modules/settings-ai.js).
// getAiSettings() returns { ...AI_DEFAULTS, ...storedOverrides } on every read,
// so editing a default here propagates unless the user has overridden that key.
export const AI_DEFAULTS = {
  // Default route: managed Cloudflare Worker proxy that holds the OpenRouter API
  // key as a secret. Visitors don't need their own key. Replace this placeholder
  // with the real deployed worker URL once the proxy issue is closed.
  PROXY_BASE_URL: 'https://callistemon-ai-proxy.workers.dev',
  // Fallback route: direct OpenRouter, used only when USE_OWN_OPENROUTER_KEY is
  // true (the "Use my own OpenRouter key" toggle in AI Settings).
  OPENROUTER_BASE: 'https://openrouter.ai/api/v1',
  // Free model chosen for initial dev; runtime-swappable via the AI Settings
  // panel. If tool-calling proves unreliable, try anthropic/claude-haiku-4-5
  // or openai/gpt-4o-mini.
  OPENROUTER_MODEL: 'google/gemma-4-31b-it:free',
  // Hybrid key handling: default false -> proxy route. When true, the user's own
  // key (OPENROUTER_API_KEY) is read from settings and sent direct to OPENROUTER_BASE.
  USE_OWN_OPENROUTER_KEY: false,
  // Ontoserver: MCP first, REST fallback (probed at boot in ontoserver-tools.js).
  MCP_URL: 'https://ontoserver.app/mcp',
  REST_TX_BASE: 'https://tx.dev.hl7.org.au/fhir',
  // Per-feature ECL scoping (spec §7). Feature A draws from clinical findings,
  // Feature B from procedures.
  REASON_ECL: '< 404684003 |Clinical finding|',
  TEST_ECL: '< 71388002 |Procedure|',
  // Operator-tunable prompt context (spec §5.4, §C.4).
  PRE_PROMPT_SUPPLEMENTS: 'When a pathology specimen type is not specified, prefer serum, then blood, then urine (in that order).',
  GUIDELINES_SUMMARY: '',
  // Feature toggles (spec §6, §C.11).
  AI_FEATURES_ENABLED: true,
  DECISION_SUPPORT_ENABLED: true,
};

export const AI_SETTINGS_KEY = 'callistemon_ai_settings';
