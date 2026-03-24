/*
 * Purpose:
 * - Render and control the Home-feature world carousel with coverflow-style interactions.
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
 * - 2026-03-24: Moved the carousel implementation into the Home feature to satisfy tightened feature ownership rules.
 */

import { app, Component } from 'apprun';
import { ActionButton, IconActionButton, TextInputControl } from '../../../patterns';
import type { World } from '../../../types';

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

const CARD_SLOT = 200;
const CARD_W = 300;
const CARD_H = 180;
const VIEWPORT_H = 220;
const SNAP_THRESHOLD = 50;
const WHEEL_NAVIGATION_THRESHOLD = 18;
const WHEEL_NAVIGATION_COOLDOWN_MS = 180;

const PERSPECTIVE = 900;
const ROT_PER_DIST = 52;
const MAX_ROT = 72;
const DEPTH_PX = 35;
const PULL_PX = 120;
const PULL_PX_3 = 60;

const scaleAt = (distance: number) => Math.max(0.40, 1 - distance * 0.28);
const opacityAt = (distance: number) => {
  const base = Math.max(0.50, 1 - distance * 0.26);
  return Math.max(0.12, base - Math.max(0, distance - 2) * 0.38);
};
const rotateAt = (signedDistance: number) =>
  Math.max(-MAX_ROT, Math.min(MAX_ROT, -signedDistance * ROT_PER_DIST));

const CARD_MARGIN = (CARD_SLOT - CARD_W) / 2;

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

