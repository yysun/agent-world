/**
 * Unit Tests for Desktop API Domain Helpers
 *
 * Features:
 * - Validates bridge availability checks.
 * - Verifies backward-compatible `deleteChat` fallback wiring.
 * - Verifies error message normalization helper behavior.
 *
 * Implementation Notes:
 * - Uses temporary `window.agentWorldDesktop` test doubles.
 * - Restores original window value after each test.
 *
 * Recent Changes:
 * - 2026-02-12: Moved into layer-based tests/electron subfolder and updated module import paths.
 * - 2026-02-12: Added Phase 5 tests for extracted desktop API domain helpers.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { getDesktopApi, safeMessage } from '../../../electron/renderer/src/domain/desktop-api.js';

const globalWindow = ((globalThis as any).window ||= {});
const originalApi = globalWindow.agentWorldDesktop;

afterEach(() => {
  globalWindow.agentWorldDesktop = originalApi;
});

describe('desktop-api domain helpers', () => {
  it('throws when desktop bridge is unavailable', () => {
    globalWindow.agentWorldDesktop = undefined;
    expect(() => getDesktopApi()).toThrow('Desktop API bridge is unavailable.');
  });

  it('returns a normalized API copy when deleteChat exists', () => {
    const api = { deleteChat: () => true, openWorkspace: () => true, ping: () => 'ok' };
    globalWindow.agentWorldDesktop = api;
    const normalized = getDesktopApi() as typeof api & { pickDirectory?: () => boolean };
    expect(normalized).not.toBe(api);
    expect(normalized.deleteChat).toBe(api.deleteChat);
    expect(normalized.pickDirectory).toBe(api.openWorkspace);
  });

  it('creates compatibility openWorkspace fallback from pickDirectory', () => {
    const pickDirectory = () => true;
    const api = { pickDirectory, ping: () => 'ok' };
    globalWindow.agentWorldDesktop = api;

    const normalized = getDesktopApi() as typeof api & { openWorkspace: () => boolean };
    expect(normalized.openWorkspace).toBe(pickDirectory);
  });

  it('creates compatibility deleteChat fallback from deleteSession', () => {
    const deleteSession = () => true;
    const api = { deleteSession, ping: () => 'ok' };
    globalWindow.agentWorldDesktop = api;

    const normalized = getDesktopApi() as typeof api & { deleteChat: () => boolean };
    expect(normalized.deleteChat).toBe(deleteSession);
  });

  it('normalizes safe error messages', () => {
    expect(safeMessage(new Error('boom'), 'fallback')).toBe('boom');
    expect(safeMessage('plain string', 'fallback')).toBe('fallback');
  });
});
