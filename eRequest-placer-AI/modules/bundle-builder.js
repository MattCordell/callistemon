// modules/bundle-builder.js — FHIR Bundle construction

import { state } from './state.js';
import { uuidURN, newUUID } from './utils.js';
import {
  AU_PROFILES, TASK_TAG_SYS, TASK_CODE, PLACER_SYS, CAT,
} from '../config.js';
import { practitionerResources, roleSpecialties } from '../clinicians.js';
import { providePatientRefAndEntry } from './patient.js';
import { buildCombinedNoteText, buildReasonCodeArray } from './reason-tags.js';
import { fastingCodeSet } from './terminology.js';

// ----- Practitioner/Role entries -----
export function buildPractitionerAndRoleEntries(selectedName) {
  const pracRes = practitionerResources[selectedName];
  const pracFullUrl = uuidURN();
  const roleFullUrl = uuidURN();
  const s = roleSpecialties[selectedName];
  const practitionerRole = {
    resourceType: 'PractitionerRole',
    meta: { profile: ['http://hl7.org.au/fhir/ereq/StructureDefinition/au-erequesting-practitionerrole'] },
    active: true,
    practitioner: { reference: pracFullUrl },
  };
  if (s) {
    practitionerRole.specialty = [{ coding: [{ system: s.system, code: s.code, display: s.display }], text: s.display }];
  }
  const practitionerEntry = { fullUrl: pracFullUrl, resource: pracRes, request: { method: 'POST', url: 'Practitioner' } };
  const roleEntry = { fullUrl: roleFullUrl, resource: practitionerRole, request: { method: 'POST', url: 'PractitionerRole' } };
  return { practitionerEntry, roleEntry, roleRef: roleFullUrl };
}

// ----- Pregnancy status dropdown -----
export function populatePregnancyStatus() {
  const sel = document.getElementById('pregnancy-status');
  const options = [
    { system: 'http://snomed.info/sct', code: '77386006',        display: 'Pregnancy' },
    { system: 'http://snomed.info/sct', code: '60001007',        display: 'Not pregnant' },
    { system: 'http://snomed.info/sct', code: '146799005',       display: 'Possible pregnancy' },
    { system: 'http://snomed.info/sct', code: '152231000119106', display: 'Pregnancy test result unconfirmed' },
  ];
  options.forEach((o) => {
    const opt = document.createElement('option');
    opt.value = o.code;
    opt.textContent = o.display;
    opt.dataset.system = o.system;
    sel.appendChild(opt);
  });
}

