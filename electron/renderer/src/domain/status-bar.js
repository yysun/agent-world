/**
 * Renderer Status Bar Service
 * Purpose:
 * - Provide a shared publish/subscribe API for footer status text across renderer modules.
 *
 * Features:
 * - Global status state store (`text`, `kind`) with normalization.
 * - Listener subscription API for React views and domain modules.
 * - Helper methods to publish, clear, and read status state.
 *
 * Implementation Notes:
 * - Function-based module state (no classes) for lightweight cross-module sharing.
 * - Listeners are notified synchronously in publish order.
 * - Listener failures are isolated to avoid blocking other subscribers.
 *
 * Recent Changes:
 * - 2026-02-13: Hardened API to return/emit shallow copies to prevent accidental external mutation of internal state.
 * - 2026-02-13: Initial shared status bar service extracted from App-local state updates.
 */

const STATUS_KINDS = new Set(['info', 'success', 'error']);

let currentStatus = {
  text: '',
  kind: 'info'
};

const listeners = new Set();

function cloneStatus(status) {
  return {
    text: String(status?.text || ''),
    kind: normalizeStatusKind(status?.kind)
  };
}

function normalizeStatusKind(kind) {
  const normalized = String(kind || 'info').trim().toLowerCase();
  return STATUS_KINDS.has(normalized) ? normalized : 'info';
}

function normalizeStatusText(text) {
  if (typeof text !== 'string') {
    if (text == null) return '';
    return String(text);
  }
  return text;
}

function notifyListeners() {
  for (const listener of listeners) {
    try {
      listener(cloneStatus(currentStatus));
    } catch {
      // Ignore listener errors to keep status notifications resilient.
    }
  }
}

export function getStatusBarStatus() {
  return cloneStatus(currentStatus);
}

export function publishStatusBarStatus(text, kind = 'info') {
  currentStatus = {
    text: normalizeStatusText(text),
    kind: normalizeStatusKind(kind)
  };
  notifyListeners();
  return cloneStatus(currentStatus);
}

export function clearStatusBarStatus() {
  currentStatus = {
    text: '',
    kind: 'info'
  };
  notifyListeners();
  return cloneStatus(currentStatus);
}

export function subscribeStatusBarStatus(listener) {
  if (typeof listener !== 'function') {
    return () => { };
  }

  listeners.add(listener);
  listener(cloneStatus(currentStatus));

  return () => {
    listeners.delete(listener);
  };
}
