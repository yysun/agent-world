/**
 * Purpose:
 * - Re-export Home feature view modules.
 *
 * Key Features:
 * - Provides stable feature-layer imports for Home page composition.
 *
 * Notes on Implementation:
 * - Keeps Home-specific view ownership out of the route entry file.
 *
 * Summary of Recent Changes:
 * - 2026-03-24: Added Home feature view barrel exports.
 */

export { HomePageView } from './home-page-view';
export type { HomeViewState } from './home-page-view';
export {
  default as SwipeCarousel,
  filterWorldsByQuery,
  resolveSearchSelectionIndex,
  resolveWheelNavigationStep,
  resolveWorldDotMetrics,
} from './swipe-carousel';