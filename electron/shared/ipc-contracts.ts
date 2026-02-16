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
 * - 2026-02-14: Added `hitl:respond` invoke contract for resolving world HITL option prompts from renderer.
 * - 2026-02-14: Added `skill:list` invoke contract for renderer welcome-screen skill registry display.
 * - 2026-02-13: Added `message:edit` invoke contract for core-driven message edit + resubmission flow.
 * - 2026-02-13: Added chat stop-message invoke contract for session-scoped processing interruption.
 * - 2026-02-12: Added shared IPC contract definitions for Phase 4 typed bridge hardening.
 */

export const DESKTOP_BRIDGE_KEY = 'agentWorldDesktop' as const;
export const CHAT_EVENT_CHANNEL = 'chat:event' as const;

export const DESKTOP_INVOKE_CHANNELS = {
  WORKSPACE_GET: 'workspace:get',
  WORKSPACE_OPEN: 'workspace:open',
  DIALOG_PICK_DIRECTORY: 'dialog:pickDirectory',
  WORLD_LOAD_FROM_FOLDER: 'world:loadFromFolder',
  WORLD_LOAD: 'world:load',
  WORLD_IMPORT: 'world:import',
  WORLD_LIST: 'world:list',
  SKILL_LIST: 'skill:list',
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
  MESSAGE_EDIT: 'message:edit',
  HITL_RESPOND: 'hitl:respond',
  CHAT_STOP_MESSAGE: 'chat:stopMessage',
  MESSAGE_DELETE: 'message:delete',
  CHAT_SUBSCRIBE_EVENTS: 'chat:subscribeEvents',
  CHAT_UNSUBSCRIBE_EVENTS: 'chat:unsubscribeEvents',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SAVE: 'settings:save',
  DIALOG_PICK_FILE: 'dialog:pickFile'
} as const;

export type DesktopInvokeChannel =
  (typeof DESKTOP_INVOKE_CHANNELS)[keyof typeof DESKTOP_INVOKE_CHANNELS];

export interface WorldIdPayload {
  worldId: string;
}

export interface WorldChatPayload extends WorldIdPayload {
  chatId: string;
}

export interface ChatStopPayload extends WorldChatPayload { }

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

export interface MessageEditPayload extends WorldChatPayload {
  messageId: string;
  newContent: string;
}

export interface HitlResponsePayload extends WorldIdPayload {
  requestId: string;
  optionId: string;
  chatId?: string | null;
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

export interface SkillRegistrySummary {
  skill_id: string;
  description: string;
  hash: string;
  lastUpdated: string;
  sourceScope?: 'global' | 'project';
}

export interface SkillListFilterPayload {
  includeGlobalSkills?: boolean;
  includeProjectSkills?: boolean;
}

export interface DesktopApi {
  getWorkspace: () => Promise<unknown>;
  openWorkspace: (directoryPath?: string) => Promise<unknown>;
  pickDirectory: () => Promise<unknown>;
  loadWorldFromFolder: () => Promise<unknown>;
  loadWorld: (worldId: string) => Promise<unknown>;
  importWorld: () => Promise<unknown>;
  listWorlds: () => Promise<unknown>;
  listSkills: (filters?: SkillListFilterPayload) => Promise<SkillRegistrySummary[]>;
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
  editMessage: (worldId: string, messageId: string, newContent: string, chatId: string) => Promise<unknown>;
  respondHitlOption: (worldId: string, requestId: string, optionId: string, chatId?: string | null) => Promise<unknown>;
  stopMessage: (worldId: string, chatId: string) => Promise<unknown>;
  deleteMessage: (worldId: string, messageId: string, chatId: string) => Promise<unknown>;
  subscribeChatEvents: (worldId: string, chatId: string, subscriptionId: string) => Promise<unknown>;
  unsubscribeChatEvents: (subscriptionId: string) => Promise<unknown>;
  onChatEvent: (callback: (payload: ChatEventPayload) => void) => () => void;
  getSettings: () => Promise<unknown>;
  saveSettings: (settings: Record<string, unknown>) => Promise<unknown>;
  pickFile: () => Promise<unknown>;
}
