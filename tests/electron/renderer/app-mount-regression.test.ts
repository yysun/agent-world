/**
 * Electron Renderer App-Level Proxy Ref Pattern Tests
 * Purpose:
 * - Verify the ref-based proxy indirection used by App.tsx for stable hook callbacks.
 *
 * Key Features:
 * - Tests that a proxy-ref wrapper always delegates to the latest underlying function.
 * - Validates that callers receive the return value from the current (not stale) delegate.
 *
 * Implementation Notes:
 * - Tests the pure proxy-ref pattern without React rendering or hook runtime.
 * - Covers the sessionSetterProxyRef / selectedSessionIdRef patterns introduced
 *   in the 2026-03-06 stable-hook-refs change.
 *
 * Recent Changes:
 * - 2026-03-06: Created targeted tests for proxy-ref callback stability pattern.
 */

import { describe, expect, it, vi } from 'vitest';

describe('App proxy-ref callback stability pattern', () => {
  it('proxy always delegates to the latest setter stored in the ref', () => {
    // Simulates the sessionSetterProxyRef indirection used in App.tsx:
    // proxySetSessions = (updater) => sessionSetterProxyRef.current.setSessions?.(updater)
    const proxyRef: { current: { setSessions: ((v: any) => void) | null } } = {
      current: { setSessions: null },
    };
    const proxy = (updater: any) => proxyRef.current.setSessions?.(updater);

    // Before useSessionManagement mounts — no delegate yet
    proxy('should-be-ignored');
    // No throw — optional chaining guards null delegate

    // After first render: useSessionManagement provides setSessions
    const firstSetter = vi.fn();
    proxyRef.current.setSessions = firstSetter;
    proxy('value-a');
    expect(firstSetter).toHaveBeenCalledWith('value-a');

    // After re-render with new setSessions identity (e.g. from state update)
    const secondSetter = vi.fn();
    proxyRef.current.setSessions = secondSetter;
    proxy('value-b');
    expect(secondSetter).toHaveBeenCalledWith('value-b');
    expect(firstSetter).toHaveBeenCalledTimes(1); // stale setter not called again
  });

  it('selectedSessionIdRef always returns the latest session id', () => {
    // Simulates: getSelectedSessionId = () => selectedSessionIdRef.current
    const ref: { current: string | null } = { current: null };
    const getter = () => ref.current;

    expect(getter()).toBeNull();

    ref.current = 'chat-1';
    expect(getter()).toBe('chat-1');

    ref.current = 'chat-2';
    expect(getter()).toBe('chat-2');
  });

  it('proxy ref handles function updaters like React setState', () => {
    // proxySetSessions may be called with a function updater: setSessions(prev => [...prev, x])
    const proxyRef: { current: { setSessions: ((v: any) => void) | null } } = {
      current: { setSessions: null },
    };
    const proxy = (updater: any) => proxyRef.current.setSessions?.(updater);

    const mockSetState = vi.fn();
    proxyRef.current.setSessions = mockSetState;

    const updater = (prev: string[]) => [...prev, 'new-session'];
    proxy(updater);
    expect(mockSetState).toHaveBeenCalledWith(updater);
  });
});