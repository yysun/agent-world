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
 * - 2026-03-22: Added `skill:delete` channel/order/payload coverage.
 * - 2026-03-19: Added payload-routing coverage for `dialog:pickDirectory(defaultPath)` without changing `workspace:open(directoryPath)` routing.
 * - 2026-03-15: Added canonical channel and payload coverage for `agent:import`
 *   and `skill:import` route wiring.
 * - 2026-03-08: Updated canonical channel list and last-route assertion for skill:readContent and skill:saveContent.
 * - 2026-02-26: Added channel/order/payload assertions for `logging:getConfig` route wiring.
 * - 2026-02-26: Added payload assertion for `world:import` route wiring with optional `source` input.
 * - 2026-02-19: Added channel/order/payload assertions for `world:export` route wiring.
 * - 2026-02-16: Added channel/order/payload assertions for `session:branchFromMessage` route wiring.
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
    openExternalLink: vi.fn(async () => ({ opened: true })),
    loadWorldsFromWorkspace: vi.fn(async () => ([])),
    loadSpecificWorld: vi.fn(async () => ({})),
    importWorld: vi.fn(async () => ({})),
    importAgent: vi.fn(async () => ({})),
    importSkill: vi.fn(async () => ({})),
    exportWorld: vi.fn(async () => ({})),
    listWorkspaceWorlds: vi.fn(async () => ([])),
    listSkillRegistry: vi.fn(async () => ([])),
    createWorkspaceWorld: vi.fn(async () => ({})),
    updateWorkspaceWorld: vi.fn(async () => ({})),
    deleteWorkspaceWorld: vi.fn(async () => ({ deleted: true })),
    listHeartbeatJobs: vi.fn(async () => ([])),
    runHeartbeatJob: vi.fn(async () => ({ ok: true })),
    pauseHeartbeatJob: vi.fn(async () => ({ ok: true })),
    stopHeartbeatJob: vi.fn(async () => ({ ok: true })),
    createWorldAgent: vi.fn(async () => ({})),
    updateWorldAgent: vi.fn(async () => ({})),
    deleteWorldAgent: vi.fn(async () => ({ deleted: true })),
    readWorldPreference: vi.fn(async () => 'world-1'),
    writeWorldPreference: vi.fn(async () => true),
    listWorldSessions: vi.fn(async () => ([])),
    createWorldSession: vi.fn(async () => ({})),
    branchWorldSessionFromMessage: vi.fn(async () => ({})),
    deleteWorldSession: vi.fn(async () => ({ deleted: true })),
    selectWorldSession: vi.fn(async () => true),
    getSessionMessages: vi.fn(async () => ([])),
    getChatEvents: vi.fn(async () => ([])),
    sendChatMessage: vi.fn(async () => ({})),
    editMessageInChat: vi.fn(async () => ({})),
    respondHitlOption: vi.fn(async () => ({ accepted: true })),
    stopChatMessage: vi.fn(async () => ({ stopped: true })),
    deleteMessageFromChat: vi.fn(async () => ({ deleted: true })),
    subscribeChatEvents: vi.fn(async () => ({ subscribed: true })),
    unsubscribeChatEvents: vi.fn(async () => ({ unsubscribed: true })),
    getUpdateState: vi.fn(async () => ({ status: 'idle' })),
    checkForUpdates: vi.fn(async () => ({ status: 'checking' })),
    installUpdateAndRestart: vi.fn(async () => ({ accepted: true })),
    getLoggingConfig: vi.fn(async () => ({ globalLevel: 'error', categoryLevels: {}, nodeEnv: 'test' })),
    getSystemSettings: vi.fn(async () => ({})),
    saveSystemSettings: vi.fn(async () => true),
    openFileDialog: vi.fn(async () => ({ canceled: true, filePath: null })),
    addToQueue: vi.fn(async () => ({ success: true })),
    getQueuedMessages: vi.fn(async () => ([])),
    removeFromQueue: vi.fn(async () => ({ success: true })),
    clearChatQueue: vi.fn(async () => ({ success: true })),
    pauseChatQueue: vi.fn(async () => ({ success: true })),
    resumeChatQueue: vi.fn(async () => ({ success: true })),
    stopChatQueue: vi.fn(async () => ({ success: true })),
    retryQueueMessage: vi.fn(async () => ({ success: true })),
    readSkillContent: vi.fn(async () => '# skill content'),
    saveSkillContent: vi.fn(async () => undefined),
    deleteSkill: vi.fn(async () => undefined)
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
      'link:openExternal',
      'world:loadFromFolder',
      'world:load',
      'world:import',
      'agent:import',
      'skill:import',
      'world:export',
      'world:list',
      'skill:list',
      'world:create',
      'world:update',
      'world:delete',
      'heartbeat:list',
      'heartbeat:run',
      'heartbeat:pause',
      'heartbeat:stop',
      'agent:create',
      'agent:update',
      'agent:delete',
      'world:getLastSelected',
      'world:saveLastSelected',
      'session:list',
      'session:create',
      'session:branchFromMessage',
      'chat:delete',
      'session:delete',
      'session:select',
      'chat:getMessages',
      'chat:getEvents',
      'chat:sendMessage',
      'message:edit',
      'hitl:respond',
      'chat:stopMessage',
      'message:delete',
      'chat:subscribeEvents',
      'chat:unsubscribeEvents',
      'update:getState',
      'update:check',
      'update:installAndRestart',
      'logging:getConfig',
      'settings:get',
      'settings:save',
      'dialog:pickFile',
      'queue:add',
      'queue:get',
      'queue:remove',
      'queue:clear',
      'queue:pause',
      'queue:resume',
      'queue:stop',
      'queue:retry',
      'skill:readContent',
      'skill:saveContent',
      'skill:delete'
    ]);
  });

  it('routes payloads to the correct dependencies', async () => {
    const handlers = createHandlerMocks();
    const routes = buildMainIpcRoutes(handlers);

    await routes.find((route) => route.channel === 'world:saveLastSelected')?.handler({}, 'world-99');
    await routes.find((route) => route.channel === 'workspace:open')?.handler({}, { directoryPath: '/tmp/workspace' });
    await routes.find((route) => route.channel === 'dialog:pickDirectory')?.handler({}, { defaultPath: '/tmp/current-project' });
    await routes.find((route) => route.channel === 'link:openExternal')?.handler({}, { url: 'https://example.com/docs' });
    await routes.find((route) => route.channel === 'world:import')?.handler({}, { source: '@awesome-agent-world/infinite-etude' });
    await routes.find((route) => route.channel === 'agent:import')?.handler({}, { repo: 'yysun/agent-worlds', itemName: 'guide-agent' });
    await routes.find((route) => route.channel === 'skill:import')?.handler({}, { repo: 'yysun/agent-skills', itemName: 'reviewer' });
    await routes.find((route) => route.channel === 'world:export')?.handler({}, { worldId: 'w-9' });
    await routes.find((route) => route.channel === 'skill:list')?.handler({});
    await routes.find((route) => route.channel === 'heartbeat:list')?.handler({});
    await routes.find((route) => route.channel === 'heartbeat:run')?.handler({}, { worldId: 'w-1' });
    await routes.find((route) => route.channel === 'heartbeat:pause')?.handler({}, { worldId: 'w-1' });
    await routes.find((route) => route.channel === 'heartbeat:stop')?.handler({}, { worldId: 'w-1' });
    await routes.find((route) => route.channel === 'session:list')?.handler({}, { worldId: 'w-1' });
    await routes.find((route) => route.channel === 'session:branchFromMessage')?.handler({}, { worldId: 'w-1', chatId: 'c-1', messageId: 'm-1' });
    await routes.find((route) => route.channel === 'chat:delete')?.handler({}, { worldId: 'w-1', chatId: 'c-1' });
    await routes.find((route) => route.channel === 'message:edit')?.handler({}, { worldId: 'w-1', chatId: 'c-1', messageId: 'm-1', newContent: 'updated' });
    await routes.find((route) => route.channel === 'hitl:respond')?.handler({}, { worldId: 'w-1', requestId: 'req-1', optionId: 'yes_once' });
    await routes.find((route) => route.channel === 'chat:stopMessage')?.handler({}, { worldId: 'w-1', chatId: 'c-1' });
    await routes.find((route) => route.channel === 'update:getState')?.handler({});
    await routes.find((route) => route.channel === 'update:check')?.handler({});
    await routes.find((route) => route.channel === 'update:installAndRestart')?.handler({});
    await routes.find((route) => route.channel === 'logging:getConfig')?.handler({});
    await routes.find((route) => route.channel === 'settings:get')?.handler({});
    await routes.find((route) => route.channel === 'settings:save')?.handler({}, { storageType: 'sqlite' });
    await routes.find((route) => route.channel === 'dialog:pickFile')?.handler({});
    await routes.find((route) => route.channel === 'queue:add')?.handler({}, { worldId: 'w-1', chatId: 'c-1', content: 'hello' });
    await routes.find((route) => route.channel === 'queue:get')?.handler({}, { worldId: 'w-1', chatId: 'c-1' });
    await routes.find((route) => route.channel === 'queue:remove')?.handler({}, { worldId: 'w-1', messageId: 'm-1' });
    await routes.find((route) => route.channel === 'queue:clear')?.handler({}, { worldId: 'w-1', chatId: 'c-1' });
    await routes.find((route) => route.channel === 'queue:pause')?.handler({}, { worldId: 'w-1', chatId: 'c-1' });
    await routes.find((route) => route.channel === 'queue:resume')?.handler({}, { worldId: 'w-1', chatId: 'c-1' });
    await routes.find((route) => route.channel === 'queue:stop')?.handler({}, { worldId: 'w-1', chatId: 'c-1' });
    await routes.find((route) => route.channel === 'queue:retry')?.handler({}, { worldId: 'w-1', messageId: 'm-1', chatId: 'c-1' });
    await routes.find((route) => route.channel === 'skill:delete')?.handler({}, { skillId: 'skill-1' });

    expect(handlers.writeWorldPreference).toHaveBeenCalledWith('world-99');
    expect(handlers.openWorkspaceDialog).toHaveBeenCalledWith({ directoryPath: '/tmp/workspace' });
    expect(handlers.pickDirectoryDialog).toHaveBeenCalledWith({ defaultPath: '/tmp/current-project' });
    expect(handlers.openExternalLink).toHaveBeenCalledWith({ url: 'https://example.com/docs' });
    expect(handlers.importWorld).toHaveBeenCalledWith({ source: '@awesome-agent-world/infinite-etude' });
    expect(handlers.importAgent).toHaveBeenCalledWith({ repo: 'yysun/agent-worlds', itemName: 'guide-agent' });
    expect(handlers.importSkill).toHaveBeenCalledWith({ repo: 'yysun/agent-skills', itemName: 'reviewer' });
    expect(handlers.exportWorld).toHaveBeenCalledWith({ worldId: 'w-9' });
    expect(handlers.listSkillRegistry).toHaveBeenCalledTimes(1);
    expect(handlers.listHeartbeatJobs).toHaveBeenCalledTimes(1);
    expect(handlers.runHeartbeatJob).toHaveBeenCalledWith({ worldId: 'w-1' });
    expect(handlers.pauseHeartbeatJob).toHaveBeenCalledWith({ worldId: 'w-1' });
    expect(handlers.stopHeartbeatJob).toHaveBeenCalledWith({ worldId: 'w-1' });
    expect(handlers.listWorldSessions).toHaveBeenCalledWith('w-1');
    expect(handlers.branchWorldSessionFromMessage).toHaveBeenCalledWith({ worldId: 'w-1', chatId: 'c-1', messageId: 'm-1' });
    expect(handlers.deleteWorldSession).toHaveBeenCalledWith('w-1', 'c-1');
    expect(handlers.editMessageInChat).toHaveBeenCalledWith({ worldId: 'w-1', chatId: 'c-1', messageId: 'm-1', newContent: 'updated' });
    expect(handlers.respondHitlOption).toHaveBeenCalledWith({ worldId: 'w-1', requestId: 'req-1', optionId: 'yes_once' });
    expect(handlers.stopChatMessage).toHaveBeenCalledWith({ worldId: 'w-1', chatId: 'c-1' });
    expect(handlers.getUpdateState).toHaveBeenCalledTimes(1);
    expect(handlers.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(handlers.installUpdateAndRestart).toHaveBeenCalledTimes(1);
    expect(handlers.getLoggingConfig).toHaveBeenCalledTimes(1);
    expect(handlers.getSystemSettings).toHaveBeenCalledTimes(1);
    expect(handlers.saveSystemSettings).toHaveBeenCalledWith({ storageType: 'sqlite' });
    expect(handlers.openFileDialog).toHaveBeenCalledTimes(1);
    expect(handlers.addToQueue).toHaveBeenCalledWith({ worldId: 'w-1', chatId: 'c-1', content: 'hello' });
    expect(handlers.getQueuedMessages).toHaveBeenCalledWith({ worldId: 'w-1', chatId: 'c-1' });
    expect(handlers.removeFromQueue).toHaveBeenCalledWith({ worldId: 'w-1', messageId: 'm-1' });
    expect(handlers.clearChatQueue).toHaveBeenCalledWith({ worldId: 'w-1', chatId: 'c-1' });
    expect(handlers.pauseChatQueue).toHaveBeenCalledWith({ worldId: 'w-1', chatId: 'c-1' });
    expect(handlers.resumeChatQueue).toHaveBeenCalledWith({ worldId: 'w-1', chatId: 'c-1' });
    expect(handlers.stopChatQueue).toHaveBeenCalledWith({ worldId: 'w-1', chatId: 'c-1' });
    expect(handlers.retryQueueMessage).toHaveBeenCalledWith({ worldId: 'w-1', messageId: 'm-1', chatId: 'c-1' });
    expect(handlers.deleteSkill).toHaveBeenCalledWith({ skillId: 'skill-1' });
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
      'skill:delete',
      expect.any(Function)
    );
  });
});
