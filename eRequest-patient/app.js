/**
 * AU eRequesting Consumer App
 * Main application logic for viewing FHIR ServiceRequest requisitions
 */

import { CONFIG } from './config.js';

// ============================================
// DOM Element Cache (Performance Optimization)
// ============================================

const elements = {
  status: null,
  loadPanel: null,
  detailsPanel: null,
  desktopOptions: null,
  mobileOptions: null,
  taskUrlInput: null,
  loadBtn: null,
  qrArea: null,
  switchDesktopBtn: null,
  searchAgainBtn: null,
  qrImageInput: null,
  // Detail panel elements
  reqId: null,
  reqCreated: null,
  patientName: null,
  patientAge: null,
  patientPhoto: null,
  avatarWrap: null,
  instructions: null,
  notes: null,
  srList: null,
  // Modal elements
  infoModal: null,
  modalClose: null,
  modalTitle: null,
  modalBody: null,
  modalLink: null
};

/**
 * Initialize DOM element references
 * Call this once on DOMContentLoaded
 */
function initElements() {
  elements.status = document.getElementById("status");
  elements.loadPanel = document.getElementById("loadPanel");
  elements.detailsPanel = document.getElementById("detailsPanel");
  elements.desktopOptions = document.getElementById("desktopOptions");
  elements.mobileOptions = document.getElementById("mobileOptions");
  elements.taskUrlInput = document.getElementById("taskUrl");
  elements.loadBtn = document.getElementById("loadBtn");
  elements.qrArea = document.getElementById("qrArea");
  elements.switchDesktopBtn = document.getElementById("switchDesktopBtn");
  elements.searchAgainBtn = document.getElementById("searchAgainBtn");
  elements.qrImageInput = document.getElementById("qrImage");
  // Detail panel
  elements.reqId = document.getElementById("reqId");
  elements.reqCreated = document.getElementById("reqCreated");
  elements.patientName = document.getElementById("patientName");
  elements.patientAge = document.getElementById("patientAge");
  elements.patientPhoto = document.getElementById("patientPhoto");
  elements.avatarWrap = document.getElementById("avatarWrap");
  elements.instructions = document.getElementById("instructions");
  elements.notes = document.getElementById("notes");
  elements.srList = document.getElementById("srList");
  // Modal
  elements.infoModal = document.getElementById("infoModal");
  elements.modalClose = document.getElementById("modalClose");
  elements.modalTitle = document.getElementById("modalTitle");
  elements.modalBody = document.getElementById("modalBody");
  elements.modalLink = document.getElementById("modalLink");
}

// ============================================
// Status Management
// ============================================

/**
 * Update the application status display
 * @param {string} message - Status message to display
 * @param {string} [type] - Status type: 'error', 'ok', 'loading', or undefined for default
 */
function setStatus(message, type) {
  if (!elements.status) return;

  // Clear existing content
  elements.status.textContent = "";
  elements.status.className = "status";

  // Add loading spinner if type is 'loading'
  if (type === "loading") {
    const spinner = document.createElement("span");
    spinner.className = "spinner";
    spinner.setAttribute("aria-label", "Loading");
    elements.status.appendChild(spinner);
  }

  // Add message text
  const textNode = document.createTextNode(message);
  elements.status.appendChild(textNode);

  // Add type-specific classes
  if (type === "error") {
    elements.status.classList.add("error");
  } else if (type === "ok") {
    elements.status.classList.add("success");
  }

  // Log status changes for debugging
  console.log(`[${(type || 'info').toUpperCase()}] ${message}`);
}

// ============================================
// FHIR API Integration
// ============================================

/**
 * Perform a GET request to a FHIR server with timeout support
 * @param {string} url - The FHIR endpoint URL
 * @param {Object} [params={}] - Query parameters
 * @param {number} [timeoutMs] - Request timeout in milliseconds
 * @returns {Promise<Object>} FHIR response JSON
 */
