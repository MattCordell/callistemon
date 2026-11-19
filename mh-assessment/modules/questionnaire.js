// Questionnaire generation (FR-12). One item per definition field, grouped
// by tab, so the QuestionnaireResponse built by qr-builder.js lines up with it:
// the same linkIds and the same group nesting.
//
//   item.code          the field's observable
//   item.answerValueSet the implicit ECL value set URL (configured edition), or the value set
//   item.answerOption  inline options (local or FHIR-internal codes)
//
// SDC rendering fidelity is out of scope (SPEC.md section 11, item 1).

import { DEFINITION } from '../definition/assessment-definition.js';
import { getConfig } from '../config.js';
import { implicitVsUrl } from './terminology.js';
import { bindingOf } from './controls.js';
import { labelResolver } from './bundle.js';
import { coding } from './fhir-codes.js';

const EXT_MIN = 'http://hl7.org/fhir/StructureDefinition/minValue';
const EXT_MAX = 'http://hl7.org/fhir/StructureDefinition/maxValue';

const PLAIN_TYPES = {
  text: 'string',
  textarea: 'text',
  integer: 'integer',
  date: 'date',
  boolean: 'boolean'
};

// Builds the Questionnaire. Labels use AU preferred terms where the field has no label.
export async function buildQuestionnaire() {
  const names = await labelResolver();
  const today = localDate();

  const groups = DEFINITION.tabs
    .map(tab => ({
      linkId: tab.id,
      text: tab.label,
      type: 'group',
      item: DEFINITION.fields.filter(f => f.tab === tab.id).map(f => fieldItem(f, names))
    }))
    .filter(g => g.item.length);

  return {
    resourceType: 'Questionnaire',
    id: DEFINITION.id,
    url: DEFINITION.questionnaireUrl,
    version: DEFINITION.questionnaireVersion,
    name: 'MHAODAssessment',
    title: DEFINITION.title,
    status: 'draft',
    experimental: true,
    subjectType: ['Patient'],
    date: today,
    publisher: 'Callistemon demonstrator',
    description: 'Generated from the MHAOD assessment definition file. Bindings are placeholders. Synthetic data only.',
    item: groups
  };
}

// Today's date in the browser's time zone (toISOString would give the UTC date).
function localDate(d = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fieldItem(def, names) {
  const item = { linkId: def.id, text: names.labelOf(def) };
  if (def.observable?.code) {
    item.code = [coding({
      system: def.observable.system || getConfig().SNOMED_SYSTEM,
      code: def.observable.code,
      display: names.observableDisplay(def)
    })];
  }

  if (def.control === 'repeating-group') {
    item.type = 'group';
    item.repeats = true;
    item.item = (def.columns || []).map(col => fieldItem(col, names));
    return item;
  }

  const binding = bindingOf(def);
  if (def.options) {
    item.type = 'choice';
    item.answerOption = def.options.map(o => ({ valueCoding: coding(o) }));
  } else if (binding) {
    // A boolean with a binding records the bound concept, so it is a choice too.
    item.type = 'choice';
    item.answerValueSet = binding.ecl ? implicitVsUrl(binding.ecl) : binding.valueSet;
  } else {
    item.type = PLAIN_TYPES[def.control] || 'string';
  }
  if (def.cardinality === 'multiple') item.repeats = true;

  if (item.type === 'integer') {
    const ext = [];
    if (def.min != null) ext.push({ url: EXT_MIN, valueInteger: def.min });
    if (def.max != null) ext.push({ url: EXT_MAX, valueInteger: def.max });
    if (ext.length) item.extension = ext;
  }
  return item;
}
