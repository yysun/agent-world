/**
 * Unit Tests for Preload Invoke Guard
 *
 * Purpose:
 * - Verify channel allowlist behavior for preload invoke calls.
 *
 * Key Features:
 * - Validates known channel allow checks.
 * - Ensures unknown channels are blocked with explicit errors.
 *
 * Implementation Notes:
 * - Uses a minimal invoke mock instead of real Electron runtime.
 * - Keeps tests deterministic and in-memory.
 *
 * Recent Changes:
 * - 2026-02-14: Added allowlist assertion for `skill:list` channel.
 * - 2026-02-12: Corrected unsupported-channel assertion to validate synchronous throw semantics.
 * - 2026-02-12: Moved into layer-based tests/electron subfolder and updated module import paths.
 * - 2026-02-12: Added Phase 4 tests for preload invoke channel guard behavior.
 */

import { describe, expect, it, vi } from 'vitest';
import { DESKTOP_INVOKE_CHANNELS } from '../../../electron/shared/ipc-contracts';
import { invokeDesktopChannel, isAllowedDesktopChannel } from '../../../electron/preload/invoke';

describe('preload invoke channel guards', () => {
  it('accepts known desktop invoke channels', () => {
    expect(isAllowedDesktopChannel(DESKTOP_INVOKE_CHANNELS.CHAT_SEND_MESSAGE)).toBe(true);
    expect(isAllowedDesktopChannel(DESKTOP_INVOKE_CHANNELS.WORLD_LIST)).toBe(true);
    expect(isAllowedDesktopChannel(DESKTOP_INVOKE_CHANNELS.SKILL_LIST)).toBe(true);
  });

  it('rejects unknown channels', () => {
    expect(isAllowedDesktopChannel('chat:unknown')).toBe(false);
  });

  it('invokes ipcRenderer for allowed channels', async () => {
    const invoke = vi.fn(async () => ({ ok: true }));
    await invokeDesktopChannel(
      { invoke },
      DESKTOP_INVOKE_CHANNELS.WORLD_LIST
    );

    expect(invoke).toHaveBeenCalledWith('world:list');
  });

  it('throws for unsupported channel usage', () => {
    const invoke = vi.fn(async () => ({ ok: true }));
    expect(() =>
      invokeDesktopChannel(
        { invoke },
        'chat:unsupported' as typeof DESKTOP_INVOKE_CHANNELS.CHAT_SEND_MESSAGE
      )
    ).toThrow('Blocked unsupported IPC channel: chat:unsupported');
  });
});
