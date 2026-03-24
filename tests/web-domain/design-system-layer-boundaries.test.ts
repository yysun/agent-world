/**
 * Purpose:
 * - Verify the web UI layers keep their enforced dependency direction.
 *
 * Key Features:
 * - Checks foundations for forbidden UI-layer imports.
 * - Checks primitives and patterns for upward or skipped-layer imports.
 * - Checks feature/page/app surfaces for forbidden direct imports from primitives or foundations.
 *
 * Notes on Implementation:
 * - Uses source inspection so the assertions cover the whole current layer surface.
 * - Treats the transitional `components/` folder as feature/app-level UI for boundary purposes.
 *
 * Summary of Recent Changes:
 * - 2026-03-24: Added web design-system boundary coverage for the stricter adjacent-layer contract.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webSrcDir = path.resolve(__dirname, '../../web/src');

function listSourceFiles(relativeDir: string, extensions: string[]): string[] {
  const rootDir = path.join(webSrcDir, relativeDir);

  function visit(dirPath: string): string[] {
    return readdirSync(dirPath, { withFileTypes: true }).flatMap((entry) => {
      const entryPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        return visit(entryPath);
      }

      return extensions.some((extension) => entry.name.endsWith(extension)) ? [entryPath] : [];
    });
  }

  return visit(rootDir);
}

function readSource(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}

function getFeatureName(filePath: string): string | null {
  const relativePath = path.relative(path.join(webSrcDir, 'features'), filePath);
  const [featureName] = relativePath.split(path.sep);
  return featureName || null;
}

function resolveImportedSourcePath(filePath: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) {
    return null;
  }

  const absoluteBase = path.resolve(path.dirname(filePath), specifier);
  const candidates = [
    absoluteBase,
    `${absoluteBase}.ts`,
    `${absoluteBase}.tsx`,
    `${absoluteBase}.js`,
    `${absoluteBase}.jsx`,
    path.join(absoluteBase, 'index.ts'),
    path.join(absoluteBase, 'index.tsx'),
    path.join(absoluteBase, 'index.js'),
    path.join(absoluteBase, 'index.jsx'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function getImportSpecifiers(source: string): string[] {
  return Array.from(source.matchAll(/from ['"]([^'"]+)['"]/g), (match) => match[1]);
}

function expectNoMatch(filePath: string, patterns: RegExp[]) {
  const source = readSource(filePath);

  for (const pattern of patterns) {
    expect(source, `Unexpected match for ${pattern} in ${filePath}`).not.toMatch(pattern);
  }
}

describe('web design-system layer boundaries', () => {
  it('keeps foundations free of UI-layer imports', () => {
    const foundationFiles = listSourceFiles('foundations', ['.css', '.ts', '.tsx']);

    for (const filePath of foundationFiles) {
      expectNoMatch(filePath, [
        /@import ['"](?:\.\/)?\.\.\/primitives(?:\/|['"])/,
        /@import ['"](?:\.\/)?\.\.\/patterns(?:\/|['"])/,
        /@import ['"](?:\.\/)?\.\.\/(?:features|pages|app-shell|components)(?:\/|['"])/,
        /from ['"](?:\.\/)?\.\.\/(?:primitives|patterns|features|pages|app-shell|components)(?:\/|['"])/,
      ]);
    }
  });

  it('keeps primitives free of pattern and feature/app imports', () => {
    const primitiveFiles = listSourceFiles('primitives', ['.ts', '.tsx']);

    for (const filePath of primitiveFiles) {
      expectNoMatch(filePath, [
        /from ['"]\.\.\/patterns(?:\/|['"])/,
        /from ['"]\.\.\/(?:features|pages|app-shell|components)(?:\/|['"])/,
      ]);
    }
  });

  it('keeps patterns free of feature/app imports', () => {
    const patternFiles = listSourceFiles('patterns', ['.ts', '.tsx']);

    for (const filePath of patternFiles) {
      expectNoMatch(filePath, [
        /from ['"]\.\.\/(?:features|pages|app-shell|components)(?:\/|['"])/,
      ]);
    }
  });

  it('keeps feature, page, app-shell, and transitional component UI free of direct primitive and foundation imports', () => {
    const uiSurfaceFiles = [
      ...listSourceFiles('features', ['.ts', '.tsx']),
      ...listSourceFiles('pages', ['.ts', '.tsx']),
      ...listSourceFiles('app-shell', ['.ts', '.tsx']),
      ...listSourceFiles('components', ['.ts', '.tsx']),
    ];

    for (const filePath of uiSurfaceFiles) {
      expectNoMatch(filePath, [
        /from ['"](?:\.\.\/)+primitives(?:\/|['"])/,
        /from ['"](?:\.\.\/)+foundations(?:\/|['"])/,
      ]);
    }
  });

  it('keeps feature-owned source free of transitional components and sibling feature UI imports', () => {
    const featureFiles = listSourceFiles('features', ['.ts', '.tsx']);

    for (const filePath of featureFiles) {
      const currentFeature = getFeatureName(filePath);
      const source = readSource(filePath);

      for (const specifier of getImportSpecifiers(source)) {
        const resolvedPath = resolveImportedSourcePath(filePath, specifier);
        if (!resolvedPath) {
          continue;
        }

        expect(resolvedPath, `Feature file must not import transitional components: ${filePath} -> ${specifier}`).not.toContain(`${path.sep}web${path.sep}src${path.sep}components${path.sep}`);

        if (resolvedPath.includes(`${path.sep}web${path.sep}src${path.sep}features${path.sep}`)) {
          expect(getFeatureName(resolvedPath), `Feature file must not import sibling feature UI: ${filePath} -> ${specifier}`).toBe(currentFeature);
        }
      }
    }
  });
});