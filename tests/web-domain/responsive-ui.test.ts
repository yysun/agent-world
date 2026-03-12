/**
 * Web Responsive UI Metric Tests
 *
 * Purpose:
 * - Verify the shared web responsive sizing contract used by chat and history controls.
 *
 * Coverage:
 * - Mobile mode keeps interactive controls at a readable 16 px minimum.
 * - Tablet mode stays between mobile and desktop control sizing while sharing the calmer world legend size.
 * - CSS variable output matches the chosen control metrics.
 *
 * Notes on Implementation:
 * - Exercises the public responsive-ui domain helpers directly with deterministic viewport modes.
 *
 * Recent Changes:
 * - 2026-03-11: Added transcript line-height token coverage for the world-page message boxes.
 * - 2026-03-11: Added chat-list title token coverage so right-panel chats match the world agent label styling.
 * - 2026-03-11: Added regression coverage for mobile-safe control typography and legend sizing tokens.
 */

import { describe, expect, it } from 'vitest';

import {
  getResponsiveControlCssVars,
  getResponsiveControlMetrics,
  getResponsiveControlStyleAttribute,
} from '../../web/src/domain/responsive-ui';

describe('web/responsive-ui metrics', () => {
  it('keeps mobile interactive controls at a readable minimum size', () => {
    const metrics = getResponsiveControlMetrics('mobile');

    expect(metrics.controlFontSizePx).toBe(16);
    expect(metrics.controlHeightPx).toBeGreaterThanOrEqual(36);
    expect(metrics.submitButtonSizePx).toBeGreaterThanOrEqual(36);
    expect(metrics.chatLegendFontSizePx).toBe(17);
    expect(metrics.chatMessageFontSizePx).toBe(15);
    expect(metrics.chatMessageMetaFontSizePx).toBe(14);
    expect(metrics.chatMessageLineHeight).toBe(1.56);
    expect(metrics.chatListTitleFontSizePx).toBe(14.4);
    expect(metrics.chatListTitleFontWeight).toBe(700);
  });

  it('keeps tablet controls larger than desktop while matching the calmer legend size', () => {
    const tablet = getResponsiveControlMetrics('tablet');
    const desktop = getResponsiveControlMetrics('desktop');

    expect(tablet.controlFontSizePx).toBeGreaterThan(desktop.controlFontSizePx);
    expect(tablet.chatLegendFontSizePx).toBe(desktop.chatLegendFontSizePx);
    expect(tablet.chatLegendFontSizePx).toBeGreaterThan(getResponsiveControlMetrics('mobile').chatLegendFontSizePx);
  });

  it('maps responsive metrics into CSS variables for fieldset consumers', () => {
    expect(getResponsiveControlCssVars('mobile')).toEqual({
      '--interactive-control-font-size': '16px',
      '--interactive-control-height': '36px',
      '--interactive-icon-button-size': '36px',
      '--interactive-submit-button-size': '36px',
      '--chat-legend-font-size': '17px',
      '--history-legend-font-size': '17px',
      '--chat-message-font-size': '15px',
      '--chat-message-meta-font-size': '14px',
      '--chat-message-line-height': '1.56',
      '--chat-list-title-font-size': '14.4px',
      '--chat-list-title-font-weight': '700',
    });

    expect(getResponsiveControlCssVars('desktop')).toMatchObject({
      '--interactive-control-font-size': '14px',
      '--chat-legend-font-size': '18px',
      '--chat-message-font-size': '15px',
      '--chat-message-meta-font-size': '14px',
      '--chat-message-line-height': '1.56',
      '--chat-list-title-font-size': '14.4px',
      '--chat-list-title-font-weight': '700',
    });
    expect(getResponsiveControlStyleAttribute('mobile')).toContain('--interactive-control-height: 36px');
  });
});
