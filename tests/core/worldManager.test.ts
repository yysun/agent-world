/**
 * Unit Tests for World Manager
 * 
 * Tests the world manager implementation including:
 * - Lazy loading of worlds on first subscribe
 * - Direct EventEmitter access for subscribers
 * - Reference counting and cleanup
 * - Multiple subscribers sharing the same world
 * - Unloading when all subscribers disconnect
 */

import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'events';
import { WorldManager } from '../../src/core/worldManager.js';

function makeLoaderFactory() {
  const created: Record<string, number> = {};
  return {
    factory: (id: string) => {
      return () => {
        created[id] = (created[id] || 0) + 1;
        const e = new EventEmitter();
        // expose a close method to allow manager to clean up
        (e as any).close = () => { e.removeAllListeners(); };
        return e;
      };
    },
    created,
  };
}

describe('WorldManager', () => {
  it('lazy loads world when subscribed and returns emitter', async () => {
    const { factory, created } = makeLoaderFactory();
    const mgr = new WorldManager(factory);

    const sub = await mgr.subscribe('w1');
    expect(created['w1']).toBe(1);
    let received = false;
    sub.emitter.on('tick', (payload) => { received = true; expect(payload).toBe(123); });

    // emit from the world emitter
    sub.emitter.emit('tick', 123);
    expect(received).toBe(true);

    // unsubscribe and ensure the world is unloaded
    sub.unsubscribe();
    await new Promise((r) => setTimeout(r, 50)); // wait for actor to process unsubscribe
    const info = await mgr.getInfo('w1');
    expect(info.loaded).toBe(false);
    expect(info.refCount).toBe(0);
  });

  it('supports multiple subscribers and unloads when all unsubscribe', async () => {
    const { factory, created } = makeLoaderFactory();
    const mgr = new WorldManager(factory);

    const a = await mgr.subscribe('multi');
    const b = await mgr.subscribe('multi');
    expect(created['multi']).toBe(1);

    let count = 0;
    a.emitter.on('ev', () => count++);
    b.emitter.on('ev', () => count++);

    a.emitter.emit('ev');
    expect(count).toBe(2);

    a.unsubscribe();
    await new Promise((r) => setTimeout(r, 50)); // wait for actor to process
    let info = await mgr.getInfo('multi');
    expect(info.loaded).toBe(true);
    expect(info.refCount).toBe(1);

    b.unsubscribe();
    await new Promise((r) => setTimeout(r, 50)); // wait for actor to process
    info = await mgr.getInfo('multi');
    expect(info.loaded).toBe(false);
    expect(info.refCount).toBe(0);
  });
});
