/**
 * Purpose:
 * - Centralize route registration for the AppRun web shell.
 *
 * Key Features:
 * - Registers the Home, World, and Settings route entry components.
 * - Keeps route-to-page wiring out of feature modules.
 *
 * Notes on Implementation:
 * - Route entry components remain the public AppRun page surface.
 *
 * Summary of Recent Changes:
 * - 2026-03-24: Added the app-shell route registry as part of the layered web refactor.
 */

import type { App } from 'apprun';
import Home from '../pages/Home';
import World from '../pages/World';
import Settings from '../pages/Settings';

export function registerWebRoutes(appInstance: App): void {
  appInstance.addComponents('#pages', {
    '/': Home,
    '/World': World,
    '/Settings': Settings,
  });
}