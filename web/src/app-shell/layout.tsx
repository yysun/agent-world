/**
 * Purpose:
 * - Provide the top-level AppRun page mount surface for the web app shell.
 *
 * Key Features:
 * - Renders the shared `#pages` outlet used by AppRun route components.
 * - Keeps shell structure stable while feature and page layers evolve underneath it.
 *
 * Notes on Implementation:
 * - Intentionally minimal so route composition stays centralized in the app-shell entry point.
 *
 * Summary of Recent Changes:
 * - 2026-03-24: Moved the legacy layout shell into the dedicated app-shell layer.
 */

import app from 'apprun';

export function AppShellLayout() {
  return <div id="main" className="w-full min-h-screen">
    <div id="pages"></div>
  </div>;
}

export default AppShellLayout;