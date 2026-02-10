/**
 * Electron Preload Bridge - Renderer IPC Surface
 *
 * Features:
 * - Workspace, world, session, and chat invoke APIs
 * - Load all worlds from workspace folders
 * - Load specific world by ID
 * - Realtime chat event subscription
 *
 * Implementation Notes:
 * - Exposes only explicit safe methods via `contextBridge`
 *
 * Recent Changes:
 * - 2026-02-10: Added agent create/update bridge methods for renderer avatar controls and agent edit panel
 * - 2026-02-10: Added chat delete bridge method (`deleteChat`) for chat-session removal
 * - 2026-02-10: Added session delete bridge method for renderer chat-session actions
 * - 2026-02-10: Added world update/delete bridge methods for renderer sidebar actions
 * - 2026-02-10: Removed openRecentWorkspace (worlds load from environment only)
 * - 2026-02-09: Added `loadWorld` bridge method for loading specific world by ID
 * - 2026-02-09: Added `loadWorldFromFolder` bridge method for loading all worlds
 * - 2026-02-08: Added subscription ID support for concurrent chat streams
 */
//@ts-check
import { contextBridge, ipcRenderer } from 'electron';

const CHAT_EVENT_CHANNEL = 'chat:event';

function onChatEvent(callback) {
  const listener = (_event, payload) => {
    callback(payload);
  };
  ipcRenderer.on(CHAT_EVENT_CHANNEL, listener);
  return () => {
    ipcRenderer.removeListener(CHAT_EVENT_CHANNEL, listener);
  };
}

const desktopApi = {
  getWorkspace: () => ipcRenderer.invoke('workspace:get'),
  openWorkspace: () => ipcRenderer.invoke('workspace:open'),
  loadWorldFromFolder: () => ipcRenderer.invoke('world:loadFromFolder'),
  loadWorld: (worldId) => ipcRenderer.invoke('world:load', worldId),
  importWorld: () => ipcRenderer.invoke('world:import'),
  listWorlds: () => ipcRenderer.invoke('world:list'),
  createWorld: (payload) => ipcRenderer.invoke('world:create', payload),
  updateWorld: (worldId, payload) => ipcRenderer.invoke('world:update', { worldId, ...payload }),
  deleteWorld: (worldId) => ipcRenderer.invoke('world:delete', { worldId }),
  createAgent: (worldId, payload) => ipcRenderer.invoke('agent:create', { worldId, ...payload }),
  updateAgent: (worldId, agentId, payload) => ipcRenderer.invoke('agent:update', { worldId, agentId, ...payload }),
  getLastSelectedWorld: () => ipcRenderer.invoke('world:getLastSelected'),
  saveLastSelectedWorld: (worldId) => ipcRenderer.invoke('world:saveLastSelected', worldId),
  listSessions: (worldId) => ipcRenderer.invoke('session:list', { worldId }),
  createSession: (worldId) => ipcRenderer.invoke('session:create', { worldId }),
  deleteChat: (worldId, chatId) => ipcRenderer.invoke('chat:delete', { worldId, chatId }),
  deleteSession: (worldId, chatId) => ipcRenderer.invoke('session:delete', { worldId, chatId }),
  selectSession: (worldId, chatId) => ipcRenderer.invoke('session:select', { worldId, chatId }),
  getMessages: (worldId, chatId) => ipcRenderer.invoke('chat:getMessages', { worldId, chatId }),
  sendMessage: (payload) => ipcRenderer.invoke('chat:sendMessage', payload),
  subscribeChatEvents: (worldId, chatId, subscriptionId) =>
    ipcRenderer.invoke('chat:subscribeEvents', { worldId, chatId, subscriptionId }),
  unsubscribeChatEvents: (subscriptionId) =>
    ipcRenderer.invoke('chat:unsubscribeEvents', { subscriptionId }),
  onChatEvent
};

contextBridge.exposeInMainWorld('agentWorldDesktop', desktopApi);
