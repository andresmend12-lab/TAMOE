/**
 * Utility functions for TAMOE
 */

// ============================================
// DOM UTILITIES
// ============================================

/**
 * Show an element by removing 'hidden' class
 * @param {HTMLElement} el
 */
export const showEl = (el) => el && el.classList.remove('hidden');

/**
 * Hide an element by adding 'hidden' class
 * @param {HTMLElement} el
 */
export const hideEl = (el) => el && el.classList.add('hidden');

/**
 * Toggle element visibility
 * @param {HTMLElement} el
 * @param {boolean} [show] - Force show/hide
 */
export const toggleEl = (el, show) => {
  if (!el) return;
  if (show === undefined) {
    el.classList.toggle('hidden');
  } else {
    el.classList.toggle('hidden', !show);
  }
};

/**
 * Safely get element by ID
 * @param {string} id
 * @returns {HTMLElement|null}
 */
export const getEl = (id) => document.getElementById(id);

/**
 * Query selector with error handling
 * @param {string} selector
 * @param {HTMLElement} [parent]
 * @returns {HTMLElement|null}
 */
export const qs = (selector, parent = document) => parent.querySelector(selector);

/**
 * Query selector all with error handling
 * @param {string} selector
 * @param {HTMLElement} [parent]
 * @returns {HTMLElement[]}
 */
export const qsa = (selector, parent = document) => Array.from(parent.querySelectorAll(selector));

// ============================================
// STRING UTILITIES
// ============================================

/**
 * Sanitize HTML to prevent XSS
 * @param {string} str
 * @returns {string}
 */
export const escapeHtml = (str) => {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
};

/**
 * Truncate string with ellipsis
 * @param {string} str
 * @param {number} maxLength
 * @returns {string}
 */
export const truncate = (str, maxLength = 50) => {
  if (!str || str.length <= maxLength) return str || '';
  return str.slice(0, maxLength - 3) + '...';
};

/**
 * Build manage prefix from company name
 * Takes first letters of first two words
 * @param {string} name
 * @returns {string}
 */
export const buildManagePrefixFromName = (name) => {
  if (!name) return 'XX';
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'XX';
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return (words[0][0] + words[1][0]).toUpperCase();
};

/**
 * Format manage ID (e.g., "NN-001")
 * @param {string} prefix
 * @param {number} number
 * @returns {string}
 */
export const formatManageId = (prefix, number) => {
  return `${prefix}-${String(number).padStart(3, '0')}`;
};

/**
 * Generate unique ID
 * @returns {string}
 */
export const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
};

// ============================================
// DATE UTILITIES
// ============================================

/**
 * Format date to ISO string
 * @param {Date} [date]
 * @returns {string}
 */
export const toISOString = (date = new Date()) => date.toISOString();

/**
 * Format date for display
 * @param {string|Date} date
 * @param {Object} [options]
 * @returns {string}
 */
export const formatDate = (date, options = {}) => {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';

  const defaultOptions = {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...options
  };

  return d.toLocaleDateString('es-ES', defaultOptions);
};

/**
 * Format relative time (e.g., "hace 2 horas")
 * @param {string|Date} date
 * @returns {string}
 */
export const formatRelativeTime = (date) => {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';

  const now = new Date();
  const diffMs = now - d;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'hace unos segundos';
  if (diffMins < 60) return `hace ${diffMins} minuto${diffMins !== 1 ? 's' : ''}`;
  if (diffHours < 24) return `hace ${diffHours} hora${diffHours !== 1 ? 's' : ''}`;
  if (diffDays < 7) return `hace ${diffDays} día${diffDays !== 1 ? 's' : ''}`;

  return formatDate(d);
};

/**
 * Check if date is today
 * @param {Date} date
 * @returns {boolean}
 */
export const isToday = (date) => {
  const today = new Date();
  return date.getDate() === today.getDate() &&
         date.getMonth() === today.getMonth() &&
         date.getFullYear() === today.getFullYear();
};

/**
 * Get start of day
 * @param {Date} date
 * @returns {Date}
 */
export const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Get end of day
 * @param {Date} date
 * @returns {Date}
 */
export const endOfDay = (date) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

// ============================================
// VALIDATION UTILITIES
// ============================================

/**
 * Validate email format
 * @param {string} email
 * @returns {boolean}
 */
export const isValidEmail = (email) => {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
};

/**
 * Check if value is non-empty string
 * @param {any} value
 * @returns {boolean}
 */
export const isNonEmptyString = (value) => {
  return typeof value === 'string' && value.trim().length > 0;
};

/**
 * Validate status value
 * @param {string} status
 * @returns {boolean}
 */