async function fhirGET(url, params = {}, timeoutMs = CONFIG.FHIR_SERVER.timeout) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const fullUrl = new URL(url);

    // Add query parameters
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        fullUrl.searchParams.set(key, value);
      }
    });

    const response = await fetch(fullUrl.toString(), {
      headers: CONFIG.FHIR_SERVER.headers,
      signal: controller.signal
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GET ${fullUrl}: ${response.status} — ${text}`);
    }

    return response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {number} [maxRetries] - Maximum number of retry attempts
 * @param {number} [initialDelay] - Initial delay in milliseconds
 * @returns {Promise<any>} Result of the function
 */
async function retryWithBackoff(fn, maxRetries = CONFIG.FHIR_SERVER.retryCount, initialDelay = 1000) {
  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry on client errors (4xx) or validation errors
      if (error.message.includes('400') ||
          error.message.includes('401') ||
          error.message.includes('403') ||
          error.message.includes('404') ||
          error.message.includes('Invalid')) {
        throw error;
      }

      // Only retry on network errors and 5xx server errors
      const isRetryable = error.name === 'TypeError' || // Network error
                         error.message.includes('timed out') ||
                         error.message.includes('500') ||
                         error.message.includes('502') ||
                         error.message.includes('503') ||
                         error.message.includes('504');

      if (!isRetryable || attempt === maxRetries - 1) {
        throw error;
      }

      // Exponential backoff: delay = initialDelay * 2^attempt
      const delay = initialDelay * Math.pow(2, attempt);
      const jitter = Math.random() * 0.3 * delay; // Add up to 30% jitter
      const totalDelay = delay + jitter;

      console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${Math.round(totalDelay)}ms...`);
      await new Promise(resolve => setTimeout(resolve, totalDelay));
    }
  }

  throw lastError;
}

/**
 * Read a specific FHIR resource by type and ID with automatic retry
 * @param {string} baseUrl - FHIR server base URL
 * @param {string} resourceType - FHIR resource type (e.g., 'Task', 'Patient')
 * @param {string} id - Resource ID
 * @returns {Promise<Object>} FHIR resource
 */
async function readResource(baseUrl, resourceType, id) {
  return retryWithBackoff(() =>
    fhirGET(`${baseUrl}/${resourceType}/${encodeURIComponent(id)}`)
  );
}

/**
 * Search for FHIR resources with automatic retry
 * @param {string} baseUrl - FHIR server base URL
 * @param {string} resourceType - FHIR resource type
 * @param {Object} query - Search parameters
 * @returns {Promise<Object>} FHIR Bundle
 */
async function searchResources(baseUrl, resourceType, query) {
  return retryWithBackoff(() =>
    fhirGET(`${baseUrl}/${resourceType}`, query)
  );
}

/**
 * Extract resources from a FHIR Bundle
 * @param {Object} bundle - FHIR Bundle
 * @returns {Array<Object>} Array of resources
 */
function gatherResources(bundle) {
  return (bundle?.entry || [])
    .map(entry => entry.resource)
    .filter(Boolean);
}

/**
 * Validate a FHIR resource matches expected type and has required fields
 * @param {Object} resource - FHIR resource to validate
 * @param {string} expectedType - Expected resource type
 * @throws {Error} If resource is invalid
 * @returns {Object} The validated resource
 */
function validateFhirResource(resource, expectedType) {
  if (!resource || resource.resourceType !== expectedType) {
    throw new Error(`Invalid FHIR resource: expected ${expectedType}`);
  }
  if (!resource.id) {
    throw new Error(`FHIR resource missing required 'id' field`);
  }
  return resource;
}

// ============================================
// URL Validation
// ============================================

/**
 * Check if a URL is a valid FHIR Task URL
 * Validates protocol (HTTPS only) and path structure
 * @param {string} urlString - URL to validate
 * @returns {boolean} True if valid Task URL
 */
function isTaskUrl(urlString) {
  if (!urlString || typeof urlString !== "string") {
    return false;
  }

  try {
    const url = new URL(urlString);

    // Security: Only allow HTTPS protocol (not javascript:, file:, etc.)
    if (url.protocol !== CONFIG.VALIDATION.requiredProtocol) {
      return false;
    }

    // Check URL length
    if (urlString.length > CONFIG.VALIDATION.maxUrlLength) {
      return false;
    }

    // Validate Task path pattern
    return CONFIG.VALIDATION.taskUrlPattern.test(url.pathname);
  } catch {
    return false;
  }
}

/**
 * Extract the FHIR server base URL from a Task URL
 * @param {string} taskUrl - Full Task URL
 * @returns {string} Base server URL
 */
