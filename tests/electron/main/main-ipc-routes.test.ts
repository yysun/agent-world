/**
 * Unit Tests for Main IPC Route Wiring
 *
 * Features:
 * - Verifies canonical channel list and registration order.
 * - Confirms payload routing for channel handlers.
 * - Ensures registration uses deterministic route definitions.
 *
 * Implementation Notes:
 * - Uses injected handler mocks without real Electron runtime.
 * - Tests route build + registration helpers together.
 *
 * Recent Changes:
 * - 2026-02-14: Added channel/order/payload assertions for `hitl:respond` route wiring.
 * - 2026-02-14: Added channel/order/payload assertions for `skill:list` route wiring.
 * - 2026-02-13: Added channel/order/payload assertions for `message:edit` route wiring.
 * - 2026-02-13: Added channel/order/payload assertions for `chat:stopMessage` route wiring.
 * - 2026-02-12: Moved into layer-based tests/electron subfolder and updated module import paths.
 * - 2026-02-12: Added Phase 3 coverage for main-process IPC orchestration and channel wiring.
 */

import { describe, it, expect, vi } from 'vitest';
import { buildMainIpcRoutes } from '../../../electron/main-process/ipc-routes';
import { registerIpcRoutes } from '../../../electron/main-process/ipc-registration';

function createHandlerMocks() {
  return {
    getWorkspaceState: vi.fn(async () => ({})),
    openWorkspaceDialog: vi.fn(async () => ({})),
    pickDirectoryDialog: vi.fn(async () => ({ canceled: true, directoryPath: null })),
    loadWorldsFromWorkspace: vi.fn(async () => ([])),
    loadSpecificWorld: vi.fn(async () => ({})),
    importWorld: vi.fn(async () => ({})),
    listWorkspaceWorlds: vi.fn(async () => ([])),
    listSkillRegistry: vi.fn(async () => ([])),
    createWorkspaceWorld: vi.fn(async () => ({})),
    updateWorkspaceWorld: vi.fn(async () => ({})),
    deleteWorkspaceWorld: vi.fn(async () => ({ deleted: true })),
    createWorldAgent: vi.fn(async () => ({})),
    updateWorldAgent: vi.fn(async () => ({})),
    deleteWorldAgent: vi.fn(async () => ({ deleted: true })),
    readWorldPreference: vi.fn(async () => 'world-1'),
    writeWorldPreference: vi.fn(async () => true),
    listWorldSessions: vi.fn(async () => ([])),
    createWorldSession: vi.fn(async () => ({})),
    deleteWorldSession: vi.fn(async () => ({ deleted: true })),
    selectWorldSession: vi.fn(async () => true),
    getSessionMessages: vi.fn(async () => ([])),
    sendChatMessage: vi.fn(async () => ({})),
    editMessageInChat: vi.fn(async () => ({})),
    respondHitlOption: vi.fn(async () => ({ accepted: true })),
    stopChatMessage: vi.fn(async () => ({ stopped: true })),
    deleteMessageFromChat: vi.fn(async () => ({ deleted: true })),
    subscribeChatEvents: vi.fn(async () => ({ subscribed: true })),
    unsubscribeChatEvents: vi.fn(async () => ({ unsubscribed: true })),
    getSystemSettings: vi.fn(async () => ({})),
    saveSystemSettings: vi.fn(async () => true),
    openFileDialog: vi.fn(async () => ({ canceled: true, filePath: null }))
  };
}

