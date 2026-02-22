/**
 * SwipeCarousel – continuous world carousel with distance-based card scaling
 *
 * Layout:
 *   The track (all cards in a flex row) is absolutely positioned with
 *   `left: 50%`, then translated so that the current card's centre sits
 *   at the viewport's 50% mark:
 *
 *     translateX = -(currentIndex * CARD_SLOT + CARD_SLOT/2) + dragOffset
 *
 *   No viewport-width measurement is needed; the centring is purely
 *   arithmetic over the fixed CARD_SLOT constant.
 *
 * Card scaling:
 *   During every pointermove the fractional centre is recomputed:
 *     fractCenter = currentIndex - dragOffset / CARD_SLOT
 *   Each card's scale and opacity derive from its distance to fractCenter,
 *   so the shrink/grow transition is continuous and follows the finger.
 *
 * Snap:
 *   On pointerup, if |dragOffset| >= SNAP_THRESHOLD the index advances;
 *   otherwise it snaps back. A CSS transition animates the settle.
 *
 * Rubber-band:
 *   Dragging past the first or last card applies ÷3 resistance.
 */

import { Component } from 'apprun';
import type { World } from '../types';

interface SwipeCarouselState {
  worlds: World[];
  currentIndex: number;
  dragOffset: number;   // live px offset while dragging; 0 when idle
  isDragging: boolean;
  startX: number | null;
  startY: number | null;
}

const CARD_SLOT = 220;       // px – slot width for every card in the track
const SNAP_THRESHOLD = 60;  // px – drag distance needed to advance one slide
const VIEWPORT_H = 220;     // px – clipping viewport height

/** Scale [0.55 … 1.0] as a function of distance from centre. */
const scaleAt = (d: number) => Math.max(0.55, 1 - d * 0.18);

/** Opacity [0.4 … 1.0] as a function of distance from centre. */
const opacityAt = (d: number) => Math.max(0.4, 1 - d * 0.28);

export default class SwipeCarousel extends Component<SwipeCarouselState> {
  declare props: Readonly<{ worlds: World[] }>;

  state: SwipeCarouselState = {
    worlds: [],
    currentIndex: 0,
    dragOffset: 0,
    isDragging: false,
    startX: null,
    startY: null,
  };

  mounted = (props: { worlds: World[] }): SwipeCarouselState => ({
    ...this.state,
    worlds: props.worlds ?? [],
  });