function parseServerFromTaskUrl(taskUrl) {
  const url = new URL(taskUrl);
  const parts = url.pathname.split("/").filter(Boolean);
  const taskIndex = parts.findIndex(part => part.toLowerCase() === "task");

  return taskIndex > 0
    ? `${url.origin}/${parts.slice(0, taskIndex).join("/")}`
    : url.origin;
}

/**
 * Extract the Task ID from a Task URL
 * @param {string} taskUrl - Full Task URL
 * @returns {string|null} Task ID or null if not found
 */
function extractTaskId(taskUrl) {
  const match = new URL(taskUrl).pathname.match(/\/Task\/([^\/]+)/i);
  return match ? match[1] : null;
}

// ============================================
// FHIR Data Parsing Helpers
// ============================================

/**
 * Format a FHIR HumanName into a readable string
 * @param {Object|Array} humanName - FHIR HumanName or array of names
 * @returns {string} Formatted name or "—" if unavailable
 */
function formatHumanName(humanName) {
  if (!humanName) return "—";

  const nameList = Array.isArray(humanName) ? humanName : [humanName];
  const preferredName = nameList.find(n => n.use === "official") || nameList[0];

  if (!preferredName) return "—";

  const parts = [
    ...(preferredName.prefix || []),
    ...(preferredName.given || []),
    preferredName.family || ""
  ];

  return parts.join(" ").replace(/\s+/g, " ").trim() || "—";
}

/**
 * Calculate age from a date of birth
 * @param {string} birthDate - ISO date string (YYYY-MM-DD)
 * @returns {string} Age in years or "—" if invalid
 */
function calculateAge(birthDate) {
  if (!birthDate) return "—";

  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();

  // Adjust if birthday hasn't occurred this year
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }

  return `${age} years`;
}

/**
 * Extract display text from a FHIR CodeableConcept
 * @param {Object} codeableConcept - FHIR CodeableConcept
 * @returns {string} Display text or "—" if unavailable
 */
function getCodeableConceptDisplay(codeableConcept) {
  if (!codeableConcept) return "—";

  const coding = (codeableConcept.coding || [])[0];
  return coding?.display || codeableConcept?.text || "—";
}

/**
 * Get unique non-empty strings from an array
 * @param {Array} array - Array of strings
 * @returns {Array<string>} Unique trimmed strings
 */
function getUniqueStrings(array) {
  return [...new Set(
    array
      .filter(x => typeof x === "string" && x.trim())
      .map(x => x.trim())
  )];
}

/**
 * Parse a FHIR reference into resource type and ID
 * @param {Object} reference - FHIR Reference object
 * @returns {Object|null} {type, id} or null if invalid
 */
function parseResourceReference(reference) {
  if (!reference || !reference.reference) return null;

  const refString = reference.reference;

  try {
    // Handle both absolute URLs and relative references
    const url = new URL(refString, location.origin);
    const match = url.pathname.match(/\/([A-Za-z]+)\/([^\/]+)/);

    return match ? { type: match[1], id: match[2] } : null;
  } catch {
    return null;
  }
}

// ============================================
// Photo Validation & Rendering
// ============================================

/**
 * Validate and set patient photo with security checks
 * @param {Object} photo - FHIR Attachment object
 */
function renderPatientPhoto(photo) {
  // Clear any previous SVG placeholders
  Array.from(elements.avatarWrap.querySelectorAll("svg")).forEach(svg => svg.remove());

  if (!photo) {
    showPhotoPlaceholder();
    return;
  }

  // Handle URL-based photos
  if (photo.url) {
    try {
      const url = new URL(photo.url);

      // Security: Validate protocol
      if (!CONFIG.PHOTO.allowedProtocols.includes(url.protocol)) {
        console.error('Invalid photo URL protocol:', url.protocol);
        showPhotoPlaceholder();
        return;
      }

      elements.patientPhoto.src = photo.url;
      elements.patientPhoto.style.display = "block";
      return;
    } catch (error) {
      console.error('Invalid photo URL:', photo.url, error);
      showPhotoPlaceholder();
      return;
    }
  }

  // Handle base64 data photos
  if (photo.data && photo.contentType) {
    // Security: Validate MIME type (prevent XSS via HTML/JS content types)
    const contentType = photo.contentType.toLowerCase();
    if (!CONFIG.PHOTO.allowedTypes.includes(contentType)) {
      console.error('Unsafe photo content type:', photo.contentType);
      showPhotoPlaceholder();
      return;
    }

    // Security: Validate base64 format
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(photo.data)) {
      console.error('Invalid base64 photo data');
      showPhotoPlaceholder();
      return;
    }

    elements.patientPhoto.src = `data:${photo.contentType};base64,${photo.data}`;
    elements.patientPhoto.style.display = "block";
    return;
  }

  // No valid photo data
  showPhotoPlaceholder();
}

