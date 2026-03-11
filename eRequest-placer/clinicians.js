// clinicians.js — Practitioner resources, role specialties, user favourites
'use strict';

window.App = window.App || {};

App.practitionerResources = {
  "Dr Confident Cane Toad": {
    resourceType: "Practitioner",
    id: "J855592470710578",
    meta: { profile: [
      "http://hl7.org.au/fhir/StructureDefinition/au-practitioner",
      "http://hl7.org.au/fhir/erequesting/StructureDefinition/au-erequesting-practitioner"
    ] },
    active: true,
    identifier: [{
      type: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/v2-0203", code: "NPI", display: "National provider identifier" }], text: "HPI-I" },
      system: "http://ns.electronichealth.net.au/id/hi/hpii/1.0",
      value: "8003619952069505"
    }],
    name: [{ text: "Dr Confident Cane Toad", family: "Cane Toad", given: ["Confident"], prefix: ["Dr"] }],
    address: [{
      text: "45 Wattle Rise, Kensington, TAS 6497",
      line: ["45 Wattle Rise"], city: "Kensington", state: "TAS", postalCode: "6497", country: "Australia"
    }]
  },
  "Dr Compassionate Quoll": {
    resourceType: "Practitioner",
    id: "W855592487843004",
    meta: { profile: [
      "http://hl7.org.au/fhir/StructureDefinition/au-practitioner",
      "http://hl7.org.au/fhir/erequesting/StructureDefinition/au-erequesting-practitioner"
    ] },
    active: true,
    identifier: [{
      type: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/v2-0203", code: "NPI", display: "National provider identifier" }], text: "HPI-I" },
      system: "http://ns.electronichealth.net.au/id/hi/hpii/1.0",
      value: "8003619970307465"
    }],
    name: [{ text: "Dr Compassionate Quoll", family: "Quoll", given: ["Compassionate"], prefix: ["Dr"] }],
    address: [{
      text: "136 Allocasuarina Ln, Geelong, NSW 5600",
      line: ["136 Allocasuarina Ln"], city: "Geelong", state: "NSW", postalCode: "5600", country: "Australia"
    }]
  }
};

App.roleSpecialties = {
  "Dr Confident Cane Toad": { system: "http://snomed.info/sct", code: "408443003", display: "General medical practice" },
  "Dr Compassionate Quoll": { system: "http://snomed.info/sct", code: "394585009", display: "Obstetrics and gynaecology" }
};

App.userFavourites = {
  "Dr Confident Cane Toad": {
    pathology: [
      {code:"26604007",display:"Full blood count"},
      {code:"401324008",display:"Urine MCS"},
      {code:"26958001",display:"Liver function test"},
      {code:"252150008",display:"Fasting lipid profile"},
      {code:"843441000168103",display:"Respiratory pathogen nucleic acid assay"},
      {code:"395142003",display:"Allergy screening test"},
      {code:"43396009",display:"HbA1c (glycated haemoglobin)"}
    ],
    radiology: [
      {code:"399208008",display:"Chest X-ray"},
      {code:"3821000087108",display:"Plain X-ray of left wrist"},
      {code:"3831000087105",display:"Plain X-ray of right wrist"},
      {code:"446522006",display:"Ultrasound scan in first trimester"},
      {code:"33367005",display:"Coronary angiography"},
      {code:"241601008",display:"MRI of head"}
    ]
  },
  "Dr Compassionate Quoll": {
    pathology: [
      {code:"26604007",display:"Full blood count"},
      {code:"401324008",display:"Serum pregnancy test (B-HCG)"},
      {code:"113076002",display:"Glucose tolerance test"},
      {code:"252409009",display:"Rubella virus antibody screening"},
      {code:"44608003",display:"Blood group typing"},
      {code:"395144002",display:"B12/folate level"},
      {code:"43396009",display:"HbA1c (glycated haemoglobin)"}
    ],
    radiology: [
      {code:"446522006",display:"Ultrasound scan in first trimester"},
      {code:"446208007",display:"Ultrasound scan in second trimester"},
      {code:"446353007",display:"Ultrasound scan in third trimester"},
      {code:"433235006",display:"Fetal echocardiography"},
      {code:"414880004",display:"Nuchal ultrasound scan"},
      {code:"433153009",display:"Chorionic villus sampling using obstetric ultrasound guidance"}
    ]
  }
};
