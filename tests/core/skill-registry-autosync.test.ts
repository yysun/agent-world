/**
 * Purpose: Verify skill registry auto-sync behavior at core module load time.
 *
 * Features:
 * - Re-imports the skill-registry module to exercise module-load side effects
 * - Verifies startup sync begins automatically without manual sync calls
 *
 * Implementation Notes:
 * - Uses in-memory fs mocks from Vitest setup
 * - Uses `vi.resetModules()` to force a fresh module-load cycle per test
 *
 * Recent Changes:
 * - 2026-02-14: Added coverage for automatic skill sync during core module load.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fsModule from 'fs';

const fs = vi.mocked(fsModule.promises);

async function flushMicrotasks(rounds = 8): Promise<void> {
  for (let index = 0; index < rounds; index += 1) {
    await Promise.resolve();
  }
}

describe('core/skill-registry auto-sync on module load', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('starts initial sync automatically when the module is loaded', async () => {
    const fsAny = fs as any;
    if (!fsAny.stat) {
      fsAny.stat = vi.fn();
    }
    if (!fsAny.readFile) {
      fsAny.readFile = vi.fn();
    }
    vi.mocked(fsAny.access).mockResolvedValue(undefined);
    vi.mocked(fsAny.readdir).mockResolvedValue([]);
    vi.mocked(fsAny.stat).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(fsAny.readFile).mockRejectedValue(new Error('ENOENT'));

    const registryModule = await import('../../core/skill-registry.js');
    await flushMicrotasks();
    await registryModule.waitForInitialSkillSync();

    expect(fsAny.access).toHaveBeenCalled();
  });
});