/**
 * Show placeholder SVG when no patient photo is available
 */
function showPhotoPlaceholder() {
  elements.patientPhoto.removeAttribute("src");
  elements.patientPhoto.style.display = "none";

  // Create SVG placeholder with person silhouette + medical cross
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 80 80");
  svg.setAttribute("width", "72");
  svg.setAttribute("height", "72");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Patient photo placeholder");

  svg.innerHTML = `
    <defs>
      <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0%" stop-color="#223055"/>
        <stop offset="100%" stop-color="#0e1a3b"/>
      </linearGradient>
    </defs>
    <rect x="1" y="1" width="78" height="78" rx="12" fill="url(#g)" stroke="#223055"/>
    <circle cx="40" cy="28" r="12" fill="#2a3a6a"/>
    <rect x="18" y="44" width="44" height="22" rx="11" fill="#2a3a6a"/>
    <g transform="translate(52,52)">
      <rect x="-8" y="-2" width="16" height="4" rx="2" fill="#5cc2ff"/>
      <rect x="-2" y="-8" width="4" height="16" rx="2" fill="#5cc2ff"/>
    </g>
  `;

  elements.avatarWrap.appendChild(svg);
}

// ============================================
// UI Rendering Helpers (DRY - Don't Repeat Yourself)
// ============================================

/**
 * Render a list of chips with an empty state message
 * Eliminates code duplication for instructions and notes rendering
 * @param {HTMLElement} container - Container element
 * @param {Array<string>} items - Items to render as chips
 * @param {string} emptyMessage - Message to show when items is empty
 */
function renderChipList(container, items, emptyMessage) {
  // Clear existing content
  container.replaceChildren();

  if (!items.length) {
    const emptySpan = document.createElement("span");
    emptySpan.className = "muted";
    emptySpan.textContent = emptyMessage;
    container.appendChild(emptySpan);
  } else {
    items.forEach(item => {
      const chip = document.createElement("div");
      chip.className = "chip";
      chip.textContent = item;
      container.appendChild(chip);
    });
  }
}

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ============================================
// Main Render Function
// ============================================

/**
 * Render the requisition details to the UI
 * @param {Object} data - Parsed requisition data
 * @param {Object} data.root - Root Task resource
 * @param {Object} data.patient - Patient resource
 * @param {Array} data.srs - ServiceRequest resources
 * @param {Map} data.srToTask - Map of SR ID to Task
 * @param {Array<string>} data.distinctInstructions - Unique patient instructions
 * @param {Array<string>} data.distinctNotes - Unique clinical notes
 */
function renderRequisitionDetails(data) {
  const { root, patient, srs, srToTask, distinctInstructions, distinctNotes } = data;

  // Requisition metadata
  elements.reqId.textContent = root?.id || "—";
  elements.reqCreated.textContent = root?.authoredOn || root?.created || root?.meta?.lastUpdated || "—";

  // Patient information
  elements.patientName.textContent = patient ? formatHumanName(patient.name) : "—";

  if (patient?.birthDate) {
    elements.patientAge.textContent = `${calculateAge(patient.birthDate)} (DOB: ${patient.birthDate})`;
  } else {
    elements.patientAge.textContent = "Age not provided";
  }

  // Patient photo with security validation
  const photo = (patient?.photo || [])[0];
  renderPatientPhoto(photo);

  // Patient instructions
  renderChipList(
    elements.instructions,
    distinctInstructions,
    "No patient instructions were provided for this requisition."
  );

  // Clinical notes
  renderChipList(
    elements.notes,
    distinctNotes,
    "No clinical notes were provided for this requisition."
  );

  // ServiceRequests list
  renderServiceRequests(srs, srToTask);

  // Show details panel, hide loader
  elements.detailsPanel.style.display = "block";
  elements.loadPanel.style.display = "none";
  elements.searchAgainBtn.style.display = "inline-flex";

  setStatus("Loaded", "ok");
}

// ============================================
// Patient Info Modal
// ============================================

