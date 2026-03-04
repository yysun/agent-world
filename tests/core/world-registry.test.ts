/**
 * World Registry Tests
 *
 * Verifies reference-counted runtime lifecycle, storage-aware runtime keys,
 * and deterministic shutdown behavior.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createWorldRuntimeKey,
  listWorldRuntimeSnapshots,
  startWorldRuntime,
  stopAllWorldRuntimes,
} from '../../core/world-registry.js';

describe('world runtime registry', () => {
  afterEach(async () => {
    await stopAllWorldRuntimes();
    vi.restoreAllMocks();
  });

  it('starts once and increments refCount for multiple consumers', async () => {
    const createRuntime = vi.fn(async () => ({
      world: { id: 'alpha' },
      stop: vi.fn(async () => undefined),
      refresh: vi.fn(async () => undefined),
    }));

    const first = await startWorldRuntime({
      worldId: 'alpha',
      consumerId: 'consumer-a',
      storageType: 'sqlite',
      storagePath: '/tmp/a',
      createRuntime,
    });

    const second = await startWorldRuntime({
      worldId: 'alpha',
      consumerId: 'consumer-b',
      storageType: 'sqlite',
      storagePath: '/tmp/a',
      createRuntime,
    });

    expect(createRuntime).toHaveBeenCalledTimes(1);
    expect(first.runtimeKey).toBe(second.runtimeKey);

    const snapshots = listWorldRuntimeSnapshots();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.refCount).toBe(2);
    expect(snapshots[0]?.storageType).toBe('sqlite');
    expect(snapshots[0]?.storagePath).toContain('/tmp/a');
  });

  it('stops runtime only after last consumer release', async () => {
    const stop = vi.fn(async () => undefined);
    const createRuntime = vi.fn(async () => ({
      world: { id: 'alpha' },
      stop,
    }));

    const first = await startWorldRuntime({
      worldId: 'alpha',
      consumerId: 'consumer-a',
      storageType: 'sqlite',
      storagePath: '/tmp/a',
      createRuntime,
    });

    const second = await startWorldRuntime({
      worldId: 'alpha',
      consumerId: 'consumer-b',
      storageType: 'sqlite',
      storagePath: '/tmp/a',
      createRuntime,
    });

    await first.release();
    expect(stop).toHaveBeenCalledTimes(0);
    expect(listWorldRuntimeSnapshots()[0]?.refCount).toBe(1);

    await second.release();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(listWorldRuntimeSnapshots()).toHaveLength(0);
  });

  it('creates distinct runtimes for same world across storage paths', async () => {
    const createRuntime = vi.fn(async () => ({
      world: { id: 'alpha' },
      stop: vi.fn(async () => undefined),
    }));

    const a = await startWorldRuntime({
      worldId: 'alpha',
      consumerId: 'consumer-a',
      storageType: 'sqlite',
      storagePath: '/tmp/a',
      createRuntime,
    });

    const b = await startWorldRuntime({
      worldId: 'alpha',
      consumerId: 'consumer-b',
      storageType: 'sqlite',
      storagePath: '/tmp/b',
      createRuntime,
    });

    expect(a.runtimeKey).not.toBe(b.runtimeKey);
    expect(createRuntime).toHaveBeenCalledTimes(2);

    const keyA = createWorldRuntimeKey('alpha', { storageType: 'sqlite', storagePath: '/tmp/a' });
    const keyB = createWorldRuntimeKey('alpha', { storageType: 'sqlite', storagePath: '/tmp/b' });
    expect(keyA).not.toBe(keyB);
  });
});
