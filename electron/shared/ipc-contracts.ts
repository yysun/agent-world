/**
 * Electron Shared IPC Contracts
 *
 * Purpose:
 * - Define shared IPC channel constants and payload/api type contracts used by
 *   main-process handlers and preload bridge layers.
 *
 * Key Features:
 * - Canonical invoke channel constants to prevent string drift.
 * - Typed payload shapes for common world/chat/session message flows.
 * - Typed renderer bridge API surface for preload exposure.
 *
 * Implementation Notes:
 * - Payload contracts are intentionally permissive for incremental migration.
 * - Runtime validation remains in main-process handlers for behavior parity.
 *
 * Recent Changes:
 * - 2026-02-12: Added shared IPC contract definitions for Phase 4 typed bridge hardening.
 */

export const DESKTOP_BRIDGE_KEY = 'agentWorldDesktop' as const;
export const CHAT_EVENT_CHANNEL = 'chat:event' as const;

export const DESKTOP_INVOKE_CHANNELS = {
  WORKSPACE_GET: 'workspace:get',
  WORKSPACE_OPEN: 'workspace:open',
  WORLD_LOAD_FROM_FOLDER: 'world:loadFromFolder',
  WORLD_LOAD: 'world:load',
  WORLD_IMPORT: 'world:import',
  WORLD_LIST: 'world:list',
  WORLD_CREATE: 'world:create',
  WORLD_UPDATE: 'world:update',
  WORLD_DELETE: 'world:delete',
  AGENT_CREATE: 'agent:create',
  AGENT_UPDATE: 'agent:update',
  AGENT_DELETE: 'agent:delete',
  WORLD_GET_LAST_SELECTED: 'world:getLastSelected',
  WORLD_SAVE_LAST_SELECTED: 'world:saveLastSelected',
  SESSION_LIST: 'session:list',
  SESSION_CREATE: 'session:create',
  CHAT_DELETE: 'chat:delete',
  SESSION_DELETE: 'session:delete',
  SESSION_SELECT: 'session:select',
  CHAT_GET_MESSAGES: 'chat:getMessages',
  CHAT_SEND_MESSAGE: 'chat:sendMessage',
  MESSAGE_DELETE: 'message:delete',
  CHAT_SUBSCRIBE_EVENTS: 'chat:subscribeEvents',
  CHAT_UNSUBSCRIBE_EVENTS: 'chat:unsubscribeEvents'
} as const;

export type DesktopInvokeChannel =
  (typeof DESKTOP_INVOKE_CHANNELS)[keyof typeof DESKTOP_INVOKE_CHANNELS];

export interface WorldIdPayload {
  worldId: string;
}

export interface WorldChatPayload extends WorldIdPayload {
  chatId: string;
}

export interface WorldLastSelectedPayload {
  worldId: string;
}

export interface AgentPayload extends WorldIdPayload {
  agentId: string;
  [key: string]: unknown;
}

export interface MessageDeletePayload extends WorldChatPayload {
  messageId: string;
}

export interface ChatSubscribePayload extends WorldChatPayload {
  subscriptionId: string;
}

export interface ChatUnsubscribePayload {
  subscriptionId: string;
}

export interface ChatEventPayload {
  type?: string;
  worldId?: string;
  chatId?: string | null;
  [key: string]: unknown;
}

export interface DesktopApi {
  getWorkspace: () => Promise<unknown>;
  openWorkspace: () => Promise<unknown>;
  loadWorldFromFolder: () => Promise<unknown>;
  loadWorld: (worldId: string) => Promise<unknown>;
  importWorld: () => Promise<unknown>;
  listWorlds: () => Promise<unknown>;
  createWorld: (payload: Record<string, unknown>) => Promise<unknown>;
  updateWorld: (worldId: string, payload: Record<string, unknown>) => Promise<unknown>;
  deleteWorld: (worldId: string) => Promise<unknown>;
  createAgent: (worldId: string, payload: Record<string, unknown>) => Promise<unknown>;
  updateAgent: (worldId: string, agentId: string, payload: Record<string, unknown>) => Promise<unknown>;
  deleteAgent: (worldId: string, agentId: string) => Promise<unknown>;
  getLastSelectedWorld: () => Promise<unknown>;
  saveLastSelectedWorld: (worldId: string) => Promise<unknown>;
  listSessions: (worldId: string) => Promise<unknown>;
  createSession: (worldId: string) => Promise<unknown>;
  deleteChat: (worldId: string, chatId: string) => Promise<unknown>;
  deleteSession: (worldId: string, chatId: string) => Promise<unknown>;
  selectSession: (worldId: string, chatId: string) => Promise<unknown>;
  getMessages: (worldId: string, chatId: string) => Promise<unknown>;
  sendMessage: (payload: Record<string, unknown>) => Promise<unknown>;
  deleteMessage: (worldId: string, messageId: string, chatId: string) => Promise<unknown>;
  subscribeChatEvents: (worldId: string, chatId: string, subscriptionId: string) => Promise<unknown>;
  unsubscribeChatEvents: (subscriptionId: string) => Promise<unknown>;
  onChatEvent: (callback: (payload: ChatEventPayload) => void) => () => void;
}
