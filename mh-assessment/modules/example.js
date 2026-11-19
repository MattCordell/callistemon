// Example data loader (FR-11). Fills the form with the synthetic scenario in
// the definition file. Each code is resolved against the field's current
// binding at load time; a code no longer in the binding is skipped with a
// console warning. The display is the AU preferred term from the server.

import { DEFINITION, EXAMPLE_SCENARIO } from '../definition/assessment-definition.js';
import { getConfig } from '../config.js';
import { validateCode } from './terminology.js';
import { bindingOf } from './controls.js';
import { allAnswers, getPatient, setPatient, replaceAnswers } from './state.js';
import { createLimiter } from './ui.js';

// Field and column definitions by id.
function definitionsById() {
  const map = new Map();
  for (const f of DEFINITION.fields) {
    map.set(f.id, f);
    for (const c of f.columns || []) map.set(c.id, c);
  }
  return map;
}

const isCoded = v => !!v && typeof v === 'object' && !Array.isArray(v) && 'code' in v;

// Returns true when the form holds anything the example would replace.
export function formHasData() {
  return allAnswers().size > 0 || getPatient() !== null;
}

// Loads the example. Returns { loaded, skipped }: counts of values.
export async function loadExample() {
  const defs = definitionsById();
  const limit = createLimiter(getConfig().CONCURRENCY);
  let skipped = 0;

  const skip = (id, why) => {
    skipped++;
    console.warn(`Example data: skipped a value for "${id}": ${why}`);
    return null;
  };

  // One coded value -> { system, code, display } or null.
  async function resolveCoding(def, spec) {
    if (def.options) {
      const match = def.options.find(o => o.code === spec.code && (!spec.system || o.system === spec.system));
      return match
        ? { system: match.system, code: match.code, display: match.display }
        : skip(def.id, `${spec.code} is not one of the field's options.`);
    }
    const binding = bindingOf(def);
    if (!binding) return skip(def.id, 'the field has no binding.');
    const system = spec.system || getConfig().SNOMED_SYSTEM;
    try {
      const res = await limit(() => validateCode(binding, spec.code, system));
      if (!res.result) return skip(def.id, `${spec.code} is no longer in the binding. ${res.message}`.trim());
      return { system, code: spec.code, display: res.display || spec.display || spec.code };
    } catch (err) {
      return skip(def.id, `${spec.code} could not be checked (${err.message}).`);
    }
  }

  // Any value shape -> the shape form state holds, or null.
  async function resolveValue(def, spec) {
    if (def.control === 'repeating-group') {
      const rows = await Promise.all((spec || []).map(async row => {
        const out = {};
        for (const [colId, colSpec] of Object.entries(row)) {
          const col = defs.get(colId);
          if (!col) { skip(colId, 'no such column.'); continue; }
          const v = await resolveValue(col, colSpec);
          if (v != null) out[colId] = v;
        }
        return Object.keys(out).length ? out : null;
      }));
      const kept = rows.filter(Boolean);
      return kept.length ? kept : null;
    }
    if (Array.isArray(spec)) {
      const codings = (await Promise.all(spec.map(s => resolveCoding(def, s)))).filter(Boolean);
      return codings.length ? codings : null;
    }
    if (isCoded(spec)) return resolveCoding(def, spec);
    return spec;
  }

  // An existing patient is kept; otherwise the example's new patient is used.
  const usePatient = getPatient()?.mode !== 'existing';
  const specs = Object.entries({
    ...(usePatient ? EXAMPLE_SCENARIO.patient : {}),
    ...EXAMPLE_SCENARIO.answers
  });

  const resolved = await Promise.all(specs.map(async ([id, spec]) => {
    const def = defs.get(id);
    if (!def) return [id, skip(id, 'no such field in the definition.')];
    return [id, await resolveValue(def, spec)];
  }));

  const entries = resolved.filter(([, v]) => v != null);
  replaceAnswers(entries);
  if (usePatient) setPatient({ mode: 'new' });
  return { loaded: entries.length, skipped };
}
