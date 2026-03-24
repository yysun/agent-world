/**
 * Electron Renderer Layer Boundary Tests
 *
 * Purpose:
 * - Verify the renderer design-system core and transitional seams stay within the approved layer contract.
 *
 * Key Features:
 * - Checks primitive files for forbidden imports from patterns or business components.
 * - Checks pattern files for forbidden imports from business components.
 * - Locks the renderer against direct foundation imports outside the design-system.
 * - Restricts access to the transitional `components/` layer to one app-shell seam file.
 *
 * Implementation Notes:
 * - Uses filesystem inspection so the assertions cover the whole layer surface.
 * - Focuses on current renderer path conventions under `electron/renderer/src`.
 *
 * Recent Changes:
 * - 2026-03-24: Added renderer-wide boundary coverage for the app-shell transitional seam and direct-foundation import guard.
 * - 2026-03-23: Added boundary coverage for the new design-system layer structure.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const rendererSrcDir = path.resolve(__dirname, '../../../electron/renderer/src');
const rendererDesignSystemDir = path.resolve(__dirname, '../../../electron/renderer/src/design-system');
const rendererDesignSystemFoundationsDir = path.join(rendererDesignSystemDir, 'foundations');
const rendererComponentsDir = path.join(rendererSrcDir, 'components');
const relativeModuleSpecifierPattern = /(?:import|export)\s+(?:[^'"\n]*?\s+from\s+)?['"]([^'"]+)['"]/g;

function listSourceFiles(dirPath: string): string[] {
  return readdirSync(dirPath, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      return listSourceFiles(entryPath);
    }

    return /\.(ts|tsx)$/.test(entry.name) ? [entryPath] : [];
  });
}

function listLayerFiles(layerName: string): string[] {
  return listSourceFiles(path.join(rendererDesignSystemDir, layerName));
}

function readSource(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}

function listResolvedRelativeImports(filePath: string): string[] {
  const source = readSource(filePath);

  return Array.from(source.matchAll(relativeModuleSpecifierPattern))
    .map((match) => match[1])
    .filter((specifier): specifier is string => specifier.startsWith('.'))
    .map((specifier) => path.resolve(path.dirname(filePath), specifier));
}

function isWithinDir(filePath: string, dirPath: string): boolean {
  return filePath === dirPath || filePath.startsWith(`${dirPath}${path.sep}`);
}

function toRendererRelativePath(filePath: string): string {
  return path.relative(rendererSrcDir, filePath).split(path.sep).join('/');
}

describe('electron renderer design-system layer boundaries', () => {
  it('keeps primitives free of pattern and business-component imports', () => {
    const primitiveFiles = listLayerFiles('primitives');

    for (const filePath of primitiveFiles) {
      const source = readSource(filePath);

      expect(source).not.toMatch(/from ['"]\.\.\/patterns(?:\/|['"])/);
      expect(source).not.toMatch(/from ['"](?:\.\.\/)+(?:components|features|app)(?:\/|['"])/);
    }
  });

  it('keeps patterns free of business-component imports', () => {
    const patternFiles = listLayerFiles('patterns');

    for (const filePath of patternFiles) {
      const source = readSource(filePath);

      expect(source).not.toMatch(/from ['"](?:\.\.\/)+(?:components|features|app)(?:\/|['"])/);
    }
  });

  it('keeps direct foundation imports inside the design-system', () => {
    const nonDesignSystemFiles = listSourceFiles(rendererSrcDir)
      .filter((filePath) => !filePath.startsWith(rendererDesignSystemDir));

    for (const filePath of nonDesignSystemFiles) {
      const resolvedImports = listResolvedRelativeImports(filePath);

      expect(resolvedImports.some((resolvedPath) => isWithinDir(resolvedPath, rendererDesignSystemFoundationsDir))).toBe(false);
    }
  });

  it('routes external transitional components access through the app-shell seam only', () => {
    const transitionalImporters = listSourceFiles(rendererSrcDir)
      .filter((filePath) => !isWithinDir(filePath, rendererComponentsDir))
      .filter((filePath) => {
        const resolvedImports = listResolvedRelativeImports(filePath);
        return resolvedImports.some((resolvedPath) => isWithinDir(resolvedPath, rendererComponentsDir));
      })
      .map(toRendererRelativePath)
      .sort();

    expect(transitionalImporters).toEqual([
      'app/shell/components/transitional.ts',
    ]);
  });
});