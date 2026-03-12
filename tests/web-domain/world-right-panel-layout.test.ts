/**
 * World Right Panel Layout Tests
 *
 * Purpose:
 * - Verify viewport-sensitive helpers used by the web world right panel.
 *
 * Coverage:
 * - Uses measured viewport width when available for panel actions.
 * - Falls back to the current viewport mode when no runtime width is available.
 *
 * Notes:
 * - Tests the public World-page helper directly for deterministic coverage.
 *
 * Recent Changes:
 * - 2026-03-11: Added regression coverage for mobile close-panel actions when viewport state lags behind CSS layout.
 */

import { describe, expect, it } from 'vitest';

import { resolveRightPanelViewportMode } from '../../web/src/pages/World';

describe('web/world right panel layout', () => {
  it('prefers the measured width over stale viewport state for mobile overlays', () => {
    expect(resolveRightPanelViewportMode('desktop', 500)).toBe('mobile');
    expect(resolveRightPanelViewportMode('desktop', 820)).toBe('tablet');
  });

  it('falls back to the current viewport mode when no width is available', () => {
    expect(resolveRightPanelViewportMode('mobile', 0)).toBe('mobile');
    expect(resolveRightPanelViewportMode('desktop')).toBe('desktop');
  });
});
