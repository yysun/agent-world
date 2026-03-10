/**
 * Chat Event Subscription Dependency Stability Tests
 * Purpose:
 * - Verify `useChatEventSubscriptions` keeps effect dependencies stable when callback props change.
 *
 * Key Features:
 * - Captures `useEffect` dependency arrays without a React runtime.
 * - Confirms callback-identity changes do not enter subscription effect deps.
 * - Protects against cleanup/rebind cycles that would flush active streaming state.
 *
 * Implementation Notes:
 * - Uses a lightweight mocked `react` module to record `useEffect` deps.
 * - Focuses on the hook boundary rather than DOM rendering.
 *
 * Recent Changes:
 * - 2026-03-10: Added regression coverage for AGENTS.md Rules 1-3.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const effectDeps: unknown[][] = [];

vi.mock('react', () => ({
  useEffect: (_effect: unknown, deps?: unknown[]) => {
    effectDeps.push(Array.isArray(deps) ? [...deps] : []);
  },
  useRef: (value?: unknown) => ({ current: value }),
  useState: (value: unknown) => [value, vi.fn()],
}), { virtual: true });

import { useChatEventSubscriptions } from '../../../electron/renderer/src/hooks/useChatEventSubscriptions';

describe('useChatEventSubscriptions dependency stability', () => {
  beforeEach(() => {
    effectDeps.length = 0;
  });

  it('keeps subscription effect deps stable when callback identities change', () => {
    const api = {
      onChatEvent: vi.fn(() => vi.fn()),
      subscribeChatEvents: vi.fn(async () => undefined),
      unsubscribeChatEvents: vi.fn(async () => undefined),
    };
    const chatSubscriptionCounter = { current: 0 };
    const streamingStateRef = { current: null };
    const setMessages = vi.fn();
    const setHitlPromptQueue = vi.fn();

    useChatEventSubscriptions({
      api: api as any,
      loadedWorld: { id: 'world-1' },
      selectedSessionId: 'chat-1',
      setMessages,
      chatSubscriptionCounter: chatSubscriptionCounter as any,
      streamingStateRef: streamingStateRef as any,
      refreshSessions: vi.fn(async () => undefined),
      resetActivityRuntimeState: vi.fn(),
      setHitlPromptQueue,
      onMainLogEvent: vi.fn(),
      onSessionSystemEvent: vi.fn(),
    });

    useChatEventSubscriptions({
      api: api as any,
      loadedWorld: { id: 'world-1' },
      selectedSessionId: 'chat-1',
      setMessages,
      chatSubscriptionCounter: chatSubscriptionCounter as any,
      streamingStateRef: streamingStateRef as any,
      refreshSessions: vi.fn(async () => undefined),
      resetActivityRuntimeState: vi.fn(),
      setHitlPromptQueue: vi.fn(),
      onMainLogEvent: vi.fn(),
      onSessionSystemEvent: vi.fn(),
    });

    expect(effectDeps).toHaveLength(4);

    const [firstGlobalLogDeps, firstSubscriptionDeps, secondGlobalLogDeps, secondSubscriptionDeps] = effectDeps;
    expect(firstGlobalLogDeps).toEqual([api]);
    expect(secondGlobalLogDeps).toEqual([api]);
    expect(firstSubscriptionDeps).toEqual(secondSubscriptionDeps);
    expect(firstSubscriptionDeps).toEqual([
      api,
      chatSubscriptionCounter,
      'world-1',
      'chat-1',
      setMessages,
      streamingStateRef,
    ]);
  });
});
