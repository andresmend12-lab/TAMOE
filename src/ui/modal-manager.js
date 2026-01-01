/**
 * Modal Manager - Centralized modal handling
 */

import { showEl, hideEl, getEl } from '../utils/helpers.js';

// ============================================
// MODAL REGISTRY
// ============================================

const modals = new Map();
let activeModal = null;

/**
 * Register a modal
 * @param {string} id - Modal element ID
 * @param {Object} [options] - Modal options
 */
export const registerModal = (id, options = {}) => {
  const element = getEl(id);
  if (!element) {
    console.warn(`Modal element not found: ${id}`);
    return;
  }

  modals.set(id, {
    element,
    form: options.form || element.querySelector('form'),
    closeBtn: options.closeBtn || element.querySelector('[data-close-modal]'),
    cancelBtn: options.cancelBtn || element.querySelector('[data-cancel-modal]'),
    onOpen: options.onOpen,
    onClose: options.onClose,
    onSubmit: options.onSubmit
  });

  // Setup event listeners
  const modal = modals.get(id);

  if (modal.closeBtn) {
    modal.closeBtn.addEventListener('click', () => closeModal(id));
  }

  if (modal.cancelBtn) {
    modal.cancelBtn.addEventListener('click', () => closeModal(id));
  }

  // Close on backdrop click
  element.addEventListener('click', (e) => {
    if (e.target === element) {
      closeModal(id);
    }
  });

  // Close on escape key
  element.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal(id);
    }
  });
};

/**
 * Open a modal
 * @param {string} id - Modal ID
 * @param {Object} [data] - Data to pass to onOpen callback
 */
export const openModal = (id, data = {}) => {
  const modal = modals.get(id);
  if (!modal) {
    console.warn(`Modal not registered: ${id}`);
    return;
  }

  // Close any active modal first
  if (activeModal && activeModal !== id) {
    closeModal(activeModal);
  }

  // Reset form if exists
  if (modal.form) {
    modal.form.reset();
  }

  // Call onOpen callback
  if (modal.onOpen) {
    modal.onOpen(data);
  }

  // Show modal
  showEl(modal.element);
  activeModal = id;

  // Focus first input
  const firstInput = modal.element.querySelector('input, textarea, select');
  if (firstInput) {
    setTimeout(() => firstInput.focus(), 100);
  }

  // Prevent body scroll
  document.body.classList.add('overflow-hidden');
};

/**
 * Close a modal
 * @param {string} [id] - Modal ID (closes active modal if not specified)
 */
export const closeModal = (id) => {
  const modalId = id || activeModal;
  if (!modalId) return;

  const modal = modals.get(modalId);
  if (!modal) return;

  // Call onClose callback
  if (modal.onClose) {
    modal.onClose();
  }

  // Hide modal
  hideEl(modal.element);

  if (activeModal === modalId) {
    activeModal = null;
  }

  // Restore body scroll
  document.body.classList.remove('overflow-hidden');
};

/**
 * Close all modals
 */
export const closeAllModals = () => {
  modals.forEach((_, id) => closeModal(id));
};

/**
 * Check if a modal is open
 * @param {string} [id] - Modal ID (checks if any modal is open if not specified)
 * @returns {boolean}
 */
export const isModalOpen = (id) => {
  if (id) {
    return activeModal === id;
  }
  return activeModal !== null;
};

/**
 * Get active modal ID
 * @returns {string|null}
 */
export const getActiveModal = () => activeModal;

// ============================================
// CONFIRMATION DIALOG
// ============================================

let confirmResolve = null;

/**
 * Show confirmation dialog
 * @param {Object} options
 * @param {string} options.title - Dialog title
 * @param {string} options.message - Dialog message
 * @param {string} [options.confirmText='Confirmar'] - Confirm button text
 * @param {string} [options.cancelText='Cancelar'] - Cancel button text
 * @param {string} [options.type='default'] - 'default', 'danger', 'warning'
 * @returns {Promise<boolean>}
 */
export const confirm = (options) => {
  return new Promise((resolve) => {
    confirmResolve = resolve;

    const {
      title,
      message,
      confirmText = 'Confirmar',
      cancelText = 'Cancelar',
      type = 'default'
    } = options;

    // Create or get confirm modal
    let confirmModal = getEl('confirm-modal');
    if (!confirmModal) {
      confirmModal = createConfirmModal();
      document.body.appendChild(confirmModal);
    }

    // Update content
    const titleEl = confirmModal.querySelector('[data-confirm-title]');
    const messageEl = confirmModal.querySelector('[data-confirm-message]');
    const confirmBtn = confirmModal.querySelector('[data-confirm-btn]');
    const cancelBtn = confirmModal.querySelector('[data-cancel-btn]');

    if (titleEl) titleEl.textContent = title;
    if (messageEl) messageEl.textContent = message;
    if (confirmBtn) {
      confirmBtn.textContent = confirmText;
      // Update button style based on type
      confirmBtn.className = confirmBtn.className.replace(/bg-\w+-\d+/g, '');
      if (type === 'danger') {
        confirmBtn.classList.add('bg-red-600', 'hover:bg-red-700');
      } else if (type === 'warning') {
        confirmBtn.classList.add('bg-yellow-600', 'hover:bg-yellow-700');
      } else {
        confirmBtn.classList.add('bg-blue-600', 'hover:bg-blue-700');
      }
    }
    if (cancelBtn) cancelBtn.textContent = cancelText;

    showEl(confirmModal);
  });
};

