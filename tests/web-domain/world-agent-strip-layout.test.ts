/**
 * World Agent Strip Layout Tests
 *
 * Purpose:
 * - Verify the responsive spacing contract for the world-page top agent strip.
 *
 * Coverage:
 * - Mobile agent strip uses tighter gap and side padding for one-line scrolling.
 * - Desktop agent strip keeps wider spacing for larger viewports.
 * - Style attribute serialization exposes the CSS vars consumed by the world page.
 *
 * Notes:
 * - Tests the public World-page layout helpers directly for deterministic coverage.
 *
 * Recent Changes:
 * - 2026-03-11: Added shared top-row size token coverage so the world agent strip compresses without clipping badges.
 * - 2026-03-11: Added regression coverage for the single-row scrollable top agent strip.
 */

import { describe, expect, it } from 'vitest';

import {
  getAgentStripCssVars,
  getAgentStripStyleAttribute,
} from '../../web/src/pages/World';

describe('web/world agent strip layout', () => {
  it('uses tighter spacing vars on mobile to preserve a single scrollable row', () => {
    expect(getAgentStripCssVars('mobile')).toEqual({
      '--world-page-padding-top': '0.2rem',
      '--agent-strip-gap': '0.75rem',
      '--agent-strip-side-padding': '0.35rem',
      '--agent-strip-top-padding': '0.3rem',
      '--agent-strip-item-padding-x': '0.5rem',
      '--agent-strip-sprite-size': '3.25rem',
      '--world-top-row-min-height': '4.35rem',
      '--world-top-row-section-padding-y': '0.35rem',
      '--world-top-action-button-size': '2.15rem',
    });
  });

  it('keeps wider spacing vars on desktop layouts', () => {
    expect(getAgentStripCssVars('desktop')).toEqual({
      '--world-page-padding-top': '0.2rem',
      '--agent-strip-gap': '0.95rem',
      '--agent-strip-side-padding': '0.55rem',
      '--agent-strip-top-padding': '0.35rem',
      '--agent-strip-item-padding-x': '0.6rem',
      '--agent-strip-sprite-size': '3.5rem',
      '--world-top-row-min-height': '4.75rem',
      '--world-top-row-section-padding-y': '0.45rem',
      '--world-top-action-button-size': '2.3rem',
    });
  });

  it('serializes the strip spacing vars for inline style usage', () => {
    expect(getAgentStripStyleAttribute('tablet')).toContain('--world-page-padding-top: 0.2rem');
    expect(getAgentStripStyleAttribute('tablet')).toContain('--agent-strip-gap: 0.85rem');
    expect(getAgentStripStyleAttribute('tablet')).toContain('--agent-strip-side-padding: 0.45rem');
    expect(getAgentStripStyleAttribute('tablet')).toContain('--agent-strip-top-padding: 0.32rem');
    expect(getAgentStripStyleAttribute('tablet')).toContain('--agent-strip-sprite-size: 3.35rem');
    expect(getAgentStripStyleAttribute('tablet')).toContain('--world-top-row-min-height: 4.5rem');
  });
});
