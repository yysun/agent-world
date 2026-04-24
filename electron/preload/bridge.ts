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
 * - 2026-04-24: Added `respondHitlInput()` bridge wiring so Electron can submit skipped HITL prompts without synthesizing option IDs.
 * - 2026-04-14: Added `saveProjectFileContent()` bridge wiring for editable project files in the composer project viewer.
 * - 2026-04-14: Added `readProjectFolderStructure()` and `readProjectFileContent()` bridge wiring for the composer project viewer.
 * - 2026-04-11: Added `listLocalSkills()` bridge wiring for scanning a chosen local root for installable skills.
 * - 2026-03-22: Added `previewSkillImport()` bridge wiring for the skill editor install-mode preview flow.
 * - 2026-03-22: Extended `readSkillContent` and `saveSkillContent` bridge wiring with optional relative paths for tree-selected files.
 * - 2026-03-22: Added `readSkillFolderStructure(skillId)` bridge wiring for the skill editor right-pane folder tree.
 * - 2026-03-22: Added `deleteSkill(skillId)` bridge wiring for confirmed skill deletion from the editor toolbar.
 * - 2026-03-19: Added optional `defaultPath` support to `pickDirectory()` and restored `openWorkspace(directoryPath)` to direct-path payload forwarding only.
 * - 2026-03-19: Updated `listSkills()` bridge payload support to use world-scoped filters instead of renderer project-path injection.
 * - 2026-03-06: Fixed `runHeartbeat()` payload normalization to omit `chatId` when not provided.
 * - 2026-02-26: Added `getLoggingConfig()` bridge method for renderer-safe env-controlled logging category/level configuration.
 * - 2026-02-25: Updated `importWorld()` bridge method to accept optional source payload.
 * - 2026-02-20: Enforced options-only HITL bridge surface (`respondHitlOption` only).
 * - 2026-02-19: Added `exportWorld(worldId)` bridge method for desktop world save/export workflow.
 * - 2026-02-16: Added `branchSessionFromMessage(worldId, chatId, messageId)` bridge method for chat branching from assistant messages.
 * - 2026-02-14: Added `respondHitlOption()` bridge method for renderer resolution of world HITL option requests.
 * - 2026-02-14: Typed `listSkills()` bridge invoke response as `SkillRegistrySummary[]` to satisfy DesktopApi contract.
 * - 2026-02-14: Added `listSkills()` bridge method for renderer welcome-screen skill registry cards.
 * - 2026-02-13: Added `editMessage(worldId, messageId, newContent, chatId)` IPC bridge method for core-driven message edit flow.
 * - 2026-02-13: Added `stopMessage(worldId, chatId)` IPC bridge method for session-scoped stop control.
 * - 2026-02-12: Added dependency-injected bridge creation/exposure helpers for stable unit testing without Electron runtime module mocks.
 * - 2026-02-12: Added modular preload bridge composition for Phase 4 conversion.
 */

import { createRequire } from 'node:module';
import {
  UPDATE_EVENT_CHANNEL,
  CHAT_EVENT_CHANNEL,
  DESKTOP_BRIDGE_KEY,
  DESKTOP_INVOKE_CHANNELS,
  type AppUpdateState,
  type ChatEventPayload,
  type DesktopApi,
  type GitHubSkillSummary,
  type LocalSkillSummary,
  type ProjectFileReadResult,
  type ProjectFolderEntry,
  type HeartbeatJobStatus,
  type RendererLoggingConfig,
  type SkillImportPreviewResult,
  type SkillFolderEntry,
  type SkillRegistrySummary,
  type QueueAddPayload
} from '../shared/ipc-contracts.js';
import { invokeDesktopChannel } from './invoke.js';
import {
  toAgentPayload,
  toBranchSessionPayload,
  toExternalLinkPayload,
  toHeartbeatJobPayload,
  toHitlInputResponsePayload,
  toHitlResponsePayload,
  toMessageEditPayload,
  toMessageDeletePayload,
  toSubscribePayload,
  toUnsubscribePayload,
  toWorldChatPayload,
  toWorldLastSelectedPayload,
  toWorldPayload,
  toWorldWithPayload
} from './payloads.js';

const require = createRequire(import.meta.url);

