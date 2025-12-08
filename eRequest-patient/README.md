# AU eRequesting – Consumer App

A patient-facing web application for viewing Australian eRequesting FHIR ServiceRequest requisitions.

## Overview

This demonstrator application showcases FHIR ServiceRequest workflows by allowing users to:
- Load requisitions by scanning QR codes (mobile) or pasting Task URLs (desktop)
- View patient details, instructions, and clinical notes
- See requested tests with their current status

The app connects to FHIR servers that support Australian eRequesting profiles.

## Features

- **QR Code Scanning**: Mobile users can scan QR codes from referral forms
- **Desktop URL Input**: Paste Task URLs directly from email or referral documents
- **Patient-Friendly UI**: Clean mint-themed interface designed for healthcare consumers
- **FHIR R4 Integration**: Retrieves Task groups, ServiceRequests, and Patient resources
- **Mobile Responsive**: Works on Chrome, Edge, and mobile devices

## Quick Start

### Option 1: Open Directly in Browser
Simply open `index.html` in your web browser (Chrome, Edge, Firefox, etc.)

### Option 2: Run with a Local Web Server (Recommended)

Using Python:
```bash
python -m http.server 8000
```

Using Node.js:
```bash
npx serve
```

Using PHP:
```bash
php -S localhost:8000
```

Then visit `http://localhost:8000` in your browser.

## Usage

### Desktop Mode
1. Paste a FHIR Task URL into the input field
   - Example: `https://server.fire.ly/Task/example-task-id`
2. Click the "Load" button
3. View the requisition details

### Mobile Mode
1. Open the app on your mobile device
2. Allow camera access when prompted
3. Point your camera at the QR code on your referral form
4. The requisition loads automatically once the QR code is detected

**Supported FHIR Servers:**
- Primary: `https://server.fire.ly`
- Secondary: `https://pyroserver.azurewebsites.net/pyro`
- Any HTTPS FHIR server with AU eRequesting support

## File Structure

```
/eRequest-patient/
  ├── index.html         # Main HTML file (clean, references external files)
  ├── styles.css         # Application stylesheet (formatted and organized)
  ├── app.js             # Main application logic (modular, well-documented)
  ├── config.js          # Configuration constants
  ├── README.md          # This file
  └── Readme.txt         # Original brief description
```

## Configuration

All configurable values are centralized in `config.js`:

- **FHIR Server Settings**: Timeout, retry count, page size
- **QR Scanner Settings**: FPS, box size, file size limits
- **Photo Validation**: Allowed MIME types and protocols
- **UI Settings**: Mobile breakpoint, rate limiting

To customize behavior, edit values in `config.js` without touching core application code.

## Browser Support

**Tested and supported:**
- Chrome (desktop and mobile)
- Edge (desktop and mobile)
- Mobile Safari (iOS)
- Chrome Mobile (Android)

**Requirements:**
- ES6 modules support
- Fetch API
- Modern CSS (CSS variables, Grid, Flexbox)

## Security Features

The refactored application includes several security improvements:

### XSS Prevention
- ✅ Photo URL protocol validation (only http/https allowed)
- ✅ Photo MIME type validation (only images allowed)
- ✅ Base64 data validation
- ✅ HTML escaping for user-generated content

### Input Validation
- ✅ HTTPS-only Task URLs
- ✅ QR image file type and size limits
- ✅ URL length validation
- ✅ FHIR resource type validation

### Network Security
- ✅ Request timeouts (30 seconds default)
- ✅ Pinned external library version (html5-qrcode@2.3.8)
- ✅ Proper error handling (no silent failures)

### Resource Management
- ✅ QR scanner cleanup on page unload (prevents memory leaks)
- ✅ Cached DOM element references (performance)

## Code Quality Improvements

### Phase 1 Refactoring (Completed)

**Before:** 476-line single HTML file with inline CSS and JavaScript

**After:** Clean separation of concerns with 4 files:
1. **index.html** (124 lines): Clean HTML structure
2. **styles.css** (291 lines): Formatted, organized CSS
3. **app.js** (775 lines): Modular JavaScript with JSDoc comments
4. **config.js** (90 lines): Centralized configuration

**Key Improvements:**
- ✅ Extracted CSS to external file with proper formatting
- ✅ Extracted JavaScript with modular structure
- ✅ Removed code duplication (helper functions)
- ✅ Cached DOM elements for performance
- ✅ Added comprehensive JSDoc documentation
- ✅ Improved error messages and logging

## Architecture

### Main Components

#### 1. **FHIR API Integration** ([app.js:61-182](app.js#L61-L182))
- `fhirGET()`: Fetch with timeout support
- `readResource()`: Read specific FHIR resources
- `searchResources()`: Search for FHIR resources
- `validateFhirResource()`: Validate resource structure

#### 2. **Data Parsing** ([app.js:219-314](app.js#L219-L314))
- `formatHumanName()`: Format FHIR names
- `calculateAge()`: Calculate age from birthdate
- `getCodeableConceptDisplay()`: Extract CodeableConcept text
- `parseResourceReference()`: Parse FHIR references

