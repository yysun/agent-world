/**
 * Activity Tracker Tests
 *
 * Purpose:
 * - Verify WorldActivityEventPayload includes queuedChatIds and activeAgentNames.
 * - Verify getActiveAgentNames() strips 'agent:' prefix correctly.
 *
 * Key Features:
 * - Black-box boundary tests on emitted payloads.
 * - getActiveAgentNames accessor tested in isolation.
 *
 * Implementation Notes:
 * - Uses in-memory world with real EventEmitter for payload capture.
 * - LLM queue status is mocked to avoid provider dependencies.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

vi.mock('../../core/llm-runtime.js', () => ({
  getLLMQueueStatus: vi.fn(() => ({ pending: 0, processing: 0, completed: 0, failed: 0 })),
}));

function makeWorld(overrides: Record<string, any> = {}): any {
  return {
    id: 'world-1',
    isProcessing: false,
    eventEmitter: new EventEmitter(),
    agents: new Map(),
    chats: new Map(),
    ...overrides,
  };
}

describe('activity-tracker', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('emits queuedChatIds from world._queuedChatIds in payload', async () => {
    const { beginWorldActivity } = await import('../../core/activity-tracker.js');

    const world = makeWorld({ _queuedChatIds: new Set(['chat-queued-1', 'chat-queued-2']) });
    const payloads: any[] = [];
    world.eventEmitter.on('world', (p: any) => payloads.push(p));

    const end = beginWorldActivity(world, 'some-source', 'chat-active-1');
    end();

    expect(payloads.length).toBeGreaterThan(0);
    const startPayload = payloads[0];
    expect(startPayload.queuedChatIds).toEqual(expect.arrayContaining(['chat-queued-1', 'chat-queued-2']));
    expect(startPayload.queuedChatIds).toHaveLength(2);
  });

  it('emits empty queuedChatIds when _queuedChatIds is not set', async () => {
    const { beginWorldActivity } = await import('../../core/activity-tracker.js');

    const world = makeWorld();
    const payloads: any[] = [];
    world.eventEmitter.on('world', (p: any) => payloads.push(p));

    const end = beginWorldActivity(world, 'some-source', 'chat-1');
    end();

    expect(payloads[0].queuedChatIds).toEqual([]);
  });

  it('emits activeAgentNames stripped of agent: prefix', async () => {
    const { beginWorldActivity } = await import('../../core/activity-tracker.js');

    const world = makeWorld();
    const payloads: any[] = [];
    world.eventEmitter.on('world', (p: any) => payloads.push(p));

    const end = beginWorldActivity(world, 'agent:my-agent', 'chat-1');
    // While operation is in flight, response-start payload has the agent
    const startPayload = payloads[0];
    expect(startPayload.activeAgentNames).toEqual(['my-agent']);

    end();
    // After idle, agent is removed from activeSources
    const idlePayload = payloads[payloads.length - 1];
    expect(idlePayload.type).toBe('idle');
    expect(idlePayload.activeAgentNames).toEqual([]);
  });

  it('excludes non-agent sources from activeAgentNames', async () => {
    const { beginWorldActivity } = await import('../../core/activity-tracker.js');

    const world = makeWorld();
    const payloads: any[] = [];
    world.eventEmitter.on('world', (p: any) => payloads.push(p));

    const end = beginWorldActivity(world, 'tool:some-tool', 'chat-1');
    const startPayload = payloads[0];
    expect(startPayload.activeAgentNames).toEqual([]);
    end();
  });

  it('getActiveAgentNames returns agent names without prefix', async () => {
    const { beginWorldActivity, getActiveAgentNames } = await import('../../core/activity-tracker.js');

    const world = makeWorld();
    const end = beginWorldActivity(world, 'agent:alice', 'chat-1');
    expect(getActiveAgentNames(world)).toEqual(['alice']);
    end();
    expect(getActiveAgentNames(world)).toEqual([]);
  });

  it('getActiveAgentNames returns [] for world with no activity state', async () => {
    const { getActiveAgentNames } = await import('../../core/activity-tracker.js');
    const world = makeWorld();
    expect(getActiveAgentNames(world)).toEqual([]);
  });
});
