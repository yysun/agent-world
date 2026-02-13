/**
 * Electron Preload Bridge Module
 *
 * Purpose:
 * - Compose and expose the renderer-facing desktop bridge API.
 *
 * Key Features:
 * - Typed API construction using shared contracts.
 * - Channel-guarded invoke wiring.
 * - Chat event subscription forwarding with cleanup.
 *
 * Implementation Notes:
 * - Context bridge exposure remains stable on `window.agentWorldDesktop`.
 * - Payload normalization helpers preserve existing invoke payload formats.
 *
 * Recent Changes:
 * - 2026-02-13: Added `stopMessage(worldId, chatId)` IPC bridge method for session-scoped stop control.
 * - 2026-02-12: Added dependency-injected bridge creation/exposure helpers for stable unit testing without Electron runtime module mocks.
 * - 2026-02-12: Added modular preload bridge composition for Phase 4 conversion.
 */

import { contextBridge, ipcRenderer } from 'electron';
import {
  CHAT_EVENT_CHANNEL,
  DESKTOP_BRIDGE_KEY,
  DESKTOP_INVOKE_CHANNELS,
  type ChatEventPayload,
  type DesktopApi
} from '../shared/ipc-contracts.js';
import { invokeDesktopChannel } from './invoke.js';
import {
  toAgentPayload,
  toMessageDeletePayload,
  toSubscribePayload,
  toUnsubscribePayload,
  toWorldChatPayload,
  toWorldLastSelectedPayload,
  toWorldPayload,
  toWorldWithPayload
} from './payloads.js';

interface IpcRendererLike {
  invoke: (channel: string, payload?: unknown) => Promise<unknown>;
  on: (channel: string, listener: (event: unknown, payload: ChatEventPayload) => void) => void;
  removeListener: (channel: string, listener: (event: unknown, payload: ChatEventPayload) => void) => void;
}

interface ContextBridgeLike {
  exposeInMainWorld: (key: string, api: DesktopApi) => void;
}

function onChatEvent(
  ipcRendererLike: IpcRendererLike,
  callback: (payload: ChatEventPayload) => void
): () => void {
  const listener = (_event: unknown, payload: ChatEventPayload) => {
    callback(payload);
  };
  ipcRendererLike.on(CHAT_EVENT_CHANNEL, listener);
  return () => {
    ipcRendererLike.removeListener(CHAT_EVENT_CHANNEL, listener);
  };
}