export const isValidStatus = (status) => {
  return ['Pendiente', 'En proceso', 'Finalizado'].includes(status);
};

/**
 * Validate priority value
 * @param {string} priority
 * @returns {boolean}
 */
export const isValidPriority = (priority) => {
  return ['Alta', 'Media', 'Baja'].includes(priority);
};

// ============================================
// COLLECTION UTILITIES
// ============================================

/**
 * Safe object entries (handles null/undefined)
 * @param {Object} obj
 * @returns {Array}
 */
export const safeEntries = (obj) => {
  if (!obj || typeof obj !== 'object') return [];
  return Object.entries(obj);
};

/**
 * Safe object values (handles null/undefined)
 * @param {Object} obj
 * @returns {Array}
 */
export const safeValues = (obj) => {
  if (!obj || typeof obj !== 'object') return [];
  return Object.values(obj);
};

/**
 * Safe object keys (handles null/undefined)
 * @param {Object} obj
 * @returns {Array}
 */
export const safeKeys = (obj) => {
  if (!obj || typeof obj !== 'object') return [];
  return Object.keys(obj);
};

/**
 * Count items in object/array
 * @param {Object|Array} collection
 * @returns {number}
 */
export const count = (collection) => {
  if (!collection) return 0;
  if (Array.isArray(collection)) return collection.length;
  return Object.keys(collection).length;
};

/**
 * Sort array by property
 * @param {Array} arr
 * @param {string} prop
 * @param {boolean} [desc]
 * @returns {Array}
 */
export const sortBy = (arr, prop, desc = false) => {
  return [...arr].sort((a, b) => {
    const aVal = a[prop];
    const bVal = b[prop];
    if (aVal < bVal) return desc ? 1 : -1;
    if (aVal > bVal) return desc ? -1 : 1;
    return 0;
  });
};

/**
 * Group array by property
 * @param {Array} arr
 * @param {string} prop
 * @returns {Object}
 */
export const groupBy = (arr, prop) => {
  return arr.reduce((acc, item) => {
    const key = item[prop];
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
};

// ============================================
// ASYNC UTILITIES
// ============================================

/**
 * Debounce function
 * @param {Function} fn
 * @param {number} delay
 * @returns {Function}
 */
export const debounce = (fn, delay = 300) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};

/**
 * Throttle function
 * @param {Function} fn
 * @param {number} limit
 * @returns {Function}
 */
export const throttle = (fn, limit = 300) => {
  let inThrottle;
  return (...args) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

/**
 * Sleep utility
 * @param {number} ms
 * @returns {Promise}
 */
export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Retry async function with exponential backoff
 * @param {Function} fn
 * @param {number} maxRetries
 * @param {number} baseDelay
 * @returns {Promise}
 */
export const retry = async (fn, maxRetries = 3, baseDelay = 1000) => {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        await sleep(baseDelay * Math.pow(2, i));
      }
    }
  }
  throw lastError;
};

// ============================================
// STATUS UTILITIES
// ============================================

/**
 * Get status color class
 * @param {string} status
 * @returns {string}
 */
export const getStatusColorClass = (status) => {
  switch (status) {
    case 'Pendiente':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    case 'En proceso':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    case 'Finalizado':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  }
};

/**
 * Get priority color class
 * @param {string} priority
 * @returns {string}
 */
export const getPriorityColorClass = (priority) => {
  switch (priority) {
    case 'Alta':
      return 'text-red-600 dark:text-red-400';
    case 'Media':
      return 'text-yellow-600 dark:text-yellow-400';
    case 'Baja':
      return 'text-green-600 dark:text-green-400';
    default:
      return 'text-gray-600 dark:text-gray-400';
  }
};

/**
 * Calculate progress percentage from tasks
 * @param {Object} tasks - Tasks object
 * @returns {number} Progress percentage (0-100)
 */
export const calculateProgress = (tasks) => {
  const taskArray = safeValues(tasks);
  if (taskArray.length === 0) return 0;

  const completed = taskArray.filter(t => t.status === 'Finalizado').length;
  return Math.round((completed / taskArray.length) * 100);
};

// ============================================
// ERROR HANDLING
// ============================================

/**
 * Safe JSON parse
 * @param {string} str
 * @param {any} fallback
 * @returns {any}
 */
export const safeJsonParse = (str, fallback = null) => {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
};

/**
 * Format error message for display
 * @param {Error|string} error
 * @returns {string}
 */
export const formatErrorMessage = (error) => {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return 'Ha ocurrido un error desconocido';
};

/**
 * Log error with context
 * @param {string} context
 * @param {Error} error
 */
export const logError = (context, error) => {
  console.error(`[${context}]`, error);
  // Future: Send to error tracking service
};
