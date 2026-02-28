/**
 * Chat Stop-State Domain Tests
 * Purpose:
 * - Verify composer stop-mode eligibility logic used by Electron renderer actions.
 *
 * Key Features:
 * - Confirms stop mode activates from registry working state even without pending markers.
 * - Confirms legacy pending markers still activate stop mode.
 * - Confirms send/stop in-flight state blocks stop mode.
 *
 * Implementation Notes:
 * - Pure unit tests for deterministic behavior at the stop-eligibility boundary.
 * - No filesystem, network, or realtime dependencies.
 *
 * Recent Changes:
 * - 2026-02-27: Added regression coverage for missing stop button when only status-registry working state is present.
 */

import { describe, expect, it } from 'vitest';
import { computeCanStopCurrentSession } from '../../../electron/renderer/src/domain/chat-stop-state';

describe('electron/renderer chat-stop-state domain', () => {
  it('allows stop mode when the active session is working even if pending markers are absent', () => {
    const result = computeCanStopCurrentSession({
      selectedSessionId: 'chat-1',
      isCurrentSessionSending: false,
      isCurrentSessionStopping: false,
      isCurrentSessionPendingResponse: false,
      isCurrentSessionWorking: true,
    });

    expect(result).toBe(true);
  });

  it('keeps legacy pending-response marker support', () => {
    const result = computeCanStopCurrentSession({
      selectedSessionId: 'chat-1',
      isCurrentSessionSending: false,
      isCurrentSessionStopping: false,
      isCurrentSessionPendingResponse: true,
      isCurrentSessionWorking: false,
    });

    expect(result).toBe(true);
  });

  it('blocks stop mode while sending, while stopping, or without an active session', () => {
    expect(
      computeCanStopCurrentSession({
        selectedSessionId: 'chat-1',
        isCurrentSessionSending: true,
        isCurrentSessionStopping: false,
        isCurrentSessionPendingResponse: true,
        isCurrentSessionWorking: true,
      })
    ).toBe(false);

    expect(
      computeCanStopCurrentSession({
        selectedSessionId: 'chat-1',
        isCurrentSessionSending: false,
        isCurrentSessionStopping: true,
        isCurrentSessionPendingResponse: true,
        isCurrentSessionWorking: true,
      })
    ).toBe(false);

    expect(
      computeCanStopCurrentSession({
        selectedSessionId: '',
        isCurrentSessionSending: false,
        isCurrentSessionStopping: false,
        isCurrentSessionPendingResponse: true,
        isCurrentSessionWorking: true,
      })
    ).toBe(false);
  });
});
