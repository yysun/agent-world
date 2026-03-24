/**
 * Purpose:
 * - Expose the public web app-shell bootstrap entry point.
 *
 * Key Features:
 * - Renders the app shell layout into `#root`.
 * - Registers AppRun route entry components through the app-shell route registry.
 *
 * Notes on Implementation:
 * - This layer owns bootstrap concerns only; feature code stays below route registration.
 *
 * Summary of Recent Changes:
 * - 2026-03-24: Added the app-shell bootstrap API for the layered web architecture.
 */

import app from 'apprun';
import AppShellLayout from './layout';
import { registerWebRoutes } from './routes';

export function renderWebApp(): void {
  app.render('#root', <AppShellLayout />);
  registerWebRoutes(app);
}

export { AppShellLayout } from './layout';
export { registerWebRoutes } from './routes';