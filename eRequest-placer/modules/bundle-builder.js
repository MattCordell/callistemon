// modules/bundle-builder.js — FHIR Bundle construction
'use strict';

window.App = window.App || {};

App.lastRequisitionId = null;

// ----- Practitioner/Role entries -----
App.buildPractitionerAndRoleEntries = function(selectedName) {
  var pracRes = App.practitionerResources[selectedName];
  var pracFullUrl = App.uuidURN();
  var roleFullUrl = App.uuidURN();
  var s = App.roleSpecialties[selectedName];
  var practitionerRole = {
    resourceType: 'PractitionerRole',
    meta: { profile: [
      'http://hl7.org.au/fhir/StructureDefinition/au-practitionerrole',
      'http://hl7.org.au/fhir/ereq/StructureDefinition/au-erequesting-practitionerrole'
    ] },
    active: true,
    practitioner: { reference: pracFullUrl }
  };
  if (s) {
    practitionerRole.specialty = [{ coding: [{ system: s.system, code: s.code, display: s.display }], text: s.display }];
  }
  var practitionerEntry = { fullUrl: pracFullUrl, resource: pracRes, request: { method: 'POST', url: 'Practitioner' } };
  var roleEntry = { fullUrl: roleFullUrl, resource: practitionerRole, request: { method: 'POST', url: 'PractitionerRole' } };
  return { practitionerEntry: practitionerEntry, roleEntry: roleEntry, roleRef: roleFullUrl };
};

// ----- Pregnancy status dropdown -----
App.populatePregnancyStatus = function() {
  var sel = document.getElementById('pregnancy-status');
  var options = [
    { system: 'http://snomed.info/sct', code: '77386006',        display: 'Pregnancy' },
    { system: 'http://snomed.info/sct', code: '60001007',        display: 'Not pregnant' },
    { system: 'http://snomed.info/sct', code: '146799005',       display: 'Possible pregnancy' },
    { system: 'http://snomed.info/sct', code: '152231000119106', display: 'Pregnancy test result unconfirmed' }
  ];
  options.forEach(function(o) {
    var opt = document.createElement('option');
    opt.value = o.code;
    opt.textContent = o.display;
    opt.dataset.system = o.system;
    sel.appendChild(opt);
  });
};

