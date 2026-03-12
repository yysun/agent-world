/**
 * Web Home Carousel Search Tests
 *
 * Purpose:
 * - Verify the home-page world search helpers narrow the carousel and keep selection stable.
 *
 * Coverage:
 * - Empty search returns all worlds.
 * - Search matches by world name or description.
 * - Search selection always recenters on the first matching world.
 * - Carousel dots shrink as the visible world count grows.
 *
 * Notes on Implementation:
 * - Exercises the exported SwipeCarousel helper functions directly for deterministic AppRun-friendly coverage.
 *
 * Recent Changes:
 * - 2026-03-11: Added wheel-navigation coverage so the home carousel can advance via scroll gestures.
 * - 2026-03-11: Re-tightened dense-row dot metrics so mobile indicators fit while inactive dots stay outline-only.
 * - 2026-03-11: Updated dot metric coverage so crowded mobile rows keep inactive indicators readable.
 * - 2026-03-11: Added regression coverage for the home-page world search flow replacing the Enter button.
 */

import { describe, expect, it } from 'vitest';

import {
  filterWorldsByQuery,
  resolveWheelNavigationStep,
  resolveWorldDotMetrics,
  resolveSearchSelectionIndex,
} from '../../web/src/components/swipe-carousel';

describe('web/swipe-carousel search', () => {
  const worlds = [
    { id: 'default-world', name: 'Default World', description: 'General sandbox' },
    { id: 'music', name: 'Music Room', description: 'Compose and jam together' },
    { id: 'dev-team', name: 'Dev Team', description: 'Ship product changes' },
  ] as any[];

  it('returns all worlds for an empty query', () => {
    expect(filterWorldsByQuery(worlds as any, '')).toEqual(worlds);
    expect(filterWorldsByQuery(worlds as any, '   ')).toEqual(worlds);
  });

  it('matches worlds by name and description', () => {
    expect(filterWorldsByQuery(worlds as any, 'music')).toEqual([worlds[1]]);
    expect(filterWorldsByQuery(worlds as any, 'product')).toEqual([worlds[2]]);
  });

  it('always recenters search results on the first matching world', () => {
    const filteredWorlds = filterWorldsByQuery(worlds as any, 'o');

    expect(resolveSearchSelectionIndex(filteredWorlds as any, worlds[0] as any)).toBe(0);
    expect(resolveSearchSelectionIndex(filteredWorlds as any, worlds[2] as any)).toBe(0);
  });

  it('shrinks dot size and spacing for longer visible world lists', () => {
    expect(resolveWorldDotMetrics(8)).toEqual({ sizePx: 12, gapPx: 8 });
    expect(resolveWorldDotMetrics(18)).toEqual({ sizePx: 8, gapPx: 5 });
    expect(resolveWorldDotMetrics(24)).toEqual({ sizePx: 7, gapPx: 4 });
    expect(resolveWorldDotMetrics(30)).toEqual({ sizePx: 6, gapPx: 3 });
  });

  it('maps dominant wheel gestures to previous and next carousel moves', () => {
    expect(resolveWheelNavigationStep(28, 4)).toBe(1);
    expect(resolveWheelNavigationStep(-32, -6)).toBe(-1);
    expect(resolveWheelNavigationStep(6, 30)).toBe(1);
    expect(resolveWheelNavigationStep(-4, -26)).toBe(-1);
  });

  it('ignores low-amplitude wheel jitter', () => {
    expect(resolveWheelNavigationStep(8, 10)).toBe(0);
    expect(resolveWheelNavigationStep(-12, 7)).toBe(0);
  });
});
