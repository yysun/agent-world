/**
 * Electron Renderer Transcript Scroll Policy Tests
 *
 * Purpose:
 * - Verify the outer transcript auto-scroll policy only applies in chat view.
 *
 * Key Features:
 * - Guards against non-chat world views inheriting chat auto-scroll behavior.
 * - Covers normalization of raw and unsupported view-mode values.
 *
 * Implementation Notes:
 * - Uses pure-function assertions with no renderer runtime dependencies.
 *
 * Recent Changes:
 * - 2026-05-10: Added after non-chat view switches could auto-scroll the outer transcript and hide the top human-input panel.
 */

import { describe, expect, it } from 'vitest';

import { shouldAutoScrollOuterTranscript } from '../../../electron/renderer/src/domain/transcript-scroll-policy';

describe('electron/renderer transcript scroll policy', () => {
  it('auto-scrolls the outer transcript only in chat view', () => {
    expect(shouldAutoScrollOuterTranscript('chat')).toBe(true);
    expect(shouldAutoScrollOuterTranscript('CHAT')).toBe(true);
    expect(shouldAutoScrollOuterTranscript('board')).toBe(false);
    expect(shouldAutoScrollOuterTranscript('grid')).toBe(false);
    expect(shouldAutoScrollOuterTranscript('canvas')).toBe(false);
  });

  it('treats unsupported values as chat via canonical normalization', () => {
    expect(shouldAutoScrollOuterTranscript('unsupported-mode')).toBe(true);
    expect(shouldAutoScrollOuterTranscript(undefined)).toBe(true);
  });
});