/**
 * Open the patient info modal with an iframe showing the external page
 * @param {string} testName - Display name of the test
 * @param {string} url - URL to pathologyTestsExplained page
 */
function openInfoModal(testName, url) {
  elements.modalTitle.textContent = testName;
  elements.modalBody.innerHTML = '';

  const iframe = document.createElement('iframe');
  iframe.src = url;
  iframe.className = 'modal-iframe';
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
  iframe.title = testName + ' — Pathology Tests Explained';
  elements.modalBody.appendChild(iframe);

  elements.modalLink.href = url;
  elements.infoModal.classList.add('open');
}

/**
 * Close the patient info modal
 */
function closeInfoModal() {
  elements.infoModal.classList.remove('open');
  // Remove iframe to stop loading and free resources
  elements.modalBody.innerHTML = '';
}

/**
 * Extract supplement properties from R5 backport extensions on an $expand concept
 * @param {Object} concept - A concept from ValueSet $expand contains
 * @returns {Object} Map of property code to value
 */
function extractSupplementProperties(concept) {
  const props = {};
  for (const ext of (concept.extension || [])) {
    if (ext.url !== CONFIG.TERMINOLOGY.r5PropertyExtension) continue;
    const subExts = ext.extension || [];
    const codeExt = subExts.find(e => e.url === 'code');
    const valueExt = subExts.find(e => e.url === 'value');
    if (!codeExt) continue;
    const code = codeExt.valueCode;
    const value = valueExt?.valueString || valueExt?.valueCode || '';
    if (code === 'pathologyTestsExplainedUrl') {
      props[code] = value;
    }
  }
  return props;
}

/**
 * Fetch supplement properties for SNOMED codes via Ontoserver $expand
 * @param {Array<{code: string, display: string}>} snomedCodes - Codes to look up
 * @returns {Promise<Map<string, Object>>} Map of SNOMED code to supplement properties
 */
async function fetchSupplementForCodes(snomedCodes) {
  const result = new Map();
  if (!snomedCodes.length) return result;

  const supplement = `${CONFIG.TERMINOLOGY.supplementUrl}|${CONFIG.TERMINOLOGY.supplementVersion}`;

  // Use each code's display as filter to find it in the valueset
  const fetches = snomedCodes.map(async ({ code, display }) => {
    try {
      const url = new URL(CONFIG.TERMINOLOGY.expandUrl);
      url.searchParams.set('url', CONFIG.TERMINOLOGY.pathologyValueSet);
      url.searchParams.set('filter', display);
      url.searchParams.set('count', '20');
      url.searchParams.set('useSupplement', supplement);
      url.searchParams.append('property', 'pathologyTestsExplainedUrl');

      const resp = await fetch(url.toString(), {
        headers: { 'Accept': 'application/fhir+json' }
      });
      if (!resp.ok) return;
      const data = await resp.json();
      const match = (data.expansion?.contains || []).find(c => c.code === code);
      if (match) {
        const props = extractSupplementProperties(match);
        if (Object.keys(props).length) {
          result.set(code, props);
        }
      }
    } catch (e) {
      console.warn(`Supplement lookup failed for ${code}:`, e);
    }
  });

  await Promise.all(fetches);
  return result;
}

/**
 * Render the ServiceRequests list
 * @param {Array} serviceRequests - Array of ServiceRequest resources
 * @param {Map} srToTask - Map of SR ID to Task
 */
