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
 * - 2026-03-22: Added `skill:previewImport` plus install-target payload fields so the skill editor can preview and install skills from local or GitHub sources.
 * - 2026-03-22: Extended skill content payloads with optional `relativePath` so the skill editor can open files from the folder tree.
 * - 2026-03-22: Added `skill:readFolderStructure` contracts and `SkillFolderEntry` so the skill editor can render the skill folder tree in its right pane.
 * - 2026-03-22: Added `skill:delete` invoke contract and `deleteSkill()` bridge method for confirmed skill removal from the editor.
 * - 2026-03-19: Added optional `defaultPath` payload support to `dialog:pickDirectory` while preserving `workspace:open(directoryPath)` direct-path semantics.
 * - 2026-03-19: Changed `skill:list` filtering from renderer-provided `projectPath` to world-scoped `worldId`.
 * - 2026-03-15: Added `nextRunAt` to heartbeat job status so the renderer can show a live next-run countdown.
 * - 2026-03-08: Added `skill:readContent` and `skill:saveContent` invoke contracts for skill SKILL.md read/write flows.
 * - 2026-02-26: Added `logging:getConfig` invoke contract and typed renderer logging config payload for env-controlled categorized renderer logs.
 * - 2026-02-25: Extended `world:import` contract with optional source payload for path/shorthand imports.
 * - 2026-02-19: Added `world:export` invoke contract for desktop world save/export flows aligned with CLI storage options.
 * - 2026-02-16: Added `session:branchFromMessage` invoke contract for creating a branched chat from an assistant message.
 * - 2026-02-14: Added `hitl:respond` invoke contract for resolving world HITL option prompts from renderer.
 * - 2026-02-20: Enforced options-only HITL response payload (`optionId` required).
 * - 2026-02-14: Added `skill:list` invoke contract for renderer welcome-screen skill registry display.
 * - 2026-02-13: Added `message:edit` invoke contract for core-driven message edit + resubmission flow.
 * - 2026-02-13: Added chat stop-message invoke contract for session-scoped processing interruption.
 * - 2026-02-12: Added shared IPC contract definitions for Phase 4 typed bridge hardening.
 */

export const DESKTOP_BRIDGE_KEY = 'agentWorldDesktop' as const;
export const CHAT_EVENT_CHANNEL = 'chat:event' as const;
export const UPDATE_EVENT_CHANNEL = 'update:event' as const;

export const DESKTOP_INVOKE_CHANNELS = {
  WORKSPACE_GET: 'workspace:get',
  WORKSPACE_OPEN: 'workspace:open',
  DIALOG_PICK_DIRECTORY: 'dialog:pickDirectory',
  LINK_OPEN_EXTERNAL: 'link:openExternal',
  WORLD_LOAD_FROM_FOLDER: 'world:loadFromFolder',
  WORLD_LOAD: 'world:load',
  WORLD_IMPORT: 'world:import',
  AGENT_IMPORT: 'agent:import',
  SKILL_IMPORT: 'skill:import',
  SKILL_PREVIEW_IMPORT: 'skill:previewImport',
  SKILL_LIST_GITHUB: 'skill:listGitHubSkills',
  WORLD_EXPORT: 'world:export',
  WORLD_LIST: 'world:list',
  SKILL_LIST: 'skill:list',
  WORLD_CREATE: 'world:create',
  WORLD_UPDATE: 'world:update',
  WORLD_DELETE: 'world:delete',
  HEARTBEAT_LIST: 'heartbeat:list',
  HEARTBEAT_RUN: 'heartbeat:run',
  HEARTBEAT_PAUSE: 'heartbeat:pause',
  HEARTBEAT_STOP: 'heartbeat:stop',
  AGENT_CREATE: 'agent:create',
  AGENT_UPDATE: 'agent:update',
  AGENT_DELETE: 'agent:delete',
  WORLD_GET_LAST_SELECTED: 'world:getLastSelected',
  WORLD_SAVE_LAST_SELECTED: 'world:saveLastSelected',
  SESSION_LIST: 'session:list',
  SESSION_CREATE: 'session:create',
  SESSION_BRANCH_FROM_MESSAGE: 'session:branchFromMessage',
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
  UPDATE_GET_STATE: 'update:getState',
  UPDATE_CHECK: 'update:check',
  UPDATE_INSTALL_AND_RESTART: 'update:installAndRestart',
  LOGGING_GET_CONFIG: 'logging:getConfig',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SAVE: 'settings:save',
  DIALOG_PICK_FILE: 'dialog:pickFile',
  CHAT_GET_EVENTS: 'chat:getEvents',
  QUEUE_ADD: 'queue:add',
  QUEUE_GET: 'queue:get',
  QUEUE_REMOVE: 'queue:remove',
  QUEUE_CLEAR: 'queue:clear',
  QUEUE_PAUSE: 'queue:pause',
  QUEUE_RESUME: 'queue:resume',
  QUEUE_STOP: 'queue:stop',
  QUEUE_RETRY: 'queue:retry',
  SKILL_READ_CONTENT: 'skill:readContent',
  SKILL_READ_FOLDER_STRUCTURE: 'skill:readFolderStructure',
  SKILL_SAVE_CONTENT: 'skill:saveContent',
  SKILL_DELETE: 'skill:delete'
} as const;

