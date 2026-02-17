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
 * - 2026-02-17: Migrated module from JS to TS with typed status/listener contracts.
 */

export type StatusKind = 'info' | 'success' | 'error';

export interface StatusBarState {
  text: string;
  kind: StatusKind;
}

const STATUS_KINDS = new Set<StatusKind>(['info', 'success', 'error']);

let currentStatus: StatusBarState = {
  text: '',
  kind: 'info',
};

const listeners = new Set<(status: StatusBarState) => void>();

function cloneStatus(status: Partial<StatusBarState>): StatusBarState {
  return {
    text: String(status?.text || ''),
    kind: normalizeStatusKind(status?.kind),
  };
}

function normalizeStatusKind(kind: unknown): StatusKind {
  const normalized = String(kind || 'info').trim().toLowerCase() as StatusKind;
  return STATUS_KINDS.has(normalized) ? normalized : 'info';
}

function normalizeStatusText(text: unknown): string {
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
    }
  }
}

export function getStatusBarStatus(): StatusBarState {
  return cloneStatus(currentStatus);
}

export function publishStatusBarStatus(text: unknown, kind: StatusKind | string = 'info'): StatusBarState {
  currentStatus = {
    text: normalizeStatusText(text),
    kind: normalizeStatusKind(kind),
  };
  notifyListeners();
  return cloneStatus(currentStatus);
}

export function clearStatusBarStatus(): StatusBarState {
  currentStatus = {
    text: '',
    kind: 'info',
  };
  notifyListeners();
  return cloneStatus(currentStatus);
}

export function subscribeStatusBarStatus(listener: ((status: StatusBarState) => void) | unknown): () => void {
  if (typeof listener !== 'function') {
    return () => { };
  }

  listeners.add(listener);
  listener(cloneStatus(currentStatus));

  return () => {
    listeners.delete(listener);
  };
}
