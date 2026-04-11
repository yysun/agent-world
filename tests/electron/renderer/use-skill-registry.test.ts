/**
 * useSkillRegistry Hook Tests
 *
 * Purpose:
 * - Verify the Electron renderer requests skill summaries using the active world context.
 *
 * Key Features:
 * - Confirms `skill:list` requests include `worldId`.
 * - Confirms repeated calls can target different loaded worlds.
 *
 * Implementation Notes:
 * - Mocks `react` hooks so the hook can run without a renderer runtime.
 * - Executes `useEffect` immediately to exercise the refresh side effect deterministically.
 *
 * Recent Changes:
 * - 2026-03-19: Added regression coverage for world-scoped skill-registry refresh requests.
 */

import { describe, expect, it, vi } from 'vitest';

const hookState = vi.hoisted(() => ({
  stateIndex: 0,
  setters: [] as Array<ReturnType<typeof vi.fn>>,
}));

vi.mock('react', () => ({
  useCallback: (fn: unknown) => fn,
  useEffect: (fn: () => void | Promise<void>) => {
    void fn();
  },
  useState: (initialValue: unknown) => {
    const setter = hookState.setters[hookState.stateIndex] ?? vi.fn();
    hookState.stateIndex += 1;
    return [initialValue, setter];
  },
}), { virtual: true });

import { useSkillRegistry } from '../../../electron/renderer/src/hooks/useSkillRegistry';

function resetHookState(): void {
  hookState.stateIndex = 0;
  hookState.setters = [vi.fn(), vi.fn(), vi.fn(), vi.fn()];
}

describe('electron/renderer useSkillRegistry', () => {
  it('requests skills for the active loaded world', async () => {
    resetHookState();
    const api = {
      listSkills: vi.fn(async () => []),
    };

    useSkillRegistry({ api, loadedWorldId: 'world-1' });
    await Promise.resolve();
    await Promise.resolve();

    expect(api.listSkills).toHaveBeenNthCalledWith(1, {
      includeGlobalSkills: true,
      includeProjectSkills: true,
      worldId: 'world-1',
    });
    expect(api.listSkills).toHaveBeenNthCalledWith(2, {
      includeGlobalSkills: true,
      includeProjectSkills: true,
      worldId: 'world-1',
      preserveScopes: true,
    });
  });

  it('can refresh against a newly selected world id', async () => {
    resetHookState();
    const api = {
      listSkills: vi.fn(async () => []),
    };

    useSkillRegistry({ api, loadedWorldId: 'world-1' });
    resetHookState();
    useSkillRegistry({ api, loadedWorldId: 'world-2' });
    await Promise.resolve();
    await Promise.resolve();

    expect(api.listSkills).toHaveBeenNthCalledWith(1, {
      includeGlobalSkills: true,
      includeProjectSkills: true,
      worldId: 'world-1',
    });
    expect(api.listSkills).toHaveBeenNthCalledWith(2, {
      includeGlobalSkills: true,
      includeProjectSkills: true,
      worldId: 'world-1',
      preserveScopes: true,
    });
    expect(api.listSkills).toHaveBeenNthCalledWith(3, {
      includeGlobalSkills: true,
      includeProjectSkills: true,
      worldId: 'world-2',
    });
    expect(api.listSkills).toHaveBeenNthCalledWith(4, {
      includeGlobalSkills: true,
      includeProjectSkills: true,
      worldId: 'world-2',
      preserveScopes: true,
    });
  });
});
