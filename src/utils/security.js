/**
 * Security Utilities for TAMOE
 * Provides CSP, sanitization, and security helpers
 */

// ============================================
// CONTENT SECURITY POLICY
// ============================================

/**
 * Content Security Policy configuration
 * Defines allowed sources for various resource types
 */
export const CSP_CONFIG = {
  'default-src': ["'self'"],
  'script-src': [
    "'self'",
    'https://www.gstatic.com',
    'https://cdn.tailwindcss.com',
    'https://cdnjs.cloudflare.com',
    'https://www.google.com',
    'https://www.gstatic.com',
    "'unsafe-inline'",  // Required for Tailwind config
    "'unsafe-eval'"     // Required for Tailwind JIT
  ],
  'style-src': [
    "'self'",
    'https://fonts.googleapis.com',
    'https://cdn.tailwindcss.com',
    "'unsafe-inline'"   // Required for Tailwind
  ],
  'font-src': [
    "'self'",
    'https://fonts.gstatic.com',
    'https://fonts.googleapis.com'
  ],
  'img-src': [
    "'self'",
    'data:',
    'https:',
    'blob:'
  ],
  'connect-src': [
    "'self'",
    'https://*.firebaseio.com',
    'https://*.googleapis.com',
    'https://*.cloudfunctions.net',
    'https://*.firebasedatabase.app',
    'wss://*.firebaseio.com',
    'https://firebaseinstallations.googleapis.com',
    'https://www.google.com'
  ],
  'frame-src': [
    "'self'",
    'https://*.firebaseapp.com',
    'https://www.google.com'
  ],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"]
};

/**
 * Generate CSP header string from config
 * @returns {string}
 */
export const generateCSPString = () => {
  return Object.entries(CSP_CONFIG)
    .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
    .join('; ');
};

/**
 * Apply CSP via meta tag
 * Call this function early in your application
 */
export const applyCSP = () => {
  // Check if CSP meta tag already exists
  const existingCSP = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
  if (existingCSP) return;

  const meta = document.createElement('meta');
  meta.httpEquiv = 'Content-Security-Policy';
  meta.content = generateCSPString();
  document.head.insertBefore(meta, document.head.firstChild);
};

// ============================================
// INPUT SANITIZATION
// ============================================

/**
 * HTML entities map for escaping
 */
const HTML_ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;'
};

/**
 * Escape HTML to prevent XSS attacks
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
export const escapeHTML = (text) => {
  if (text === null || text === undefined) return '';
  return String(text).replace(/[&<>"'`=/]/g, char => HTML_ENTITIES[char]);
};

/**
 * Sanitize HTML allowing only safe tags
 * @param {string} html - HTML to sanitize
 * @param {Object} options - Sanitization options
 * @returns {string} Sanitized HTML
 */
export const sanitizeHTML = (html, options = {}) => {
  if (!html) return '';

  const {
    allowedTags = ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'span'],
    allowedAttributes = ['href', 'target', 'class', 'id'],
    allowedProtocols = ['http', 'https', 'mailto']
  } = options;

  // Create a temporary element to parse HTML
  const temp = document.createElement('div');
  temp.innerHTML = html;

  // Recursively sanitize nodes
  const sanitizeNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }

    const tagName = node.tagName.toLowerCase();

    // Remove disallowed tags
    if (!allowedTags.includes(tagName)) {
      // Keep text content of removed tags
      return Array.from(node.childNodes)
        .map(child => sanitizeNode(child))
        .join('');
    }

    // Create new clean element
    const clean = document.createElement(tagName);

    // Copy allowed attributes
    for (const attr of node.attributes) {
      if (allowedAttributes.includes(attr.name)) {
        let value = attr.value;

        // Sanitize href to prevent javascript: URLs
        if (attr.name === 'href') {
          try {
            const url = new URL(value, window.location.origin);
            if (!allowedProtocols.includes(url.protocol.replace(':', ''))) {
              continue; // Skip disallowed protocols
            }
          } catch {
            continue; // Skip invalid URLs
          }
        }

        clean.setAttribute(attr.name, value);
      }
    }

    // Force target="_blank" links to have rel="noopener noreferrer"
    if (tagName === 'a' && clean.getAttribute('target') === '_blank') {
      clean.setAttribute('rel', 'noopener noreferrer');
    }

    // Recursively sanitize children
    for (const child of node.childNodes) {
      const sanitized = sanitizeNode(child);
      if (typeof sanitized === 'string') {
        clean.appendChild(document.createTextNode(sanitized));
      }
    }

    return clean.outerHTML;
  };

  return Array.from(temp.childNodes)
    .map(node => sanitizeNode(node))
    .join('');
};

/**
 * Sanitize plain text (remove HTML entirely)
 * @param {string} text - Text to sanitize
 * @returns {string} Plain text
 */
