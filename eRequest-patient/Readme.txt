AU eRequesting – Consumer App
=============================

This is a simple demonstration web app for viewing Australian eRequesting requisitions.

Features:
- Load a requisition either by scanning a QR code (mobile) or pasting a Task URL (desktop).
- Retrieve the associated Task group and ServiceRequests from a FHIR server.
- Display patient details (name, age, photo or placeholder).
- Show distinct patient instructions and clinical notes.
- List requested tests, with their current status and business status.

The app is designed with a clean, patient-friendly mint colour scheme.
It requires access to a FHIR server supporting AU eRequesting profiles.
