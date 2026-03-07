/**
 * Chat Event Subscriptions Ref-Callback Stability Tests
 * Purpose:
 * - Verify that the ref-ified callback pattern in useChatEventSubscriptions
 *   correctly reads latest callback values at call-time, not at creation-time.
 *
 * Key Features:
 * - Tests closures that read .current from refs always invoke the latest delegate.
 * - Tests that createGlobalLogEventHandler receives a stable wrapper whose behavior
 *   tracks the latest onMainLogEvent callback.
 * - Tests that forwardSessionSystemEvent reads refreshSessions and onSessionSystemEvent
 *   from refs at call-time, supporting hot-swapping of callbacks between renders.
 *
 * Implementation Notes:
 * - Tests the pure closure/indirection patterns without React hook runtime.
 * - Directly imports createGlobalLogEventHandler and forwardSessionSystemEvent
 *   to verify the ref-based wiring contract.
 *
 * Recent Changes:
 * - 2026-03-06: Created for ref-ified callback stability coverage.
 */

import { describe, expect, it, vi } from 'vitest';
import { createGlobalLogEventHandler } from '../../../electron/renderer/src/domain/chat-event-handlers';
import { forwardSessionSystemEvent } from '../../../electron/renderer/src/hooks/useChatEventSubscriptions';

describe('ref-callback stability: global log handler', () => {
  it('wrapper that reads ref.current delegates to the latest callback', () => {
    // Simulates the pattern from useChatEventSubscriptions:
    //   const onMainLogEventRef = useRef(onMainLogEvent);
    //   onMainLogEventRef.current = onMainLogEvent; // updated every render
    //   createGlobalLogEventHandler({ onMainLogEvent: (entry) => onMainLogEventRef.current?.(entry) })
    const ref: { current: ((entry: any) => void) | undefined } = { current: undefined };
    const stableWrapper = (entry: any) => ref.current?.(entry);

    const handler = createGlobalLogEventHandler({ onMainLogEvent: stableWrapper });

    // Render 1: first callback identity
    const firstCallback = vi.fn();
    ref.current = firstCallback;

    handler({
      type: 'log',
      logEvent: { level: 'info', category: 'test', message: 'hello', timestamp: '2026-01-01T00:00:00Z' },
    });
    expect(firstCallback).toHaveBeenCalledTimes(1);
    expect(firstCallback).toHaveBeenCalledWith(
      expect.objectContaining({ process: 'main', level: 'info', category: 'test', message: 'hello' })
    );

    // Render 2: callback identity changes (e.g. parent re-rendered)
    const secondCallback = vi.fn();
    ref.current = secondCallback;

    handler({
      type: 'log',
      logEvent: { level: 'warn', category: 'test2', message: 'world', timestamp: '2026-01-01T00:00:01Z' },
    });
    expect(secondCallback).toHaveBeenCalledTimes(1);
    expect(firstCallback).toHaveBeenCalledTimes(1); // stale callback not invoked again
  });

  it('handler is safe when ref.current is undefined', () => {
    const ref: { current: ((entry: any) => void) | undefined } = { current: undefined };
    const stableWrapper = (entry: any) => ref.current?.(entry);

    const handler = createGlobalLogEventHandler({ onMainLogEvent: stableWrapper });

    // Should not throw when no callback is set
    expect(() => {
      handler({
        type: 'log',
        logEvent: { level: 'info', category: 'test', message: 'ignored', timestamp: '2026-01-01T00:00:00Z' },
      });
    }).not.toThrow();
  });
});

describe('ref-callback stability: forwardSessionSystemEvent', () => {
  it('reads refreshSessions and onSessionSystemEvent from refs at call-time', () => {
    // Simulates the pattern from useChatEventSubscriptions:
    //   onSessionSystemEvent: (systemEvent) => forwardSessionSystemEvent({
    //     loadedWorldId,
    //     refreshSessions: refreshSessionsRef.current,
    //     onSessionSystemEvent: onSessionSystemEventRef.current,
    //     systemEvent,
    //   })
    const refreshRef: { current: (wid: string, cid?: string | null) => Promise<void> } = {
      current: vi.fn(async () => { }),
    };
    const systemEventRef: { current: ((event: any) => void) | undefined } = {
      current: vi.fn(),
    };

    const titleEvent = {
      eventType: 'chat-title-updated',
      chatId: 'chat-1',
      messageId: 'msg-1',
      createdAt: '2026-03-06T00:00:00Z',
      content: { eventType: 'chat-title-updated', title: 'New Title' },
    };

    // Call 1: uses first set of callbacks
    const firstRefresh = refreshRef.current as ReturnType<typeof vi.fn>;
    const firstSysEvent = systemEventRef.current as ReturnType<typeof vi.fn>;

    forwardSessionSystemEvent({
      loadedWorldId: 'world-1',
      refreshSessions: refreshRef.current,
      onSessionSystemEvent: systemEventRef.current,
      systemEvent: titleEvent,
    });

    expect(firstRefresh).toHaveBeenCalledWith('world-1', 'chat-1');
    expect(firstSysEvent).toHaveBeenCalledWith(titleEvent);

    // Simulate re-render: callbacks change identity
    const secondRefresh = vi.fn(async () => { });
    const secondSysEvent = vi.fn();
    refreshRef.current = secondRefresh;
    systemEventRef.current = secondSysEvent;

    forwardSessionSystemEvent({
      loadedWorldId: 'world-1',
      refreshSessions: refreshRef.current,
      onSessionSystemEvent: systemEventRef.current,
      systemEvent: titleEvent,
    });

    expect(secondRefresh).toHaveBeenCalledWith('world-1', 'chat-1');
    expect(secondSysEvent).toHaveBeenCalledWith(titleEvent);
    // First callbacks should not receive additional calls
    expect(firstRefresh).toHaveBeenCalledTimes(1);
    expect(firstSysEvent).toHaveBeenCalledTimes(1);
  });
});