export const sanitizeText = (text) => {
  if (!text) return '';
  const temp = document.createElement('div');
  temp.innerHTML = text;
  return temp.textContent || temp.innerText || '';
};

/**
 * Sanitize file name to prevent path traversal
 * @param {string} fileName - File name to sanitize
 * @returns {string} Safe file name
 */
export const sanitizeFileName = (fileName) => {
  if (!fileName) return '';
  return fileName
    .replace(/[^a-zA-Z0-9._-]/g, '_')  // Replace unsafe chars
    .replace(/\.{2,}/g, '.')            // Remove multiple dots
    .replace(/^\.+|\.+$/g, '')          // Remove leading/trailing dots
    .substring(0, 255);                 // Limit length
};

/**
 * Sanitize URL
 * @param {string} url - URL to sanitize
 * @param {string[]} allowedProtocols - Allowed protocols
 * @returns {string|null} Safe URL or null if invalid
 */
export const sanitizeURL = (url, allowedProtocols = ['http', 'https']) => {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const protocol = parsed.protocol.replace(':', '');

    if (!allowedProtocols.includes(protocol)) {
      return null;
    }

    return parsed.href;
  } catch {
    return null;
  }
};

// ============================================
// INPUT VALIDATION
// ============================================

/**
 * Validate email format
 * @param {string} email
 * @returns {boolean}
 */
export const isValidEmail = (email) => {
  if (!email) return false;
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
};

/**
 * Validate manage ID format (e.g., TC-001)
 * @param {string} manageId
 * @returns {boolean}
 */
export const isValidManageId = (manageId) => {
  if (!manageId) return false;
  const regex = /^[A-Z]{2,4}-[0-9]{3,6}$/;
  return regex.test(manageId);
};

/**
 * Validate status value
 * @param {string} status
 * @returns {boolean}
 */
export const isValidStatus = (status) => {
  const validStatuses = ['Pendiente', 'En proceso', 'Finalizado'];
  return validStatuses.includes(status);
};

/**
 * Validate priority value
 * @param {string} priority
 * @returns {boolean}
 */
export const isValidPriority = (priority) => {
  const validPriorities = ['Alta', 'Media', 'Baja'];
  return validPriorities.includes(priority);
};

/**
 * Validate string length
 * @param {string} str
 * @param {number} min
 * @param {number} max
 * @returns {boolean}
 */
export const isValidLength = (str, min = 1, max = 500) => {
  if (!str) return min === 0;
  return str.length >= min && str.length <= max;
};

// ============================================
// FORM SANITIZATION
// ============================================

/**
 * Sanitize form data object
 * @param {Object} data - Form data
 * @param {Object} schema - Validation schema
 * @returns {Object} Sanitized data
 */
export const sanitizeFormData = (data, schema = {}) => {
  const sanitized = {};

  for (const [key, value] of Object.entries(data)) {
    const fieldSchema = schema[key] || { type: 'string', maxLength: 500 };

    switch (fieldSchema.type) {
      case 'string':
        sanitized[key] = sanitizeText(value)
          .trim()
          .substring(0, fieldSchema.maxLength || 500);
        break;

      case 'email':
        const email = sanitizeText(value).trim().toLowerCase();
        sanitized[key] = isValidEmail(email) ? email : '';
        break;

      case 'html':
        sanitized[key] = sanitizeHTML(value, fieldSchema.htmlOptions);
        break;

      case 'number':
        const num = parseFloat(value);
        sanitized[key] = isNaN(num) ? (fieldSchema.default || 0) : num;
        break;

      case 'boolean':
        sanitized[key] = Boolean(value);
        break;

      case 'url':
        sanitized[key] = sanitizeURL(value) || '';
        break;

      default:
        sanitized[key] = sanitizeText(value).trim();
    }
  }

  return sanitized;
};

// ============================================
// SECURITY HEADERS CHECK
// ============================================

/**
 * Check if security headers are properly configured
 * @returns {Object} Security status
 */
export const checkSecurityHeaders = () => {
  const results = {
    csp: false,
    xFrameOptions: false,
    xContentTypeOptions: false,
    httpsOnly: false
  };

  // Check CSP
  const cspMeta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
  results.csp = !!cspMeta;

  // Check HTTPS
  results.httpsOnly = window.location.protocol === 'https:';

  return results;
};

// ============================================
// INITIALIZATION
// ============================================

/**
 * Initialize security features
 * Call this function at application startup
 */
export const initializeSecurity = () => {
  // Apply CSP
  applyCSP();

  // Log security status in development
  if (window.location.hostname === 'localhost') {
    const status = checkSecurityHeaders();
    console.log('Security Status:', status);
  }
};

// Auto-initialize when module is loaded
if (typeof window !== 'undefined') {
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeSecurity);
  } else {
    initializeSecurity();
  }
}
