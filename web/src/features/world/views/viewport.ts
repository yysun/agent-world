/**
 * Purpose:
 * - Centralize World page viewport and responsive layout helpers in the feature view layer.
 *
 * Key Features:
 * - Resolves viewport mode, right-panel responsiveness, and agent-strip CSS variables.
 * - Provides a shared import surface for the World route and route-local UI handlers.
 *
 * Notes on Implementation:
 * - Extracted from the World route so route UI logic can share the same responsive rules.
 *
 * Summary of Recent Changes:
 * - 2026-03-24: Added World viewport helpers to the feature view layer.
 */

import type { WorldViewportMode } from '../../../types';

const DESKTOP_PANEL_BREAKPOINT = 1024;
const TABLET_PANEL_BREAKPOINT = 768;

export function getViewportMode(width: number): WorldViewportMode {
  if (width >= DESKTOP_PANEL_BREAKPOINT) return 'desktop';
  if (width >= TABLET_PANEL_BREAKPOINT) return 'tablet';
  return 'mobile';
}

export function getInitialViewportMode(): WorldViewportMode {
  if (typeof window === 'undefined') return 'desktop';
  return getViewportMode(window.innerWidth);
}

export function resolveRightPanelViewportMode(
  currentViewportMode: WorldViewportMode,
  measuredWidth?: number,
): WorldViewportMode {
  const width = Number(measuredWidth);
  if (Number.isFinite(width) && width > 0) {
    return getViewportMode(width);
  }

  if (typeof window !== 'undefined' && Number.isFinite(window.innerWidth) && window.innerWidth > 0) {
    return getViewportMode(window.innerWidth);
  }

  return currentViewportMode;
}

export function getAgentStripCssVars(viewportMode: WorldViewportMode): Record<string, string> {
  if (viewportMode === 'mobile') {
    return {
      '--world-page-padding-top': '0.2rem',
      '--agent-strip-gap': '0.75rem',
      '--agent-strip-side-padding': '0.35rem',
      '--agent-strip-top-padding': '0.3rem',
      '--agent-strip-item-padding-x': '0.5rem',
      '--agent-strip-sprite-size': '3.25rem',
      '--world-top-row-min-height': '4.35rem',
      '--world-top-row-section-padding-y': '0.35rem',
      '--world-top-action-button-size': '2.15rem',
    };
  }

  if (viewportMode === 'tablet') {
    return {
      '--world-page-padding-top': '0.2rem',
      '--agent-strip-gap': '0.85rem',
      '--agent-strip-side-padding': '0.45rem',
      '--agent-strip-top-padding': '0.32rem',
      '--agent-strip-item-padding-x': '0.55rem',
      '--agent-strip-sprite-size': '3.35rem',
      '--world-top-row-min-height': '4.5rem',
      '--world-top-row-section-padding-y': '0.4rem',
      '--world-top-action-button-size': '2.2rem',
    };
  }

  return {
    '--world-page-padding-top': '0.2rem',
    '--agent-strip-gap': '0.95rem',
    '--agent-strip-side-padding': '0.55rem',
    '--agent-strip-top-padding': '0.35rem',
    '--agent-strip-item-padding-x': '0.6rem',
    '--agent-strip-sprite-size': '3.5rem',
    '--world-top-row-min-height': '4.75rem',
    '--world-top-row-section-padding-y': '0.45rem',
    '--world-top-action-button-size': '2.3rem',
  };
}

export function getAgentStripStyleAttribute(viewportMode: WorldViewportMode): string {
  return Object.entries(getAgentStripCssVars(viewportMode))
    .map(([name, value]) => `${name}: ${value}`)
    .join('; ');
}