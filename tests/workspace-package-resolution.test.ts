/**
 * Workspace TypeScript package resolution contract tests.
 *
 * Purpose:
 * - Prevent TypeScript check/build regressions when workspace package symlinks are missing or stale.
 *
 * Key Features:
 * - Verifies the root TypeScript config maps `@agent-world/llm` to the workspace package boundary.
 * - Verifies the `core` TypeScript config preserves the same package-boundary resolution contract for direct workspace checks.
 *
 * Notes on Implementation:
 * - Reads the real tsconfig files because the contract is the checked-in compiler configuration.
 * - Keeps coverage fast and deterministic without invoking `tsc` from the test process.
 *
 * Summary of Recent Changes:
 * - 2026-03-29: Added regression coverage for `@agent-world/llm` workspace path mapping.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import ts from 'typescript';

type TsConfig = {
  compilerOptions?: {
    baseUrl?: string;
    paths?: Record<string, string[] | undefined>;
  };
};

function readTsConfig(relativePath: string): TsConfig {
  const tsconfigPath = path.resolve(process.cwd(), relativePath);
  const tsconfigText = readFileSync(tsconfigPath, 'utf8');
  const parsed = ts.parseConfigFileTextToJson(tsconfigPath, tsconfigText);
  if (parsed.error) {
    throw new Error(ts.flattenDiagnosticMessageText(parsed.error.messageText, '\n'));
  }
  return parsed.config as TsConfig;
}

describe('workspace TypeScript package resolution', () => {
  it('maps @agent-world/llm from the root tsconfig to the workspace package boundary', () => {
    const rootTsconfig = readTsConfig('tsconfig.json');

    expect(rootTsconfig.compilerOptions?.baseUrl).toBe('.');
    expect(rootTsconfig.compilerOptions?.paths?.['@agent-world/llm']).toEqual([
      'packages/llm',
    ]);
  });

  it('maps @agent-world/llm from the core tsconfig to the workspace package boundary', () => {
    const coreTsconfig = readTsConfig('core/tsconfig.json');

    expect(coreTsconfig.compilerOptions?.baseUrl).toBe('.');
    expect(coreTsconfig.compilerOptions?.paths?.['@agent-world/llm']).toEqual([
      '../packages/llm',
    ]);
  });
});
