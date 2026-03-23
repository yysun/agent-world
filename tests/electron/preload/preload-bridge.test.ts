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
 * - 2026-03-22: Added relative-path coverage for `readSkillContent` and `saveSkillContent` so tree-selected skill files use the same IPC surface.
 * - 2026-03-22: Added bridge coverage for `readSkillFolderStructure(skillId)` IPC forwarding.
 * - 2026-03-22: Added bridge coverage for `deleteSkill(skillId)` IPC forwarding.
 * - 2026-03-19: Added regression coverage for `pickDirectory(defaultPath)` payload forwarding while preserving `openWorkspace(directoryPath)` wiring.
 * - 2026-02-26: Added coverage for `getLoggingConfig()` IPC bridge wiring.
 * - 2026-02-26: Added coverage for `importWorld({ source })` payload forwarding to `world:import`.
 * - 2026-02-19: Added coverage for `exportWorld` bridge wiring and `world:export` invoke payload contract.
 * - 2026-02-16: Added coverage for `branchSessionFromMessage` bridge wiring and invoke payload contract.
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
    invoke: vi.fn().mockResolvedValue(undefined),
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
      pickDirectory: expect.any(Function),
      openExternalLink: expect.any(Function),
      loadWorldFromFolder: expect.any(Function),
      listWorlds: expect.any(Function),
      exportWorld: expect.any(Function),
      listHeartbeatJobs: expect.any(Function),
      runHeartbeat: expect.any(Function),
      pauseHeartbeat: expect.any(Function),
      stopHeartbeat: expect.any(Function),
      listSkills: expect.any(Function),
      readSkillContent: expect.any(Function),
      readSkillFolderStructure: expect.any(Function),
      saveSkillContent: expect.any(Function),
      deleteSkill: expect.any(Function),
      sendMessage: expect.any(Function),
      branchSessionFromMessage: expect.any(Function),
      editMessage: expect.any(Function),
      respondHitlOption: expect.any(Function),
      stopMessage: expect.any(Function),
      subscribeChatEvents: expect.any(Function),
      unsubscribeChatEvents: expect.any(Function),
      getUpdateState: expect.any(Function),
      checkForUpdates: expect.any(Function),
      installUpdateAndRestart: expect.any(Function),
      onUpdateEvent: expect.any(Function),
      getLoggingConfig: expect.any(Function),
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
    api.pickDirectory('/tmp/current-project');
    api.openWorkspace('/tmp/workspace');
    api.openExternalLink('https://example.com/docs');
    api.importWorld({ source: '@awesome-agent-world/infinite-etude' });
    api.exportWorld('world-1');
    api.listHeartbeatJobs();
    api.runHeartbeat('world-1');
    api.pauseHeartbeat('world-1');
    api.stopHeartbeat('world-1');
    api.listSkills({ worldId: 'world-1' });
    api.branchSessionFromMessage('world-1', 'chat-1', 'msg-1');
    api.editMessage('world-1', 'msg-1', 'Updated', 'chat-1');
    api.respondHitlOption('world-1', 'req-1', 'yes_once', 'chat-1');
    api.stopMessage('world-1', 'chat-1');
    api.subscribeChatEvents('world-1', 'chat-1', 'sub-1');
    api.unsubscribeChatEvents('sub-1');
    api.getUpdateState();
    api.checkForUpdates();
    api.installUpdateAndRestart();
    api.getLoggingConfig();
    api.readSkillContent('skill-1', 'notes/guide.md');
    api.readSkillFolderStructure('skill-1');
    api.saveSkillContent('skill-1', '# Updated', 'notes/guide.md');
    api.deleteSkill('skill-1');

    expect(mocks.invoke).toHaveBeenNthCalledWith(1, 'chat:sendMessage', sendPayload);
    expect(mocks.invoke).toHaveBeenNthCalledWith(2, 'dialog:pickDirectory', { defaultPath: '/tmp/current-project' });
    expect(mocks.invoke).toHaveBeenNthCalledWith(3, 'workspace:open', { directoryPath: '/tmp/workspace' });
    expect(mocks.invoke).toHaveBeenNthCalledWith(4, 'link:openExternal', { url: 'https://example.com/docs' });
    expect(mocks.invoke).toHaveBeenNthCalledWith(5, 'world:import', {
      source: '@awesome-agent-world/infinite-etude'
    });
    expect(mocks.invoke).toHaveBeenNthCalledWith(6, 'world:export', { worldId: 'world-1' });
    expect(mocks.invoke).toHaveBeenNthCalledWith(7, 'heartbeat:list');
    expect(mocks.invoke).toHaveBeenNthCalledWith(8, 'heartbeat:run', { worldId: 'world-1' });
    expect(mocks.invoke).toHaveBeenNthCalledWith(9, 'heartbeat:pause', { worldId: 'world-1' });
    expect(mocks.invoke).toHaveBeenNthCalledWith(10, 'heartbeat:stop', { worldId: 'world-1' });
    expect(mocks.invoke).toHaveBeenNthCalledWith(11, 'skill:list', { worldId: 'world-1' });
    expect(mocks.invoke).toHaveBeenNthCalledWith(12, 'session:branchFromMessage', {
      worldId: 'world-1',
      chatId: 'chat-1',
      messageId: 'msg-1'
    });
    expect(mocks.invoke).toHaveBeenNthCalledWith(13, 'message:edit', {
      worldId: 'world-1',
      messageId: 'msg-1',
      newContent: 'Updated',
      chatId: 'chat-1'
    });
    expect(mocks.invoke).toHaveBeenNthCalledWith(14, 'hitl:respond', {
      worldId: 'world-1',
      requestId: 'req-1',
      optionId: 'yes_once',
      chatId: 'chat-1'
    });
    expect(mocks.invoke).toHaveBeenNthCalledWith(15, 'chat:stopMessage', {
      worldId: 'world-1',
      chatId: 'chat-1'
    });
    expect(mocks.invoke).toHaveBeenNthCalledWith(16, 'chat:subscribeEvents', {
      worldId: 'world-1',
      chatId: 'chat-1',
      subscriptionId: 'sub-1'
    });
    expect(mocks.invoke).toHaveBeenNthCalledWith(17, 'chat:unsubscribeEvents', {
      subscriptionId: 'sub-1'
    });
    expect(mocks.invoke).toHaveBeenNthCalledWith(18, 'update:getState');
    expect(mocks.invoke).toHaveBeenNthCalledWith(19, 'update:check');
    expect(mocks.invoke).toHaveBeenNthCalledWith(20, 'update:installAndRestart');
    expect(mocks.invoke).toHaveBeenNthCalledWith(21, 'logging:getConfig');
    expect(mocks.invoke).toHaveBeenNthCalledWith(22, 'skill:readContent', { skillId: 'skill-1', relativePath: 'notes/guide.md' });
    expect(mocks.invoke).toHaveBeenNthCalledWith(23, 'skill:readFolderStructure', { skillId: 'skill-1' });
    expect(mocks.invoke).toHaveBeenNthCalledWith(24, 'skill:saveContent', { skillId: 'skill-1', content: '# Updated', relativePath: 'notes/guide.md' });
    expect(mocks.invoke).toHaveBeenNthCalledWith(25, 'skill:delete', { skillId: 'skill-1' });
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

  it('wires update event listener callback and cleanup correctly', () => {
    const mocks = createBridgeMocks();
    const api = createDesktopApi({
      invoke: mocks.invoke,
      on: mocks.on,
      removeListener: mocks.removeListener
    });
    const callback = vi.fn();

    const unsubscribe = api.onUpdateEvent(callback) as () => void;

    expect(mocks.on).toHaveBeenCalledWith('update:event', expect.any(Function));
    const listener = mocks.on.mock.calls[0]?.[1] as (event: unknown, payload: unknown) => void;
    listener({}, { status: 'downloaded', downloadedVersion: '0.16.0' });
    expect(callback).toHaveBeenCalledWith({ status: 'downloaded', downloadedVersion: '0.16.0' });

    unsubscribe();
    expect(mocks.removeListener).toHaveBeenCalledWith('update:event', listener);
  });
});
