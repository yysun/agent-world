/**
 * Electron Preload Invoke Guard
 *
 * Purpose:
 * - Guard IPC invoke calls behind an allowlist of supported desktop channels.
 *
 * Key Features:
 * - Runtime channel allowlist protection.
 * - Typed channel signatures based on shared IPC contracts.
 *
 * Implementation Notes:
 * - Invalid channel usage throws early in preload for clearer diagnostics.
 * - Guard is intentionally lightweight and non-breaking for valid callers.
 *
 * Recent Changes:
 * - 2026-02-12: Added preload invoke guard helper for Phase 4 bridge hardening.
 */

import type { DesktopInvokeChannel } from '../shared/ipc-contracts.js';
import { DESKTOP_INVOKE_CHANNELS } from '../shared/ipc-contracts.js';

const ALLOWED_DESKTOP_CHANNELS = new Set<DesktopInvokeChannel>(
  Object.values(DESKTOP_INVOKE_CHANNELS)
);

interface IpcRendererInvokeLike {
  invoke: (channel: string, payload?: unknown) => Promise<unknown>;
}

export function isAllowedDesktopChannel(channel: string): channel is DesktopInvokeChannel {
  return ALLOWED_DESKTOP_CHANNELS.has(channel as DesktopInvokeChannel);
}

export function invokeDesktopChannel(
  ipcRendererLike: IpcRendererInvokeLike,
  channel: DesktopInvokeChannel,
  payload?: unknown
): Promise<unknown> {
  if (!isAllowedDesktopChannel(channel)) {
    throw new Error(`Blocked unsupported IPC channel: ${channel}`);
  }
  if (typeof payload === 'undefined') {
    return ipcRendererLike.invoke(channel);
  }
  return ipcRendererLike.invoke(channel, payload);
}