describe('buildMainIpcRoutes', () => {
  it('builds the expected canonical channel list in deterministic order', () => {
    const handlers = createHandlerMocks();
    const routes = buildMainIpcRoutes(handlers);

    expect(routes.map((route) => route.channel)).toEqual([
      'workspace:get',
      'workspace:open',
      'dialog:pickDirectory',
      'world:loadFromFolder',
      'world:load',
      'world:import',
      'world:list',
      'skill:list',
      'world:create',
      'world:update',
      'world:delete',
      'agent:create',
      'agent:update',
      'agent:delete',
      'world:getLastSelected',
      'world:saveLastSelected',
      'session:list',
      'session:create',
      'chat:delete',
      'session:delete',
      'session:select',
      'chat:getMessages',
      'chat:sendMessage',
      'message:edit',
      'hitl:respond',
      'chat:stopMessage',
      'message:delete',
      'chat:subscribeEvents',
      'chat:unsubscribeEvents',
      'settings:get',
      'settings:save',
      'dialog:pickFile'
    ]);
  });

  it('routes payloads to the correct dependencies', async () => {
    const handlers = createHandlerMocks();
    const routes = buildMainIpcRoutes(handlers);

    await routes.find((route) => route.channel === 'world:saveLastSelected')?.handler({}, 'world-99');
    await routes.find((route) => route.channel === 'workspace:open')?.handler({}, { directoryPath: '/tmp/workspace' });
    await routes.find((route) => route.channel === 'dialog:pickDirectory')?.handler({});
    await routes.find((route) => route.channel === 'skill:list')?.handler({});
    await routes.find((route) => route.channel === 'session:list')?.handler({}, { worldId: 'w-1' });
    await routes.find((route) => route.channel === 'chat:delete')?.handler({}, { worldId: 'w-1', chatId: 'c-1' });
    await routes.find((route) => route.channel === 'message:edit')?.handler({}, { worldId: 'w-1', chatId: 'c-1', messageId: 'm-1', newContent: 'updated' });
    await routes.find((route) => route.channel === 'hitl:respond')?.handler({}, { worldId: 'w-1', requestId: 'req-1', optionId: 'yes_once' });
    await routes.find((route) => route.channel === 'chat:stopMessage')?.handler({}, { worldId: 'w-1', chatId: 'c-1' });
    await routes.find((route) => route.channel === 'settings:get')?.handler({});
    await routes.find((route) => route.channel === 'settings:save')?.handler({}, { storageType: 'sqlite' });
    await routes.find((route) => route.channel === 'dialog:pickFile')?.handler({});

    expect(handlers.writeWorldPreference).toHaveBeenCalledWith('world-99');
    expect(handlers.openWorkspaceDialog).toHaveBeenCalledWith({ directoryPath: '/tmp/workspace' });
    expect(handlers.pickDirectoryDialog).toHaveBeenCalledTimes(1);
    expect(handlers.listSkillRegistry).toHaveBeenCalledTimes(1);
    expect(handlers.listWorldSessions).toHaveBeenCalledWith('w-1');
    expect(handlers.deleteWorldSession).toHaveBeenCalledWith('w-1', 'c-1');
    expect(handlers.editMessageInChat).toHaveBeenCalledWith({ worldId: 'w-1', chatId: 'c-1', messageId: 'm-1', newContent: 'updated' });
    expect(handlers.respondHitlOption).toHaveBeenCalledWith({ worldId: 'w-1', requestId: 'req-1', optionId: 'yes_once' });
    expect(handlers.stopChatMessage).toHaveBeenCalledWith({ worldId: 'w-1', chatId: 'c-1' });
    expect(handlers.getSystemSettings).toHaveBeenCalledTimes(1);
    expect(handlers.saveSystemSettings).toHaveBeenCalledWith({ storageType: 'sqlite' });
    expect(handlers.openFileDialog).toHaveBeenCalledTimes(1);
  });
});

describe('registerIpcRoutes', () => {
  it('registers all channels using ipcMain.handle', () => {
    const handlers = createHandlerMocks();
    const routes = buildMainIpcRoutes(handlers);
    const ipcMainLike = { handle: vi.fn() };

    registerIpcRoutes(ipcMainLike, routes);

    expect(ipcMainLike.handle).toHaveBeenCalledTimes(routes.length);
    expect(ipcMainLike.handle).toHaveBeenNthCalledWith(
      1,
      'workspace:get',
      expect.any(Function)
    );
    expect(ipcMainLike.handle).toHaveBeenNthCalledWith(
      routes.length,
      'dialog:pickFile',
      expect.any(Function)
    );
  });
});
