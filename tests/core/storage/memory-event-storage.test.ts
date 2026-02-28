/**
 * Memory Event Storage Behavioral Tests
 *
 * Purpose:
 * - Validate in-memory event storage semantics used by tests and browser-compatible flows.
 *
 * Key features:
 * - Sequence assignment, duplicate suppression, and context isolation.
 * - Query filtering by sequence/time/type with ordering and limit handling.
 * - Range queries, world/chat deletions, and statistics helpers.
 * - Deep-clone guarantees for stored and fetched data.
 */

import { describe, expect, it } from 'vitest';
import {
  createMemoryEventStorage,
  MemoryEventStorage,
} from '../../../core/storage/eventStorage/memoryEventStorage.js';
import type { StoredEvent } from '../../../core/storage/eventStorage/types.js';

function makeEvent(overrides: Partial<StoredEvent> = {}): StoredEvent {
  const id = overrides.id ?? 'evt-1';
  return {
    id,
    worldId: overrides.worldId ?? 'world-1',
    chatId: overrides.chatId === undefined ? 'chat-1' : overrides.chatId,
    seq: overrides.seq,
    type: overrides.type ?? 'message',
    payload: overrides.payload ?? { text: id, tags: ['a'] },
    meta: overrides.meta ?? { nested: { source: 'test' } },
    createdAt: overrides.createdAt ?? new Date('2026-02-27T10:00:00.000Z'),
  };
}

