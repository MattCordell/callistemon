# Patient Reception

A small React app for FHIR Connectathons.

- Accepts a full resource URL, a Patient ID, or scans a QR.
- If given a Patient or something with a Patient `subject`, it automatically calls `$everything`.
- Renders a dashboard-style view and shows outstanding ServiceRequests.

## Local dev

```bash
npm i
npm run dev
