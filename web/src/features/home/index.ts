/**
 * Purpose:
 * - Re-export Home feature public modules.
 *
 * Key Features:
 * - Provides stable feature imports for Home views and update handlers.
 *
 * Notes on Implementation:
 * - Use this barrel for route-level Home composition during the layered migration.
 *
 * Summary of Recent Changes:
 * - 2026-03-24: Added the Home feature barrel exports.
 */

export { HomePageView } from './views';
export { SwipeCarousel } from './views';
export type { HomeViewState } from './views';
export { homePageUpdateHandlers } from './update';