export type DesktopInvokeChannel =
  (typeof DESKTOP_INVOKE_CHANNELS)[keyof typeof DESKTOP_INVOKE_CHANNELS];

export interface WorldIdPayload {
  worldId: string;
}

export interface ExternalLinkPayload {
  url: string;
}

export interface WorldExportPayload extends WorldIdPayload {
  targetPath?: string;
}

export interface WorldImportPayload {
  source?: string;
  repo?: string;
  itemName?: string;
}

export interface AgentImportPayload extends WorldIdPayload {
  source?: string;
  repo?: string;
  itemName?: string;
}

export interface SkillImportPayload {
  source?: string;
  repo?: string;
  itemName?: string;
  targetScope?: 'global' | 'project';
  files?: Record<string, string>;
}

export interface SkillImportPreviewResult {
  rootName: string;
  entries: SkillFolderEntry[];
  files: Record<string, string>;
  initialFilePath: string;
}

export interface GitHubSkillListPayload {
  repo: string;
}

export interface WorldChatPayload extends WorldIdPayload {
  chatId: string;
}

export interface HeartbeatJobPayload extends WorldIdPayload {
  chatId?: string;
}

export interface HeartbeatJobStatus {
  worldId: string;
  worldName: string;
  interval: string;
  status: 'running' | 'paused' | 'stopped';
  runCount: number;
  nextRunAt: string | null;
}

