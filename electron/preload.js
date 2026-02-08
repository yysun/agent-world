/**
 * Electron Preload Bridge - IPC-Only Renderer API Contract
 *
 * Features:
 * - Workspace APIs: get/open workspace context
 * - World APIs: list/create worlds
 * - Session APIs: list/create/select chat sessions
 * - Chat APIs: fetch messages and send messages
 *
 * Implementation Notes:
 * - Renderer receives only explicit invoke-based methods
 * - No direct Node.js or server API surface is exposed to renderer
 *
 * Recent Changes:
 * - 2026-02-08: Added subscription ID support for concurrent chat streams
 * - 2026-02-08: Added renderer subscription API for main->renderer chat events
 * - 2026-02-08: Expanded bridge for session and chat operations
 * - 2026-02-08: Standardized IPC-only desktop data contract
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