function renderServiceRequests(serviceRequests, srToTask) {
  elements.srList.replaceChildren();

  if (!serviceRequests.length) {
    const emptyDiv = document.createElement("div");
    emptyDiv.className = "muted";
    emptyDiv.textContent = "No ServiceRequests were found for this requisition.";
    elements.srList.appendChild(emptyDiv);
    return;
  }

  // Collect SNOMED codes for supplement lookup
  const snomedCodes = [];
  const infoLinkSlots = new Map(); // code -> DOM element to insert link into
  const codeDisplayNames = new Map(); // code -> test display name

  serviceRequests.forEach(sr => {
    const task = srToTask.get(sr.id);
    const taskStatus = task?.status || "unknown";
    const businessStatus = getCodeableConceptDisplay(task?.businessStatus);
    const testName = getCodeableConceptDisplay(sr.code);

    const item = document.createElement("div");
    item.className = "sr-item";

    // Test name
    const nameDiv = document.createElement("div");
    nameDiv.style.fontWeight = "600";
    nameDiv.style.minWidth = "180px";
    nameDiv.style.flex = "1 1 auto";
    nameDiv.textContent = testName;

    // Patient info link slot (populated after supplement fetch)
    const infoSlot = document.createElement("span");
    nameDiv.appendChild(infoSlot);

    // Track SNOMED code for supplement lookup
    const coding = (sr.code?.coding || []).find(c => c.system === 'http://snomed.info/sct');
    if (coding?.code) {
      snomedCodes.push({ code: coding.code, display: coding.display || testName });
      infoLinkSlots.set(coding.code, infoSlot);
      codeDisplayNames.set(coding.code, testName);
    }

    // Status chips container
    const chipsDiv = document.createElement("div");
    chipsDiv.className = "chips";
    chipsDiv.style.gap = "6px";

    // Task status chip
    const statusChip = document.createElement("span");
    statusChip.className = "chip";
    statusChip.title = "Task status";
    statusChip.textContent = taskStatus;
    chipsDiv.appendChild(statusChip);

    // Business status chip (if present)
    if (businessStatus && businessStatus !== "—") {
      const bizChip = document.createElement("span");
      bizChip.className = "chip";
      bizChip.title = "Business status";
      bizChip.textContent = businessStatus;
      chipsDiv.appendChild(bizChip);
    }

    item.appendChild(nameDiv);
    item.appendChild(chipsDiv);
    elements.srList.appendChild(item);
  });

  // Fetch supplement data and populate patient info links
  if (snomedCodes.length) {
    fetchSupplementForCodes(snomedCodes).then(supplementMap => {
      for (const [code, props] of supplementMap) {
        const slot = infoLinkSlots.get(code);
        if (slot && props.pathologyTestsExplainedUrl) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = " — Patient info \u2197";
          btn.style.background = "none";
          btn.style.border = "none";
          btn.style.cursor = "pointer";
          btn.style.fontWeight = "400";
          btn.style.fontSize = "0.85em";
          btn.style.color = "#6366f1";
          btn.style.padding = "0";
          btn.style.fontFamily = "inherit";
          const displayName = codeDisplayNames.get(code) || code;
          const infoUrl = props.pathologyTestsExplainedUrl;
          btn.addEventListener("click", () => openInfoModal(displayName, infoUrl));
          slot.appendChild(btn);
        }
      }
    });
  }

  // Warning if results may be truncated
  if (serviceRequests.length >= CONFIG.FHIR_SERVER.pageSize) {
    const warning = document.createElement("div");
    warning.className = "muted";
    warning.style.marginTop = "8px";
    warning.textContent = `Showing first ${CONFIG.FHIR_SERVER.pageSize} tests. Some items may not be displayed.`;
    elements.srList.appendChild(warning);
  }
}

// ============================================
// Main Load Function
// ============================================

/**
 * Load and display a requisition from a Task URL
 * @param {string} taskUrl - Full Task URL
 */
