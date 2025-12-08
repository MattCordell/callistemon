/**
 * Configuration constants for AU eRequesting Consumer App
 *
 * This file contains all configurable values used throughout the application.
 * Modify these values to customize behavior without changing core application code.
 */

export const CONFIG = {
  /**
   * FHIR Server Configuration
   */
  FHIR_SERVER: {
    // Request timeout in milliseconds (30 seconds)
    timeout: 30000,

    // Number of retry attempts for failed requests
    retryCount: 3,

    // Default page size for FHIR search results
    pageSize: 100,

    // FHIR API headers
    headers: {
      "Accept": "application/fhir+json"
    }
  },

  /**
   * QR Code Scanner Configuration
   */
  QR: {
    // Frames per second for QR scanning
    fps: 10,

    // Size of QR code scanning box in pixels
    qrbox: 240,

    // Aspect ratio for QR scanner
    aspectRatio: 1.0,

    // Maximum file size for QR image upload (5MB)
    maxFileSize: 5 * 1024 * 1024,

    // Allowed MIME types for QR image upload
    allowedTypes: ['image/jpeg', 'image/png', 'image/gif']
  },

  /**
   * Image Validation Configuration
   */
  PHOTO: {
    // Allowed MIME types for patient photos (security: prevent HTML/JS injection)
    allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],

    // Allowed URL protocols for photo URLs
    allowedProtocols: ['http:', 'https:']
  },

  /**
   * UI Configuration
   */
  UI: {
    // Mobile device detection breakpoint
    mobileBreakpoint: 820,

    // Rate limit for load button (milliseconds between clicks)
    loadRateLimit: 2000
  },

  /**
   * Validation Configuration
   */
  VALIDATION: {
    // Maximum URL length
    maxUrlLength: 2048,

    // Required URL protocol
    requiredProtocol: 'https:',

    // Regex pattern for Task URL validation
    taskUrlPattern: /\/Task\/[^/?#]+/
  }
};

/**
 * External library configuration
 */
export const EXTERNAL_LIBS = {
  // html5-qrcode library URL with version pinning
  qrCodeLibrary: {
    url: 'https://unpkg.com/html5-qrcode@2.3.8/dist/html5-qrcode.min.js',
    // TODO: Add SRI hash for security
    integrity: null,
    crossorigin: 'anonymous'
  }
};