describe('memory event storage behavior', () => {
  it('assigns sequence numbers per context and ignores duplicate IDs', async () => {
    const storage = new MemoryEventStorage();

    await storage.saveEvent(makeEvent({ id: 'a-1', worldId: 'w1', chatId: 'c1' }));
    await storage.saveEvent(makeEvent({ id: 'a-2', worldId: 'w1', chatId: 'c1' }));
    await storage.saveEvent(makeEvent({ id: 'b-1', worldId: 'w1', chatId: 'c2' }));
    await storage.saveEvent(makeEvent({ id: 'n-1', worldId: 'w1', chatId: null }));

    await storage.saveEvent(makeEvent({ id: 'a-2', worldId: 'w1', chatId: 'c1' }));

    const c1 = await storage.getEventsByWorldAndChat('w1', 'c1');
    const c2 = await storage.getEventsByWorldAndChat('w1', 'c2');
    const nullChat = await storage.getEventsByWorldAndChat('w1', null);

    expect(c1.map((event) => event.id)).toEqual(['a-1', 'a-2']);
    expect(c1.map((event) => event.seq)).toEqual([1, 2]);
    expect(c2[0].seq).toBe(1);
    expect(nullChat[0].seq).toBe(1);
    await expect(storage.getLatestSeq('w1', 'c1')).resolves.toBe(2);
  });

  it('deep clones data on save and on fetch', async () => {
    const storage = new MemoryEventStorage();
    const input = makeEvent({
      id: 'clone-1',
      payload: { arr: [1], nested: { value: 'before' } },
      meta: { info: ['x'] },
      createdAt: new Date('2026-02-27T11:00:00.000Z'),
    });

    await storage.saveEvent(input);

    (input.payload as any).arr.push(2);
    (input.payload as any).nested.value = 'after';
    (input.meta as any).info.push('y');

    const firstRead = await storage.getEventsByWorldAndChat('world-1', 'chat-1');
    expect(firstRead[0].payload).toEqual({ arr: [1], nested: { value: 'before' } });
    expect(firstRead[0].meta).toEqual({ info: ['x'] });

    firstRead[0].payload.arr.push(3);
    firstRead[0].meta.info.push('z');

    const secondRead = await storage.getEventsByWorldAndChat('world-1', 'chat-1');
    expect(secondRead[0].payload).toEqual({ arr: [1], nested: { value: 'before' } });
    expect(secondRead[0].meta).toEqual({ info: ['x'] });
    expect(secondRead[0].createdAt).toBeInstanceOf(Date);
    expect(secondRead[0].createdAt.toISOString()).toBe('2026-02-27T11:00:00.000Z');
  });

  it('filters and orders events by sequence, time, type, desc, and limit', async () => {
    const storage = new MemoryEventStorage();

    await storage.saveEvents([
      makeEvent({
        id: 'e1',
        type: 'message',
        seq: 2,
        createdAt: new Date('2026-02-27T10:00:02.000Z'),
      }),
      makeEvent({
        id: 'e2',
        type: 'tool',
        seq: 1,
        createdAt: new Date('2026-02-27T10:00:01.000Z'),
      }),
      makeEvent({
        id: 'e3',
        type: 'message',
        seq: 3,
        createdAt: new Date('2026-02-27T10:00:03.000Z'),
      }),
    ]);

    const sinceSeq = await storage.getEventsByWorldAndChat('world-1', 'chat-1', {
      sinceSeq: 1,
    });
    expect(sinceSeq.map((event) => event.id)).toEqual(['e1', 'e3']);

    const sinceTimeAndType = await storage.getEventsByWorldAndChat('world-1', 'chat-1', {
      sinceTime: new Date('2026-02-27T10:00:01.000Z'),
      types: ['message'],
    });
    expect(sinceTimeAndType.map((event) => event.id)).toEqual(['e1', 'e3']);

    const descLimited = await storage.getEventsByWorldAndChat('world-1', 'chat-1', {
      order: 'desc',
      limit: 2,
      types: [],
    });
    expect(descLimited.map((event) => event.id)).toEqual(['e3', 'e1']);

    const zeroLimit = await storage.getEventsByWorldAndChat('world-1', 'chat-1', {
      limit: 0,
    });
    expect(zeroLimit).toHaveLength(3);
  });

  it('returns sequence ranges and tracks deletions by chat and world', async () => {
    const storage = new MemoryEventStorage();

    await storage.saveEvents([
      makeEvent({ id: 'c1-1', worldId: 'world-a', chatId: 'chat-1', seq: 1 }),
      makeEvent({ id: 'c1-2', worldId: 'world-a', chatId: 'chat-1', seq: 2 }),
      makeEvent({ id: 'c1-3', worldId: 'world-a', chatId: 'chat-1', seq: 3 }),
      makeEvent({ id: 'c2-1', worldId: 'world-a', chatId: 'chat-2', seq: 1 }),
      makeEvent({ id: 'other', worldId: 'world-b', chatId: 'chat-1', seq: 1 }),
      makeEvent({ id: 'seq-null', worldId: 'world-a', chatId: 'chat-1', seq: undefined }),
    ]);

    const range = await storage.getEventRange('world-a', 'chat-1', 2, 3);
    expect(range.map((event) => event.id)).toEqual(['c1-2', 'c1-3']);

    await expect(storage.deleteEventsByWorldAndChat('world-a', 'missing')).resolves.toBe(0);
    await expect(storage.deleteEventsByWorldAndChat('world-a', 'chat-2')).resolves.toBe(1);
    await expect(storage.getLatestSeq('world-a', 'chat-2')).resolves.toBe(0);

    await expect(storage.deleteEventsByWorld('world-a')).resolves.toBe(4);
    await expect(storage.deleteEventsByWorld('missing-world')).resolves.toBe(0);

    const worldB = await storage.getEventsByWorldAndChat('world-b', 'chat-1');
    expect(worldB).toHaveLength(1);
  });

  it('reports storage stats, supports clear, and factory returns event storage API', async () => {
    const storage = new MemoryEventStorage();

    await storage.saveEvent(makeEvent({ id: 's1', worldId: 'stats-world', chatId: 'a' }));
    await storage.saveEvent(makeEvent({ id: 's2', worldId: 'stats-world', chatId: null }));

    const stats = storage.getStats();
    expect(stats.totalContexts).toBe(2);
    expect(stats.totalEvents).toBe(2);
    expect(stats.eventsByContext.get('stats-world:a')).toBe(1);
    expect(stats.eventsByContext.get('stats-world:null')).toBe(1);

    await storage.clear();
    expect(storage.getStats().totalEvents).toBe(0);

    const factoryStorage = createMemoryEventStorage();
    await expect(factoryStorage.getLatestSeq('none', null)).resolves.toBe(0);
  });
});