  view = (state: SwipeCarouselState) => {
    const { worlds, currentIndex, dragOffset, isDragging } = state;
    if (!worlds.length) return <div className="swipe-carousel" />;

    const world = worlds[currentIndex];

    // Fractional centre index – moves smoothly between integers during drag
    const fractCenter = currentIndex - dragOffset / CARD_SLOT;

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
      <div className="swipe-carousel">

        {/* ── Viewport row: arrows + clipping area ── */}
        <div className="flex items-center gap-2">
          <button
            className="btn carousel-arrow swipe-carousel-arrow w-14 h-14 flex items-center justify-center text-4xl flex-shrink-0"
            $onclick="sc-prev"
          >‹</button>

          {/* Clipping viewport */}
          <div
            className="swipe-carousel-viewport"
            style={{
              position: 'relative',
              flex: '1',
              overflow: 'hidden',
              height: `${VIEWPORT_H}px`,
              touchAction: 'pan-y',
              cursor: isDragging ? 'grabbing' : 'grab',
            }}
            $onpointerdown="sc-start"
            $onpointermove="sc-move"
            $onpointerup="sc-end"
            $onpointercancel="sc-cancel"
          >
            {/* Sliding track */}
            <div style={trackStyle}>
              {worlds.map((w, i) => {
                const distance = Math.abs(i - fractCenter);
                const scale = scaleAt(distance);
                const opacity = opacityAt(distance);
                const isCenter = i === currentIndex;

                return (
                  <div
                    key={w.id || w.name}
                    style={{
                      width: `${CARD_SLOT}px`,
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0 0.4rem',
                      boxSizing: 'border-box' as const,
                    }}
                  >
                    <button
                      className={`btn world-card-btn ${isCenter ? 'btn-primary center' : 'btn-secondary side'} flex flex-col items-center justify-center w-full rounded-2xl`}
                      style={{
                        height: '180px',
                        transform: `scale(${scale})`,
                        opacity,
                        transformOrigin: 'center center',
                        transition: isDragging
                          ? 'none'
                          : 'transform 220ms ease, opacity 220ms ease',
                      }}
                      $onclick={isCenter ? ['sc-enter', w] : ['sc-goto', i]}
                    >
                      <span className="world-name text-lg font-medium">{w.name}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <button
            className="btn carousel-arrow swipe-carousel-arrow w-14 h-14 flex items-center justify-center text-4xl flex-shrink-0"
            $onclick="sc-next"
          >›</button>
        </div>

        {/* ── Indicator dots ── */}
        <div className="flex justify-center gap-2 mt-3">
          {worlds.map((w, i) => (
            <button
              key={w.id || w.name}
              className={`world-dot ${i === currentIndex ? 'active' : ''}`}
              $onclick={['sc-goto', i]}
              title={w.name}
            />
          ))}
        </div>

        {/* ── Description + action buttons ── */}
        <div className="description-card max-w-2xl mx-auto mt-6 p-6 rounded-xl shadow-md">
          <h4 className="description-title text-2xl font-bold text-center mb-4">{world.name}</h4>
          <p className="description-text text-base text-center text-text-secondary mb-6">
            {world.description || 'No description available'}
          </p>
          <div className="action-buttons flex items-center justify-center gap-4">
            <button
              className="btn add-world-btn w-12 h-12 flex items-center justify-center rounded-lg"
              title="Add New World"
              $onclick="open-world-create"
            >
              <span className="plus-icon text-2xl">+</span>
            </button>
            <a href={'/World/' + encodeURIComponent(world.id || world.name)}>
              <button className="btn btn-primary enter-btn px-8 py-3 rounded-lg text-lg">
                Enter {world.name}
              </button>
            </a>
            <button
              className="btn add-world-btn delete-world-btn w-12 h-12 flex items-center justify-center rounded-lg"
              title="Delete World"
              $onclick={['open-world-delete', world]}
            >
              <span className="plus-icon text-2xl">×</span>
            </button>
          </div>
        </div>

      </div>
    );
  };

  update = {
    'sc-start': (state: SwipeCarouselState, e: PointerEvent): SwipeCarouselState => {
      (e.target as Element | null)?.setPointerCapture?.(e.pointerId);
      return { ...state, isDragging: true, startX: e.clientX, startY: e.clientY, dragOffset: 0 };
    },

    /**
     * Update dragOffset in state on every move → triggers re-render →
     * both the track translateX and each card's scale/opacity update in real time.
     */
    'sc-move': (state: SwipeCarouselState, e: PointerEvent): SwipeCarouselState => {
      if (!state.isDragging || state.startX === null || state.startY === null) return state;
      const dx = e.clientX - state.startX;
      const dy = e.clientY - state.startY;
      if (Math.abs(dx) > Math.abs(dy)) e.preventDefault();
      const atStart = state.currentIndex === 0 && dx > 0;
      const atEnd = state.currentIndex === state.worlds.length - 1 && dx < 0;
      return { ...state, dragOffset: (atStart || atEnd) ? dx / 3 : dx };
    },

    'sc-end': (state: SwipeCarouselState, _e: PointerEvent): SwipeCarouselState => {
      if (!state.isDragging) return state;
      const { dragOffset, currentIndex, worlds } = state;

      // If the finger moved enough to count as a drag, swallow the next click
      // so the card that lands in the centre isn't accidentally entered.
      if (Math.abs(dragOffset) > 10) {
        document.addEventListener('click', (ev) => ev.stopPropagation(), {
          capture: true,
          once: true,
        });
      }

      let next = currentIndex;
      if (dragOffset < -SNAP_THRESHOLD && currentIndex < worlds.length - 1) next++;
      else if (dragOffset > SNAP_THRESHOLD && currentIndex > 0) next--;
      return { ...state, currentIndex: next, dragOffset: 0, isDragging: false, startX: null, startY: null };
    },

    'sc-cancel': (state: SwipeCarouselState): SwipeCarouselState => ({
      ...state, dragOffset: 0, isDragging: false, startX: null, startY: null,
    }),

    'sc-goto': (state: SwipeCarouselState, index: number): SwipeCarouselState => ({
      ...state, currentIndex: index, dragOffset: 0,
    }),

    'sc-prev': (state: SwipeCarouselState): SwipeCarouselState => ({
      ...state,
      currentIndex: state.currentIndex > 0 ? state.currentIndex - 1 : state.worlds.length - 1,
      dragOffset: 0,
    }),

    'sc-next': (state: SwipeCarouselState): SwipeCarouselState => ({
      ...state,
      currentIndex: state.currentIndex < state.worlds.length - 1 ? state.currentIndex + 1 : 0,
      dragOffset: 0,
    }),

    'sc-enter': (_state: SwipeCarouselState, world: World): void => {
      window.location.href = '/World/' + encodeURIComponent(world.id || world.name);
    },
  };
}
