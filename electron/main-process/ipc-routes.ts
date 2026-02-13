/**
 * Electron Main IPC Route Definitions
 *
 * Features:
 * - Defines canonical IPC channel-to-handler mappings.
 * - Centralizes route construction for deterministic registration.
 *
 * Implementation Notes:
 * - Each route delegates directly to injected handler dependencies.
 * - Keeps channel naming and payload routing in one module.
 *
 * Recent Changes:
 * - 2026-02-13: Added `chat:stopMessage` route wiring for session-scoped stop requests.
 * - 2026-02-12: Switched route channel strings to shared IPC constants and typed payload contracts.
 * - 2026-02-12: Added extracted IPC route builder for main-process modularization.
 */

import type { MainIpcRoute } from './ipc-registration.js';
import {
  DESKTOP_INVOKE_CHANNELS,
  type ChatSubscribePayload,
  type ChatUnsubscribePayload,
  type MessageDeletePayload,
  type WorldChatPayload,
  type WorldIdPayload
} from '../shared/ipc-contracts.js';

export interface MainIpcHandlers {
  getWorkspaceState: () => Promise<unknown> | unknown;
  openWorkspaceDialog: () => Promise<unknown> | unknown;
  loadWorldsFromWorkspace: () => Promise<unknown> | unknown;
  loadSpecificWorld: (worldId: unknown) => Promise<unknown> | unknown;
  importWorld: () => Promise<unknown> | unknown;
  listWorkspaceWorlds: () => Promise<unknown> | unknown;
  createWorkspaceWorld: (payload: unknown) => Promise<unknown> | unknown;
  updateWorkspaceWorld: (payload: unknown) => Promise<unknown> | unknown;
  deleteWorkspaceWorld: (payload: unknown) => Promise<unknown> | unknown;
  createWorldAgent: (payload: unknown) => Promise<unknown> | unknown;
  updateWorldAgent: (payload: unknown) => Promise<unknown> | unknown;
  deleteWorldAgent: (payload: unknown) => Promise<unknown> | unknown;
  readWorldPreference: () => Promise<unknown> | unknown;
  writeWorldPreference: (worldId: unknown) => Promise<unknown> | unknown;
  listWorldSessions: (worldId: unknown) => Promise<unknown> | unknown;
  createWorldSession: (worldId: unknown) => Promise<unknown> | unknown;
  deleteWorldSession: (worldId: unknown, chatId: unknown) => Promise<unknown> | unknown;
  selectWorldSession: (worldId: unknown, chatId: unknown) => Promise<unknown> | unknown;
  getSessionMessages: (worldId: unknown, chatId: unknown) => Promise<unknown> | unknown;
  sendChatMessage: (payload: unknown) => Promise<unknown> | unknown;
  stopChatMessage: (payload: unknown) => Promise<unknown> | unknown;
  deleteMessageFromChat: (payload: unknown) => Promise<unknown> | unknown;
  subscribeChatEvents: (payload: unknown) => Promise<unknown> | unknown;
  unsubscribeChatEvents: (payload: unknown) => Promise<unknown> | unknown;
}