// ----- Build the transaction Bundle -----
export function buildBundle() {
  const preq = providePatientRefAndEntry();
  const patientRef = preq.patientRef;
  const patientEntry = preq.entry;
  const doctorName = document.getElementById('doctor-select').value || 'Dr Confident Cane Toad';
  const entries = [];
  if (patientEntry) entries.push(patientEntry);

  const pr = buildPractitionerAndRoleEntries(doctorName);
  entries.push(pr.practitionerEntry, pr.roleEntry);
  const roleRef = pr.roleRef;

  const now = new Date().toISOString();

  const requisitionId = newUUID();
  state.lastRequisitionId = requisitionId;
  const groupIdentifier = {
    system: PLACER_SYS,
    value: requisitionId,
    type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'PGN', display: 'Placer Group Number' }] },
  };

  const groupTaskFullUrl = uuidURN();
  const groupTask = {
    resourceType: 'Task',
    meta: {
      profile: [AU_PROFILES.TASK_GROUP],
      tag: [{ system: TASK_TAG_SYS, code: 'fulfilment-task-group' }],
    },
    identifier: [{ system: PLACER_SYS, value: requisitionId }],
    groupIdentifier,
    status: 'requested',
    intent: 'order',
    code: TASK_CODE,
    for: { reference: patientRef },
    authoredOn: now,
    requester: { reference: roleRef },
  };
  entries.push({ fullUrl: groupTaskFullUrl, resource: groupTask, request: { method: 'POST', url: 'Task' } });

  const pregSel = document.getElementById('pregnancy-status');
  const pregCode = (pregSel && pregSel.value) ? pregSel.value : '';
  let pregObsFullUrl = null;
  if (pregCode) {
    pregObsFullUrl = uuidURN();
    const sys = (pregSel.selectedOptions && pregSel.selectedOptions[0] && pregSel.selectedOptions[0].dataset.system) || 'http://snomed.info/sct';
    const disp = (pregSel.selectedOptions && pregSel.selectedOptions[0] && pregSel.selectedOptions[0].textContent) || '';
    const pregObs = {
      resourceType: 'Observation',
      meta: { profile: ['http://hl7.org/fhir/uv/ips/StructureDefinition/Observation-pregnancy-status-uv-ips'] },
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: '82810-3', display: 'Pregnancy status' }], text: 'Pregnancy status' },
      subject: { reference: patientRef },
      effectiveDateTime: now,
      valueCodeableConcept: { coding: [{ system: sys, code: pregCode, display: disp }], text: disp },
    };
    entries.push({ fullUrl: pregObsFullUrl, resource: pregObs, request: { method: 'POST', url: 'Observation' } });
  }

  // ----- Encounter (required by au-erequesting-servicerequest-path) -----
  const encounterFullUrl = uuidURN();
  const encounterResource = {
    resourceType: 'Encounter',
    meta: { profile: ['http://hl7.org.au/fhir/ereq/StructureDefinition/au-erequesting-encounter'] },
    status: 'planned',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' },
    subject: { reference: patientRef },
  };
  entries.push({ fullUrl: encounterFullUrl, resource: encounterResource, request: { method: 'POST', url: 'Encounter' } });

  const combinedNote = buildCombinedNoteText();
  let displaySeq = 0;

  state.selectedTests.forEach((t) => {
    displaySeq++;
    const category = (t.kind === 'IMAG') ? CAT.IMAG : CAT.PATH;
    const srFullUrl = uuidURN();

    const codeDisplay = t.officialDisplay || t.display;
    const srCode = t.code
      ? { coding: [{ system: 'http://snomed.info/sct', code: t.code, display: codeDisplay }], text: t.display }
      : { text: t.display };

    const srResource = {
      resourceType: 'ServiceRequest',
      meta: { profile: [(t.kind === 'IMAG') ? AU_PROFILES.SR_IMAG : AU_PROFILES.SR_PATH] },
      extension: [{
        url: 'http://hl7.org.au/fhir/ereq/StructureDefinition/au-erequesting-displaysequence',
        valueInteger: displaySeq,
      }],
      status: 'active',
      intent: 'order',
      priority: (t.priority || 'routine'),
      category: [category],
      code: srCode,
      subject: { reference: patientRef },
      encounter: { reference: encounterFullUrl },
      requester: { reference: roleRef },
      requisition: groupIdentifier,
      reasonCode: buildReasonCodeArray(),
      authoredOn: now,
    };
    if (combinedNote) { srResource.note = [{ text: combinedNote }]; }

    if (t.code && fastingCodeSet.has(t.code)) {
      srResource.patientInstruction = 'fast of at least 8h, but no more than 16h';
    }

    if (pregObsFullUrl && pregCode === '77386006') {
      srResource.supportingInfo = srResource.supportingInfo || [];
      srResource.supportingInfo.push({ reference: pregObsFullUrl });
    }

    if (t.bodySite) {
      const bodyStructure = {
        resourceType: 'BodyStructure',
        id: 'bs',
        location: {
          coding: [{ system: 'http://snomed.info/sct', code: t.bodySite.code, display: t.bodySite.display }],
          text: t.bodySite.display,
        },
      };
      bodyStructure.patient = { reference: patientRef };
      srResource.contained = [bodyStructure];
      srResource.extension.push({
        url: 'http://hl7.org/fhir/StructureDefinition/procedure-targetBodyStructure',
        valueReference: { reference: '#bs' },
      });
    }

    entries.push({ fullUrl: srFullUrl, resource: srResource, request: { method: 'POST', url: 'ServiceRequest' } });

    const diagTaskFullUrl = uuidURN();
    const diagTask = {
      resourceType: 'Task',
      meta: {
        profile: [AU_PROFILES.TASK_DIAG],
        tag: [{ system: TASK_TAG_SYS, code: 'fulfilment-task' }],
      },
      identifier: [{ system: PLACER_SYS, value: newUUID() }],
      groupIdentifier,
      partOf: [{ reference: groupTaskFullUrl }],
      status: 'requested',
      intent: 'order',
      code: TASK_CODE,
      priority: (t.priority || 'routine'),
      focus: { reference: srFullUrl },
      for: { reference: patientRef },
      authoredOn: now,
      requester: { reference: roleRef },
    };
    entries.push({ fullUrl: diagTaskFullUrl, resource: diagTask, request: { method: 'POST', url: 'Task' } });
  });

  const bundle = { resourceType: 'Bundle', type: 'transaction', entry: entries };
  if (state.viewer) state.viewer.show(bundle);
  window.__lastBundle = bundle;
  return { bundle, requisitionId };
}
