// Non-blocking replacements for window.confirm / window.alert.
//
// The native dialogs ignore dark mode, block the event loop and cannot show
// progress, so every destructive action in the dashboard goes through these
// stores instead. Both are rendered once, at the root of the dashboard, by
// <ConfirmDialog> and <ToastHost>.

import { writable } from 'svelte/store';

/** The single pending confirmation, or null. */
export const confirmRequest = writable(null);

/**
 * Promise-based confirm. Resolves true when the user accepts.
 * @param {Object} options
 * @param {string} options.message
 * @param {string} [options.title]
 * @param {string} [options.confirmLabel]
 * @param {string} [options.cancelLabel]
 * @param {boolean} [options.danger] Style the accept button as destructive.
 * @returns {Promise<boolean>}
 */
export function confirmAction(options) {
  return new Promise((resolve) => {
    confirmRequest.set({
      title: 'Are you sure?',
      confirmLabel: 'Confirm',
      cancelLabel: 'Cancel',
      danger: false,
      ...options,
      resolve: (value) => {
        confirmRequest.set(null);
        resolve(value);
      },
    });
  });
}

export const toasts = writable([]);

let nextToastId = 1;

/**
 * Show a transient message. Announced to screen readers by <ToastHost>.
 * @param {string} message
 * @param {Object} [options]
 * @param {'info'|'success'|'error'} [options.type]
 * @param {number} [options.timeout] 0 keeps the toast until dismissed.
 * @param {{label: string, run: Function}} [options.action] e.g. an undo button.
 * @returns {number} The toast id.
 */
export function notify(message, options = {}) {
  const { type = 'info', timeout = 5000, action = null } = options;
  const id = nextToastId++;

  toasts.update((list) => [...list, { id, message, type, action }]);

  if (timeout > 0) {
    setTimeout(() => dismissToast(id), timeout);
  }
  return id;
}

export function dismissToast(id) {
  toasts.update((list) => list.filter((toast) => toast.id !== id));
}
