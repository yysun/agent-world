/**
 * Transcript Scroll Policy
 * Purpose:
 * - Define when the outer transcript viewport should auto-scroll in the Electron renderer.
 *
 * Key Features:
 * - Keeps chat-mode auto-scroll behavior explicit and testable.
 * - Prevents non-chat world views from inheriting chat transcript scroll behavior.
 *
 * Implementation Notes:
 * - Uses canonical world-view normalization so callers can pass raw UI values safely.
 * - Applies only to the outer transcript viewport; non-chat inner panes manage their own scroll.
 *
 * Recent Changes:
 * - 2026-05-10: Added to stop board/grid/canvas view switches from auto-scrolling the outer transcript and hiding the top human-input panel.
 */

import { normalizeWorldViewMode } from './world-view';

export function shouldAutoScrollOuterTranscript(worldViewMode: unknown): boolean {
  return normalizeWorldViewMode(worldViewMode) === 'chat';
}