/*
 * Purpose:
 * - Render and control the Home-page world carousel with coverflow-style interactions.
 *
 * Key features:
 * - 3D fan carousel layout with drag, arrows, dot navigation, and card-open action.
 * - Inline world search that narrows the carousel, recenters on the first match, and avoids duplicate open affordances.
 * - Persists and restores the last selected world across Home page visits.
 *
 * Notes on implementation:
 * - Uses localStorage defensively (try/catch + browser checks) to avoid runtime issues.
 * - Stores both world id and name for robust restore when IDs are absent.
 *
 * Summary of recent changes:
 * - 2026-03-11: Replaced text chevrons with SVG arrow icons so the desktop carousel controls fit cleanly inside Doodle buttons.
 * - 2026-03-11: Added wheel and trackpad scroll navigation so the Home carousel can advance without dragging.
 * - 2026-03-11: Restored outline-only inactive dots and tightened dense-row sizing so mobile indicators fit again.
 * - 2026-03-11: Strengthened inactive dot sizing so mobile users can see all carousel indicators without hover.
 * - 2026-03-11: Added swipe guidance to the centered-card hint so the mobile carousel affordance is clearer.
 * - 2026-03-11: Scaled world-indicator dots to fit crowded mobile carousels without wrapping.
 * - 2026-03-11: Replaced the duplicate Enter button with inline world search, a top action row, and first-match recentering.
 * - 2026-03-11: Let CSS fully control arrow visibility so phone-sized viewports can hide carousel arrows reliably.
 * - 2026-03-11: Added stable world-dot selectors so web smoke tests can focus a specific world before asserting its actions.
 * - 2026-03-10: Added stable world-card selectors for Playwright web E2E coverage.
 * - 2026-02-26: Added last-selected-world persistence/restore on Home page.
 */

import { app, Component } from 'apprun';
import type { World } from '../types';

interface SwipeCarouselState {
  allWorlds: World[];
  currentIndex: number;
  dragOffset: number;
  isDragging: boolean;
  lastWheelAt: number;
  startX: number | null;
  startY: number | null;
  searchQuery: string;
}

interface PersistedWorldSelection {
  id: string | null;
  name: string | null;
}

// ── Layout constants ─────────────────────────────────────────────────────────
const CARD_SLOT      = 200;   // px – track slot width (determines card spacing)
const CARD_W         = 300;   // px – actual button width (wider than slot → overlap)
const CARD_H         = 180;   // px – button height (landscape rectangle)
const VIEWPORT_H     = 220;   // px – clipping viewport height
const SNAP_THRESHOLD = 50;    // px – drag needed to advance one card
const WHEEL_NAVIGATION_THRESHOLD = 18;
const WHEEL_NAVIGATION_COOLDOWN_MS = 180;

// ── 3D constants ──────────────────────────────────────────────────────────────
const PERSPECTIVE    = 900;   // px – per-card perspective distance
const ROT_PER_DIST   = 52;    // degrees of rotateY per unit distance from centre
const MAX_ROT        = 72;    // degrees – cap for distant cards
const DEPTH_PX       = 35;    // px translateZ push-back per unit distance
const PULL_PX        = 120;   // px – extra inward pull applied to 2nd+ cards
const PULL_PX_3      = 60;    // px – additional pull for 3rd+ (ghost) cards

const scaleAt   = (d: number) => Math.max(0.40, 1 - d * 0.28);
const opacityAt = (d: number) => {
  const base = Math.max(0.50, 1 - d * 0.26);
  // Sharply fade out from the 3rd card onward
  return Math.max(0.12, base - Math.max(0, d - 2) * 0.38);
};
const rotateAt  = (sd: number) =>
  Math.max(-MAX_ROT, Math.min(MAX_ROT, -sd * ROT_PER_DIST));

// Horizontal margin to centre CARD_W button inside CARD_SLOT slot
const CARD_MARGIN = (CARD_SLOT - CARD_W) / 2;  // negative → button overflows slot

const LAST_SELECTED_WORLD_STORAGE_KEY = 'agent-world-home-last-selected-world';

function toNonEmptyString(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

function readPersistedWorldSelection(): PersistedWorldSelection | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(LAST_SELECTED_WORLD_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as PersistedWorldSelection | string | null;
    if (typeof parsed === 'string') {
      return { id: null, name: toNonEmptyString(parsed) };
    }

    if (parsed && typeof parsed === 'object') {
      return {
        id: toNonEmptyString(parsed.id),
        name: toNonEmptyString(parsed.name),
      };
    }
  } catch {
    return null;
  }

  return null;
}

