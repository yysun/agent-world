/**
 * Purpose:
 * - Centralize responsive sizing tokens for the web chat and history controls.
 *
 * Key Features:
 * - Provides mobile-safe control typography and touch target sizing.
 * - Keeps chat legends, transcript text, and interactive controls aligned across viewport modes.
 *
 * Notes on Implementation:
 * - Mobile metrics enforce a 16 px interactive font floor to keep controls readable and avoid browser zoom issues.
 * - Returned CSS variables are consumed directly by the chat and history fieldsets.
 *
 * Summary of Recent Changes:
 * - 2026-03-11: Added transcript line-height tokens so world-page message boxes breathe more without enlarging the text.
 * - 2026-03-11: Added chat-list title typography tokens so the right-panel chat list matches the top agent labels.
 * - 2026-03-11: Rebalanced world-page legend, transcript, and composer typography so the web world view matches the home page better.
 * - 2026-03-11: Added shared responsive control metrics for the web chat and right-panel history surfaces.
 */

import type { WorldViewportMode } from '../types';

export type ResponsiveControlMetrics = {
  controlFontSizePx: number;
  controlHeightPx: number;
  iconButtonSizePx: number;
  submitButtonSizePx: number;
  chatLegendFontSizePx: number;
  historyLegendFontSizePx: number;
  chatMessageFontSizePx: number;
  chatMessageMetaFontSizePx: number;
  chatMessageLineHeight: number;
  chatListTitleFontSizePx: number;
  chatListTitleFontWeight: number;
};

const DESKTOP_CONTROL_METRICS: ResponsiveControlMetrics = {
  controlFontSizePx: 14,
  controlHeightPx: 32,
  iconButtonSizePx: 32,
  submitButtonSizePx: 33,
  chatLegendFontSizePx: 18,
  historyLegendFontSizePx: 18,
  chatMessageFontSizePx: 15,
  chatMessageMetaFontSizePx: 14,
  chatMessageLineHeight: 1.56,
  chatListTitleFontSizePx: 14.4,
  chatListTitleFontWeight: 700,
};

const TABLET_CONTROL_METRICS: ResponsiveControlMetrics = {
  controlFontSizePx: 15,
  controlHeightPx: 34,
  iconButtonSizePx: 34,
  submitButtonSizePx: 34,
  chatLegendFontSizePx: 18,
  historyLegendFontSizePx: 18,
  chatMessageFontSizePx: 15,
  chatMessageMetaFontSizePx: 14,
  chatMessageLineHeight: 1.56,
  chatListTitleFontSizePx: 14.4,
  chatListTitleFontWeight: 700,
};

const MOBILE_CONTROL_METRICS: ResponsiveControlMetrics = {
  controlFontSizePx: 16,
  controlHeightPx: 36,
  iconButtonSizePx: 36,
  submitButtonSizePx: 36,
  chatLegendFontSizePx: 17,
  historyLegendFontSizePx: 17,
  chatMessageFontSizePx: 15,
  chatMessageMetaFontSizePx: 14,
  chatMessageLineHeight: 1.56,
  chatListTitleFontSizePx: 14.4,
  chatListTitleFontWeight: 700,
};

export function getResponsiveControlMetrics(viewportMode: WorldViewportMode): ResponsiveControlMetrics {
  if (viewportMode === 'mobile') {
    return MOBILE_CONTROL_METRICS;
  }

  if (viewportMode === 'tablet') {
    return TABLET_CONTROL_METRICS;
  }

  return DESKTOP_CONTROL_METRICS;
}

export function getResponsiveControlCssVars(viewportMode: WorldViewportMode): Record<string, string> {
  const metrics = getResponsiveControlMetrics(viewportMode);

  return {
    '--interactive-control-font-size': `${metrics.controlFontSizePx}px`,
    '--interactive-control-height': `${metrics.controlHeightPx}px`,
    '--interactive-icon-button-size': `${metrics.iconButtonSizePx}px`,
    '--interactive-submit-button-size': `${metrics.submitButtonSizePx}px`,
    '--chat-legend-font-size': `${metrics.chatLegendFontSizePx}px`,
    '--history-legend-font-size': `${metrics.historyLegendFontSizePx}px`,
    '--chat-message-font-size': `${metrics.chatMessageFontSizePx}px`,
    '--chat-message-meta-font-size': `${metrics.chatMessageMetaFontSizePx}px`,
    '--chat-message-line-height': String(metrics.chatMessageLineHeight),
    '--chat-list-title-font-size': `${metrics.chatListTitleFontSizePx}px`,
    '--chat-list-title-font-weight': String(metrics.chatListTitleFontWeight),
  };
}

export function getResponsiveControlStyleAttribute(viewportMode: WorldViewportMode): string {
  return Object.entries(getResponsiveControlCssVars(viewportMode))
    .map(([name, value]) => `${name}: ${value}`)
    .join('; ');
}
