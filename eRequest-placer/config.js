// config.js — Constants, terminology URLs, ValueSets, AU profiles, SNOMED codes
'use strict';

window.App = window.App || {};

// Terminology servers
// R4: CSIRO Ontoserver — used only for pathology (RCPA SPIA supplement)
// TX: HL7 AU tx server — used for all other ValueSet expansion + $subsumes
App.R4_BASE  = "https://r4.ontoserver.csiro.au/fhir/ValueSet/$expand";
App.TX_BASE  = "https://tx.dev.hl7.org.au/fhir/ValueSet/$expand";
App.TERM_BASE = "https://tx.dev.hl7.org.au/fhir";

App.VS = {
  PATH: "https://www.rcpa.edu.au/fhir/ValueSet/spia-requesting-refset-3",
  IMAG: "https://ranzcr.com/fhir/ValueSet/radiology-referral-1",
  REASON: "https://healthterminologies.gov.au/fhir/ValueSet/reason-for-procedure-1",
  PREGNANCY: "http://hl7.org/fhir/uv/ips/ValueSet/pregnancy-status-uv-ips"
};

App.AU_PROFILES = {
  TASK_GROUP: "http://hl7.org.au/fhir/ereq/StructureDefinition/au-erequesting-task-group",
  TASK_DIAG:  "http://hl7.org.au/fhir/ereq/StructureDefinition/au-erequesting-task-diagnosticrequest",
  SR_DIAG:    "http://hl7.org.au/fhir/ereq/StructureDefinition/au-erequesting-diagnosticrequest",
  SR_PATH:    "http://hl7.org.au/fhir/ereq/StructureDefinition/au-erequesting-servicerequest-path",
  SR_IMAG:    "http://hl7.org.au/fhir/ereq/StructureDefinition/au-erequesting-servicerequest-imag"
};

App.TASK_TAG_SYS = 'http://terminology.hl7.org.au/CodeSystem/resource-tag';
App.TASK_CODE = { coding: [{ system: 'http://hl7.org/fhir/CodeSystem/task-code', code: 'fulfill' }] };
App.PLACER_SYS = "http://callistemon.test/placer/id/";
App.MAX_NOTE_SUG = 8;

// SNOMED codes for warning logic
App.XRAY_PARENT = '363680008';      // Radiographic imaging procedure
App.HBA1C_CODE = '43396009';        // HbA1c
App.OBSTETRIC_PARENT = '271992004';  // Obstetric investigation (procedure)
App.NOT_PREGNANT_CODE = '60001007';  // Not pregnant
App.PREG_CODES_WARN = new Set(['77386006', '146799005']); // Pregnancy, Possible pregnancy

// ECL for fasting instruction
App.ECL_FASTING = '^1072351000168102 {{ term = "fasting" }}';
App.VS_ECL_FASTING = 'http://snomed.info/sct?fhir_vs=ecl/' + encodeURIComponent(App.ECL_FASTING);

// Boost + supplement for pathology search
App.BOOST_URL      = 'http://snomed.info/sct?fhir_vs=refset/933412481000036103';
App.SUPPLEMENT_URL = 'https://github.com/MattCordell/callistemon/fhir/CodeSystem/snomed-pathology-test-info-supplement';
App.R5_PROP_EXT    = 'http://hl7.org/fhir/5.0/StructureDefinition/extension-ValueSet.expansion.contains.property';

App.CAT = {
  PATH: { coding: [{ system: "http://snomed.info/sct", code: "108252007", display: "Laboratory procedure" }] },
  IMAG: { coding: [{ system: "http://snomed.info/sct", code: "363679005", display: "Imaging" }] }
};