export interface BranchSessionFromMessagePayload extends WorldChatPayload {
  messageId: string;
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

export interface ChatSendMessagePayload extends WorldChatPayload {
  content: string;
  sender?: string;
  systemSettings?: {
    enableGlobalSkills?: boolean;
    enableProjectSkills?: boolean;
    disabledGlobalSkillIds?: string[];
    disabledProjectSkillIds?: string[];
  };
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

export interface QueueAddPayload extends WorldChatPayload {
  content: string;
  sender?: string;
}

export interface QueueMessagePayload extends WorldChatPayload {
  messageId: string;
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
  worldId?: string;
}

export interface SkillContentPayload {
  skillId: string;
  relativePath?: string;
}

export interface SkillSavePayload {
  skillId: string;
  content: string;
  relativePath?: string;
}

export interface SkillFolderEntry {
  name: string;
  relativePath: string;
  type: 'file' | 'directory';
  children?: SkillFolderEntry[];
}

export interface PickDirectoryPayload {
  defaultPath?: string;
}

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

export interface RendererLoggingConfig {
  globalLevel: LogLevel;
  categoryLevels: Record<string, LogLevel>;
  nodeEnv: string;
}

export type AppUpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'up-to-date'
  | 'error'
  | 'unsupported';

export interface AppUpdateState {
  currentVersion: string;
  allowPrereleaseUpdates: boolean;
  isPackaged: boolean;
  status: AppUpdateStatus;
  statusMessage: string;
  availableVersion: string | null;
  downloadedVersion: string | null;
  releaseName: string | null;
  releaseDate: string | null;
  releaseNotes: string;
  lastCheckedAt: string | null;
  downloadProgressPercent: number | null;
  errorMessage: string | null;
}

export interface DesktopApi {
  getWorkspace: () => Promise<unknown>;
  openWorkspace: (directoryPath?: string) => Promise<unknown>;
  pickDirectory: (defaultPath?: string) => Promise<unknown>;
  openExternalLink: (url: string) => Promise<unknown>;
  loadWorldFromFolder: () => Promise<unknown>;
  loadWorld: (worldId: string) => Promise<unknown>;
  importWorld: (payload?: WorldImportPayload) => Promise<unknown>;
  importAgent: (payload: AgentImportPayload) => Promise<unknown>;
  importSkill: (payload?: SkillImportPayload) => Promise<unknown>;
  previewSkillImport: (payload?: SkillImportPayload) => Promise<SkillImportPreviewResult | null>;
  listGitHubSkills: (repo: string) => Promise<string[]>;
  exportWorld: (worldId: string) => Promise<unknown>;
  listWorlds: () => Promise<unknown>;
  listSkills: (filters?: SkillListFilterPayload) => Promise<SkillRegistrySummary[]>;
  createWorld: (payload: Record<string, unknown>) => Promise<unknown>;
  updateWorld: (worldId: string, payload: Record<string, unknown>) => Promise<unknown>;
  deleteWorld: (worldId: string) => Promise<unknown>;
  listHeartbeatJobs: () => Promise<HeartbeatJobStatus[]>;
  runHeartbeat: (worldId: string, chatId?: string) => Promise<unknown>;
  pauseHeartbeat: (worldId: string) => Promise<unknown>;
  stopHeartbeat: (worldId: string) => Promise<unknown>;
  createAgent: (worldId: string, payload: Record<string, unknown>) => Promise<unknown>;
  updateAgent: (worldId: string, agentId: string, payload: Record<string, unknown>) => Promise<unknown>;
  deleteAgent: (worldId: string, agentId: string) => Promise<unknown>;
  getLastSelectedWorld: () => Promise<unknown>;
  saveLastSelectedWorld: (worldId: string) => Promise<unknown>;
  listSessions: (worldId: string) => Promise<unknown>;
  createSession: (worldId: string) => Promise<unknown>;
  branchSessionFromMessage: (worldId: string, chatId: string, messageId: string) => Promise<unknown>;
  deleteChat: (worldId: string, chatId: string) => Promise<unknown>;
  deleteSession: (worldId: string, chatId: string) => Promise<unknown>;
  selectSession: (worldId: string, chatId: string) => Promise<unknown>;
  getMessages: (worldId: string, chatId: string) => Promise<unknown>;
  sendMessage: (payload: ChatSendMessagePayload) => Promise<unknown>;
  editMessage: (worldId: string, messageId: string, newContent: string, chatId: string) => Promise<unknown>;
  respondHitlOption: (worldId: string, requestId: string, optionId: string, chatId?: string | null) => Promise<unknown>;
  stopMessage: (worldId: string, chatId: string) => Promise<unknown>;
  deleteMessage: (worldId: string, messageId: string, chatId: string) => Promise<unknown>;
  subscribeChatEvents: (worldId: string, chatId: string, subscriptionId: string) => Promise<unknown>;
  unsubscribeChatEvents: (subscriptionId: string) => Promise<unknown>;
  onChatEvent: (callback: (payload: ChatEventPayload) => void) => () => void;
  getUpdateState: () => Promise<AppUpdateState>;
  checkForUpdates: () => Promise<AppUpdateState>;
  installUpdateAndRestart: () => Promise<{ accepted: boolean; reason?: string }>;
  onUpdateEvent: (callback: (payload: AppUpdateState) => void) => () => void;
  getLoggingConfig: () => Promise<RendererLoggingConfig>;
  getSettings: () => Promise<unknown>;
  saveSettings: (settings: Record<string, unknown>) => Promise<unknown>;
  pickFile: () => Promise<unknown>;
  getChatEvents: (worldId: string, chatId: string) => Promise<unknown>;
  addToQueue: (worldId: string, chatId: string, content: string, sender?: string) => Promise<unknown>;
  getQueuedMessages: (worldId: string, chatId: string) => Promise<unknown>;
  removeFromQueue: (worldId: string, messageId: string) => Promise<unknown>;
  clearQueue: (worldId: string, chatId: string) => Promise<unknown>;
  pauseChatQueue: (worldId: string, chatId: string) => Promise<unknown>;
  resumeChatQueue: (worldId: string, chatId: string) => Promise<unknown>;
  stopChatQueue: (worldId: string, chatId: string) => Promise<unknown>;
  retryQueueMessage: (worldId: string, messageId: string, chatId: string) => Promise<unknown>;
  readSkillContent: (skillId: string, relativePath?: string) => Promise<string>;
  readSkillFolderStructure: (skillId: string) => Promise<SkillFolderEntry[]>;
  saveSkillContent: (skillId: string, content: string, relativePath?: string) => Promise<void>;
  deleteSkill: (skillId: string) => Promise<void>;
}
