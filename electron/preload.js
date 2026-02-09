/**
 * Electron Preload Bridge - Renderer IPC Surface
 *
 * Features:
 * - Workspace, world, session, and chat invoke APIs
 * - Realtime chat event subscription
 *
 * Implementation Notes:
 * - Exposes only explicit safe methods via `contextBridge`
 *
 * Recent Changes:
 * - 2026-02-08: Added `openRecentWorkspace` bridge method for workspace dropdown recents
 * - 2026-02-08: Added subscription ID support for concurrent chat streams
 */

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
  openRecentWorkspace: (workspacePath) => ipcRenderer.invoke('workspace:openRecent', { workspacePath }),
  listWorlds: () => ipcRenderer.invoke('world:list'),
  createWorld: (payload) => ipcRenderer.invoke('world:create', payload),
  listSessions: (worldId) => ipcRenderer.invoke('session:list', { worldId }),
  createSession: (worldId) => ipcRenderer.invoke('session:create', { worldId }),
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
