/**
 * Unit Tests for Electron Preload Bridge
 *
 * Features:
 * - Verifies preload exposes a stable renderer API surface.
 * - Confirms IPC invoke wiring for key bridge methods.
 * - Validates chat event subscription/unsubscription callback flow.
 *
 * Implementation Notes:
 * - Uses dependency-injected `contextBridge`/`ipcRenderer` doubles.
 * - Avoids brittle runtime mocking of the Electron module.
 * - Keeps all assertions in-memory with no file-system dependencies.
 *
 * Recent Changes:
 * - 2026-02-14: Added coverage for `respondHitlOption` bridge wiring and `hitl:respond` invoke payload contract.
 * - 2026-02-14: Added coverage for `listSkills` bridge wiring and `skill:list` channel invoke.
 * - 2026-02-13: Added coverage for `editMessage` bridge wiring and invoke payload contract.
 * - 2026-02-13: Added coverage for `stopMessage` bridge wiring and invoke payload contract.
 * - 2026-02-12: Switched to dependency-injected bridge API tests for stable coverage outside Electron runtime.
 * - 2026-02-12: Moved into layer-based tests/electron subfolder and updated module import paths.
 * - 2026-02-12: Updated for TypeScript preload entry conversion and modular bridge wiring.
 * - 2026-02-12: Added preload bridge smoke/regression coverage for SS Phase 1 safety harness.
 */

import { describe, expect, it, vi } from 'vitest';
import { createDesktopApi, exposeDesktopApi } from '../../../electron/preload/bridge';

function createBridgeMocks() {
  return {
    invoke: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
    exposeInMainWorld: vi.fn()
  };
}

describe('electron preload bridge', () => {
  it('exposes desktop API on the expected global key', () => {
    const mocks = createBridgeMocks();
    exposeDesktopApi(
      { exposeInMainWorld: mocks.exposeInMainWorld },
      { invoke: mocks.invoke, on: mocks.on, removeListener: mocks.removeListener }
    );
    const call = mocks.exposeInMainWorld.mock.calls[0];
    const key = call?.[0];
    const api = call?.[1] as Record<string, (...args: unknown[]) => unknown>;

    expect(key).toBe('agentWorldDesktop');
    expect(api).toMatchObject({
      getWorkspace: expect.any(Function),
      loadWorldFromFolder: expect.any(Function),
      listWorlds: expect.any(Function),
      listSkills: expect.any(Function),
      sendMessage: expect.any(Function),
      editMessage: expect.any(Function),
      respondHitlOption: expect.any(Function),
      stopMessage: expect.any(Function),
      subscribeChatEvents: expect.any(Function),
      unsubscribeChatEvents: expect.any(Function),
      onChatEvent: expect.any(Function)
    });
  });

  it('routes send and subscription methods through ipcRenderer.invoke', () => {
    const mocks = createBridgeMocks();
    const api = createDesktopApi({
      invoke: mocks.invoke,
      on: mocks.on,
      removeListener: mocks.removeListener
    });

    const sendPayload = { worldId: 'world-1', chatId: 'chat-1', content: 'Hello' };
    api.sendMessage(sendPayload);
    api.listSkills();
    api.editMessage('world-1', 'msg-1', 'Updated', 'chat-1');
    api.respondHitlOption('world-1', 'req-1', 'yes_once', 'chat-1');
    api.stopMessage('world-1', 'chat-1');
    api.subscribeChatEvents('world-1', 'chat-1', 'sub-1');
    api.unsubscribeChatEvents('sub-1');

    expect(mocks.invoke).toHaveBeenNthCalledWith(1, 'chat:sendMessage', sendPayload);
    expect(mocks.invoke).toHaveBeenNthCalledWith(2, 'skill:list');
    expect(mocks.invoke).toHaveBeenNthCalledWith(3, 'message:edit', {
      worldId: 'world-1',
      messageId: 'msg-1',
      newContent: 'Updated',
      chatId: 'chat-1'
    });
    expect(mocks.invoke).toHaveBeenNthCalledWith(4, 'hitl:respond', {
      worldId: 'world-1',
      requestId: 'req-1',
      optionId: 'yes_once',
      chatId: 'chat-1'
    });
    expect(mocks.invoke).toHaveBeenNthCalledWith(5, 'chat:stopMessage', {
      worldId: 'world-1',
      chatId: 'chat-1'
    });
    expect(mocks.invoke).toHaveBeenNthCalledWith(6, 'chat:subscribeEvents', {
      worldId: 'world-1',
      chatId: 'chat-1',
      subscriptionId: 'sub-1'
    });
    expect(mocks.invoke).toHaveBeenNthCalledWith(7, 'chat:unsubscribeEvents', {
      subscriptionId: 'sub-1'
    });
  });

  it('wires chat event listener callback and cleanup correctly', () => {
    const mocks = createBridgeMocks();
    const api = createDesktopApi({
      invoke: mocks.invoke,
      on: mocks.on,
      removeListener: mocks.removeListener
    });
    const callback = vi.fn();

    const unsubscribe = api.onChatEvent(callback) as () => void;

    expect(mocks.on).toHaveBeenCalledWith('chat:event', expect.any(Function));
    const listener = mocks.on.mock.calls[0]?.[1] as (event: unknown, payload: unknown) => void;
    listener({}, { type: 'response-start', chatId: 'chat-1' });
    expect(callback).toHaveBeenCalledWith({ type: 'response-start', chatId: 'chat-1' });

    unsubscribe();
    expect(mocks.removeListener).toHaveBeenCalledWith('chat:event', listener);
  });
});