export function resolveSearchSelectionIndex(filteredWorlds: World[], _currentWorld: World | undefined): number {
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

function clampIndex(index: number, worlds: World[]): number {
  if (!worlds.length) {
    return 0;
  }

  return Math.max(0, Math.min(worlds.length - 1, index));
}

function resolveNextIndex(state: SwipeCarouselState, delta: -1 | 1): number {
  const visibleWorlds = getVisibleWorlds(state);
  return clampIndex(state.currentIndex + delta, visibleWorlds);
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
          <IconActionButton
            className="btn add-world-btn w-12 h-12 flex items-center justify-center rounded-lg"
            title="Add New World"
            $onclick="open-world-create"
            data-testid="world-create"
            label={<span className="plus-icon text-2xl">+</span>}
          />
          {world ? (
            <IconActionButton
              className="btn add-world-btn delete-world-btn w-12 h-12 flex items-center justify-center rounded-lg"
              title="Delete World"
              $onclick={['open-world-delete', world]}
              data-testid={`delete-world-${world.id || world.name}`}
              label={<span className="plus-icon text-2xl">x</span>}
            />
          ) : null}
        </div>
        <div className="home-world-search-row">
          <TextInputControl
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
        <div style={{ position: 'relative', width: '100%' }}>
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
                {worlds.map((currentWorld, index) => {
                  const signedDistance = index - fractCenter;
                  const absDistance = Math.abs(signedDistance);
                  const rotation = rotateAt(signedDistance);
                  const translateZ = -absDistance * DEPTH_PX;
                  const scale = scaleAt(absDistance);
                  const opacity = opacityAt(absDistance);
                  const zIndex = Math.round(100 - absDistance * 10);
                  const isCenter = index === currentIndex;
                  const pullIn = -Math.sign(signedDistance) * (
                    Math.max(0, absDistance - 1) * PULL_PX +
                    Math.max(0, absDistance - 2) * PULL_PX_3
                  );
                  const cardTransform =
                    `translateX(${pullIn}px) perspective(${PERSPECTIVE}px) rotateY(${rotation}deg) translateZ(${translateZ}px) scale(${scale})`;

                  return (
                    <div
                      key={currentWorld.id || currentWorld.name}
                      style={{
                        width: `${CARD_SLOT}px`,
                        flexShrink: 0,
                        position: 'relative' as const,
                        overflow: 'visible' as const,
                        zIndex,
                      }}
                    >
                      <ActionButton
                        className={`btn world-card-btn ${isCenter ? 'btn-primary center' : 'btn-secondary side'} flex flex-col items-center justify-center rounded-xl`}
                        data-testid={`world-card-${currentWorld.id || currentWorld.name}`}
                        data-world-id={currentWorld.id || ''}
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
                        $onclick={isCenter ? ['sc-enter', currentWorld] : ['sc-goto', index]}
                      >
                        <span className="world-name text-3xl font-bold">{currentWorld.name}</span>
                      </ActionButton>
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

          {hasSearchResults && worlds.length > 1 ? (
            <>
              <IconActionButton
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
                icon={(
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="carousel-arrow-icon">
                    <path
                      d="M14.5 6 8.5 12l6 6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              />

              <IconActionButton
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
                icon={(
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="carousel-arrow-icon">
                    <path
                      d="m9.5 6 6 6-6 6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              />
            </>
          ) : null}
        </div>

        {hasSearchResults ? (
          <div key={dotRenderKey} className="world-dot-row" style={dotRowStyle}>
            {worlds.map((currentWorld, index) => (
              <ActionButton
                key={currentWorld.id || currentWorld.name}
                className={`world-dot ${index === currentIndex ? 'active' : ''}`}
                style={{ width: `${dotMetrics.sizePx}px`, height: `${dotMetrics.sizePx}px` }}
                $onclick={['sc-goto', index]}
                title={currentWorld.name}
                data-testid={`world-dot-${currentWorld.id || currentWorld.name}`}
              />
            ))}
          </div>
        ) : null}

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
    'sc-start': (state: SwipeCarouselState, event: PointerEvent): SwipeCarouselState => {
      (event.target as Element | null)?.setPointerCapture?.(event.pointerId);
      return {
        ...state,
        isDragging: true,
        dragOffset: 0,
        startX: event.clientX,
        startY: event.clientY,
      };
    },

    'sc-move': (state: SwipeCarouselState, event: PointerEvent): SwipeCarouselState => {
      if (!state.isDragging || state.startX === null) {
        return state;
      }

      return {
        ...state,
        dragOffset: event.clientX - state.startX,
      };
    },

    'sc-end': (state: SwipeCarouselState): SwipeCarouselState => {
      const visibleWorlds = getVisibleWorlds(state);
      if (!state.isDragging || !visibleWorlds.length) {
        return { ...state, isDragging: false, dragOffset: 0, startX: null, startY: null };
      }

      let nextIndex = state.currentIndex;
      if (state.dragOffset >= SNAP_THRESHOLD) {
        nextIndex = clampIndex(state.currentIndex - 1, visibleWorlds);
      } else if (state.dragOffset <= -SNAP_THRESHOLD) {
        nextIndex = clampIndex(state.currentIndex + 1, visibleWorlds);
      }

      const selectedWorld = visibleWorlds[nextIndex] || visibleWorlds[0];
      persistWorldSelection(selectedWorld);

      return {
        ...state,
        currentIndex: nextIndex,
        dragOffset: 0,
        isDragging: false,
        startX: null,
        startY: null,
      };
    },

    'sc-cancel': (state: SwipeCarouselState): SwipeCarouselState => ({
      ...state,
      dragOffset: 0,
      isDragging: false,
      startX: null,
      startY: null,
    }),

    'sc-prev': (state: SwipeCarouselState): SwipeCarouselState => {
      const visibleWorlds = getVisibleWorlds(state);
      const nextIndex = clampIndex(state.currentIndex - 1, visibleWorlds);
      persistWorldSelection(visibleWorlds[nextIndex]);
      return { ...state, currentIndex: nextIndex };
    },

    'sc-next': (state: SwipeCarouselState): SwipeCarouselState => {
      const visibleWorlds = getVisibleWorlds(state);
      const nextIndex = clampIndex(state.currentIndex + 1, visibleWorlds);
      persistWorldSelection(visibleWorlds[nextIndex]);
      return { ...state, currentIndex: nextIndex };
    },

    'sc-goto': (state: SwipeCarouselState, index: number): SwipeCarouselState => {
      const visibleWorlds = getVisibleWorlds(state);
      const nextIndex = clampIndex(index, visibleWorlds);
      persistWorldSelection(visibleWorlds[nextIndex]);
      return { ...state, currentIndex: nextIndex };
    },

    'sc-enter': (_state: SwipeCarouselState, world: World): SwipeCarouselState => {
      persistWorldSelection(world);
      window.location.href = `/World/${encodeURIComponent(world.name)}`;
      return _state;
    },

    'sc-search': (state: SwipeCarouselState, event: Event): SwipeCarouselState => {
      const searchQuery = (event.target as HTMLInputElement | null)?.value || '';
      const visibleWorlds = filterWorldsByQuery(state.allWorlds, searchQuery);
      const currentWorld = getSelectedVisibleWorld(state);
      const currentIndex = resolveSearchSelectionIndex(visibleWorlds, currentWorld);

      return {
        ...state,
        searchQuery,
        currentIndex,
      };
    },

    'sc-search-keydown': (state: SwipeCarouselState, event: KeyboardEvent): SwipeCarouselState => {
      if (event.key !== 'Enter') {
        return state;
      }

      event.preventDefault();
      const visibleWorlds = getVisibleWorlds(state);
      const selectedWorld = visibleWorlds[state.currentIndex] || visibleWorlds[0];
      if (selectedWorld) {
        persistWorldSelection(selectedWorld);
        window.location.href = `/World/${encodeURIComponent(selectedWorld.name)}`;
      }
      return state;
    },

    'sc-wheel': (state: SwipeCarouselState, event: WheelEvent): SwipeCarouselState => {
      const now = Date.now();
      if (now - state.lastWheelAt < WHEEL_NAVIGATION_COOLDOWN_MS) {
        return state;
      }

      const step = resolveWheelNavigationStep(event.deltaX, event.deltaY);
      if (step === 0) {
        return state;
      }

      event.preventDefault();
      const visibleWorlds = getVisibleWorlds(state);
      const nextIndex = resolveNextIndex(state, step);
      persistWorldSelection(visibleWorlds[nextIndex]);
      return {
        ...state,
        currentIndex: nextIndex,
        lastWheelAt: now,
      };
    },
  };
}