// ----- Build the transaction Bundle -----
App.buildBundle = function() {
  var preq = App.providePatientRefAndEntry();
  var patientRef = preq.patientRef;
  var patientEntry = preq.entry;
  var doctorName = document.getElementById('doctor-select').value || 'Dr Confident Cane Toad';
  var entries = [];
  if (patientEntry) entries.push(patientEntry);

  var pr = App.buildPractitionerAndRoleEntries(doctorName);
  entries.push(pr.practitionerEntry, pr.roleEntry);
  var roleRef = pr.roleRef;

  var now = new Date().toISOString();

  var requisitionId = App.newUUID();
  App.lastRequisitionId = requisitionId;
  var groupIdentifier = {
    system: App.PLACER_SYS,
    value: requisitionId,
    type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'PGN', display: 'Placer Group Number' }] }
  };

  var groupTaskFullUrl = App.uuidURN();
  var groupTask = {
    resourceType: 'Task',
    meta: {
      profile: [App.AU_PROFILES.TASK_GROUP],
      tag: [{ system: App.TASK_TAG_SYS, code: 'fulfilment-task-group' }]
    },
    identifier: [{ system: App.PLACER_SYS, value: requisitionId }],
    groupIdentifier: groupIdentifier,
    status: 'requested',
    intent: 'order',
    code: App.TASK_CODE,
    for: { reference: patientRef },
    authoredOn: now,
    requester: { reference: roleRef }
  };
  entries.push({ fullUrl: groupTaskFullUrl, resource: groupTask, request: { method: 'POST', url: 'Task' } });

  var pregSel = document.getElementById('pregnancy-status');
  var pregCode = (pregSel && pregSel.value) ? pregSel.value : '';
  var pregObsFullUrl = null;
  if (pregCode) {
    pregObsFullUrl = App.uuidURN();
    var sys = (pregSel.selectedOptions && pregSel.selectedOptions[0] && pregSel.selectedOptions[0].dataset.system) || 'http://snomed.info/sct';
    var disp = (pregSel.selectedOptions && pregSel.selectedOptions[0] && pregSel.selectedOptions[0].textContent) || '';
    var pregObs = {
      resourceType: 'Observation',
      meta: { profile: ['http://hl7.org/fhir/uv/ips/StructureDefinition/Observation-pregnancy-status-uv-ips'] },
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: '82810-3', display: 'Pregnancy status' }], text: 'Pregnancy status' },
      subject: { reference: patientRef },
      effectiveDateTime: now,
      valueCodeableConcept: { coding: [{ system: sys, code: pregCode, display: disp }], text: disp }
    };
    entries.push({ fullUrl: pregObsFullUrl, resource: pregObs, request: { method: 'POST', url: 'Observation' } });
  }

  // ----- Encounter (required by au-erequesting-servicerequest-path) -----
  var encounterFullUrl = App.uuidURN();
  var encounterResource = {
    resourceType: 'Encounter',
    meta: { profile: ['http://hl7.org.au/fhir/ereq/StructureDefinition/au-erequesting-encounter'] },
    status: 'planned',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' },
    subject: { reference: patientRef }
  };
  entries.push({ fullUrl: encounterFullUrl, resource: encounterResource, request: { method: 'POST', url: 'Encounter' } });

  var combinedNote = App.buildCombinedNoteText();
  var displaySeq = 0;

  App.selectedTests.forEach(function(t) {
    displaySeq++;
    var category = (t.kind === 'IMAG') ? App.CAT.IMAG : App.CAT.PATH;
    var srFullUrl = App.uuidURN();

    var codeDisplay = t.officialDisplay || t.display;
    var srCode = t.code
      ? { coding: [{ system: 'http://snomed.info/sct', code: t.code, display: codeDisplay }], text: t.display }
      : { text: t.display };

    var srResource = {
      resourceType: 'ServiceRequest',
      meta: { profile: [(t.kind === 'IMAG') ? App.AU_PROFILES.SR_IMAG : App.AU_PROFILES.SR_PATH] },
      extension: [{
        url: 'http://hl7.org.au/fhir/ereq/StructureDefinition/au-erequesting-displaysequence',
        valueInteger: displaySeq
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
      reasonCode: App.buildReasonCodeArray(),
      authoredOn: now
    };
    if (combinedNote) { srResource.note = [{ text: combinedNote }]; }

    if (t.code && App.fastingCodeSet.has(t.code)) {
      srResource.patientInstruction = 'fast of at least 8h, but no more than 16h';
    }

    if (pregObsFullUrl && pregCode === '77386006') {
      srResource.supportingInfo = srResource.supportingInfo || [];
      srResource.supportingInfo.push({ reference: pregObsFullUrl });
    }

    if (t.bodySite) {
      var bodyStructure = {
        resourceType: 'BodyStructure',
        id: 'bs',
        location: {
          coding: [{ system: 'http://snomed.info/sct', code: t.bodySite.code, display: t.bodySite.display }],
          text: t.bodySite.display
        }
      };
      if (patientRef.indexOf('urn:') !== 0) {
        bodyStructure.patient = { reference: patientRef };
      }
      srResource.contained = [bodyStructure];
      srResource.extension.push({
        url: 'http://hl7.org/fhir/StructureDefinition/procedure-targetBodyStructure',
        valueReference: { reference: '#bs' }
      });
    }

    entries.push({ fullUrl: srFullUrl, resource: srResource, request: { method: 'POST', url: 'ServiceRequest' } });

    var diagTaskFullUrl = App.uuidURN();
    var diagTask = {
      resourceType: 'Task',
      meta: {
        profile: [App.AU_PROFILES.TASK_DIAG],
        tag: [{ system: App.TASK_TAG_SYS, code: 'fulfilment-task' }]
      },
      identifier: [{ system: App.PLACER_SYS, value: App.newUUID() }],
      groupIdentifier: groupIdentifier,
      partOf: [{ reference: groupTaskFullUrl }],
      status: 'requested',
      intent: 'order',
      code: App.TASK_CODE,
      priority: (t.priority || 'routine'),
      focus: { reference: srFullUrl },
      for: { reference: patientRef },
      authoredOn: now,
      requester: { reference: roleRef }
    };
    entries.push({ fullUrl: diagTaskFullUrl, resource: diagTask, request: { method: 'POST', url: 'Task' } });
  });

  var bundle = { resourceType: 'Bundle', type: 'transaction', entry: entries };
  App.viewer.show(bundle);
  window.__lastBundle = bundle;
  return { bundle: bundle, requisitionId: requisitionId };
};