export function createDesktopApi(ipcRendererLike: IpcRendererLike = ipcRenderer): DesktopApi {
  return {
    getWorkspace: () => invokeDesktopChannel(ipcRendererLike, DESKTOP_INVOKE_CHANNELS.WORKSPACE_GET),
    openWorkspace: () => invokeDesktopChannel(ipcRendererLike, DESKTOP_INVOKE_CHANNELS.WORKSPACE_OPEN),
    loadWorldFromFolder: () =>
      invokeDesktopChannel(ipcRendererLike, DESKTOP_INVOKE_CHANNELS.WORLD_LOAD_FROM_FOLDER),
    loadWorld: (worldId) =>
      invokeDesktopChannel(ipcRendererLike, DESKTOP_INVOKE_CHANNELS.WORLD_LOAD, worldId),
    importWorld: () => invokeDesktopChannel(ipcRendererLike, DESKTOP_INVOKE_CHANNELS.WORLD_IMPORT),
    listWorlds: () => invokeDesktopChannel(ipcRendererLike, DESKTOP_INVOKE_CHANNELS.WORLD_LIST),
    createWorld: (payload) =>
      invokeDesktopChannel(ipcRendererLike, DESKTOP_INVOKE_CHANNELS.WORLD_CREATE, payload),
    updateWorld: (worldId, payload) =>
      invokeDesktopChannel(
        ipcRendererLike,
        DESKTOP_INVOKE_CHANNELS.WORLD_UPDATE,
        toWorldWithPayload(worldId, payload)
      ),
    deleteWorld: (worldId) =>
      invokeDesktopChannel(
        ipcRendererLike,
        DESKTOP_INVOKE_CHANNELS.WORLD_DELETE,
        toWorldPayload(worldId)
      ),
    createAgent: (worldId, payload) =>
      invokeDesktopChannel(
        ipcRendererLike,
        DESKTOP_INVOKE_CHANNELS.AGENT_CREATE,
        toWorldWithPayload(worldId, payload)
      ),
    updateAgent: (worldId, agentId, payload) =>
      invokeDesktopChannel(
        ipcRendererLike,
        DESKTOP_INVOKE_CHANNELS.AGENT_UPDATE,
        toAgentPayload(worldId, agentId, payload)
      ),
    deleteAgent: (worldId, agentId) =>
      invokeDesktopChannel(
        ipcRendererLike,
        DESKTOP_INVOKE_CHANNELS.AGENT_DELETE,
        toAgentPayload(worldId, agentId)
      ),
    getLastSelectedWorld: () =>
      invokeDesktopChannel(ipcRendererLike, DESKTOP_INVOKE_CHANNELS.WORLD_GET_LAST_SELECTED),
    saveLastSelectedWorld: (worldId) =>
      invokeDesktopChannel(
        ipcRendererLike,
        DESKTOP_INVOKE_CHANNELS.WORLD_SAVE_LAST_SELECTED,
        toWorldLastSelectedPayload(worldId).worldId
      ),
    listSessions: (worldId) =>
      invokeDesktopChannel(
        ipcRendererLike,
        DESKTOP_INVOKE_CHANNELS.SESSION_LIST,
        toWorldPayload(worldId)
      ),
    createSession: (worldId) =>
      invokeDesktopChannel(
        ipcRendererLike,
        DESKTOP_INVOKE_CHANNELS.SESSION_CREATE,
        toWorldPayload(worldId)
      ),
    deleteChat: (worldId, chatId) =>
      invokeDesktopChannel(
        ipcRendererLike,
        DESKTOP_INVOKE_CHANNELS.CHAT_DELETE,
        toWorldChatPayload(worldId, chatId)
      ),
    deleteSession: (worldId, chatId) =>
      invokeDesktopChannel(
        ipcRendererLike,
        DESKTOP_INVOKE_CHANNELS.SESSION_DELETE,
        toWorldChatPayload(worldId, chatId)
      ),
    selectSession: (worldId, chatId) =>
      invokeDesktopChannel(
        ipcRendererLike,
        DESKTOP_INVOKE_CHANNELS.SESSION_SELECT,
        toWorldChatPayload(worldId, chatId)
      ),
    getMessages: (worldId, chatId) =>
      invokeDesktopChannel(
        ipcRendererLike,
        DESKTOP_INVOKE_CHANNELS.CHAT_GET_MESSAGES,
        toWorldChatPayload(worldId, chatId)
      ),
    sendMessage: (payload) =>
      invokeDesktopChannel(ipcRendererLike, DESKTOP_INVOKE_CHANNELS.CHAT_SEND_MESSAGE, payload),
    stopMessage: (worldId, chatId) =>
      invokeDesktopChannel(
        ipcRendererLike,
        DESKTOP_INVOKE_CHANNELS.CHAT_STOP_MESSAGE,
        toWorldChatPayload(worldId, chatId)
      ),
    deleteMessage: (worldId, messageId, chatId) =>
      invokeDesktopChannel(
        ipcRendererLike,
        DESKTOP_INVOKE_CHANNELS.MESSAGE_DELETE,
        toMessageDeletePayload(worldId, messageId, chatId)
      ),
    subscribeChatEvents: (worldId, chatId, subscriptionId) =>
      invokeDesktopChannel(
        ipcRendererLike,
        DESKTOP_INVOKE_CHANNELS.CHAT_SUBSCRIBE_EVENTS,
        toSubscribePayload(worldId, chatId, subscriptionId)
      ),
    unsubscribeChatEvents: (subscriptionId) =>
      invokeDesktopChannel(
        ipcRendererLike,
        DESKTOP_INVOKE_CHANNELS.CHAT_UNSUBSCRIBE_EVENTS,
        toUnsubscribePayload(subscriptionId)
      ),
    onChatEvent: (callback) => onChatEvent(ipcRendererLike, callback)
  };
}

export function exposeDesktopApi(
  contextBridgeLike: ContextBridgeLike = contextBridge,
  ipcRendererLike: IpcRendererLike = ipcRenderer
): void {
  contextBridgeLike.exposeInMainWorld(DESKTOP_BRIDGE_KEY, createDesktopApi(ipcRendererLike));
}
