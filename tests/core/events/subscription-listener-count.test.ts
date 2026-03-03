/**
 * Subscription Listener Count Tests
 *
 * Purpose:
 * - Regression tests ensuring the EventEmitter listener count stays at exactly 1
 *   per world-level infrastructure channel (message, sse, world, system).
 * - Validates the idempotent behaviour of subscribeWorldToMessages and
 *   setupWorldActivityListener — they must not register a second listener when
 *   setupEventPersistence has already run.
 * - Validates the standalone fallback path (persistence disabled) is idempotent too.
 *
 * Implementation Notes:
 * - Uses in-memory event storage so setupEventPersistence registers real listeners.
 * - Mocks storage-factory and LLM to satisfy title-scheduler imports without I/O.
 * - The "exactly 1" invariant is the core safety property preventing
 *   MaxListenersExceededWarning when many agents are added to a world.
 *
 * Recent Changes:
 * - 2026-03-03: Initial implementation for subscription consolidation.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import type { World } from '../../../core/types';
import { LLMProvider } from '../../../core/types';
import { setupEventPersistence } from '../../../core/events/index';
import { subscribeWorldToMessages, setupWorldActivityListener } from '../../../core/events/index';
import { createMemoryEventStorage } from '../../../core/storage/eventStorage/memoryEventStorage.js';

vi.mock('../../../core/storage/storage-factory', () => ({
  createStorageWithWrappers: async () => ({
    updateChatData: vi.fn(),
    updateChatNameIfCurrent: vi.fn(),
    loadChatData: vi.fn(async () => null),
  }),
}));

vi.mock('../../../core/llm-manager', () => ({
  generateAgentResponse: vi.fn(async () => ({ response: 'Test Title', messageId: 'x' }))
}));

function makeWorld(withStorage = true): World {
  const world = {
    id: 'test-world',
    name: 'Test World',
    eventEmitter: new EventEmitter(),
    agents: new Map(),
    chats: new Map(),
    currentChatId: null,
    isProcessing: false,
    chatLLMProvider: LLMProvider.OPENAI,
    chatLLMModel: 'gpt-4',
    eventStorage: withStorage ? createMemoryEventStorage() : undefined,
  } as unknown as World;
  return world;
}

describe('EventEmitter listener count invariants', () => {
  let world: World;
  let cleanup: () => void;

  afterEach(() => {
    cleanup?.();
  });

  describe('with persistence enabled', () => {
    beforeEach(() => {
      world = makeWorld(true);
      cleanup = setupEventPersistence(world);
    });

    it('registers exactly 1 listener per infrastructure channel', () => {
      expect(world.eventEmitter.listenerCount('message')).toBe(1);
      expect(world.eventEmitter.listenerCount('world')).toBe(1);
      expect(world.eventEmitter.listenerCount('sse')).toBe(1);
      expect(world.eventEmitter.listenerCount('system')).toBe(1);
    });

    it('subscribeWorldToMessages is a no-op after setupEventPersistence', () => {
      subscribeWorldToMessages(world);
      subscribeWorldToMessages(world); // call twice to verify idempotency
      expect(world.eventEmitter.listenerCount('message')).toBe(1);
    });

    it('setupWorldActivityListener is a no-op after setupEventPersistence', () => {
      setupWorldActivityListener(world);
      setupWorldActivityListener(world); // call twice to verify idempotency
      expect(world.eventEmitter.listenerCount('world')).toBe(1);
    });

    it('cleanup removes all infrastructure listeners and clears refs', () => {
      cleanup();
      cleanup = () => { }; // prevent afterEach double-call
      expect(world.eventEmitter.listenerCount('message')).toBe(0);
      expect(world.eventEmitter.listenerCount('world')).toBe(0);
      expect(world.eventEmitter.listenerCount('sse')).toBe(0);
      expect(world.eventEmitter.listenerCount('system')).toBe(0);
      expect(world._worldMessagesUnsubscriber).toBeUndefined();
      expect(world._activityListenerCleanup).toBeUndefined();
    });
  });

  describe('standalone path (no persistence)', () => {
    beforeEach(() => {
      world = makeWorld(false);
      cleanup = () => { };
    });

    it('subscribeWorldToMessages attaches exactly 1 message listener', () => {
      const c = subscribeWorldToMessages(world);
      cleanup = c;
      expect(world.eventEmitter.listenerCount('message')).toBe(1);
    });

    it('subscribeWorldToMessages is idempotent — repeated calls keep 1 listener', () => {
      const c1 = subscribeWorldToMessages(world);
      const c2 = subscribeWorldToMessages(world);
      cleanup = c1;
      expect(c1).toBe(c2);
      expect(world.eventEmitter.listenerCount('message')).toBe(1);
    });

    it('setupWorldActivityListener attaches exactly 1 world listener', () => {
      const c = setupWorldActivityListener(world);
      cleanup = c;
      expect(world.eventEmitter.listenerCount('world')).toBe(1);
    });

    it('setupWorldActivityListener is idempotent — repeated calls keep 1 listener', () => {
      const c1 = setupWorldActivityListener(world);
      const c2 = setupWorldActivityListener(world);
      cleanup = c1;
      expect(c1).toBe(c2);
      expect(world.eventEmitter.listenerCount('world')).toBe(1);
    });

    it('standalone cleanup removes listener and clears ref', () => {
      const c = subscribeWorldToMessages(world);
      c();
      expect(world.eventEmitter.listenerCount('message')).toBe(0);
      expect(world._worldMessagesUnsubscriber).toBeUndefined();
    });
  });
});
