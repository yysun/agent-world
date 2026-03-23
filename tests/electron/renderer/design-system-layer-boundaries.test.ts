/**
 * Electron Renderer Design-System Layer Boundary Tests
 *
 * Purpose:
 * - Verify the design-system core does not import from forbidden renderer layers.
 *
 * Key Features:
 * - Checks primitive files for forbidden imports from patterns or business components.
 * - Checks pattern files for forbidden imports from business components.
 *
 * Implementation Notes:
 * - Uses filesystem inspection so the assertions cover the whole layer surface.
 * - Focuses on current renderer path conventions under `electron/renderer/src`.
 *
 * Recent Changes:
 * - 2026-03-23: Added boundary coverage for the new design-system layer structure.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const rendererDesignSystemDir = path.resolve(__dirname, '../../../electron/renderer/src/design-system');

function listLayerFiles(layerName: string): string[] {
  const layerDir = path.join(rendererDesignSystemDir, layerName);
  return readdirSync(layerDir)
    .filter((fileName) => /\.(ts|tsx)$/.test(fileName))
    .map((fileName) => path.join(layerDir, fileName));
}

function readSource(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}

describe('electron renderer design-system layer boundaries', () => {
  it('keeps primitives free of pattern and business-component imports', () => {
    const primitiveFiles = listLayerFiles('primitives');

    for (const filePath of primitiveFiles) {
      const source = readSource(filePath);

      expect(source).not.toMatch(/from ['"]\.\.\/patterns(?:\/|['"])/);
      expect(source).not.toMatch(/from ['"](?:\.\.\/)+components(?:\/|['"])/);
    }
  });

  it('keeps patterns free of business-component imports', () => {
    const patternFiles = listLayerFiles('patterns');

    for (const filePath of patternFiles) {
      const source = readSource(filePath);

      expect(source).not.toMatch(/from ['"](?:\.\.\/)+components(?:\/|['"])/);
    }
  });
});