/**
 * Electron Renderer World Info Stats Domain Tests
 *
 * Purpose:
 * - Verify selected-world sidebar summary stats are derived correctly.
 *
 * Key Features:
 * - Covers chat-count derivation from the loaded session list.
 * - Covers total-agent fallback to the world agent list.
 * - Covers turn-limit fallback behavior.
 *
 * Implementation Notes:
 * - Uses pure domain helpers only; no React or Electron runtime dependencies.
 * - Assertions target the displayed sidebar summary values.
 *
 * Summary of Recent Changes:
 * - 2026-03-14: Added coverage for the `Chats` sidebar summary stat.
 */

import { describe, expect, it } from 'vitest';
import { deriveWorldInfoStats } from '../../../electron/renderer/src/domain/world-info-stats';

describe('electron/renderer world-info-stats domain', () => {
  it('derives chat count from the loaded sessions list', () => {
    const stats = deriveWorldInfoStats({
      totalAgents: 4,
      turnLimit: 12,
    }, [
      { id: 'chat-1' },
      { id: 'chat-2' },
      { id: 'chat-3' },
    ], 1, 10);

    expect(stats).toEqual({
      totalAgents: 4,
      totalChats: 3,
      turnLimit: 12,
    });
  });

  it('falls back to the agent list and minimum turn limit when metadata is missing', () => {
    const stats = deriveWorldInfoStats({
      agents: [{ id: 'a1' }, { id: 'a2' }],
    }, [], 1, 10);

    expect(stats).toEqual({
      totalAgents: 2,
      totalChats: 0,
      turnLimit: 1,
    });
  });
});