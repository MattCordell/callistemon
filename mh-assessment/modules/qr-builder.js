// QuestionnaireResponse builder (SPEC.md section 7.3). Holds every answered
// field, grouped by tab. Unanswered fields and empty rows are left out.

import { DEFINITION } from '../definition/assessment-definition.js';
import { coding, blank } from './fhir-codes.js';

// ctx: { answers, patient, labelOf(def), refs: { patient, encounter }, when }
export function buildQuestionnaireResponse(ctx) {
  const qr = {
    resourceType: 'QuestionnaireResponse',
    questionnaire: DEFINITION.questionnaireUrl,
    status: 'completed',
    subject: ctx.refs.patient,
    encounter: ctx.refs.encounter
  };
  if (ctx.when) qr.authored = ctx.when;

  const groups = [];
  for (const tab of DEFINITION.tabs) {
    const items = DEFINITION.fields
      .filter(f => f.tab === tab.id)
      .flatMap(f => fieldItems(f, ctx));
    if (items.length) groups.push({ linkId: tab.id, text: tab.label, item: items });
  }
  if (groups.length) qr.item = groups;
  return qr;
}

function fieldItems(def, ctx) {
  // Demographics are only answered for a new patient; an existing one is referenced.
  if (def.output === 'patient' && ctx.patient?.mode !== 'new') return [];
  const value = ctx.answers.get(def.id);
  if (blank(value)) return [];
  const text = ctx.labelOf(def);

  if (def.control === 'repeating-group') {
    // A repeating group repeats its item once per row that holds a value.
    return value.filter(row => !blank(row)).map(row => {
      const children = (def.columns || []).flatMap(col => {
        const answer = answersFor(col, row[col.id]);
        return answer.length ? [{ linkId: col.id, text: col.label || col.id, answer }] : [];
      });
      return { linkId: def.id, text, item: children };
    }).filter(item => item.item.length);
  }

  const answer = answersFor(def, value);
  return answer.length ? [{ linkId: def.id, text, answer }] : [];
}

// Typed answers: valueCoding, valueString, valueInteger, valueBoolean, valueDate.
function answersFor(def, value) {
  if (blank(value)) return [];
  if (Array.isArray(value)) return value.filter(v => !blank(v)).flatMap(v => answersFor(def, v));
  if (typeof value === 'object' && 'code' in value) return [{ valueCoding: coding(value) }];
  if (typeof value === 'number') return [{ valueInteger: value }];
  if (typeof value === 'boolean') return [{ valueBoolean: value }];
  if (def.control === 'date') return [{ valueDate: value }];
  return [{ valueString: value.trim() }];
}
