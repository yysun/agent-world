/**
 * Electron Renderer World Heartbeat Domain Tests
 *
 * Purpose:
 * - Verify selected-world heartbeat summary and control derivation for sidebar display.
 *
 * Key Features:
 * - Covers disabled/configured runtime status normalization.
 * - Covers run-count propagation from heartbeat jobs.
 * - Covers start/pause/stop button enablement rules.
 *
 * Implementation Notes:
 * - Uses pure domain helpers only; no React or Electron runtime dependencies.
 * - Assertions target user-visible outcomes rather than component internals.
 *
 * Summary of Recent Changes:
 * - 2026-03-14: Added coverage for world sidebar heartbeat status and controls.
 */

import { describe, expect, it } from 'vitest';
import {
  deriveHeartbeatControlState,
  deriveWorldHeartbeatSummary,
} from '../../../electron/renderer/src/domain/world-heartbeat';

describe('electron/renderer world-heartbeat domain', () => {
  it('handles empty bootstrap state without throwing', () => {
    const summary = deriveWorldHeartbeatSummary(null, null);

    expect(summary).toEqual(expect.objectContaining({
      configured: false,
      heartbeatEnabled: false,
      heartbeatLabel: 'off',
      status: 'disabled',
      statusLabel: 'Disabled',
      runCount: 0,
      interval: '',
    }));
  });

  it('marks heartbeat as disabled when the world is not fully configured', () => {
    const summary = deriveWorldHeartbeatSummary({
      heartbeatEnabled: false,
      heartbeatInterval: '*/5 * * * *',
      heartbeatPrompt: 'tick',
    }, null);

    expect(summary).toEqual(expect.objectContaining({
      configured: false,
      heartbeatEnabled: false,
      heartbeatLabel: 'off',
      status: 'disabled',
      statusLabel: 'Disabled',
      runCount: 0,
    }));
  });

  it('uses runtime heartbeat status and run counts for configured worlds', () => {
    const summary = deriveWorldHeartbeatSummary({
      heartbeatEnabled: true,
      heartbeatInterval: '*/5 * * * *',
      heartbeatPrompt: 'tick',
    }, {
      status: 'paused',
      runCount: 7,
    });

    expect(summary).toEqual(expect.objectContaining({
      configured: true,
      heartbeatEnabled: false,
      heartbeatLabel: 'off',
      status: 'paused',
      statusLabel: 'Paused',
      runCount: 7,
      interval: '*/5 * * * *',
    }));
  });

  it('reports heartbeat as on only while the runtime status is running', () => {
    const summary = deriveWorldHeartbeatSummary({
      heartbeatEnabled: true,
      heartbeatInterval: '*/5 * * * *',
      heartbeatPrompt: 'tick',
    }, {
      status: 'running',
      runCount: 3,
    });

    expect(summary).toEqual(expect.objectContaining({
      heartbeatEnabled: true,
      heartbeatLabel: 'on',
      status: 'running',
      runCount: 3,
    }));
  });

  it('requires both configuration and a selected chat before start is enabled', () => {
    expect(deriveHeartbeatControlState({
      configured: true,
      status: 'stopped',
      selectedChatId: '',
      isActionPending: false,
    })).toEqual(expect.objectContaining({
      canStart: false,
      canStop: false,
    }));

    expect(deriveHeartbeatControlState({
      configured: true,
      status: 'running',
      selectedChatId: 'chat-1',
      isActionPending: false,
    })).toEqual(expect.objectContaining({
      canStart: false,
      canStop: true,
    }));
  });

  it('treats paused runtime as not running for the remaining visible controls', () => {
    expect(deriveHeartbeatControlState({
      configured: true,
      status: 'paused',
      selectedChatId: 'chat-1',
      isActionPending: false,
    })).toEqual(expect.objectContaining({
      canStart: true,
      canStop: false,
    }));
  });
});