interface IpcRendererLike {
  invoke: (channel: string, payload?: unknown) => Promise<unknown>;
  on: (channel: string, listener: (event: unknown, payload: ChatEventPayload) => void) => void;
  removeListener: (channel: string, listener: (event: unknown, payload: ChatEventPayload) => void) => void;
}

interface ContextBridgeLike {
  exposeInMainWorld: (key: string, api: DesktopApi) => void;
}

function resolveElectronPreloadBindings(): {
  contextBridge: ContextBridgeLike;
  ipcRenderer: IpcRendererLike;
} {
  return require('electron') as {
    contextBridge: ContextBridgeLike;
    ipcRenderer: IpcRendererLike;
  };
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

function onUpdateEvent(
  ipcRendererLike: IpcRendererLike,
  callback: (payload: AppUpdateState) => void,
): () => void {
  const listener = (_event: unknown, payload: AppUpdateState) => {
    callback(payload);
  };
  ipcRendererLike.on(UPDATE_EVENT_CHANNEL, listener as any);
  return () => {
    ipcRendererLike.removeListener(UPDATE_EVENT_CHANNEL, listener as any);
  };
}

export function createDesktopApi(ipcRendererLike?: IpcRendererLike): DesktopApi {
  const activeIpcRenderer = ipcRendererLike ?? resolveElectronPreloadBindings().ipcRenderer;

  return {
    getWorkspace: () => invokeDesktopChannel(activeIpcRenderer, DESKTOP_INVOKE_CHANNELS.WORKSPACE_GET),
    openWorkspace: (directoryPath) => invokeDesktopChannel(
      activeIpcRenderer,
      DESKTOP_INVOKE_CHANNELS.WORKSPACE_OPEN,
      directoryPath ? { directoryPath } : undefined
    ),
    pickDirectory: (defaultPath) => invokeDesktopChannel(
      activeIpcRenderer,
      DESKTOP_INVOKE_CHANNELS.DIALOG_PICK_DIRECTORY,
      defaultPath ? { defaultPath } : undefined
    ),
    openExternalLink: (url) => invokeDesktopChannel(
      activeIpcRenderer,
      DESKTOP_INVOKE_CHANNELS.LINK_OPEN_EXTERNAL,
      toExternalLinkPayload(url)
    ),
    loadWorldFromFolder: () =>
      invokeDesktopChannel(activeIpcRenderer, DESKTOP_INVOKE_CHANNELS.WORLD_LOAD_FROM_FOLDER),
    loadWorld: (worldId) =>
      invokeDesktopChannel(activeIpcRenderer, DESKTOP_INVOKE_CHANNELS.WORLD_LOAD, worldId),
    importWorld: (payload) => invokeDesktopChannel(activeIpcRenderer, DESKTOP_INVOKE_CHANNELS.WORLD_IMPORT, payload),
    importAgent: (payload) => invokeDesktopChannel(activeIpcRenderer, DESKTOP_INVOKE_CHANNELS.AGENT_IMPORT, payload),
    importSkill: (payload) => invokeDesktopChannel(activeIpcRenderer, DESKTOP_INVOKE_CHANNELS.SKILL_IMPORT, payload),
    listGitHubSkills: (repo) => invokeDesktopChannel<GitHubSkillSummary[]>(activeIpcRenderer, DESKTOP_INVOKE_CHANNELS.SKILL_LIST_GITHUB, { repo }),
    listLocalSkills: (source) => invokeDesktopChannel<LocalSkillSummary[]>(activeIpcRenderer, DESKTOP_INVOKE_CHANNELS.SKILL_LIST_LOCAL, { source }),
    exportWorld: (worldId) =>
      invokeDesktopChannel(activeIpcRenderer, DESKTOP_INVOKE_CHANNELS.WORLD_EXPORT, toWorldPayload(worldId)),
    listWorlds: () => invokeDesktopChannel(activeIpcRenderer, DESKTOP_INVOKE_CHANNELS.WORLD_LIST),
    listSkills: (filters) =>
      invokeDesktopChannel<SkillRegistrySummary[]>(
        activeIpcRenderer,
        DESKTOP_INVOKE_CHANNELS.SKILL_LIST,
        filters
      ),
    createWorld: (payload) =>
      invokeDesktopChannel(activeIpcRenderer, DESKTOP_INVOKE_CHANNELS.WORLD_CREATE, payload),
    updateWorld: (worldId, payload) =>
      invokeDesktopChannel(
        activeIpcRenderer,
        DESKTOP_INVOKE_CHANNELS.WORLD_UPDATE,
        toWorldWithPayload(worldId, payload)
      ),
    deleteWorld: (worldId) =>
      invokeDesktopChannel(
        activeIpcRenderer,
        DESKTOP_INVOKE_CHANNELS.WORLD_DELETE,
        toWorldPayload(worldId)
      ),
    listHeartbeatJobs: () => invokeDesktopChannel<HeartbeatJobStatus[]>(
      activeIpcRenderer,
      DESKTOP_INVOKE_CHANNELS.HEARTBEAT_LIST
    ),
    runHeartbeat: (worldId, chatId) =>
      invokeDesktopChannel(
        activeIpcRenderer,
        DESKTOP_INVOKE_CHANNELS.HEARTBEAT_RUN,
        toHeartbeatJobPayload(worldId, chatId)
      ),
    pauseHeartbeat: (worldId) =>
      invokeDesktopChannel(
        activeIpcRenderer,
        DESKTOP_INVOKE_CHANNELS.HEARTBEAT_PAUSE,
        toWorldPayload(worldId)
      ),
    stopHeartbeat: (worldId) =>
      invokeDesktopChannel(
        activeIpcRenderer,
        DESKTOP_INVOKE_CHANNELS.HEARTBEAT_STOP,
        toWorldPayload(worldId)
      ),
    createAgent: (worldId, payload) =>
      invokeDesktopChannel(
        activeIpcRenderer,
        DESKTOP_INVOKE_CHANNELS.AGENT_CREATE,
        toWorldWithPayload(worldId, payload)
      ),
    updateAgent: (worldId, agentId, payload) =>
      invokeDesktopChannel(
        activeIpcRenderer,
        DESKTOP_INVOKE_CHANNELS.AGENT_UPDATE,
        toAgentPayload(worldId, agentId, payload)
      ),
    deleteAgent: (worldId, agentId) =>
      invokeDesktopChannel(
        activeIpcRenderer,
        DESKTOP_INVOKE_CHANNELS.AGENT_DELETE,
        toAgentPayload(worldId, agentId)
      ),
    getLastSelectedWorld: () =>
      invokeDesktopChannel(activeIpcRenderer, DESKTOP_INVOKE_CHANNELS.WORLD_GET_LAST_SELECTED),
    saveLastSelectedWorld: (worldId) =>
      invokeDesktopChannel(
        activeIpcRenderer,
        DESKTOP_INVOKE_CHANNELS.WORLD_SAVE_LAST_SELECTED,
        toWorldLastSelectedPayload(worldId).worldId
      ),
    listSessions: (worldId) =>
      invokeDesktopChannel(
        activeIpcRenderer,
        DESKTOP_INVOKE_CHANNELS.SESSION_LIST,
        toWorldPayload(worldId)
      ),
    createSession: (worldId) =>
      invokeDesktopChannel(
        activeIpcRenderer,
        DESKTOP_INVOKE_CHANNELS.SESSION_CREATE,
        toWorldPayload(worldId)
      ),
    branchSessionFromMessage: (worldId, chatId, messageId) =>
      invokeDesktopChannel(
        activeIpcRenderer,
        DESKTOP_INVOKE_CHANNELS.SESSION_BRANCH_FROM_MESSAGE,
        toBranchSessionPayload(worldId, chatId, messageId)
      ),
    deleteChat: (worldId, chatId) =>
      invokeDesktopChannel(
        activeIpcRenderer,
        DESKTOP_INVOKE_CHANNELS.CHAT_DELETE,
        toWorldChatPayload(worldId, chatId)
      ),
    deleteSession: (worldId, chatId) =>
      invokeDesktopChannel(
        activeIpcRenderer,
        DESKTOP_INVOKE_CHANNELS.SESSION_DELETE,
        toWorldChatPayload(worldId, chatId)
      ),
    selectSession: (worldId, chatId) =>
      invokeDesktopChannel(
        activeIpcRenderer,
        DESKTOP_INVOKE_CHANNELS.SESSION_SELECT,
        toWorldChatPayload(worldId, chatId)
      ),
    getMessages: (worldId, chatId) =>
      invokeDesktopChannel(
        activeIpcRenderer,
        DESKTOP_INVOKE_CHANNELS.CHAT_GET_MESSAGES,
        toWorldChatPayload(worldId, chatId)
      ),
    getChatEvents: (worldId, chatId) =>
      invokeDesktopChannel(
        activeIpcRenderer,
        DESKTOP_INVOKE_CHANNELS.CHAT_GET_EVENTS,
        toWorldChatPayload(worldId, chatId)
      ),
    sendMessage: (payload) =>
      invokeDesktopChannel(activeIpcRenderer, DESKTOP_INVOKE_CHANNELS.CHAT_SEND_MESSAGE, payload),
    editMessage: (worldId, messageId, newContent, chatId) =>
      invokeDesktopChannel(
        activeIpcRenderer,
        DESKTOP_INVOKE_CHANNELS.MESSAGE_EDIT,
        toMessageEditPayload(worldId, messageId, newContent, chatId)
      ),
    respondHitlOption: (worldId, requestId, optionId, chatId) =>
      invokeDesktopChannel(
        activeIpcRenderer,
        DESKTOP_INVOKE_CHANNELS.HITL_RESPOND,
        toHitlResponsePayload(worldId, requestId, optionId, chatId)
      ),
    respondHitlInput: (worldId, requestId, answers, chatId, skipped) =>
      invokeDesktopChannel(
        activeIpcRenderer,
        DESKTOP_INVOKE_CHANNELS.HITL_RESPOND,
        toHitlInputResponsePayload(worldId, requestId, answers, chatId, skipped)
      ),
    stopMessage: (worldId, chatId) =>
      invokeDesktopChannel(
        activeIpcRenderer,
        DESKTOP_INVOKE_CHANNELS.CHAT_STOP_MESSAGE,
        toWorldChatPayload(worldId, chatId)
      ),
    deleteMessage: (worldId, messageId, chatId) =>
      invokeDesktopChannel(
        activeIpcRenderer,
        DESKTOP_INVOKE_CHANNELS.MESSAGE_DELETE,
        toMessageDeletePayload(worldId, messageId, chatId)
      ),
    subscribeChatEvents: (worldId, chatId, subscriptionId) =>
      invokeDesktopChannel(
        activeIpcRenderer,
        DESKTOP_INVOKE_CHANNELS.CHAT_SUBSCRIBE_EVENTS,
        toSubscribePayload(worldId, chatId, subscriptionId)
      ),
    unsubscribeChatEvents: (subscriptionId) =>
      invokeDesktopChannel(
        activeIpcRenderer,
        DESKTOP_INVOKE_CHANNELS.CHAT_UNSUBSCRIBE_EVENTS,
        toUnsubscribePayload(subscriptionId)
      ),
    onChatEvent: (callback) => onChatEvent(activeIpcRenderer, callback),
    getUpdateState: () => invokeDesktopChannel<AppUpdateState>(
      activeIpcRenderer,
      DESKTOP_INVOKE_CHANNELS.UPDATE_GET_STATE,
    ),
    checkForUpdates: () => invokeDesktopChannel<AppUpdateState>(
      activeIpcRenderer,
      DESKTOP_INVOKE_CHANNELS.UPDATE_CHECK,
    ),
    installUpdateAndRestart: () => invokeDesktopChannel<{ accepted: boolean; reason?: string }>(
      activeIpcRenderer,
      DESKTOP_INVOKE_CHANNELS.UPDATE_INSTALL_AND_RESTART,
    ),
    onUpdateEvent: (callback) => onUpdateEvent(activeIpcRenderer, callback),
    getLoggingConfig: () => invokeDesktopChannel<RendererLoggingConfig>(
      activeIpcRenderer,
      DESKTOP_INVOKE_CHANNELS.LOGGING_GET_CONFIG
    ),
    getSettings: () => invokeDesktopChannel(activeIpcRenderer, DESKTOP_INVOKE_CHANNELS.SETTINGS_GET),
    saveSettings: (settings) => invokeDesktopChannel(activeIpcRenderer, DESKTOP_INVOKE_CHANNELS.SETTINGS_SAVE, settings),
    pickFile: () => invokeDesktopChannel(activeIpcRenderer, DESKTOP_INVOKE_CHANNELS.DIALOG_PICK_FILE),
    previewSkillImport: (payload) => invokeDesktopChannel<SkillImportPreviewResult | null>(activeIpcRenderer, DESKTOP_INVOKE_CHANNELS.SKILL_PREVIEW_IMPORT, payload),
    addToQueue: (worldId, chatId, content, sender) =>
      invokeDesktopChannel(activeIpcRenderer, DESKTOP_INVOKE_CHANNELS.QUEUE_ADD, { worldId, chatId, content, sender } as QueueAddPayload),
    getQueuedMessages: (worldId, chatId) =>
      invokeDesktopChannel(activeIpcRenderer, DESKTOP_INVOKE_CHANNELS.QUEUE_GET, toWorldChatPayload(worldId, chatId)),
    removeFromQueue: (worldId, messageId) =>
      invokeDesktopChannel(activeIpcRenderer, DESKTOP_INVOKE_CHANNELS.QUEUE_REMOVE, { worldId, messageId }),
    clearQueue: (worldId, chatId) =>
      invokeDesktopChannel(activeIpcRenderer, DESKTOP_INVOKE_CHANNELS.QUEUE_CLEAR, toWorldChatPayload(worldId, chatId)),
    pauseChatQueue: (worldId, chatId) =>
      invokeDesktopChannel(activeIpcRenderer, DESKTOP_INVOKE_CHANNELS.QUEUE_PAUSE, toWorldChatPayload(worldId, chatId)),
    resumeChatQueue: (worldId, chatId) =>
      invokeDesktopChannel(activeIpcRenderer, DESKTOP_INVOKE_CHANNELS.QUEUE_RESUME, toWorldChatPayload(worldId, chatId)),
    stopChatQueue: (worldId, chatId) =>
      invokeDesktopChannel(activeIpcRenderer, DESKTOP_INVOKE_CHANNELS.QUEUE_STOP, toWorldChatPayload(worldId, chatId)),
    retryQueueMessage: (worldId, messageId, chatId) =>
      invokeDesktopChannel(activeIpcRenderer, DESKTOP_INVOKE_CHANNELS.QUEUE_RETRY, { worldId, messageId, chatId }),
    readSkillContent: (skillId, relativePath) =>
      invokeDesktopChannel<string>(activeIpcRenderer, DESKTOP_INVOKE_CHANNELS.SKILL_READ_CONTENT, { skillId, relativePath }),
    readSkillFolderStructure: (skillId) =>
      invokeDesktopChannel<SkillFolderEntry[]>(activeIpcRenderer, DESKTOP_INVOKE_CHANNELS.SKILL_READ_FOLDER_STRUCTURE, { skillId }),
    saveSkillContent: (skillId, content, relativePath) =>
      invokeDesktopChannel<void>(activeIpcRenderer, DESKTOP_INVOKE_CHANNELS.SKILL_SAVE_CONTENT, { skillId, content, relativePath }),
    deleteSkill: (skillId) =>
      invokeDesktopChannel<void>(activeIpcRenderer, DESKTOP_INVOKE_CHANNELS.SKILL_DELETE, { skillId }),
    readProjectFolderStructure: (projectPath) =>
      invokeDesktopChannel<ProjectFolderEntry[]>(activeIpcRenderer, DESKTOP_INVOKE_CHANNELS.PROJECT_READ_FOLDER_STRUCTURE, { projectPath }),
    readProjectFileContent: (projectPath, relativePath) =>
      invokeDesktopChannel<ProjectFileReadResult>(activeIpcRenderer, DESKTOP_INVOKE_CHANNELS.PROJECT_READ_FILE_CONTENT, { projectPath, relativePath }),
    saveProjectFileContent: (projectPath, content, relativePath) =>
      invokeDesktopChannel<void>(activeIpcRenderer, DESKTOP_INVOKE_CHANNELS.PROJECT_SAVE_FILE_CONTENT, { projectPath, content, relativePath })
  };
}

export function exposeDesktopApi(
  contextBridgeLike?: ContextBridgeLike,
  ipcRendererLike?: IpcRendererLike,
): void {
  const electronBindings = contextBridgeLike && ipcRendererLike ? undefined : resolveElectronPreloadBindings();
  const activeContextBridge = contextBridgeLike ?? electronBindings?.contextBridge;
  const activeIpcRenderer = ipcRendererLike ?? electronBindings?.ipcRenderer;

  if (!activeContextBridge || !activeIpcRenderer) {
    throw new Error('Electron preload bindings are unavailable');
  }

  activeContextBridge.exposeInMainWorld(DESKTOP_BRIDGE_KEY, createDesktopApi(activeIpcRenderer));
}