async function loadFromTaskUrl(taskUrl) {
  const baseUrl = parseServerFromTaskUrl(taskUrl);
  const taskId = extractTaskId(taskUrl);

  if (!taskId) {
    throw new Error("Unable to extract Task ID from URL.");
  }

  try {
    // Fetch root Task
    const rootTask = await readResource(baseUrl, "Task", taskId);
    validateFhirResource(rootTask, "Task");

    // Fetch child Tasks (subtasks of the requisition)
    const childrenBundle = await searchResources(baseUrl, "Task", {
      "part-of": `Task/${taskId}`,
      _count: String(CONFIG.FHIR_SERVER.pageSize)
    });
    const childTasks = gatherResources(childrenBundle);

    const allTasks = [rootTask, ...childTasks];

    // Build map of ServiceRequest ID -> Task
    // Tasks reference ServiceRequests via focus or basedOn
    const srIds = new Set();
    const srToTask = new Map();

    for (const task of allTasks) {
      // Check Task.focus for ServiceRequest reference
      if (task.focus) {
        const focusRef = parseResourceReference(task.focus);
        if (focusRef?.type === "ServiceRequest") {
          srIds.add(focusRef.id);
          if (!srToTask.has(focusRef.id)) {
            srToTask.set(focusRef.id, task);
          }
        }
      }

      // Check Task.basedOn for ServiceRequest references
      if (Array.isArray(task.basedOn)) {
        for (const basedOnRef of task.basedOn) {
          const ref = parseResourceReference(basedOnRef);
          if (ref?.type === "ServiceRequest") {
            srIds.add(ref.id);
            if (!srToTask.has(ref.id)) {
              srToTask.set(ref.id, task);
            }
          }
        }
      }
    }

    // Fetch ServiceRequests
    let serviceRequests = [];
    if (srIds.size > 0) {
      const srBundle = await searchResources(baseUrl, "ServiceRequest", {
        _id: Array.from(srIds).join(","),
        _count: String(CONFIG.FHIR_SERVER.pageSize)
      });
      serviceRequests = gatherResources(srBundle)
        .filter(r => r.resourceType === "ServiceRequest");
    } else {
      // Fallback: search by basedOn
      const srBundle = await searchResources(baseUrl, "ServiceRequest", {
        basedOn: `Task/${taskId}`,
        _count: String(CONFIG.FHIR_SERVER.pageSize)
      });
      serviceRequests = gatherResources(srBundle)
        .filter(r => r.resourceType === "ServiceRequest");
    }

    // Fetch Patient from first ServiceRequest's subject
    let patient = null;
    const firstSR = serviceRequests.find(sr => sr?.subject);

    if (firstSR?.subject) {
      const subjectRef = parseResourceReference(firstSR.subject);
      if (subjectRef?.type === "Patient") {
        try {
          patient = await readResource(baseUrl, "Patient", subjectRef.id);
          validateFhirResource(patient, "Patient");
        } catch (error) {
          console.warn(`Failed to fetch patient ${subjectRef.id}:`, error);
          // Continue without patient data
        }
      }
    }

    // Collect distinct patient instructions and clinical notes
    const instructions = [];
    const notes = [];

    for (const sr of serviceRequests) {
      if (sr.patientInstruction) {
        instructions.push(sr.patientInstruction);
      }
      if (Array.isArray(sr.note)) {
        sr.note.forEach(note => {
          if (note?.text) {
            notes.push(note.text);
          }
        });
      }
    }

    // Render everything
    renderRequisitionDetails({
      root: rootTask,
      patient,
      srs: serviceRequests,
      srToTask,
      distinctInstructions: getUniqueStrings(instructions),
      distinctNotes: getUniqueStrings(notes)
    });

  } catch (error) {
    console.error('Error loading requisition:', error);
    throw error;
  }
}

// ============================================
// QR Code Scanner
// ============================================

let qrScanner = null;
let qrActive = false;

/**
 * Start the QR code scanner
 */
async function startQrScanner() {
  if (qrActive) return;

  elements.qrArea.classList.add("show");
  qrActive = true;

  // Clean up any existing scanner
  await stopQrScanner();

  qrScanner = new Html5Qrcode("qrReader");

  const config = {
    fps: CONFIG.QR.fps,
    qrbox: CONFIG.QR.qrbox,
    aspectRatio: CONFIG.QR.aspectRatio
  };

  const onSuccess = (decodedText) => {
    if (decodedText) {
      elements.taskUrlInput.value = decodedText.trim();
      stopQrScanner();
      elements.loadBtn.click();
    }
  };

  const onError = () => {
    // Silently ignore scan errors (normal during scanning)
  };

  try {
    setStatus("Starting camera…", "loading");
    await qrScanner.start({ facingMode: "environment" }, config, onSuccess, onError);
    setStatus("QR reader active", "ok");
  } catch (error) {
    console.error('QR scanner start failed:', error);
    setStatus("QR reader unavailable — paste a URL instead", "error");
    qrScanner = null;
    qrActive = false;
  }
}

/**
 * Stop the QR code scanner and release camera
 */
async function stopQrScanner() {
  if (!qrScanner) {
    qrActive = false;
    return;
  }

  try {
    await qrScanner.stop();
  } catch (error) {
    console.error("Error stopping QR scanner:", error);
  }

  try {
    await qrScanner.clear();
  } catch (error) {
    console.error("Error clearing QR scanner:", error);
  }

  qrScanner = null;
  elements.qrArea.classList.remove("show");
  qrActive = false;
  setStatus("QR reader closed");
}

/**
 * Scan QR code from an uploaded image file
 * @param {File} file - Image file to scan
 */