function persistWorldSelection(world: World | undefined): void {
  if (!world || typeof window === 'undefined' || !window.localStorage) {
    return;
  }

  const selection: PersistedWorldSelection = {
    id: toNonEmptyString(world.id),
    name: toNonEmptyString(world.name),
  };

  if (!selection.id && !selection.name) {
    return;
  }

  try {
    window.localStorage.setItem(LAST_SELECTED_WORLD_STORAGE_KEY, JSON.stringify(selection));
  } catch {
    // Ignore storage failures; carousel interaction should continue without persistence.
  }
}

function resolveInitialWorldIndex(worlds: World[], persistedSelection: PersistedWorldSelection | null): number {
  if (!worlds.length || !persistedSelection) {
    return 0;
  }

  if (persistedSelection.id) {
    const idMatchIndex = worlds.findIndex((world) => toNonEmptyString(world.id) === persistedSelection.id);
    if (idMatchIndex >= 0) {
      return idMatchIndex;
    }
  }

  if (persistedSelection.name) {
    const nameMatchIndex = worlds.findIndex((world) => toNonEmptyString(world.name) === persistedSelection.name);
    if (nameMatchIndex >= 0) {
      return nameMatchIndex;
    }
  }

  return 0;
}

export function filterWorldsByQuery(worlds: World[], query: string): World[] {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (!normalizedQuery) {
    return worlds;
  }

  return worlds.filter((world) => {
    const name = String(world?.name || '').toLowerCase();
    const description = String(world?.description || '').toLowerCase();
    return name.includes(normalizedQuery) || description.includes(normalizedQuery);
  });
}

export function resolveSearchSelectionIndex(
  filteredWorlds: World[],
  _currentWorld: World | undefined,
): number {
  if (!filteredWorlds.length) {
    return 0;
  }
  return 0;
}

export function resolveWorldDotMetrics(worldCount: number): { sizePx: number; gapPx: number } {
  if (worldCount <= 10) {
    return { sizePx: 12, gapPx: 8 };
  }

  if (worldCount <= 14) {
    return { sizePx: 10, gapPx: 6 };
  }

  if (worldCount <= 18) {
    return { sizePx: 8, gapPx: 5 };
  }

  if (worldCount <= 24) {
    return { sizePx: 7, gapPx: 4 };
  }

  return { sizePx: 6, gapPx: 3 };
}

export function resolveWheelNavigationStep(deltaX: number, deltaY: number): -1 | 0 | 1 {
  const dominantDelta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
  if (Math.abs(dominantDelta) < WHEEL_NAVIGATION_THRESHOLD) {
    return 0;
  }

  return dominantDelta > 0 ? 1 : -1;
}

function getVisibleWorlds(state: SwipeCarouselState): World[] {
  return filterWorldsByQuery(state.allWorlds, state.searchQuery);
}

function getVisibleWorldSignature(worlds: World[]): string {
  return worlds.map((world) => toNonEmptyString(world.id) || toNonEmptyString(world.name) || 'world').join('|');
}

function getSelectedVisibleWorld(state: SwipeCarouselState): World | undefined {
  const visibleWorlds = getVisibleWorlds(state);
  if (!visibleWorlds.length) {
    return undefined;
  }

  return visibleWorlds[state.currentIndex] || visibleWorlds[0];
}

function updateSelectedIndex(state: SwipeCarouselState, nextIndex: number): SwipeCarouselState {
  const visibleWorlds = getVisibleWorlds(state);
  if (!visibleWorlds.length) {
    return { ...state, currentIndex: 0, dragOffset: 0 };
  }

  const boundedIndex = Math.max(0, Math.min(visibleWorlds.length - 1, nextIndex));
  persistWorldSelection(visibleWorlds[boundedIndex]);
  return {
    ...state,
    currentIndex: boundedIndex,
    dragOffset: 0,
  };
}

export default class SwipeCarousel extends Component<SwipeCarouselState> {

  is_global_event = () => true;
  
  declare props: Readonly<{ worlds: World[] }>;

  state: SwipeCarouselState = {
    allWorlds: [],
    currentIndex: 0,
    dragOffset: 0,
    isDragging: false,
    lastWheelAt: 0,
    startX: null,
    startY: null,
    searchQuery: '',
  };