export function buildMainIpcRoutes(handlers: MainIpcHandlers): MainIpcRoute[] {
  return [
    { channel: DESKTOP_INVOKE_CHANNELS.WORKSPACE_GET, handler: async () => handlers.getWorkspaceState() },
    { channel: DESKTOP_INVOKE_CHANNELS.WORKSPACE_OPEN, handler: async () => handlers.openWorkspaceDialog() },
    { channel: DESKTOP_INVOKE_CHANNELS.WORLD_LOAD_FROM_FOLDER, handler: async () => handlers.loadWorldsFromWorkspace() },
    { channel: DESKTOP_INVOKE_CHANNELS.WORLD_LOAD, handler: async (_event, worldId) => handlers.loadSpecificWorld(worldId) },
    { channel: DESKTOP_INVOKE_CHANNELS.WORLD_IMPORT, handler: async () => handlers.importWorld() },
    { channel: DESKTOP_INVOKE_CHANNELS.WORLD_LIST, handler: async () => handlers.listWorkspaceWorlds() },
    { channel: DESKTOP_INVOKE_CHANNELS.WORLD_CREATE, handler: async (_event, payload) => handlers.createWorkspaceWorld(payload) },
    { channel: DESKTOP_INVOKE_CHANNELS.WORLD_UPDATE, handler: async (_event, payload) => handlers.updateWorkspaceWorld(payload) },
    { channel: DESKTOP_INVOKE_CHANNELS.WORLD_DELETE, handler: async (_event, payload) => handlers.deleteWorkspaceWorld(payload) },
    { channel: DESKTOP_INVOKE_CHANNELS.AGENT_CREATE, handler: async (_event, payload) => handlers.createWorldAgent(payload) },
    { channel: DESKTOP_INVOKE_CHANNELS.AGENT_UPDATE, handler: async (_event, payload) => handlers.updateWorldAgent(payload) },
    { channel: DESKTOP_INVOKE_CHANNELS.AGENT_DELETE, handler: async (_event, payload) => handlers.deleteWorldAgent(payload) },
    { channel: DESKTOP_INVOKE_CHANNELS.WORLD_GET_LAST_SELECTED, handler: async () => handlers.readWorldPreference() },
    { channel: DESKTOP_INVOKE_CHANNELS.WORLD_SAVE_LAST_SELECTED, handler: async (_event, worldId) => handlers.writeWorldPreference(worldId) },
    {
      channel: DESKTOP_INVOKE_CHANNELS.SESSION_LIST,
      handler: async (_event, payload) => handlers.listWorldSessions((payload as WorldIdPayload | undefined)?.worldId)
    },
    {
      channel: DESKTOP_INVOKE_CHANNELS.SESSION_CREATE,
      handler: async (_event, payload) => handlers.createWorldSession((payload as WorldIdPayload | undefined)?.worldId)
    },
    {
      channel: DESKTOP_INVOKE_CHANNELS.CHAT_DELETE,
      handler: async (_event, payload) => {
        const normalized = payload as WorldChatPayload | undefined;
        return handlers.deleteWorldSession(normalized?.worldId, normalized?.chatId);
      }
    },
    {
      channel: DESKTOP_INVOKE_CHANNELS.SESSION_DELETE,
      handler: async (_event, payload) => {
        const normalized = payload as WorldChatPayload | undefined;
        return handlers.deleteWorldSession(normalized?.worldId, normalized?.chatId);
      }
    },
    {
      channel: DESKTOP_INVOKE_CHANNELS.SESSION_SELECT,
      handler: async (_event, payload) => {
        const normalized = payload as WorldChatPayload | undefined;
        return handlers.selectWorldSession(normalized?.worldId, normalized?.chatId);
      }
    },
    {
      channel: DESKTOP_INVOKE_CHANNELS.CHAT_GET_MESSAGES,
      handler: async (_event, payload) => {
        const normalized = payload as WorldChatPayload | undefined;
        return handlers.getSessionMessages(normalized?.worldId, normalized?.chatId);
      }
    },
    { channel: DESKTOP_INVOKE_CHANNELS.CHAT_SEND_MESSAGE, handler: async (_event, payload) => handlers.sendChatMessage(payload) },
    { channel: DESKTOP_INVOKE_CHANNELS.CHAT_STOP_MESSAGE, handler: async (_event, payload) => handlers.stopChatMessage(payload) },
    {
      channel: DESKTOP_INVOKE_CHANNELS.MESSAGE_DELETE,
      handler: async (_event, payload) => handlers.deleteMessageFromChat(payload as MessageDeletePayload)
    },
    {
      channel: DESKTOP_INVOKE_CHANNELS.CHAT_SUBSCRIBE_EVENTS,
      handler: async (_event, payload) => handlers.subscribeChatEvents(payload as ChatSubscribePayload)
    },
    {
      channel: DESKTOP_INVOKE_CHANNELS.CHAT_UNSUBSCRIBE_EVENTS,
      handler: async (_event, payload) => handlers.unsubscribeChatEvents(payload as ChatUnsubscribePayload)
    }
  ];
}