/**
 * Handle confirm dialog response
 * @param {boolean} result
 */
const handleConfirmResponse = (result) => {
  if (confirmResolve) {
    confirmResolve(result);
    confirmResolve = null;
  }
  const confirmModal = getEl('confirm-modal');
  if (confirmModal) {
    hideEl(confirmModal);
  }
};

/**
 * Create confirm modal element
 * @returns {HTMLElement}
 */
const createConfirmModal = () => {
  const modal = document.createElement('div');
  modal.id = 'confirm-modal';
  modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 hidden';
  modal.innerHTML = `
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
      <h3 data-confirm-title class="text-lg font-semibold text-gray-900 dark:text-white mb-2"></h3>
      <p data-confirm-message class="text-gray-600 dark:text-gray-300 mb-6"></p>
      <div class="flex justify-end gap-3">
        <button data-cancel-btn class="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
          Cancelar
        </button>
        <button data-confirm-btn class="px-4 py-2 text-white rounded-lg transition-colors">
          Confirmar
        </button>
      </div>
    </div>
  `;

  // Add event listeners
  modal.querySelector('[data-confirm-btn]').addEventListener('click', () => handleConfirmResponse(true));
  modal.querySelector('[data-cancel-btn]').addEventListener('click', () => handleConfirmResponse(false));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) handleConfirmResponse(false);
  });

  return modal;
};

// ============================================
// TOAST NOTIFICATIONS
// ============================================

let toastContainer = null;

/**
 * Show toast notification
 * @param {Object} options
 * @param {string} options.message - Toast message
 * @param {string} [options.type='info'] - 'info', 'success', 'warning', 'error'
 * @param {number} [options.duration=3000] - Duration in ms
 */
export const toast = (options) => {
  const {
    message,
    type = 'info',
    duration = 3000
  } = options;

  // Create container if needed
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.className = 'fixed bottom-4 right-4 z-50 flex flex-col gap-2';
    document.body.appendChild(toastContainer);
  }

  // Create toast element
  const toast = document.createElement('div');
  toast.className = `
    px-4 py-3 rounded-lg shadow-lg transform transition-all duration-300
    translate-x-full opacity-0
    ${getToastColorClass(type)}
  `;
  toast.innerHTML = `
    <div class="flex items-center gap-2">
      <span class="material-symbols-outlined text-xl">${getToastIcon(type)}</span>
      <span>${message}</span>
    </div>
  `;

  toastContainer.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    toast.classList.remove('translate-x-full', 'opacity-0');
  });

  // Remove after duration
  setTimeout(() => {
    toast.classList.add('translate-x-full', 'opacity-0');
    setTimeout(() => toast.remove(), 300);
  }, duration);
};

/**
 * Get toast color class based on type
 * @param {string} type
 * @returns {string}
 */
const getToastColorClass = (type) => {
  switch (type) {
    case 'success':
      return 'bg-green-500 text-white';
    case 'warning':
      return 'bg-yellow-500 text-white';
    case 'error':
      return 'bg-red-500 text-white';
    default:
      return 'bg-blue-500 text-white';
  }
};

/**
 * Get toast icon based on type
 * @param {string} type
 * @returns {string}
 */
const getToastIcon = (type) => {
  switch (type) {
    case 'success':
      return 'check_circle';
    case 'warning':
      return 'warning';
    case 'error':
      return 'error';
    default:
      return 'info';
  }
};

// ============================================
// LOADING OVERLAY
// ============================================

let loadingOverlay = null;

/**
 * Show loading overlay
 * @param {string} [message='Cargando...'] - Loading message
 */
export const showLoading = (message = 'Cargando...') => {
  if (!loadingOverlay) {
    loadingOverlay = document.createElement('div');
    loadingOverlay.id = 'loading-overlay';
    loadingOverlay.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50';
    loadingOverlay.innerHTML = `
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 flex items-center gap-4">
        <div class="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
        <span data-loading-message class="text-gray-700 dark:text-gray-200">${message}</span>
      </div>
    `;
    document.body.appendChild(loadingOverlay);
  } else {
    const messageEl = loadingOverlay.querySelector('[data-loading-message]');
    if (messageEl) messageEl.textContent = message;
    showEl(loadingOverlay);
  }
};

/**
 * Hide loading overlay
 */
export const hideLoading = () => {
  if (loadingOverlay) {
    hideEl(loadingOverlay);
  }
};

// ============================================
// KEYBOARD SHORTCUTS
// ============================================

/**
 * Setup global keyboard shortcuts for modals
 */
export const setupKeyboardShortcuts = () => {
  document.addEventListener('keydown', (e) => {
    // Escape to close modal
    if (e.key === 'Escape' && activeModal) {
      closeModal(activeModal);
      e.preventDefault();
    }
  });
};

// Initialize keyboard shortcuts
setupKeyboardShortcuts();
