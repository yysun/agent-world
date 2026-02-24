/**
 * Unit Tests for Workspace Runtime State
 *
 * Features:
 * - Verifies core initialization for selected workspace paths.
 * - Verifies workspace switch behavior with async runtime cleanup.
 * - Guards against workspace state clobber after deferred reset completion.
 *
 * Implementation Notes:
 * - Uses dependency injection with in-memory mocks.
 * - Avoids Electron runtime APIs and filesystem dependencies.
 *
 * Recent Changes:
 * - 2026-02-13: Updated coverage for async/serialized `ensureCoreReady` transitions.
 * - 2026-02-12: Added regression coverage for queued async reset behavior on workspace switches.
 */

import { describe, expect, it, vi } from 'vitest';
import { createWorkspaceRuntime } from '../../../electron/main-process/workspace-runtime';

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

describe('createWorkspaceRuntime', () => {
  it('keeps core initialized after async reset completes during workspace switch', async () => {
    const deferredReset = createDeferred<void>();
    const configureWorkspaceStorage = vi.fn();
    const configureProvidersFromEnv = vi.fn();
    const resetRuntimeSubscriptions = vi.fn(async () => deferredReset.promise);

    const runtime = createWorkspaceRuntime({
      configureWorkspaceStorage,
      configureProvidersFromEnv,
      workspaceFromCommandLine: () => null,
      readWorkspacePreference: () => null,
      writeWorkspacePreference: vi.fn(),
      getDefaultWorkspacePath: () => '/workspace/default',
      resetRuntimeSubscriptions
    });

    runtime.setWorkspace('/workspace/a', false);
    await runtime.ensureCoreReady();
    expect(runtime.getWorkspaceState()).toMatchObject({
      workspacePath: '/workspace/a',
      coreInitialized: true
    });

    runtime.setWorkspace('/workspace/b', false);
    const pendingEnsure = runtime.ensureCoreReady();
    await Promise.resolve();

    expect(resetRuntimeSubscriptions).toHaveBeenCalledTimes(1);

    deferredReset.resolve();
    await pendingEnsure;

    expect(runtime.getWorkspaceState()).toMatchObject({
      workspacePath: '/workspace/b',
      coreInitialized: true
    });
    expect(configureWorkspaceStorage).toHaveBeenNthCalledWith(1, '/workspace/a');
    expect(configureWorkspaceStorage).toHaveBeenNthCalledWith(2, '/workspace/b');
    expect(configureProvidersFromEnv).toHaveBeenCalledTimes(2);
  });
});
