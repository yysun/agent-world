/**
 * Electron Renderer App Root Layering Tests
 *
 * Purpose:
 * - Verify the renderer root stays thin and delegates workspace ownership to the app layer.
 *
 * Key Features:
 * - Confirms `App.tsx` imports the app-layer workspace module.
 * - Guards against reintroducing direct feature and hook ownership into the root file.
 *
 * Implementation Notes:
 * - Uses source inspection because the requirement is about module ownership, not runtime behavior.
 *
 * Recent Changes:
 * - 2026-04-19: Added after moving renderer workspace orchestration out of `App.tsx`.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const appRootPath = path.resolve(__dirname, '../../../electron/renderer/src/App.tsx');

describe('renderer app root layering', () => {
  it('keeps App.tsx as a thin wrapper around the app-layer workspace', () => {
    const source = readFileSync(appRootPath, 'utf8');

    expect(source).toContain("import RendererWorkspace from './app/RendererWorkspace'");
    expect(source).not.toContain("from './features/");
    expect(source).not.toContain("from './hooks/");
    expect(source).not.toContain("from './domain/");
  });
});