#### 3. **Photo Rendering** ([app.js:320-401](app.js#L320-L401))
- `renderPatientPhoto()`: Validate and display photos with security checks
- `showPhotoPlaceholder()`: SVG placeholder for missing photos

#### 4. **UI Rendering** ([app.js:407-542](app.js#L407-L542))
- `renderChipList()`: Reusable chip list renderer (eliminates duplication)
- `renderRequisitionDetails()`: Main render function
- `renderServiceRequests()`: ServiceRequest list renderer

#### 5. **QR Scanner** ([app.js:585-672](app.js#L585-L672))
- `startQrScanner()`: Start camera-based scanning
- `stopQrScanner()`: Clean up scanner resources
- `scanQrFromFile()`: Scan from uploaded image

#### 6. **Event Handlers** ([app.js:709-763](app.js#L709-L763))
- Load button with rate limiting
- Search again with confirmation
- QR image upload validation

## FHIR Resource Flow

1. User provides Task URL or scans QR code
2. App fetches root **Task** resource
3. App searches for child **Task** resources (via `part-of`)
4. App identifies **ServiceRequest** IDs from Task.focus and Task.basedOn
5. App fetches all **ServiceRequest** resources
6. App fetches **Patient** from first ServiceRequest.subject
7. App renders all data in the UI

## Error Handling

The application provides clear, actionable error messages:

- **Invalid URL**: "Invalid URL format. Expected: https://server.example.com/Task/12345..."
- **Network Timeout**: "Request timed out. Please try again."
- **Offline**: "You're offline. Check your internet connection."
- **QR Scan Error**: "Failed to decode QR image" or "QR code does not contain a valid Task URL"

All errors are logged to the console for debugging.

## Development

### Making Changes

1. **Configuration**: Edit `config.js` for timeouts, limits, etc.
2. **Styling**: Edit `styles.css` for visual changes
3. **Logic**: Edit `app.js` for functionality changes
4. **Structure**: Edit `index.html` for HTML changes

### Code Style

- **JavaScript**: ES6+ with JSDoc comments for all functions
- **CSS**: CSS variables for theming, organized by component
- **HTML**: Semantic HTML5 with ARIA attributes for accessibility

### Testing Checklist

Before deploying changes:
- [ ] Test on Chrome desktop
- [ ] Test on Edge desktop
- [ ] Test on mobile Chrome (Android)
- [ ] Test on mobile Safari (iOS)
- [ ] Test with sample Task URLs from both fire.ly and pyroserver
- [ ] Test QR code scanning (camera and file upload)
- [ ] Check browser console for errors
- [ ] Verify error messages are user-friendly

## Known Limitations

1. **No Authentication**: Uses public FHIR test servers (suitable for demo only)
2. **Limited Pagination**: Shows first 100 results with a warning
3. **No Retry Logic**: Network failures require manual retry (planned for Phase 3)
4. **Basic Accessibility**: Meets basic standards but not full WCAG AA compliance

## Troubleshooting

### QR Scanner Not Working
- **Cause**: Camera permissions denied or HTTPS not used
- **Solution**: Enable camera permissions in browser settings, or use local server with HTTPS

### "Request timed out"
- **Cause**: FHIR server is slow or unreachable
- **Solution**: Check your internet connection, try again later

### "Invalid URL format"
- **Cause**: URL doesn't match Task URL pattern
- **Solution**: Ensure URL is HTTPS and points to a /Task/{id} resource

### Nothing happens when clicking Load
- **Cause**: JavaScript not loading (ES6 modules blocked)
- **Solution**: Use a local web server instead of opening file:// directly

## Roadmap

### Phase 2: Security Hardening (Planned)
- [ ] Add Subresource Integrity (SRI) hash for external libraries
- [ ] Implement Content Security Policy (CSP)
- [ ] Add more robust input sanitization

### Phase 3: Code Quality (Planned)
- [ ] Network retry logic with exponential backoff
- [ ] Better empty state handling
- [ ] Loading indicators/spinners

### Phase 4: UX Enhancements (Planned)
- [ ] Offline detection
- [ ] Improved error messages
- [ ] Copy-to-clipboard for requisition IDs
- [ ] Print-friendly view

### Phase 5: Testing (Planned)
- [ ] Unit tests for utility functions
- [ ] Integration tests for FHIR API calls
- [ ] E2E tests for user workflows

## Contributing

This is a demonstrator application. For production use:
1. Add authentication/authorization
2. Implement full WCAG AA accessibility compliance
3. Add comprehensive error handling
4. Set up automated testing
5. Configure CSP and CORS policies
6. Add monitoring and analytics

## License

[Add your license information here]

## Contact

For questions about AU eRequesting or FHIR integration, refer to:
- [FHIR R4 Specification](https://hl7.org/fhir/R4/)
- [Australian Digital Health Agency](https://www.digitalhealth.gov.au/)

---

**Last Updated**: December 2024
**Version**: 2.0 (Refactored)
