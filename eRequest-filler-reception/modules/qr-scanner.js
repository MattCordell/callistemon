/**
 * @module qr-scanner
 * @description QR code scanning using BarcodeDetector API
 *
 * Provides functions for:
 * - Camera-based QR code scanning
 * - File-based QR code reading
 * - QR scanner state management
 *
 * @requires config
 * @requires fhir-helpers
 */

import { CONFIG } from '../config.js';
import { normalizeResourceUrl } from './fhir-helpers.js';

// Internal state
let qrStream = null;
let qrRaf = null;
let qrCanvas = null;
let qrCtx = null;
let detector = null;

/**
 * Ensure BarcodeDetector is initialized
 * @returns {Promise<BarcodeDetector>} BarcodeDetector instance
 * @throws {Error} If BarcodeDetector is not supported
 */
async function ensureDetector() {
  if (detector) return detector;
  if (!('BarcodeDetector' in window)) {
    throw new Error('BarcodeDetector not supported');
  }
  detector = new BarcodeDetector({ formats: ['qr_code'] });
  return detector;
}

/**
 * Stop QR scanning and release camera resources
 */
export function stopScan() {
  if (qrRaf) {
    cancelAnimationFrame(qrRaf);
    qrRaf = null;
  }
  if (qrStream) {
    qrStream.getTracks().forEach(t => t.stop());
    qrStream = null;
  }
}

/**
 * Scan frame from video element
 * @param {HTMLVideoElement} videoElement - Video element with camera stream
 * @param {Function} onDetected - Callback when QR code is detected
 * @param {Function} onError - Callback when error occurs
 */
async function scanFrame(videoElement, onDetected, onError) {
  try {
    const det = await ensureDetector();
    const w = videoElement.videoWidth;
    const h = videoElement.videoHeight;

    if (!w || !h) {
      qrRaf = requestAnimationFrame(() => scanFrame(videoElement, onDetected, onError));
      return;
    }

    if (!qrCanvas) {
      qrCanvas = document.createElement('canvas');
      qrCtx = qrCanvas.getContext('2d');
    }

    qrCanvas.width = w;
    qrCanvas.height = h;
    qrCtx.drawImage(videoElement, 0, 0, w, h);

    const codes = await det.detect(qrCanvas);
    if (codes?.length) {
      const value = normalizeResourceUrl(String(codes[0].rawValue).trim());
      stopScan();
      onDetected(value);
      return;
    }
  } catch (err) {
    console.warn('Frame scan error:', err);
  }

  qrRaf = requestAnimationFrame(() => scanFrame(videoElement, onDetected, onError));
}

/**
 * Start camera-based QR scanning
 * @param {HTMLVideoElement} videoElement - Video element to display camera feed
 * @param {Function} onDetected - Callback(value) when QR code is detected
 * @param {Function} onError - Callback(error) when error occurs
 * @param {Function} onStatusChange - Callback(message) for status updates
 * @returns {Promise<void>}
 */
export async function startScan(videoElement, onDetected, onError, onStatusChange) {
  try {
    if (!isSecureContext) {
      throw Object.assign(new Error('Insecure context'), { name: 'InsecureContextError' });
    }

    await ensureDetector();
    onStatusChange?.('Starting camera…');

    qrStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false
    });

    videoElement.srcObject = qrStream;
    await videoElement.play();

    onStatusChange?.('Scanning… point camera at QR');
    scanFrame(videoElement, onDetected, onError);
  } catch (err) {
    console.error('QR scan start error:', err);

    let msg = 'QR scanning not available.';
    if (err?.name === 'NotAllowedError') {
      msg = 'Camera permission denied.';
    } else if (err?.name === 'NotFoundError' || err?.name === 'OverconstrainedError') {
      msg = 'No suitable camera found.';
    } else if (err?.name === 'InsecureContextError') {
      msg = 'Use HTTPS or localhost.';
    } else if (!('BarcodeDetector' in window)) {
      msg = 'Browser does not support live QR scanning.';
    }

    onError?.(err, msg);
  }
}

/**
 * Scan QR code from an image file
 * @param {File} file - Image file to scan
 * @param {Function} onDetected - Callback(value) when QR code is detected
 * @param {Function} onError - Callback(error, message) when error occurs
 * @param {Function} onStatusChange - Callback(message) for status updates
 * @returns {Promise<void>}
 */
export async function scanFromFile(file, onDetected, onError, onStatusChange) {
  if (!file) return;

  try {
    await ensureDetector();

    // Try createImageBitmap first (faster)
    if ('createImageBitmap' in window) {
      const bitmap = await createImageBitmap(file);
      const codes = await detector.detect(bitmap);
      if (codes?.length) {
        const value = normalizeResourceUrl(String(codes[0].rawValue).trim());
        onDetected(value);
        return;
      }
    }

    // Fallback to Image element
    const img = new Image();
    img.onload = async () => {
      try {
        const codes = await detector.detect(img);
        if (codes?.length) {
          const value = normalizeResourceUrl(String(codes[0].rawValue).trim());
          onDetected(value);
        } else {
          onStatusChange?.('No QR found.');
        }
      } catch (err) {
        onError?.(err, 'Could not decode image.');
      }
    };
    img.onerror = () => {
      onError?.(new Error('Image load failed'), 'Could not decode image.');
    };
    img.src = URL.createObjectURL(file);
  } catch (err) {
    console.error('File QR scan error:', err);
    onError?.(err, 'Could not decode image.');
  }
}
