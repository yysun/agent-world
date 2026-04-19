/**
 * Desktop Renderer App Root
 * Purpose:
 * - Keep the renderer root thin and delegate workspace orchestration to the app layer.
 *
 * Key Features:
 * - Exposes a stable default export for renderer bootstrap.
 * - Keeps top-level assembly separate from feature and shell workflows.
 *
 * Implementation Notes:
 * - Heavy renderer orchestration now lives in `app/RendererWorkspace`.
 * - `main.tsx` continues to mount this file as the renderer entry root.
 *
 * Recent Changes:
 * - 2026-04-19: Reduced `App.tsx` to a thin root wrapper around the app-layer workspace module.
 */

import RendererWorkspace from './app/RendererWorkspace';

export default function App() {
  return <RendererWorkspace />;
}
