/**
 * SwipeCarousel – coverflow-style 3D fan carousel
 *
 * Visual design (matches reference image):
 *   - Center card: large portrait rectangle, faces flat toward viewer.
 *   - Side cards: rotateY fans them out left/right; they overlap the center
 *     card because each button (CARD_W wide) is wider than its track slot
 *     (CARD_SLOT wide). overflow:visible + zIndex keeps center on top.
 *   - Outer cards: rotated even more steeply, lower opacity.
 *
 * 3D per-card formula (all continuous during drag):
 *   fractCenter  = currentIndex − dragOffset / CARD_SLOT
 *   signedDist   = i − fractCenter
 *   rotateY      = clamp(±MAX_ROT, −signedDist × ROT_PER_DIST)
 *   translateZ   = −|signedDist| × DEPTH_PX
 *   scale        = max(0.70, 1 − |d| × 0.14)
 *   opacity      = max(0.50, 1 − |d| × 0.26)
 *   zIndex       = 100 − round(|d| × 10)
 *
 * Drag-vs-tap:
 *   After any drag > 10 px a one-shot capture click listener is installed
 *   to swallow the post-pointerup click so the newly centred card is not
 *   accidentally entered.
 */

import { app, Component } from 'apprun';
import type { World } from '../types';

interface SwipeCarouselState {
  worlds: World[];
  currentIndex: number;
  dragOffset: number;
  isDragging: boolean;
  startX: number | null;
  startY: number | null;
}

// ── Layout constants ─────────────────────────────────────────────────────────
const CARD_SLOT      = 200;   // px – track slot width (determines card spacing)
const CARD_W         = 300;   // px – actual button width (wider than slot → overlap)
const CARD_H         = 180;   // px – button height (landscape rectangle)
const VIEWPORT_H     = 220;   // px – clipping viewport height
const SNAP_THRESHOLD = 50;    // px – drag needed to advance one card

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
          >
            {/* Sliding track */}
            <div style={trackStyle}>
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
          </div>

          {/* Overlay arrows (hidden on mobile via CSS) */}
          <button
            className="btn carousel-arrow swipe-carousel-arrow"
            style={{
              position: 'absolute',
              left: '0.25rem',
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 200,
              width: '1.75rem',
              height: '1.75rem',
              fontSize: '1.1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
            }}
            $onclick="sc-prev"
          >‹</button>

          <button
            className="btn carousel-arrow swipe-carousel-arrow"
            style={{
              position: 'absolute',
              right: '0.25rem',
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 200,
              width: '1.75rem',
              height: '1.75rem',
              fontSize: '1.1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
            }}
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

    'sc-move': (state: SwipeCarouselState, e: PointerEvent): SwipeCarouselState => {
      if (!state.isDragging || state.startX === null || state.startY === null) return state;
      const dx = e.clientX - state.startX;
      const dy = e.clientY - state.startY;
      if (Math.abs(dx) > Math.abs(dy)) e.preventDefault();
      const atStart = state.currentIndex === 0 && dx > 0;
      const atEnd   = state.currentIndex === state.worlds.length - 1 && dx < 0;
      return { ...state, dragOffset: (atStart || atEnd) ? dx / 3 : dx };
    },

    'sc-end': (state: SwipeCarouselState, _e: PointerEvent): SwipeCarouselState => {
      if (!state.isDragging) return state;
      const { dragOffset, currentIndex, worlds } = state;

      // Swallow the post-drag click so the newly centred card isn't entered
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
