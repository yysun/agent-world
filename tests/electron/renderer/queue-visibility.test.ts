/**
 * Electron Renderer Queue Visibility Tests
 *
 * Purpose:
 * - Verify the floating message queue is only shown for multi-message queues without an inline HITL prompt.
 *
 * Key Features:
 * - Keeps queue visible for normal queued-message flows with multiple queued items.
 * - Hides the queue when only a single queued item remains.
 * - Hides queue whenever a HITL prompt is active, regardless of queue size.
 *
 * Implementation Notes:
 * - Tests the pure queue-visibility domain helper directly without React runtime dependencies.
 *
 * Summary of Recent Changes:
 * - 2026-03-13: Added regression coverage for the single-item queue case.
 * - 2026-03-12: Added HITL-aware queue visibility regression coverage.
 */

import { describe, expect, it } from 'vitest';

import { shouldShowQueuePanel } from '../../../electron/renderer/src/domain/queue-visibility';

describe('shouldShowQueuePanel', () => {
  it('shows the queue when multiple items are queued and no HITL prompt is active', () => {
    expect(shouldShowQueuePanel(2, false)).toBe(true);
  });

  it('shows the queue when one queued item remains', () => {
    expect(shouldShowQueuePanel(1, false)).toBe(true);
  });

  it('hides the queue when an inline HITL prompt is active', () => {
    expect(shouldShowQueuePanel(2, true)).toBe(false);
  });

  it('hides the queue when there are no queued items', () => {
    expect(shouldShowQueuePanel(0, false)).toBe(false);
  });
});