  mounted = (props: { worlds: World[] }): SwipeCarouselState => {
    const worlds = props.worlds ?? [];
    const initialIndex = resolveInitialWorldIndex(worlds, readPersistedWorldSelection());
    return {
      ...this.state,
      allWorlds: worlds,
      currentIndex: initialIndex,
    };
  };

  view = (state: SwipeCarouselState) => {
    const { currentIndex, dragOffset, isDragging, searchQuery } = state;
    const worlds = getVisibleWorlds(state);
    if (!state.allWorlds.length) return <div className="swipe-carousel" />;

    const hasSearchResults = worlds.length > 0;
    const world = hasSearchResults ? worlds[currentIndex] || worlds[0] : null;
    const fractCenter = hasSearchResults ? currentIndex - dragOffset / CARD_SLOT : 0;
    const visibleWorldSignature = getVisibleWorldSignature(worlds);
    const trackRenderKey = `track:${visibleWorldSignature}:${currentIndex}`;
    const dotRenderKey = `dots:${visibleWorldSignature}:${currentIndex}`;
    const dotMetrics = resolveWorldDotMetrics(worlds.length);
    const dotRowStyle = {
      gap: `${dotMetrics.gapPx}px`,
    };

    const searchControls = (
      <>
        <div className="home-world-action-row">
          <button
            className="btn add-world-btn w-12 h-12 flex items-center justify-center rounded-lg"
            title="Add New World"
            $onclick="open-world-create"
            data-testid="world-create"
          >
            <span className="plus-icon text-2xl">+</span>
          </button>
          {world ? (
            <button
              className="btn add-world-btn delete-world-btn w-12 h-12 flex items-center justify-center rounded-lg"
              title="Delete World"
              $onclick={['open-world-delete', world]}
              data-testid={`delete-world-${world.id || world.name}`}
            >
              <span className="plus-icon text-2xl">×</span>
            </button>
          ) : null}
        </div>
        <div className="home-world-search-row">
          <input
            type="text"
            className="world-search-input"
            placeholder="Search worlds..."
            value={searchQuery}
            $oninput="sc-search"
            $onkeydown="sc-search-keydown"
            data-testid="world-search"
          />
        </div>
      </>
    );

    // Track: left edge at viewport 50%, then pulled left to centre current card
    const trackStyle = {
      position: 'absolute' as const,
      left: '50%',
      top: 0,
      bottom: 0,
      display: 'flex',
      alignItems: 'center',
      transform: `translateX(calc(${-(currentIndex * CARD_SLOT + CARD_SLOT / 2)}px + ${dragOffset}px))`,
      transition: isDragging ? 'none' : 'transform 220ms ease',
      willChange: 'transform',
      userSelect: 'none' as const,
    };

    return (
      <div className="swipe-carousel" data-testid="world-carousel">

        {/* ── Viewport + overlay arrows ── */}
        <div style={{ position: 'relative', width: '100%' }}>

          {/* Clipping viewport */}
          <div
            className="swipe-carousel-viewport"
            style={{
              position: 'relative',
              width: '100%',
              overflow: 'hidden',
              height: `${VIEWPORT_H}px`,
              touchAction: 'pan-y',
              cursor: isDragging ? 'grabbing' : 'grab',
            }}
            $onpointerdown="sc-start"
            $onpointermove="sc-move"
            $onpointerup="sc-end"
            $onpointercancel="sc-cancel"
            $onwheel="sc-wheel"
          >
            {hasSearchResults ? (
              <div key={trackRenderKey} style={trackStyle}>
                {worlds.map((w, i) => {
                  const signedDist = i - fractCenter;
                  const absDist    = Math.abs(signedDist);
                  const rotation   = rotateAt(signedDist);
                  const tz         = -absDist * DEPTH_PX;
                  const scale      = scaleAt(absDist);
                  const opacity    = opacityAt(absDist);
                  const zIndex     = Math.round(100 - absDist * 10);
                  const isCenter   = i === currentIndex;

                  // Pull 2nd+ cards inward; ghost (3rd+) cards get extra pull
                  const pullIn = -Math.sign(signedDist) * (
                    Math.max(0, absDist - 1) * PULL_PX +
                    Math.max(0, absDist - 2) * PULL_PX_3
                  );
                  const cardTransform =
                    `translateX(${pullIn}px) perspective(${PERSPECTIVE}px) rotateY(${rotation}deg) translateZ(${tz}px) scale(${scale})`;

                  return (
                    <div
                      key={w.id || w.name}
                      style={{
                        width: `${CARD_SLOT}px`,
                        flexShrink: 0,
                        position: 'relative' as const,
                        overflow: 'visible' as const,
                        zIndex,
                      }}
                    >
                      <button
                        className={`btn world-card-btn ${isCenter ? 'btn-primary center' : 'btn-secondary side'} flex flex-col items-center justify-center rounded-xl`}
                        data-testid={`world-card-${w.id || w.name}`}
                        data-world-id={w.id || ''}
                        style={{
                          width: `${CARD_W}px`,
                          height: `${CARD_H}px`,
                          marginLeft: `${CARD_MARGIN}px`,
                          display: 'flex',
                          transform: cardTransform,
                          opacity,
                          transformOrigin: 'center center',
                          transition: isDragging
                            ? 'none'
                            : 'transform 220ms ease, opacity 220ms ease',
                        }}
                        $onclick={isCenter ? ['sc-enter', w] : ['sc-goto', i]}
                      >
                        <span className="world-name text-3xl font-bold">{w.name}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="world-search-empty-state" data-testid="world-search-empty">
                <p>No worlds match "{searchQuery.trim()}".</p>
                <p>Try another search or create a new world.</p>
              </div>
            )}
          </div>

          {/* Overlay arrows (hidden on mobile via CSS) */}
          {hasSearchResults && worlds.length > 1 ? (
            <>
              <button
                className="btn carousel-arrow swipe-carousel-arrow"
                style={{
                  position: 'absolute',
                  left: '0.25rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  zIndex: 200,
                  width: '2.5rem',
                  height: '2.5rem',
                  fontSize: '1.1rem',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                }}
                $onclick="sc-prev"
                aria-label="Previous world"
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  focusable="false"
                  className="carousel-arrow-icon"
                >
                  <path
                    d="M14.5 6 8.5 12l6 6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

              <button
                className="btn carousel-arrow swipe-carousel-arrow"
                style={{
                  position: 'absolute',
                  right: '0.25rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  zIndex: 200,
                  width: '2.5rem',
                  height: '2.5rem',
                  fontSize: '1.1rem',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                }}
                $onclick="sc-next"
                aria-label="Next world"
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  focusable="false"
                  className="carousel-arrow-icon"
                >
                  <path
                    d="m9.5 6 6 6-6 6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </>
          ) : null}
        </div>

        {/* ── Indicator dots ── */}
        {hasSearchResults ? (
          <div key={dotRenderKey} className="world-dot-row" style={dotRowStyle}>
            {worlds.map((w, i) => (
              <button
                key={w.id || w.name}
                className={`world-dot ${i === currentIndex ? 'active' : ''}`}
                style={{ width: `${dotMetrics.sizePx}px`, height: `${dotMetrics.sizePx}px` }}
                $onclick={['sc-goto', i]}
                title={w.name}
                data-testid={`world-dot-${w.id || w.name}`}
              />
            ))}
          </div>
        ) : null}

        {/* ── Description + action buttons ── */}
        <div className="description-card max-w-2xl mx-auto mt-6 p-6 rounded-xl shadow-md">
          {world ? (
            <>
              <h4 className="description-title text-2xl font-bold text-center mb-4">{world.name}</h4>
              <p className="description-text text-base text-center text-text-secondary mb-6">
                {world.description || 'No description available'}
              </p>
              {searchControls}
              <p className="world-open-hint" data-testid="world-open-hint">
                Swipe to browse, then select the centered card to open this world.
              </p>
            </>
          ) : (
            <>
              <h4 className="description-title text-2xl font-bold text-center mb-4">Find a world</h4>
              <p className="description-text text-base text-center text-text-secondary mb-6">
                Search by world name or description to narrow the carousel.
              </p>
              {searchControls}
            </>
          )}
        </div>

      </div>
    );
  };

  update = {
    'sc-start': (state: SwipeCarouselState, e: PointerEvent): SwipeCarouselState => {
      (e.target as Element | null)?.setPointerCapture?.(e.pointerId);
      return { ...state, isDragging: true, startX: e.clientX, startY: e.clientY, dragOffset: 0 };
    },

    'sc-move': (state: SwipeCarouselState, e: PointerEvent): SwipeCarouselState => {
      if (!state.isDragging || state.startX === null || state.startY === null) return state;
      const visibleWorlds = getVisibleWorlds(state);
      const dx = e.clientX - state.startX;
      const dy = e.clientY - state.startY;
      if (Math.abs(dx) > Math.abs(dy)) e.preventDefault();
      const atStart = state.currentIndex === 0 && dx > 0;
      const atEnd   = state.currentIndex === visibleWorlds.length - 1 && dx < 0;
      return { ...state, dragOffset: (atStart || atEnd) ? dx / 3 : dx };
    },

    'sc-end': (state: SwipeCarouselState, _e: PointerEvent): SwipeCarouselState => {
      if (!state.isDragging) return state;
      const visibleWorlds = getVisibleWorlds(state);
      const { dragOffset, currentIndex } = state;

      // Swallow the post-drag click so the newly centred card isn't entered
      if (Math.abs(dragOffset) > 10) {
        document.addEventListener('click', (ev) => ev.stopPropagation(), {
          capture: true,
          once: true,
        });
      }

      let next = currentIndex;
      if (dragOffset < -SNAP_THRESHOLD && currentIndex < visibleWorlds.length - 1) next++;
      else if (dragOffset > SNAP_THRESHOLD && currentIndex > 0) next--;
      return {
        ...updateSelectedIndex(state, next),
        isDragging: false,
        startX: null,
        startY: null,
      };
    },

    'sc-cancel': (state: SwipeCarouselState): SwipeCarouselState => ({
      ...state, dragOffset: 0, isDragging: false, startX: null, startY: null,
    }),

    'sc-wheel': (state: SwipeCarouselState, event: WheelEvent): SwipeCarouselState => {
      const visibleWorlds = getVisibleWorlds(state);
      if (visibleWorlds.length <= 1) {
        return state;
      }

      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) {
        return state;
      }

      const step = resolveWheelNavigationStep(event.deltaX, event.deltaY);
      if (!step) {
        return state;
      }

      const eventTime = Number.isFinite(event.timeStamp) ? event.timeStamp : 0;
      if (eventTime - state.lastWheelAt < WHEEL_NAVIGATION_COOLDOWN_MS) {
        event.preventDefault();
        return state;
      }

      event.preventDefault();
      const nextIndex = Math.max(0, Math.min(visibleWorlds.length - 1, state.currentIndex + step));
      return {
        ...updateSelectedIndex(state, nextIndex),
        lastWheelAt: eventTime,
      };
    },

    'sc-goto': (state: SwipeCarouselState, index: number): SwipeCarouselState =>
      updateSelectedIndex(state, index),

    'sc-prev': (state: SwipeCarouselState): SwipeCarouselState =>
      updateSelectedIndex(
        state,
        state.currentIndex > 0 ? state.currentIndex - 1 : getVisibleWorlds(state).length - 1
      ),

    'sc-next': (state: SwipeCarouselState): SwipeCarouselState =>
      updateSelectedIndex(
        state,
        state.currentIndex < getVisibleWorlds(state).length - 1 ? state.currentIndex + 1 : 0
      ),

    'sc-enter': (_state: SwipeCarouselState, world: World): void => {
      persistWorldSelection(world);
      window.location.href = '/World/' + encodeURIComponent(world.id || world.name);
    },

    'sc-search': (state: SwipeCarouselState, event: Event): SwipeCarouselState => {
      const nextQuery = String((event.target as HTMLInputElement | null)?.value || '');
      const nextVisibleWorlds = filterWorldsByQuery(state.allWorlds, nextQuery);
      const nextIndex = resolveSearchSelectionIndex(nextVisibleWorlds, getSelectedVisibleWorld(state));

      return {
        ...state,
        searchQuery: nextQuery,
        currentIndex: nextIndex,
        dragOffset: 0,
      };
    },

    'sc-search-keydown': (state: SwipeCarouselState, event: KeyboardEvent): SwipeCarouselState | void => {
      if (event.key === 'Escape' && state.searchQuery) {
        return {
          ...state,
          searchQuery: '',
          currentIndex: resolveInitialWorldIndex(state.allWorlds, readPersistedWorldSelection()),
          dragOffset: 0,
        };
      }

      if (event.key !== 'Enter') {
        return state;
      }

      const world = getSelectedVisibleWorld(state);
      if (!world) {
        return state;
      }

      event.preventDefault();
      persistWorldSelection(world);
      window.location.href = '/World/' + encodeURIComponent(world.id || world.name);
    },
  };
}