async function scanQrFromFile(file) {
  // Validate file type
  if (!CONFIG.QR.allowedTypes.includes(file.type)) {
    setStatus("Only JPEG, PNG, and GIF images are allowed", "error");
    return;
  }

  // Validate file size
  if (file.size > CONFIG.QR.maxFileSize) {
    setStatus(`Image file too large (max ${CONFIG.QR.maxFileSize / 1024 / 1024}MB)`, "error");
    return;
  }

  try {
    const text = await Html5Qrcode.scanFile(file, true);
    const decodedUrl = (text || "").trim();

    // Validate the decoded URL is a Task URL
    if (!isTaskUrl(decodedUrl)) {
      setStatus("QR code does not contain a valid Task URL", "error");
      return;
    }

    elements.taskUrlInput.value = decodedUrl;
    setStatus("QR decoded from image", "ok");
  } catch (error) {
    console.error('QR decode error:', error);
    setStatus("Failed to decode QR image", "error");
  }
}

// ============================================
// UI Mode Switching (Desktop vs Mobile)
// ============================================

/**
 * Check if the user is on a mobile device
 * @returns {boolean} True if mobile
 */
function isMobileDevice() {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
         window.matchMedia(`(max-width: ${CONFIG.UI.mobileBreakpoint}px)`).matches;
}

/**
 * Show desktop mode (URL input)
 */
function showDesktopMode() {
  elements.desktopOptions.style.display = "grid";
  elements.mobileOptions.style.display = "none";
  stopQrScanner();
}

/**
 * Show mobile mode (QR scanner)
 */
function showMobileMode() {
  elements.desktopOptions.style.display = "none";
  elements.mobileOptions.style.display = "grid";
  startQrScanner();
}

// ============================================
// Event Handlers
// ============================================

let lastLoadTime = 0;

/**
 * Handle load button click
 */
async function handleLoadClick() {
  // Rate limiting
  const now = Date.now();
  if (now - lastLoadTime < CONFIG.UI.loadRateLimit) {
    setStatus("Please wait before trying again", "error");
    return;
  }
  lastLoadTime = now;

  const url = elements.taskUrlInput.value.trim();

  // Validation
  if (!url) {
    setStatus("Enter or scan a Task URL first", "error");
    return;
  }

  if (!isTaskUrl(url)) {
    setStatus("Invalid URL format. Expected: https://server.example.com/Task/12345...", "error");
    return;
  }

  // Check online status
  if (!navigator.onLine) {
    setStatus("You're offline. Check your internet connection.", "error");
    return;
  }

  setStatus("Fetching…", "loading");

  try {
    await loadFromTaskUrl(url);
  } catch (error) {
    console.error('Load error:', error);
    setStatus(error.message || "Failed to load requisition", "error");
  }
}

/**
 * Handle search again button click
 */
function handleSearchAgain() {
  if (confirm("Clear the current requisition and start over?")) {
    location.reload();
  }
}

/**
 * Handle QR image file input change
 * @param {Event} event - Change event
 */
async function handleQrImageUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  await scanQrFromFile(file);
}

// ============================================
// Initialization
// ============================================

/**
 * Initialize the application
 * Called once on DOMContentLoaded
 */
function initializeApp() {
  // Cache DOM elements
  initElements();

  // Detect mobile and show appropriate UI
  if (isMobileDevice()) {
    showMobileMode();
  } else {
    showDesktopMode();
  }

  // Check for ?task= query parameter
  const urlParams = new URLSearchParams(location.search);
  const taskParam = urlParams.get("task");
  if (taskParam) {
    elements.taskUrlInput.value = taskParam;
    if (!isMobileDevice()) {
      elements.taskUrlInput.focus();
    }
  }

  // Attach event listeners
  elements.loadBtn.addEventListener("click", handleLoadClick);
  elements.searchAgainBtn.addEventListener("click", handleSearchAgain);
  elements.switchDesktopBtn.addEventListener("click", showDesktopMode);
  elements.qrImageInput.addEventListener("change", handleQrImageUpload);

  // Modal close handlers
  elements.modalClose.addEventListener("click", closeInfoModal);
  elements.infoModal.addEventListener("click", (e) => {
    if (e.target === elements.infoModal) closeInfoModal();
  });

  // Cleanup on page unload
  window.addEventListener("beforeunload", stopQrScanner);

  setStatus("Idle");
}

// Start the app when DOM is ready
window.addEventListener("DOMContentLoaded", initializeApp);
