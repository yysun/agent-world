/**
 * Desktop Renderer Workspace
 * Purpose:
 * - Own renderer workspace orchestration while keeping the root `App.tsx` thin.
 *
 * Features:
 * - World/session lifecycle, chat streaming state, and panel orchestration.
 * - HITL prompt handling and settings integration.
 * - Layout composition via extracted presentational components.
 *
 * Implementation Notes:
 * - Keeps behavior parity with existing renderer flows while delegating logic to hooks.
 * - Uses desktop IPC bridge (`window.agentWorldDesktop`) via domain helper APIs.
 * - Lives in the app layer so `App.tsx` can remain a thin assembly boundary.
 *
 * Recent Changes:
 * - 2026-04-19: Moved workspace orchestration out of `App.tsx` into the app layer to keep the renderer root thin.
 * - 2026-04-14: Split the composer project affordance and added a full-area project folder viewer/editor with lazy file loading.
 * - 2026-04-11: Local install mode now scans the chosen root for SKILL.md plus nested skills directories before preview/install.
 * - 2026-04-03: Added edit-mode markdown preview state for the skill editor and reset it to preview when opening or switching skill files.
 * - 2026-03-23: Passed the collapsed-sidebar state into the full-area skill editor so its toolbar clears the macOS traffic lights.
 * - 2026-03-22: Guarded skill file selection against overlapping busy-state requests so stale file loads cannot overwrite the active editor view.
 * - 2026-03-22: Added skill dirty-state tracking so Save only enables after the current file changes.
 * - 2026-03-22: Added skill file selection so clicking the tree view loads that file in the left editor pane.
 * - 2026-03-22: Added skill folder structure loading so the skill editor right pane shows the current skill tree.
 * - 2026-03-22: Added confirmed skill deletion from the skill editor and disabled the editor while save/delete actions are running.
 * - 2026-03-14: Added sidebar heartbeat polling plus start/pause/stop handlers for selected-world cron controls.
 * - 2026-03-13: Added `reasoningEffort` derived from `world.variables` and wired it into the Electron composer dropdown.
 * - 2026-03-12: Added `toolPermission` derived from `world.variables` env key and `onSetToolPermission` wired to composer props for the Electron tool permission dropdown.
 * - 2026-03-10: Reconcile selected-chat refresh results with live optimistic/streaming/system-error rows so history reloads do not wipe authoritative transient state.
 * - 2026-03-10: Rehydrate persisted selected-chat system error events into the transcript on chat refresh so failed-turn diagnostics survive restart without moving raw logs out of the logs panel.
 * - 2026-03-06: Added renderer bridge bootstrap fallback UI so missing preload APIs show an explicit startup error instead of a blank screen.
 * - 2026-03-06: Scoped the right-side logs panel to the active world/chat and limited Clear to the visible scoped entries.
 * - 2026-03-06: Preserved error-kind selected-chat system statuses until replaced or context changes; non-error statuses still auto-expire.
 * - 2026-03-06: Added selected-chat system-event status-bar overlays for title updates, timeout notices, and retry tracking.
 * - 2026-03-05: Moved `MessageQueuePanel` into a dedicated pre-composer slot so queue items render above the composer input.
 * - 2026-03-04: Added app-level grid submenu open state so selecting a grid-layout option can dismiss the submenu.
 * - 2026-03-04: Added world-view state (`chat|board|grid|canvas`) and grid layout choice wiring for the new header selector and message render modes.
 * - 2026-02-27: Restored stop-button visibility/behavior by deriving stop mode from both legacy pending markers and status-registry `working` state.
 * - 2026-02-28: Skill scope and per-skill settings toggles now autosave immediately when changed.
 * - 2026-02-28: Opening System Settings now triggers a skill-registry refresh to keep the settings skill list current.
 * - 2026-02-27: Added system setting support to show/hide tool-related transcript rows in the main message area.
 * - 2026-02-27: Replaced header refresh with a logs action and added a unified right-panel logs stream (main + renderer) with bounded in-memory buffering.
 * - 2026-02-27: Passed UI-selected project folder into world-management create flow so new worlds can inherit `working_directory`; load/switch continue to mirror world `cwd`.
 * - 2026-02-26: Added renderer categorized logger initialization via preload logging config and replaced message activation console tracing with env-controlled logger output.
 * - 2026-02-26: Inline working indicator now shows model-aware text (`Contacting <model>...` during handshake and `<agent> (<model>) working...` when active) using real agent model metadata.
 * - 2026-02-22: Status bar completion is now driven by core activity events plus a send-finish no-activity fallback for zero-agent runs.
 * - 2026-02-22: Removed frontend @mention validation/inference from status and pending decisions; renderer now follows core event signals only.
 * - 2026-02-22: Restored immediate working-indicator visibility during send handshake by including per-session sending state in composer activity detection.
 * - 2026-02-22: Reset completion-transition ref on session changes to avoid cross-session false "processed" status messages.
 * - 2026-02-22: Added end-of-run status-bar summary showing how many agents processed the latest message.
 * - 2026-02-21: Wired assistant-message raw-markdown copy action into message-list props for desktop chat cards.
 * - 2026-02-20: Disabled new-message sending while HITL prompt queue is non-empty.
 * - 2026-02-20: Moved HITL prompt UX from overlay modal to inline message-flow cards inside the message list.
 * - 2026-02-20: Enforced options-only HITL handling in renderer response wiring.
 * - 2026-02-20: Wired active streaming-agent IDs into header props so top avatars can animate during response activity.
 * - 2026-02-20: Fixed welcome-card flicker by deriving message-presence from renderable message identity rather than role-only checks.
 * - 2026-02-19: Restricted inline working indicator to the initial `calling LLM...` phase only; hides during streaming/done/tool phases.
 * - 2026-02-19: Split activity text surfaces: status bar shows full per-agent state, inline indicator shows first active agent state only.
 * - 2026-02-19: Kept per-agent inline activity visible during active runs with explicit done/active/pending labels (e.g. `a1: done; a2: streaming response...`).
 * - 2026-02-19: Limited inline working indicator details to agent-focused activity only (no generic status-bar text).
 * - 2026-02-19: Expanded inline chat working indicator with multi-agent status, queue/tool counts, and elapsed time.
 * - 2026-02-19: Wired world export action through `useWorldManagement` into sidebar props.
 * - 2026-02-18: Aligned renderer agent provider/model fallbacks with the selected world's chat LLM provider/model.
 * - 2026-02-17: CC cleanup reduced file size by extracting pure helpers and removing redundant/unused orchestration sections.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LeftSidebarPanel, MainWorkspaceLayout, WorkingStatusBar } from '../app/shell';
import { AppFrameLayout } from '../design-system/patterns';
import { AgentPromptEditor } from '../features/agents';
import { MessageQueuePanel } from '../features/queue';
import { ProjectFolderViewer } from '../features/projects';
import { SkillEditor, SkillInstallBrowser } from '../features/skills';
import { WorldTextEditor, type WorldTextEditorField } from '../features/worlds';
import { useWorkingStatus } from '../hooks/useWorkingStatus';
import { readDesktopApi, safeMessage } from '../domain/desktop-api';
import { useSkillRegistry } from '../hooks/useSkillRegistry';
import { useStreamingActivity } from '../hooks/useStreamingActivity';
import { useMessageManagement } from '../hooks/useMessageManagement';
import { useSessionManagement } from '../hooks/useSessionManagement';
import { useThemeSettings } from '../hooks/useThemeSettings';
import { useAppUpdater } from '../hooks/useAppUpdater';
import { useWorldManagement } from '../hooks/useWorldManagement';
import { useAppActionHandlers } from '../hooks/useAppActionHandlers';
import {
  DEFAULT_TURN_LIMIT,
  DEFAULT_AGENT_FORM,
  DEFAULT_WORLD_CHAT_LLM_PROVIDER,
  DEFAULT_WORLD_CHAT_LLM_MODEL,
  MIN_TURN_LIMIT,
} from '../constants/app-defaults';
import {
  COMPOSER_MAX_ROWS,
  DRAG_REGION_STYLE,
  MAX_HEADER_AGENT_AVATARS,
  NO_DRAG_REGION_STYLE,
} from '../constants/ui-constants';
import {
  validateWorldForm,
} from '../utils/validation';
import {
  isHumanMessage,
  isRenderableMessageEntry,
  isToolRelatedMessage,
} from '../utils/message-utils';
import {
  getAgentDisplayName,
  getAgentInitials,
  getDefaultWorldForm,
  getEnvValueFromText,
  getReasoningEffortLevel,
  getWorldFormFromWorld,
} from '../utils/app-helpers';
import { useChatEventSubscriptions } from '../hooks/useChatEventSubscriptions';
import { deriveHitlPromptDisplayState } from '../domain/hitl-scope';
import { shouldShowQueuePanel } from '../domain/queue-visibility';
import { useMessageQueue } from '../hooks/useMessageQueue';
import type { MainProcessLogEntry } from '../domain/chat-event-handlers';
import { computeCanStopCurrentSession } from '../domain/chat-stop-state';
import { shouldActivateSessionForRefresh, shouldApplyChatRefresh } from '../domain/chat-refresh-guard';
import { clearChatAgents, finalizeReplayedChat, getChatStatus, syncWorldRoster, updateRegistry } from '../domain/status-registry';
import { applyEventToRegistry, parseStoredEventReplayArgs } from '../domain/status-updater';
import {
  createEmptySkillInstallPreviewState,
  extractSkillDescriptionFromPreviewFiles,
  isSkillInstallFileEditable,
  mergeSkillInstallDraftFiles,
  resolveActiveLocalSkillLoadSourcePath,
  resolveLocalSkillSearchQueryOnSourceChange,
  resolveLocalSkillPreviewSelection,
  resolveSkillInstallEditorStageOnPreview,
  resolveSelectedGitHubSkillName,
  resolveSelectedLocalSkillName,
  shouldApplyGitHubSkillLoadResult,
  shouldApplyLocalSkillLoadResult,
} from '../domain/skill-install-preview';
import { formatFullSkillDescription } from '../utils/formatting';
import {
  createLeftSidebarProps,
  createMainContentComposerProps,
  createMainContentMessageListProps,
  createMainContentRightPanelContentProps,
  createMainContentRightPanelShellProps,
  createMainHeaderProps,
} from '../utils/app-layout-props';
import { initializeRendererLogger, rendererLogger, type RendererLogEntry } from '../utils/logger';
import { mergeStoredSystemErrorEvents, reconcileRefreshedMessagesWithLiveState } from '../domain/message-updates';
import {
  normalizeWorldGridLayoutChoiceId,
  normalizeWorldViewMode,
  type WorldGridLayoutChoiceId,
  type WorldViewMode,
} from '../domain/world-view';
import { deriveWorldHeartbeatSummary } from '../domain/world-heartbeat';
import { deriveWorldInfoStats } from '../domain/world-info-stats';
import {
  countAgentConversationResponses,
  countConversationDisplayMessages,
} from '../../../shared/conversation-message-counts';
import {
  createSessionSystemStatus,
  shouldDisplaySessionSystemStatus,
  retainSessionSystemStatusForContext,
  type SessionSystemStatusEntry,
} from '../domain/session-system-status';
import {
  clearPanelLogsForScope,
  filterPanelLogsForScope,
  normalizeUnifiedLogEntry,
  type UnifiedLogEntry,
} from '../domain/panel-log-scope';
import type {
  DesktopApi,
  GitHubSkillSummary,
  LocalSkillSummary,
  ProjectFileReadResult,
  ProjectFolderEntry,
  SkillFolderEntry,
} from '../types/desktop-api';

type WorkspaceState = {
  workspacePath: string | null;
  storagePath: string | null;
};

type DirectorySelectionResult = {
  canceled?: boolean;
  directoryPath?: string;
  workspacePath?: string;
};

type LoadingState = {
  sessions: boolean;
  messages: boolean;
};

type SetterProxy = {
  setSessions: ((updater: any) => void) | null;
  setSelectedSessionId: ((updater: any) => void) | null;
};

type HitlPrompt = {
  requestId: string;
  chatId: string | null;
  title: string;
  message: string;
  mode: 'option';
  options: Array<{ id: string; label: string; description?: string }>;
  defaultOptionId?: string;
  metadata?: {
    refreshAfterDismiss?: boolean;
    kind?: string;
  };
};

type SkillEditorEntry = { skillId: string; description: string; sourceScope: string };
type SkillInstallSourceType = 'local' | 'github';
type SkillInstallEditorStage = 'browse' | 'preview';
type WorkspaceEditorState =
  | { kind: 'none' }
  | { kind: 'skill-edit' }
  | { kind: 'skill-install'; stage: SkillInstallEditorStage }
  | { kind: 'project-folder-viewer' }
  | { kind: 'agent-system-prompt'; target: 'create' | 'edit' }
  | { kind: 'world-text-field'; target: 'edit'; field: WorldTextEditorField };

const MAX_LOG_PANEL_ENTRIES = 600;
const DESKTOP_API_BOOTSTRAP_RETRY_LIMIT = 20;
const DESKTOP_API_BOOTSTRAP_RETRY_MS = 100;
const DEFAULT_INSTALL_GITHUB_SKILL_REPO = 'yysun/awesome-agent-world';

function normalizeAgentKey(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function findFirstSkillFile(entries: SkillFolderEntry[]): string {
  for (const entry of entries) {
    if (entry.type === 'file') {
      return entry.relativePath;
    }
    if (entry.type === 'directory' && Array.isArray(entry.children) && entry.children.length > 0) {
      const nestedFilePath = findFirstSkillFile(entry.children);
      if (nestedFilePath) {
        return nestedFilePath;
      }
    }
  }

  return '';
}

function getInitialSkillFilePath(entries: SkillFolderEntry[]): string {
  const defaultSkillFile = entries.find((entry) => entry.type === 'file' && entry.relativePath === 'SKILL.md');
  return defaultSkillFile?.relativePath || findFirstSkillFile(entries) || 'SKILL.md';
}

function findFirstProjectFile(entries: ProjectFolderEntry[]): string {
  for (const entry of entries) {
    if (entry.type === 'file') {
      return entry.relativePath;
    }
    if (entry.type === 'directory' && Array.isArray(entry.children) && entry.children.length > 0) {
      const nestedFilePath = findFirstProjectFile(entry.children);
      if (nestedFilePath) {
        return nestedFilePath;
      }
    }
  }

  return '';
}

function getInitialProjectFilePath(entries: ProjectFolderEntry[]): string {
  return findFirstProjectFile(entries);
}

function isMarkdownWorkspaceFile(filePath: string): boolean {
  return /(^|\/)[^/]+\.(?:md|markdown)$/i.test(String(filePath || '').trim());
}

function confirmWorkspaceEditorDiscard(message: string): boolean {
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') {
    return true;
  }

  return window.confirm(message);
}

function BridgeUnavailableScreen({ timedOut }: { timedOut: boolean }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px',
        background: '#f7f5f2',
        color: '#1f1a17',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div style={{ maxWidth: '520px', textAlign: 'center' }}>
        <h1 style={{ margin: '0 0 12px', fontSize: '24px' }}>Agent World</h1>
        <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.5 }}>
          {timedOut
            ? 'Desktop API bridge is unavailable. Restart the app. If the issue persists, rebuild and relaunch Electron.'
            : 'Starting desktop runtime...'}
        </p>
      </div>
    </div>
  );
}

function AppContent({ api }: { api: DesktopApi }) {
  const chatSubscriptionCounter = useRef(0);
  const messageRefreshCounter = useRef(0);
  // Always reflects the latest selectedSessionId so async callbacks can read the
  // current value without stale closures. Updated synchronously each render below.
  const selectedSessionIdRef = useRef<string | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<any[]>([]);
  const previousMessageCountRef = useRef(0);
  const sessionSetterProxyRef = useRef<SetterProxy>({
    setSessions: null,
    setSelectedSessionId: null,
  });

  const [workspace, setWorkspace] = useState<WorkspaceState>({
    workspacePath: null,
    storagePath: null
  });
  const [messages, setMessages] = useState<any[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState('create-world');
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [creatingAgent, setCreatingAgent] = useState<any>(DEFAULT_AGENT_FORM);
  const [editingAgent, setEditingAgent] = useState<any>(DEFAULT_AGENT_FORM);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedProjectPath, setSelectedProjectPath] = useState<string | null>(null);
  const [savingAgent, setSavingAgent] = useState(false);
  const [deletingAgent, setDeletingAgent] = useState(false);
  const [loading, setLoading] = useState<LoadingState>({
    sessions: false,
    messages: false
  });
  // HITL option prompt queue (generic world option requests)
  const [hitlPromptQueue, setHitlPromptQueue] = useState<HitlPrompt[]>([]);
  const [submittingHitlRequestId, setSubmittingHitlRequestId] = useState<string | null>(null);
  const [panelLogs, setPanelLogs] = useState<UnifiedLogEntry[]>([]);
  const [worldViewMode, setWorldViewMode] = useState<WorldViewMode>('chat');
  const [worldGridLayoutChoiceId, setWorldGridLayoutChoiceId] = useState<WorldGridLayoutChoiceId>('1+2');
  const [isGridLayoutSubmenuOpen, setIsGridLayoutSubmenuOpen] = useState(false);
  const [heartbeatJobs, setHeartbeatJobs] = useState<any[]>([]);
  const [heartbeatAction, setHeartbeatAction] = useState<'start' | 'pause' | 'stop' | null>(null);

  // Workspace editor state
  const [workspaceEditor, setWorkspaceEditor] = useState<WorkspaceEditorState>({ kind: 'none' });
  const [agentPromptEditorDraft, setAgentPromptEditorDraft] = useState('');
  const [worldTextEditorDraft, setWorldTextEditorDraft] = useState('');
  const [editingSkillEntry, setEditingSkillEntry] = useState<SkillEditorEntry | null>(null);
  const [editingSkillFilePath, setEditingSkillFilePath] = useState('SKILL.md');
  const [editingSkillMarkdownView, setEditingSkillMarkdownView] = useState<'preview' | 'markdown'>('preview');
  const [editingSkillContent, setEditingSkillContent] = useState('');
  const [savedSkillContent, setSavedSkillContent] = useState('');
  const [editingSkillFolderEntries, setEditingSkillFolderEntries] = useState<SkillFolderEntry[]>([]);
  const [installSkillSourceType, setInstallSkillSourceType] = useState<SkillInstallSourceType>('github');
  const [installSkillSourcePath, setInstallSkillSourcePath] = useState('');
  const [installSkillRepo, setInstallSkillRepo] = useState(DEFAULT_INSTALL_GITHUB_SKILL_REPO);
  const [installSkillItemName, setInstallSkillItemName] = useState('');
  const [installSkillSearchQuery, setInstallSkillSearchQuery] = useState('');
  const [installSkillTargetScope, setInstallSkillTargetScope] = useState<'global' | 'project'>('project');
  const [installSkillDescription, setInstallSkillDescription] = useState('');
  const [installSkillPreviewStatusMessage, setInstallSkillPreviewStatusMessage] = useState('');
  const [installSkillPreviewFiles, setInstallSkillPreviewFiles] = useState<Record<string, string>>({});
  const [installSkillDraftFiles, setInstallSkillDraftFiles] = useState<Record<string, string>>({});
  const [installGitHubSkillOptions, setInstallGitHubSkillOptions] = useState<GitHubSkillSummary[]>([]);
  const [installLocalSkillOptions, setInstallLocalSkillOptions] = useState<LocalSkillSummary[]>([]);
  const [installResolvedSourcePath, setInstallResolvedSourcePath] = useState('');
  const [projectViewerRootPath, setProjectViewerRootPath] = useState('');
  const [projectViewerEntries, setProjectViewerEntries] = useState<ProjectFolderEntry[]>([]);
  const [projectViewerSelectedFilePath, setProjectViewerSelectedFilePath] = useState('');
  const [projectViewerFileResult, setProjectViewerFileResult] = useState<ProjectFileReadResult | null>(null);
  const [projectViewerContent, setProjectViewerContent] = useState('');
  const [savedProjectViewerContent, setSavedProjectViewerContent] = useState('');
  const [projectViewerMarkdownView, setProjectViewerMarkdownView] = useState<'preview' | 'markdown'>('preview');
  const [loadingSkillFileContent, setLoadingSkillFileContent] = useState(false);
  const [loadingInstallGitHubSkills, setLoadingInstallGitHubSkills] = useState(false);
  const [loadingInstallLocalSkills, setLoadingInstallLocalSkills] = useState(false);
  const [loadingProjectFolderStructure, setLoadingProjectFolderStructure] = useState(false);
  const [loadingProjectFileContent, setLoadingProjectFileContent] = useState(false);
  const [savingSkillContent, setSavingSkillContent] = useState(false);
  const [deletingSkillContent, setDeletingSkillContent] = useState(false);
  const [installingSkillContent, setInstallingSkillContent] = useState(false);
  const [savingProjectFileContent, setSavingProjectFileContent] = useState(false);
  const skillFileRequestIdRef = useRef(0);
  const installGitHubSkillLoadRequestIdRef = useRef(0);
  const installLocalSkillLoadRequestIdRef = useRef(0);
  const projectViewerRequestIdRef = useRef(0);

  const notificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [notification, setNotification] = useState<{ text: string; kind: 'error' | 'success' | 'info' } | null>(null);
  const systemStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [systemStatus, setSystemStatus] = useState<SessionSystemStatusEntry | null>(null);

  const resetInstallPreviewState = useCallback(() => {
    const emptyPreviewState = createEmptySkillInstallPreviewState();
    setEditingSkillFilePath(emptyPreviewState.selectedFilePath);
    setEditingSkillMarkdownView('preview');
    setEditingSkillContent(emptyPreviewState.content);
    setSavedSkillContent(emptyPreviewState.savedContent);
    setEditingSkillFolderEntries(emptyPreviewState.folderEntries);
    setInstallSkillPreviewFiles(emptyPreviewState.previewFiles);
    setInstallSkillDraftFiles(emptyPreviewState.draftFiles);
    setInstallSkillDescription('');
    setInstallSkillPreviewStatusMessage('');
    setInstallResolvedSourcePath('');
  }, []);

  const resetInstallBrowseState = useCallback(() => {
    installGitHubSkillLoadRequestIdRef.current += 1;
    setInstallSkillSourceType('github');
    setInstallSkillSourcePath('');
    setInstallSkillRepo(DEFAULT_INSTALL_GITHUB_SKILL_REPO);
    setInstallSkillItemName('');
    setInstallSkillSearchQuery('');
    setInstallGitHubSkillOptions([]);
    setInstallLocalSkillOptions([]);
    setInstallSkillTargetScope('project');
  }, []);

  const resetProjectFolderViewerState = useCallback(() => {
    projectViewerRequestIdRef.current += 1;
    setProjectViewerRootPath('');
    setProjectViewerEntries([]);
    setProjectViewerSelectedFilePath('');
    setProjectViewerFileResult(null);
    setProjectViewerContent('');
    setSavedProjectViewerContent('');
    setProjectViewerMarkdownView('preview');
    setLoadingProjectFolderStructure(false);
    setLoadingProjectFileContent(false);
    setSavingProjectFileContent(false);
  }, []);

  useEffect(() => {
    void initializeRendererLogger(api);
  }, [api]);

  useEffect(() => {
    return () => {
      if (notificationTimerRef.current !== null) {
        clearTimeout(notificationTimerRef.current);
      }
      if (systemStatusTimerRef.current !== null) {
        clearTimeout(systemStatusTimerRef.current);
      }
    };
  }, []);

  const setStatusText = useCallback((text: string, kind: string = 'info') => {
    const safeKind = (kind === 'error' || kind === 'success') ? kind : 'info';
    setNotification({ text, kind: safeKind });
    if (notificationTimerRef.current !== null) {
      clearTimeout(notificationTimerRef.current);
    }
    notificationTimerRef.current = setTimeout(() => {
      setNotification(null);
      notificationTimerRef.current = null;
    }, 5000);
  }, []);

  const showSessionSystemStatus = useCallback((nextStatus: SessionSystemStatusEntry | null) => {
    if (systemStatusTimerRef.current !== null) {
      clearTimeout(systemStatusTimerRef.current);
      systemStatusTimerRef.current = null;
    }

    setSystemStatus(nextStatus);
    if (!nextStatus) {
      return;
    }

    if (typeof nextStatus.expiresAfterMs !== 'number' || nextStatus.expiresAfterMs <= 0) {
      return;
    }

    systemStatusTimerRef.current = setTimeout(() => {
      setSystemStatus((current) => {
        if (!current) {
          return null;
        }
        if (current.messageId && nextStatus.messageId && current.messageId !== nextStatus.messageId) {
          return current;
        }
        if (!current.messageId && current.text !== nextStatus.text) {
          return current;
        }
        return null;
      });
      systemStatusTimerRef.current = null;
    }, nextStatus.expiresAfterMs);
  }, []);

  const appendUnifiedLogEntry = useCallback((incoming: {
    process?: unknown;
    level?: unknown;
    category?: unknown;
    message?: unknown;
    timestamp?: unknown;
    data?: unknown;
    worldId?: unknown;
    chatId?: unknown;
  }) => {
    const nextEntry = normalizeUnifiedLogEntry(incoming);
    setPanelLogs((existing) => {
      const next = [...existing, nextEntry];
      if (next.length <= MAX_LOG_PANEL_ENTRIES) {
        return next;
      }
      return next.slice(next.length - MAX_LOG_PANEL_ENTRIES);
    });
  }, []);

  const onMainProcessLogEvent = useCallback((entry: MainProcessLogEntry) => {
    appendUnifiedLogEntry(entry);
  }, [appendUnifiedLogEntry]);
  const chatStatusRef = useRef<string>('idle');

  useEffect(() => {
    const unsubscribe = rendererLogger.subscribe((entry: RendererLogEntry) => {
      appendUnifiedLogEntry(entry);
    });
    return () => {
      unsubscribe();
    };
  }, [appendUnifiedLogEntry]);

  // Stable callback proxies — identity never changes because refs are stable.
  const proxySetSessions = useCallback(
    (updater: any) => sessionSetterProxyRef.current.setSessions?.(updater), []
  );
  const proxySetSelectedSessionId = useCallback(
    (updater: any) => sessionSetterProxyRef.current.setSelectedSessionId?.(updater), []
  );
  const getSelectedSessionId = useCallback(
    () => selectedSessionIdRef.current, []
  );

  const {
    loadedWorld,
    setLoadedWorld,
    worldLoadError,
    setWorldLoadError,
    loadingWorld,
    setLoadingWorld,
    availableWorlds,
    setAvailableWorlds,
    creatingWorld,
    setCreatingWorld,
    editingWorld,
    setEditingWorld,
    updatingWorld,
    deletingWorld,
    refreshingWorldInfo,
    onSelectWorld,
    onCreateWorld,
    refreshWorldDetails,
    onRefreshWorldInfo,
    onUpdateWorld,
    onDeleteWorld,
    onImportWorld,
    onImportAgent,
    onImportSkill,
    onExportWorld,
  } = useWorldManagement({
    api,
    setStatusText,
    setSessions: proxySetSessions,
    setSelectedSessionId: proxySetSelectedSessionId,
    setMessages,
    setSelectedAgentId,
    setPanelOpen,
    setPanelMode,
    getDefaultWorldForm,
    getWorldFormFromWorld,
    selectedProjectPath,
    getSelectedSessionId,
  });

  const {
    sessions,
    setSessions,
    sessionSearch,
    setSessionSearch,
    selectedSessionId,
    setSelectedSessionId,
    deletingSessionId,
    filteredSessions,
    refreshSessions,
    onCreateSession,
    onSelectSession,
    onDeleteSession,
  } = useSessionManagement({
    api,
    loadedWorldId: loadedWorld?.id,
    setStatusText,
    setMessages,
    setLoading,
    messageRefreshCounter,
  });

  sessionSetterProxyRef.current.setSessions = setSessions;
  sessionSetterProxyRef.current.setSelectedSessionId = setSelectedSessionId;
  // Sync ref so async callbacks (refreshMessages, edit/delete follow-up) always
  // read the latest selected chat without needing it in their dependency arrays.
  selectedSessionIdRef.current = selectedSessionId;

  const {
    activeHitlPrompt,
    hasActiveHitlPrompt,
  } = deriveHitlPromptDisplayState(hitlPromptQueue, selectedSessionId);

  const scopedPanelLogs = filterPanelLogsForScope(panelLogs, loadedWorld?.id || null, selectedSessionId);

  const onClearPanelLogs = useCallback(() => {
    setPanelLogs((existing) => clearPanelLogsForScope(existing, loadedWorld?.id || null, selectedSessionId));
  }, [loadedWorld?.id, selectedSessionId]);

  const {
    streamingStateRef,
    resetActivityRuntimeState,
  } = useStreamingActivity({ setMessages });

  const respondToHitlPrompt = useCallback(async (prompt: HitlPrompt, optionId: string) => {
    if (!prompt) return;
    const worldId = String(loadedWorld?.id || '').trim();
    if (!worldId) {
      setStatusText('No world loaded to respond to approval request.', 'error');
      return;
    }

    const requestId = String(prompt.requestId || '').trim();
    if (!requestId) {
      setStatusText('Invalid approval request.', 'error');
      return;
    }

    const normalizedOptionId = String(optionId || '').trim();
    if (!normalizedOptionId) {
      setStatusText('Invalid HITL response payload.', 'error');
      return;
    }

    setSubmittingHitlRequestId(requestId);
    try {
      const normalizeHitlResponse = (value: unknown): { accepted: boolean; reason: string } => {
        const payload = (value && typeof value === 'object') ? (value as Record<string, unknown>) : null;
        return {
          accepted: payload?.accepted === true,
          reason: String(payload?.reason || '').trim(),
        };
      };

      const responseChatId = prompt.chatId || selectedSessionId || null;
      const response = normalizeHitlResponse(
        await api.respondHitlOption(worldId, requestId, normalizedOptionId, responseChatId)
      );

      if (!response.accepted) {
        if (response.reason.includes('No pending HITL request found')) {
          setHitlPromptQueue((existing: HitlPrompt[]) => existing.filter((entry) => entry.requestId !== requestId));
          setStatusText('HITL request was already resolved.', 'info');
          return;
        }
        throw new Error(response.reason || 'HITL response was not accepted.');
      }

      setHitlPromptQueue((existing: HitlPrompt[]) => existing.filter((entry) => entry.requestId !== requestId));

      if (prompt?.metadata?.refreshAfterDismiss) {
        await refreshWorldDetails(worldId);
        await refreshSessions(worldId, prompt?.chatId || selectedSessionId || null);
      }

      if (prompt?.metadata?.kind === 'create_agent_created') {
        setStatusText('Agent created confirmation dismissed.', 'success');
      } else if (normalizedOptionId === 'no') {
        setStatusText('Skill execution was declined.', 'info');
      } else {
        setStatusText('HITL response submitted.', 'success');
      }
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to submit approval response.'), 'error');
    } finally {
      setSubmittingHitlRequestId((current: string | null) => (current === requestId ? null : current));
    }
  }, [api, loadedWorld?.id, refreshSessions, refreshWorldDetails, selectedSessionId, setStatusText]);

  const selectedSession = useMemo(
    () => sessions.find((session: any) => session.id === selectedSessionId) || null,
    [sessions, selectedSessionId]
  );

  const refreshHeartbeatJobs = useCallback(async (options?: { silent?: boolean }) => {
    try {
      const nextJobs = await api.listHeartbeatJobs();
      const normalizedJobs = Array.isArray(nextJobs) ? nextJobs : [];
      setHeartbeatJobs(normalizedJobs);
      return normalizedJobs;
    } catch (error) {
      if (options?.silent) {
        rendererLogger.debug('electron.renderer.world-heartbeat', 'Failed to refresh heartbeat jobs', {
          error: safeMessage(error, 'unknown error')
        });
        return [];
      }

      setStatusText(safeMessage(error, 'Failed to load cron status.'), 'error');
      return [];
    }
  }, [api, setStatusText]);

  useEffect(() => {
    if (!loadedWorld?.id) {
      setHeartbeatJobs([]);
      setHeartbeatAction(null);
      return;
    }

    void refreshHeartbeatJobs({ silent: true });
    const timer = setInterval(() => {
      void refreshHeartbeatJobs({ silent: true });
    }, 3000);

    return () => {
      clearInterval(timer);
    };
  }, [loadedWorld?.id, refreshHeartbeatJobs]);

  const worldInfoStats = useMemo(() => {
    return deriveWorldInfoStats(loadedWorld, sessions, MIN_TURN_LIMIT, DEFAULT_TURN_LIMIT);
  }, [loadedWorld, sessions]);

  const selectedHeartbeatJob = useMemo(() => {
    const selectedWorldId = String(loadedWorld?.id || '').trim();
    if (!selectedWorldId) {
      return null;
    }

    return heartbeatJobs.find((job: any) => String(job?.worldId || '').trim() === selectedWorldId) || null;
  }, [heartbeatJobs, loadedWorld?.id]);

  const heartbeatSummary = useMemo(
    () => deriveWorldHeartbeatSummary(loadedWorld, selectedHeartbeatJob),
    [loadedWorld, selectedHeartbeatJob]
  );

  const onStartHeartbeat = useCallback(async () => {
    const worldId = String(loadedWorld?.id || '').trim();
    const chatId = String(selectedSessionId || '').trim();
    if (!worldId) {
      setStatusText('No world loaded to start cron.', 'error');
      return;
    }
    if (!heartbeatSummary.configured) {
      setStatusText('Enable heartbeat with a valid cron interval and prompt before starting cron.', 'error');
      return;
    }
    if (!chatId) {
      setStatusText('Select a chat session before starting cron.', 'error');
      return;
    }

    setHeartbeatAction('start');
    try {
      await api.runHeartbeat(worldId, chatId);
      await refreshHeartbeatJobs({ silent: true });
      setStatusText('Cron started.', 'success');
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to start cron.'), 'error');
    } finally {
      setHeartbeatAction((current) => (current === 'start' ? null : current));
    }
  }, [api, heartbeatSummary.configured, loadedWorld?.id, refreshHeartbeatJobs, selectedSessionId, setStatusText]);

  const onStopHeartbeat = useCallback(async () => {
    const worldId = String(loadedWorld?.id || '').trim();
    if (!worldId) {
      setStatusText('No world loaded to stop cron.', 'error');
      return;
    }

    setHeartbeatAction('stop');
    try {
      await api.stopHeartbeat(worldId);
      await refreshHeartbeatJobs({ silent: true });
      setStatusText('Cron stopped.', 'success');
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to stop cron.'), 'error');
    } finally {
      setHeartbeatAction((current) => (current === 'stop' ? null : current));
    }
  }, [api, loadedWorld?.id, refreshHeartbeatJobs, setStatusText]);

  const rawWorldAgents = useMemo(
    () => (Array.isArray(loadedWorld?.agents) ? loadedWorld.agents : []),
    [loadedWorld]
  );

  const messageCountByAgentId = useMemo(() => {
    const normalizedSelectedSessionId = String(selectedSessionId || '').trim();
    if (!normalizedSelectedSessionId) {
      return new Map();
    }

    const idToAgentId = new Map();
    const nameToAgentId = new Map();

    rawWorldAgents.forEach((agent: any, index: number) => {
      const id = String(agent?.id || `agent-${index + 1}`);
      idToAgentId.set(id, id);
      const name = getAgentDisplayName(agent, index).toLowerCase();
      if (name) {
        nameToAgentId.set(name, id);
      }
    });

    const sessionMessages = messages.filter((message) => {
      const messageChatId = String(message?.chatId || '').trim();
      return Boolean(messageChatId) && messageChatId === normalizedSelectedSessionId;
    });

    const counts = new Map();
    for (const agentId of idToAgentId.keys()) {
      const nextCount = countAgentConversationResponses(sessionMessages, (message) => {
        const fromAgentId = String(message?.fromAgentId || '').trim();
        if (fromAgentId && idToAgentId.has(fromAgentId)) {
          return fromAgentId === agentId;
        }

        const sender = String(message?.sender || '').trim().toLowerCase();
        return Boolean(sender) && nameToAgentId.get(sender) === agentId;
      });

      counts.set(agentId, nextCount);
    }

    return counts;
  }, [messages, rawWorldAgents, selectedSessionId]);

  const worldAgents = useMemo(() => {
    const worldDefaultProvider = String(loadedWorld?.chatLLMProvider || '').trim() || DEFAULT_WORLD_CHAT_LLM_PROVIDER;
    const worldDefaultModel = String(loadedWorld?.chatLLMModel || '').trim() || DEFAULT_WORLD_CHAT_LLM_MODEL;

    return rawWorldAgents.map((agent: any, index: number) => {
      const name = getAgentDisplayName(agent, index);
      const id = String(agent?.id || `agent-${index + 1}`);
      const derivedMessageCount = messageCountByAgentId.get(id);
      return {
        id,
        name,
        initials: getAgentInitials(name),
        autoReply: agent?.autoReply !== false,
        provider: String(agent?.provider || worldDefaultProvider),
        model: String(agent?.model || worldDefaultModel),
        systemPrompt: String(agent?.systemPrompt || ''),
        temperature: Number.isFinite(Number(agent?.temperature)) ? Number(agent.temperature) : null,
        maxTokens: Number.isFinite(Number(agent?.maxTokens)) ? Number(agent.maxTokens) : null,
        llmCallCount: Number.isFinite(Number(agent?.llmCallCount)) ? Number(agent.llmCallCount) : 0,
        messageCount: Number.isFinite(derivedMessageCount)
          ? Math.max(0, Math.floor(derivedMessageCount))
          : 0
      };
    });
  }, [loadedWorld?.chatLLMModel, loadedWorld?.chatLLMProvider, messageCountByAgentId, rawWorldAgents]);

  const worldAgentsById = useMemo(() => {
    const next = new Map();
    for (const agent of worldAgents) {
      next.set(agent.id, agent);
    }
    return next;
  }, [worldAgents]);

  const worldAgentsByName = useMemo(() => {
    const next = new Map();
    for (const agent of worldAgents) {
      const normalizedName = String(agent?.name || '').trim().toLowerCase();
      if (!normalizedName) continue;
      next.set(normalizedName, agent);
    }
    return next;
  }, [worldAgents]);

  const visibleWorldAgents = useMemo(
    () => worldAgents.slice(0, MAX_HEADER_AGENT_AVATARS),
    [worldAgents]
  );

  const hiddenWorldAgentCount = Math.max(0, worldAgents.length - visibleWorldAgents.length);

  const selectedAgentForPanel = useMemo(
    () => worldAgents.find((agent: any) => agent.id === selectedAgentId) || null,
    [worldAgents, selectedAgentId]
  );

  const messagesById = useMemo(() => {
    const index = new Map();
    for (const message of messages) {
      const id = message?.messageId;
      if (!id) continue;
      index.set(String(id), message);
    }
    return index;
  }, [messages]);
  messagesRef.current = messages;

  const refreshMessages = useCallback(async (worldId: string | null | undefined, sessionId: string | null | undefined) => {
    const refreshId = ++messageRefreshCounter.current;
    if (!worldId || !sessionId) {
      setMessages([]);
      setLoading((value: { sessions: boolean; messages: boolean }) => ({ ...value, messages: false }));
      return;
    }

    setLoading((value: { sessions: boolean; messages: boolean }) => ({ ...value, messages: true }));
    try {
      // Only activate the backend session when this is still the selected chat.
      // Edit/delete follow-up may call refreshMessages with a non-selected targetChatId;
      // activating the backend for a non-visible chat drifts backend/frontend chat state.
      if (shouldActivateSessionForRefresh(sessionId, selectedSessionIdRef.current)) {
        const activation = await api.selectSession(worldId, sessionId);
        rendererLogger.debug('electron.renderer.messages', 'Session activation resolved while refreshing messages', {
          worldId,
          requestedChatId: sessionId,
          resolvedChatId: String((activation as any)?.chatId || '').trim() || null
        });
      }
      const [nextMessages, storedEvents] = await Promise.all([
        api.getMessages(worldId, sessionId),
        api.getChatEvents(worldId, sessionId),
      ]);
      const mergedMessages = mergeStoredSystemErrorEvents(
        Array.isArray(nextMessages) ? nextMessages : [],
        Array.isArray(storedEvents) ? storedEvents as Array<Record<string, unknown>> : [],
        sessionId,
      );
      const nextVisibleMessages = reconcileRefreshedMessagesWithLiveState(
        mergedMessages,
        messagesRef.current,
        sessionId,
      );
      // Discard if a later refresh started or the target chat is no longer selected.
      if (!shouldApplyChatRefresh({
        refreshId,
        currentCounter: messageRefreshCounter.current,
        targetChatId: sessionId,
        selectedChatId: selectedSessionIdRef.current,
      })) return;
      setMessages(nextVisibleMessages);
    } catch (error) {
      if (refreshId !== messageRefreshCounter.current) return;
      setStatusText(safeMessage(error, 'Failed to load messages.'), 'error');
    } finally {
      if (refreshId !== messageRefreshCounter.current) return;
      setLoading((value: { sessions: boolean; messages: boolean }) => ({ ...value, messages: false }));
    }
  }, [api, setStatusText]);

  const {
    skillRegistryEntries,
    scopedSkillRegistryEntries,
    loadingSkillRegistry,
    skillRegistryError,
    refreshSkillRegistry,
  } = useSkillRegistry({
    api,
    loadedWorldId: loadedWorld?.id,
  });

  const {
    themePreference,
    setThemePreference,
    systemSettings,
    setSystemSettings,
    savingSystemSettings,
    settingsNeedRestart,
    hasUnsavedSystemSettingsChanges,
    disabledGlobalSkillIdSet,
    disabledProjectSkillIdSet,
    visibleSkillRegistryEntries,
    globalSkillEntries,
    projectSkillEntries,
    setGlobalSkillsEnabled,
    setProjectSkillsEnabled,
    toggleSkillEnabled,
    ensureSkillEnabled,
    loadSystemSettings,
    resetSystemSettings,
    saveSystemSettings,
  } = useThemeSettings({
    api,
    panelMode,
    skillRegistryEntries,
    scopedSkillRegistryEntries,
    refreshSkillRegistry,
    setStatusText,
  });

  const {
    appUpdateState,
    checkForUpdates,
    installUpdateAndRestart,
  } = useAppUpdater({
    api,
    setStatusText,
  });

  const {
    composer,
    setComposer,
    sendingSessionIds,
    stoppingSessionIds,
    pendingResponseSessionIds,
    editingMessageId,
    editingText,
    setEditingText,
    deletingMessageId,
    onSendMessage,
    onStopMessage,
    onSubmitMessage,
    onStartEditMessage,
    onCancelEditMessage,
    onSaveEditMessage,
    onDeleteMessage,
    onBranchFromMessage,
    onCopyRawMarkdownFromMessage,
    clearEditDeleteState,
    resetMessageRuntimeState,
  } = useMessageManagement({
    api,
    loadedWorldId: loadedWorld?.id,
    selectedSessionId,
    selectedSessionIdRef,
    systemSettings,
    messages,
    messagesById,
    refreshMessages,
    setMessages,
    setSessions,
    setSelectedSessionId,
    setStatusText,
    streamingStateRef,
    hasActiveHitlPrompt,
    setHitlPromptQueue,
    setSubmittingHitlRequestId,
    messageRefreshCounter,
  });

  const initialize = useCallback(async () => {
    try {
      const nextWorkspace: any = await api.getWorkspace();
      setWorkspace(nextWorkspace);
      if (nextWorkspace.workspacePath) {
        // Load worlds from workspace
        setLoadingWorld(true);
        try {
          const worldsState: any = await api.loadWorldFromFolder();
          if (worldsState.success && worldsState.worlds) {
            setAvailableWorlds(worldsState.worlds);
            // Auto-load last selected world
            const lastWorldId = await api.getLastSelectedWorld();
            if (lastWorldId && worldsState.worlds.some((w: any) => w.id === lastWorldId)) {
              await onSelectWorld(lastWorldId);
            }
            setWorldLoadError(null);
            // User must explicitly select a world (no auto-selection)
          } else {
            setAvailableWorlds([]);
            setLoadedWorld(null);
            setWorldLoadError(worldsState.message || worldsState.error);
            setSessions([]);
          }
        } catch (error) {
          setAvailableWorlds([]);
          setLoadedWorld(null);
          setWorldLoadError(safeMessage(error, 'Failed to load worlds from folder'));
          setSessions([]);
        } finally {
          setLoadingWorld(false);
        }
      }
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to initialize app.'), 'error');
    }
  }, [api, setStatusText]);

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    refreshSessions(loadedWorld?.id, loadedWorld?.currentChatId || null);
  }, [loadedWorld?.id, loadedWorld?.currentChatId, refreshSessions]);

  useEffect(() => {
    refreshMessages(loadedWorld?.id, selectedSessionId);
  }, [loadedWorld?.id, selectedSessionId, refreshMessages]);

  // On chat switch: clear inline edit/delete UI state so stale actions from
  // the previous chat are not shown in the newly selected chat (AD-2, AD-3).
  useEffect(() => {
    clearEditDeleteState();
  }, [selectedSessionId, clearEditDeleteState]);

  // AD-4: HITL prompt queue is NOT filtered/cleared on session switch.
  // Session scoping is applied at render time via selectHitlPromptForSession /
  // hasHitlPromptForSession so prompts from all sessions survive in-memory
  // and are shown when the owning session becomes active again.

  useEffect(() => {
    setSystemStatus((current) => retainSessionSystemStatusForContext(current, loadedWorld?.id, selectedSessionId));
    if (!loadedWorld?.id || !selectedSessionId) {
      if (systemStatusTimerRef.current !== null) {
        clearTimeout(systemStatusTimerRef.current);
        systemStatusTimerRef.current = null;
      }
    }
  }, [loadedWorld?.id, selectedSessionId]);

  // Phase 6.2b: Replay stored events to reconstruct status on chat switch.
  // Clear and replay happen atomically after the fetch so the previous status
  // remains visible while events are loading (no brief flash to idle).
  useEffect(() => {
    const worldId = loadedWorld?.id;
    const chatId = selectedSessionId;
    if (!worldId || !chatId) return;

    let cancelled = false;
    (async () => {
      try {
        const events = (await api.getChatEvents(worldId, chatId)) as any[];
        if (cancelled) return;
        // Atomic clear + replay: apply all events in one registry update.
        // Downgrade guard: if the live registry already has 'complete' for this
        // chat but the DB-replayed events only reach 'working' (async persistence
        // lag — 'sse end' not yet saved), keep the live complete status so we
        // don't regress the indicator back to "working".
        updateRegistry(r => {
          const liveStatus = getChatStatus(r, worldId, chatId);
          let reg = clearChatAgents(r, worldId, chatId);
          if (!Array.isArray(events)) return reg;
          for (const storedEvent of events) {
            const args = parseStoredEventReplayArgs(storedEvent);
            if (!args) continue;
            reg = applyEventToRegistry(reg, worldId, chatId, args.agentName, args.eventType, args.subtype);
          }
          // Normalize: force any remaining 'working' to 'complete'.
          // Handles incomplete sequences (e.g. sse/end missing from interrupted sessions).
          reg = finalizeReplayedChat(reg, worldId, chatId);
          // Don't downgrade complete → working (DB persistence lag)
          if (liveStatus === 'complete' && getChatStatus(reg, worldId, chatId) === 'working') {
            return r;
          }
          return reg;
        });
      } catch {
        // Clear stale data on fetch failure
        if (!cancelled) {
          updateRegistry(r => clearChatAgents(r, worldId, chatId));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [api, loadedWorld?.id, selectedSessionId]);

  useEffect(() => {
    const normalizedSessionId = String(selectedSessionId || '').trim();
    if (!normalizedSessionId) return;

    const nextMessageCount = countConversationDisplayMessages(messages);
    setSessions((existing: any[]) => {
      let changed = false;
      const next = existing.map((session: any) => {
        const sessionId = String(session?.id || '').trim();
        if (sessionId !== normalizedSessionId) return session;

        const currentCountRaw = Number(session?.messageCount);
        const currentCount = Number.isFinite(currentCountRaw) ? Math.max(0, Math.floor(currentCountRaw)) : 0;
        if (currentCount === nextMessageCount) return session;

        changed = true;
        return {
          ...session,
          messageCount: nextMessageCount
        };
      });

      return changed ? next : existing;
    });
  }, [messages, selectedSessionId]);

  useEffect(() => {
    const workingDirectory = getEnvValueFromText(loadedWorld?.variables, 'working_directory');
    setSelectedProjectPath(workingDirectory || null);
  }, [loadedWorld?.id, loadedWorld?.variables]);

  const toolPermission = (getEnvValueFromText(loadedWorld?.variables, 'tool_permission') as 'read' | 'ask' | 'auto') || 'auto';
  const reasoningEffort = getReasoningEffortLevel(loadedWorld?.variables);

  useEffect(() => {
    if (loadedWorld?.id) return;
    resetMessageRuntimeState();
    resetActivityRuntimeState();
    setHitlPromptQueue([]);
    setSubmittingHitlRequestId(null);
  }, [loadedWorld?.id, resetActivityRuntimeState, resetMessageRuntimeState]);

  // On session switch: clear the in-progress submission flag only.
  // The queue itself is NOT cleared — session scoping is handled at render
  // time via selectHitlPromptForSession so prompts persist across switches.
  useEffect(() => {
    setSubmittingHitlRequestId(null);
  }, [selectedSessionId]);

  useEffect(() => {
    setSessionSearch('');
  }, [loadedWorld?.id]);

  // Phase 6.3: Sync world roster (agents + chats) into registry on every CRUD change
  useEffect(() => {
    if (!loadedWorld?.id) return;
    const chatIds = (sessions as any[]).map((s: any) => String(s?.id || '')).filter(Boolean);
    const agentIds = (Array.isArray(loadedWorld.agents) ? loadedWorld.agents : [])
      .map((a: any) => String(a?.id || '')).filter(Boolean);
    updateRegistry(r => syncWorldRoster(r, loadedWorld.id, chatIds, agentIds));
  }, [loadedWorld, sessions]);

  const onSessionSystemEvent = useCallback((event: { eventType?: string | null; chatId?: string | null; messageId?: string | null; createdAt?: string | null; content?: unknown }) => {
    const nextStatus = createSessionSystemStatus(loadedWorld?.id, {
      eventType: String(event?.eventType || ''),
      chatId: String(event?.chatId || '').trim() || null,
      messageId: event?.messageId ? String(event.messageId) : null,
      createdAt: event?.createdAt ? String(event.createdAt) : null,
      content: event?.content,
    });

    if (!shouldDisplaySessionSystemStatus({
      status: nextStatus,
      chatStatus: chatStatusRef.current,
      draftText: composer,
    })) {
      return;
    }

    showSessionSystemStatus(nextStatus);
  }, [composer, loadedWorld?.id, showSessionSystemStatus]);

  useChatEventSubscriptions({
    api,
    loadedWorld,
    selectedSessionId,
    setMessages,
    chatSubscriptionCounter,
    streamingStateRef,
    refreshSessions,
    resetActivityRuntimeState,
    setHitlPromptQueue,
    onMainLogEvent: onMainProcessLogEvent,
    onSessionSystemEvent,
  });

  const {
    queuedMessages,
    addToQueue: addMessageToQueue,
    removeFromQueue: removeMessageFromQueue,
    pauseQueue,
    resumeQueue,
    stopQueue,
    clearQueue,
    retryQueueMessage: retryMessageFromQueue,
  } = useMessageQueue({
    api,
    loadedWorldId: loadedWorld?.id,
    selectedSessionId,
    messagesVersion: messages.length,
  });

  const onAddToQueue = useCallback(async (content: string) => {
    if (!content.trim()) return;
    await addMessageToQueue(content);
    setComposer('');
  }, [addMessageToQueue, setComposer]);

  const hasUnsavedWorldChanges = useCallback(() => {
    if (panelMode === 'create-world') {
      const defaultForm = getDefaultWorldForm();
      return creatingWorld.name !== defaultForm.name ||
        creatingWorld.description !== defaultForm.description ||
        creatingWorld.turnLimit !== defaultForm.turnLimit ||
        creatingWorld.mainAgent !== defaultForm.mainAgent ||
        creatingWorld.chatLLMProvider !== defaultForm.chatLLMProvider ||
        creatingWorld.chatLLMModel !== defaultForm.chatLLMModel ||
        creatingWorld.heartbeatEnabled !== defaultForm.heartbeatEnabled ||
        creatingWorld.heartbeatInterval !== defaultForm.heartbeatInterval ||
        creatingWorld.heartbeatPrompt !== defaultForm.heartbeatPrompt ||
        creatingWorld.mcpConfig !== defaultForm.mcpConfig ||
        creatingWorld.variables !== defaultForm.variables;
    }
    if (panelMode === 'edit-world' && loadedWorld) {
      const originalForm = getWorldFormFromWorld(loadedWorld);
      return editingWorld.name !== originalForm.name ||
        editingWorld.description !== originalForm.description ||
        editingWorld.turnLimit !== originalForm.turnLimit ||
        editingWorld.mainAgent !== originalForm.mainAgent ||
        editingWorld.chatLLMProvider !== originalForm.chatLLMProvider ||
        editingWorld.chatLLMModel !== originalForm.chatLLMModel ||
        editingWorld.heartbeatEnabled !== originalForm.heartbeatEnabled ||
        editingWorld.heartbeatInterval !== originalForm.heartbeatInterval ||
        editingWorld.heartbeatPrompt !== originalForm.heartbeatPrompt ||
        editingWorld.mcpConfig !== originalForm.mcpConfig ||
        editingWorld.variables !== originalForm.variables;
    }
    return false;
  }, [panelMode, creatingWorld, editingWorld, loadedWorld]);

  const hasUnsavedAgentChanges = useCallback(() => {
    if (panelMode === 'create-agent') {
      return creatingAgent.name !== DEFAULT_AGENT_FORM.name ||
        creatingAgent.autoReply !== DEFAULT_AGENT_FORM.autoReply ||
        creatingAgent.provider !== DEFAULT_AGENT_FORM.provider ||
        creatingAgent.model !== DEFAULT_AGENT_FORM.model ||
        creatingAgent.systemPrompt !== DEFAULT_AGENT_FORM.systemPrompt ||
        creatingAgent.temperature !== DEFAULT_AGENT_FORM.temperature ||
        creatingAgent.maxTokens !== DEFAULT_AGENT_FORM.maxTokens;
    }
    if (panelMode === 'edit-agent' && selectedAgentForPanel) {
      return editingAgent.name !== selectedAgentForPanel.name ||
        editingAgent.autoReply !== (selectedAgentForPanel.autoReply !== false) ||
        editingAgent.provider !== selectedAgentForPanel.provider ||
        editingAgent.model !== selectedAgentForPanel.model ||
        editingAgent.systemPrompt !== selectedAgentForPanel.systemPrompt ||
        String(editingAgent.temperature ?? '') !== String(selectedAgentForPanel.temperature ?? '') ||
        String(editingAgent.maxTokens ?? '') !== String(selectedAgentForPanel.maxTokens ?? '');
    }
    return false;
  }, [panelMode, creatingAgent, editingAgent, selectedAgentForPanel]);

  const {
    closePanel,
    onOpenSettingsPanel,
    onCancelSettings,
    onSaveSettings,
    onOpenCreateWorldPanel,
    onOpenImportWorldPanel,
    onCloseImportWorldPanel,
    onOpenLogsPanel,
    onOpenWorldEditPanel,
    onOpenCreateAgentPanel,
    onOpenEditAgentPanel,
    onCreateAgent,
    onUpdateAgent,
    onDeleteAgent,
    onSelectProject,
    onSetReasoningEffort,
    onSetToolPermission,
    onComposerKeyDown,
  } = useAppActionHandlers({
    api,
    loadedWorld,
    worldAgents,
    editingAgent,
    creatingAgent,
    setStatusText,
    closePanelNeeds: {
      hasUnsavedWorldChanges,
      hasUnsavedAgentChanges,
      hasUnsavedSystemSettingsChanges,
    },
    panelMode,
    panelOpen,
    setPanelOpen,
    setPanelMode,
    setSelectedAgentId,
    setEditingWorld,
    getWorldFormFromWorld,
    setCreatingAgent,
    setEditingAgent,
    setSavingAgent,
    setDeletingAgent,
    refreshWorldDetails,
    setLoadedWorld,
    setSelectedProjectPath,
    selectedSessionId,
    sendingSessionIds,
    stoppingSessionIds,
    pendingResponseSessionIds,
    hasActiveHitlPrompt,
    composer,
    onSendMessage,
    loadSystemSettings,
    resetSystemSettings,
    saveSystemSettings,
    refreshSkillRegistry,
  });

  const onOpenSkillEditor = useCallback(async (entry: SkillEditorEntry) => {
    const skillId = String(entry?.skillId || '').trim();
    if (!skillId) return;
    try {
      const folderEntries = await api.readSkillFolderStructure(skillId);
      const normalizedFolderEntries = Array.isArray(folderEntries) ? folderEntries : [];
      const initialFilePath = getInitialSkillFilePath(normalizedFolderEntries);
      const content = await api.readSkillContent(skillId, initialFilePath);
      resetInstallBrowseState();
      resetInstallPreviewState();
      setEditingSkillEntry(entry);
      setEditingSkillFilePath(initialFilePath);
      setEditingSkillMarkdownView('preview');
      setEditingSkillContent(typeof content === 'string' ? content : '');
      setSavedSkillContent(typeof content === 'string' ? content : '');
      setEditingSkillFolderEntries(normalizedFolderEntries);
      setWorkspaceEditor({ kind: 'skill-edit' });
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to load skill content.'), 'error');
    }
  }, [api, resetInstallBrowseState, resetInstallPreviewState, setStatusText]);

  const onOpenSkillInstallEditor = useCallback(() => {
    skillFileRequestIdRef.current += 1;
    setWorkspaceEditor({ kind: 'skill-install', stage: 'browse' });
    setEditingSkillEntry(null);
    resetInstallBrowseState();
    resetInstallPreviewState();
    setLoadingSkillFileContent(false);
    setLoadingInstallGitHubSkills(false);
    setSavingSkillContent(false);
    setDeletingSkillContent(false);
    setInstallingSkillContent(false);
  }, [resetInstallBrowseState, resetInstallPreviewState]);

  const onCloseSkillEditor = useCallback(() => {
    skillFileRequestIdRef.current += 1;
    setWorkspaceEditor({ kind: 'none' });
    setEditingSkillEntry(null);
    resetInstallBrowseState();
    resetInstallPreviewState();
    setLoadingSkillFileContent(false);
    setLoadingInstallGitHubSkills(false);
    setSavingSkillContent(false);
    setDeletingSkillContent(false);
    setInstallingSkillContent(false);
  }, [resetInstallBrowseState, resetInstallPreviewState]);

  const onBackFromInstallPreview = useCallback(() => {
    if (workspaceEditor.kind !== 'skill-install' || workspaceEditor.stage !== 'preview') {
      return;
    }

    setWorkspaceEditor({ kind: 'skill-install', stage: 'browse' });
  }, [workspaceEditor]);

  const onOpenAgentPromptEditor = useCallback((target: 'create' | 'edit') => {
    const sourceValue = target === 'create'
      ? String(creatingAgent?.systemPrompt || '')
      : String(editingAgent?.systemPrompt || '');

    setAgentPromptEditorDraft(sourceValue);
    setWorkspaceEditor({ kind: 'agent-system-prompt', target });
  }, [creatingAgent?.systemPrompt, editingAgent?.systemPrompt]);

  const onCloseAgentPromptEditor = useCallback(() => {
    setWorkspaceEditor({ kind: 'none' });
    setAgentPromptEditorDraft('');
  }, []);

  const onBackAgentPromptEditor = useCallback(() => {
    if (workspaceEditor.kind !== 'agent-system-prompt') {
      return;
    }

    const sourceValue = workspaceEditor.target === 'create'
      ? String(creatingAgent?.systemPrompt || '')
      : String(editingAgent?.systemPrompt || '');

    if (agentPromptEditorDraft === sourceValue || confirmWorkspaceEditorDiscard('Discard unapplied system prompt changes?')) {
      onCloseAgentPromptEditor();
    }
  }, [agentPromptEditorDraft, creatingAgent?.systemPrompt, editingAgent?.systemPrompt, onCloseAgentPromptEditor, workspaceEditor]);

  const onApplyAgentPromptEditor = useCallback(() => {
    if (workspaceEditor.kind !== 'agent-system-prompt') {
      return;
    }

    if (workspaceEditor.target === 'create') {
      setCreatingAgent((value: any) => ({ ...value, systemPrompt: agentPromptEditorDraft }));
    } else {
      setEditingAgent((value: any) => ({ ...value, systemPrompt: agentPromptEditorDraft }));
    }

    onCloseAgentPromptEditor();
  }, [agentPromptEditorDraft, onCloseAgentPromptEditor, setCreatingAgent, setEditingAgent, workspaceEditor]);

  const onOpenWorldTextEditor = useCallback((field: WorldTextEditorField) => {
    setWorldTextEditorDraft(String(editingWorld?.[field] || ''));
    setWorkspaceEditor({ kind: 'world-text-field', target: 'edit', field });
  }, [editingWorld]);

  const onCloseWorldTextEditor = useCallback(() => {
    setWorkspaceEditor({ kind: 'none' });
    setWorldTextEditorDraft('');
  }, []);

  const onBackWorldTextEditor = useCallback(() => {
    if (workspaceEditor.kind !== 'world-text-field') {
      return;
    }

    const sourceValue = String(editingWorld?.[workspaceEditor.field] || '');
    if (worldTextEditorDraft === sourceValue || confirmWorkspaceEditorDiscard('Discard unapplied world draft changes?')) {
      onCloseWorldTextEditor();
    }
  }, [editingWorld, onCloseWorldTextEditor, workspaceEditor, worldTextEditorDraft]);

  const onApplyWorldTextEditor = useCallback(() => {
    if (workspaceEditor.kind !== 'world-text-field') {
      return;
    }

    setEditingWorld((value: any) => ({
      ...value,
      [workspaceEditor.field]: worldTextEditorDraft,
    }));
    onCloseWorldTextEditor();
  }, [onCloseWorldTextEditor, setEditingWorld, workspaceEditor, worldTextEditorDraft]);

  const onCloseProjectFolderViewer = useCallback(() => {
    if (projectViewerContent !== savedProjectViewerContent
      && !confirmWorkspaceEditorDiscard('Discard unsaved project file changes?')) {
      return;
    }

    resetProjectFolderViewerState();
    setWorkspaceEditor({ kind: 'none' });
  }, [projectViewerContent, resetProjectFolderViewerState, savedProjectViewerContent]);

  const onSelectProjectViewerFile = useCallback(async (relativePath: string) => {
    const normalizedRelativePath = String(relativePath || '').trim();
    if (!projectViewerRootPath || !normalizedRelativePath) {
      return;
    }

    if (projectViewerContent !== savedProjectViewerContent
      && !confirmWorkspaceEditorDiscard('Discard unsaved project file changes?')) {
      return;
    }

    const requestId = projectViewerRequestIdRef.current + 1;
    projectViewerRequestIdRef.current = requestId;
    setProjectViewerSelectedFilePath(normalizedRelativePath);
    setLoadingProjectFileContent(true);
    setProjectViewerFileResult(null);
    setProjectViewerMarkdownView('preview');

    try {
      const fileResult = await api.readProjectFileContent(projectViewerRootPath, normalizedRelativePath);
      if (projectViewerRequestIdRef.current !== requestId) {
        return;
      }

      setProjectViewerFileResult(fileResult);
      const nextContent = fileResult?.status === 'ok' ? String(fileResult.content || '') : '';
      setProjectViewerContent(nextContent);
      setSavedProjectViewerContent(nextContent);
    } catch (error) {
      if (projectViewerRequestIdRef.current !== requestId) {
        return;
      }

      setProjectViewerFileResult({ status: 'unsupported', relativePath: normalizedRelativePath });
      setProjectViewerContent('');
      setSavedProjectViewerContent('');
      setStatusText(safeMessage(error, 'Failed to load project file.'), 'error');
    } finally {
      if (projectViewerRequestIdRef.current === requestId) {
        setLoadingProjectFileContent(false);
      }
    }
  }, [api, projectViewerContent, projectViewerRootPath, savedProjectViewerContent, setStatusText]);

  const onSaveProjectViewerContent = useCallback(async () => {
    const normalizedRelativePath = String(projectViewerSelectedFilePath || '').trim();
    if (!projectViewerRootPath || !normalizedRelativePath || projectViewerContent === savedProjectViewerContent) {
      return;
    }

    setSavingProjectFileContent(true);
    try {
      await api.saveProjectFileContent(projectViewerRootPath, projectViewerContent, normalizedRelativePath);
      setSavedProjectViewerContent(projectViewerContent);
      setProjectViewerFileResult((current) => (
        current && current.status === 'ok'
          ? { ...current, content: projectViewerContent, sizeBytes: projectViewerContent.length }
          : current
      ));
      setStatusText(`Saved ${normalizedRelativePath}.`, 'success');
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to save project file.'), 'error');
    } finally {
      setSavingProjectFileContent(false);
    }
  }, [api, projectViewerContent, projectViewerRootPath, projectViewerSelectedFilePath, savedProjectViewerContent, setStatusText]);

  const onOpenProjectFolderViewer = useCallback(async () => {
    const projectPath = String(selectedProjectPath || '').trim();
    if (!projectPath) {
      setStatusText('Select a project folder first.', 'info');
      return;
    }

    const requestId = projectViewerRequestIdRef.current + 1;
    projectViewerRequestIdRef.current = requestId;
    setProjectViewerRootPath(projectPath);
    setProjectViewerEntries([]);
    setProjectViewerSelectedFilePath('');
    setProjectViewerFileResult(null);
    setLoadingProjectFolderStructure(true);
    setLoadingProjectFileContent(false);
    setWorkspaceEditor({ kind: 'project-folder-viewer' });

    try {
      const folderEntries = await api.readProjectFolderStructure(projectPath);
      if (projectViewerRequestIdRef.current !== requestId) {
        return;
      }

      const normalizedEntries = Array.isArray(folderEntries) ? folderEntries : [];
      const initialFilePath = getInitialProjectFilePath(normalizedEntries);
      setProjectViewerEntries(normalizedEntries);
      setProjectViewerSelectedFilePath(initialFilePath);
      setProjectViewerMarkdownView('preview');

      if (!initialFilePath) {
        return;
      }

      setLoadingProjectFileContent(true);
      const fileResult = await api.readProjectFileContent(projectPath, initialFilePath);
      if (projectViewerRequestIdRef.current !== requestId) {
        return;
      }

      setProjectViewerFileResult(fileResult);
      const nextContent = fileResult?.status === 'ok' ? String(fileResult.content || '') : '';
      setProjectViewerContent(nextContent);
      setSavedProjectViewerContent(nextContent);
    } catch (error) {
      if (projectViewerRequestIdRef.current !== requestId) {
        return;
      }

      resetProjectFolderViewerState();
      setWorkspaceEditor({ kind: 'none' });
      setStatusText(safeMessage(error, 'Failed to open project folder viewer.'), 'error');
    } finally {
      if (projectViewerRequestIdRef.current === requestId) {
        setLoadingProjectFolderStructure(false);
        setLoadingProjectFileContent(false);
      }
    }
  }, [api, resetProjectFolderViewerState, selectedProjectPath, setStatusText]);

  const onChangeInstallSkillSourceType = useCallback((value: SkillInstallSourceType) => {
    installGitHubSkillLoadRequestIdRef.current += 1;
    installLocalSkillLoadRequestIdRef.current += 1;
    setInstallSkillSourceType(value);
    setInstallSkillSearchQuery('');
    setLoadingInstallGitHubSkills(false);
    setLoadingInstallLocalSkills(false);
    resetInstallPreviewState();
    setInstallSkillItemName('');
    if (value === 'local') {
      setInstallGitHubSkillOptions([]);
    } else {
      setInstallLocalSkillOptions([]);
    }
  }, [resetInstallPreviewState]);

  const onChangeInstallSkillSourcePath = useCallback((value: string) => {
    installLocalSkillLoadRequestIdRef.current += 1;
    setInstallSkillSearchQuery(resolveLocalSkillSearchQueryOnSourceChange(installSkillSearchQuery, installSkillSourcePath, value));
    setInstallSkillSourcePath(value);
    setInstallLocalSkillOptions([]);
    setLoadingInstallLocalSkills(false);
    resetInstallPreviewState();
    setInstallSkillItemName('');
  }, [installSkillSearchQuery, installSkillSourcePath, resetInstallPreviewState]);

  const onChangeInstallSkillRepo = useCallback((value: string) => {
    installGitHubSkillLoadRequestIdRef.current += 1;
    setInstallSkillRepo(value);
    setInstallSkillSearchQuery('');
    setLoadingInstallGitHubSkills(false);
    setInstallGitHubSkillOptions([]);
    setInstallSkillItemName('');
    resetInstallPreviewState();
  }, [resetInstallPreviewState]);

  const onLoadInstallLocalSkills = useCallback(async (rootOverride?: string) => {
    const rootPath = String(rootOverride || installSkillSourcePath || '').trim();
    const activeSourcePath = resolveActiveLocalSkillLoadSourcePath(installSkillSourcePath, rootOverride);
    if (!rootPath) {
      setStatusText('Local skill root is required.', 'error');
      return;
    }

    const requestId = installLocalSkillLoadRequestIdRef.current + 1;
    installLocalSkillLoadRequestIdRef.current = requestId;
    setLoadingInstallLocalSkills(true);
    try {
      const skills = await api.listLocalSkills(rootPath);
      if (!shouldApplyLocalSkillLoadResult({
        activeRequestId: installLocalSkillLoadRequestIdRef.current,
        requestId,
        currentSourcePath: activeSourcePath,
        requestSourcePath: rootPath,
      })) {
        return;
      }

      const normalizedSkills = Array.isArray(skills)
        ? skills.map((skill) => ({
          skillId: String(skill?.skillId || '').trim(),
          description: String(skill?.description || '').trim(),
          folderPath: String(skill?.folderPath || '').trim(),
          relativePath: String(skill?.relativePath || '').trim(),
        })).filter((skill) => Boolean(skill.skillId) && Boolean(skill.folderPath))
        : [];
      const preservedResolvedSourcePath = normalizedSkills.some((skill) => skill.folderPath === installResolvedSourcePath)
        ? installResolvedSourcePath
        : '';
      const nextSkillName = resolveSelectedLocalSkillName(installSkillItemName, normalizedSkills);
      if (nextSkillName !== installSkillItemName || preservedResolvedSourcePath !== installResolvedSourcePath) {
        resetInstallPreviewState();
      }

      setInstallSkillSourcePath(rootPath);
      setInstallLocalSkillOptions(normalizedSkills);
      setInstallSkillItemName(nextSkillName);
      setInstallResolvedSourcePath(preservedResolvedSourcePath);
      if (normalizedSkills.length > 0) {
        setStatusText(`Loaded ${normalizedSkills.length} local skill${normalizedSkills.length === 1 ? '' : 's'} from ${rootPath}.`, 'success');
      } else {
        setStatusText(`No local skills found in ${rootPath}.`, 'info');
      }
    } catch (error) {
      if (!shouldApplyLocalSkillLoadResult({
        activeRequestId: installLocalSkillLoadRequestIdRef.current,
        requestId,
        currentSourcePath: activeSourcePath,
        requestSourcePath: rootPath,
      })) {
        return;
      }

      setInstallLocalSkillOptions([]);
      setInstallSkillItemName('');
      resetInstallPreviewState();
      setStatusText(safeMessage(error, 'Failed to list local skills.'), 'error');
    } finally {
      if (installLocalSkillLoadRequestIdRef.current === requestId) {
        setLoadingInstallLocalSkills(false);
      }
    }
  }, [api, installResolvedSourcePath, installSkillItemName, installSkillSourcePath, resetInstallPreviewState, setStatusText]);

  const loadInstallSkillPreview = useCallback(async (previewPayload?: {
    source?: string;
    repo?: string;
    itemName?: string;
  }) => {
    if (!previewPayload) {
      return false;
    }

    setInstallSkillPreviewStatusMessage('Loading preview files…');
    setLoadingSkillFileContent(true);
    try {
      const preview = await api.previewSkillImport(previewPayload);
      if (!preview) {
        resetInstallPreviewState();
        setInstallSkillPreviewStatusMessage('Preview files are unavailable for this skill.');
        return false;
      }
      const normalizedEntries = Array.isArray(preview.entries) ? preview.entries : [];
      const normalizedFiles = preview.files && typeof preview.files === 'object' ? preview.files : {};
      if (normalizedEntries.length === 0 && Object.keys(normalizedFiles).length === 0) {
        resetInstallPreviewState();
        setInstallSkillPreviewStatusMessage('Preview files are unavailable for this skill.');
        return false;
      }
      const initialFilePath = String(preview.initialFilePath || getInitialSkillFilePath(normalizedEntries) || 'SKILL.md').trim();
      const initialContent = typeof normalizedFiles[initialFilePath] === 'string' ? normalizedFiles[initialFilePath] : '';
      const rawDescription = extractSkillDescriptionFromPreviewFiles(normalizedFiles);
      setEditingSkillEntry(null);
      setEditingSkillFolderEntries(normalizedEntries);
      setInstallSkillPreviewFiles(normalizedFiles);
      setInstallSkillDraftFiles({});
      setInstallSkillDescription(rawDescription ? formatFullSkillDescription(rawDescription) : '');
      setInstallSkillItemName(String(preview.rootName || previewPayload.itemName || '').trim());
      setEditingSkillFilePath(initialFilePath || 'SKILL.md');
      setEditingSkillMarkdownView('preview');
      setEditingSkillContent(initialContent);
      setSavedSkillContent(initialContent);
      setInstallSkillPreviewStatusMessage('');
      setStatusText(`Loaded skill preview: ${String(preview.rootName || 'skill')}`, 'success');
      return true;
    } catch (error) {
      const errorMessage = safeMessage(error, 'Failed to preview skill import.');
      resetInstallPreviewState();
      setInstallSkillPreviewStatusMessage(errorMessage);
      setStatusText(errorMessage, 'error');
      return false;
    } finally {
      setLoadingSkillFileContent(false);
    }
  }, [api, resetInstallPreviewState, setStatusText]);

  const onChangeInstallSkillSearchQuery = useCallback((value: string) => {
    setInstallSkillSearchQuery(value);
  }, []);

  const onChangeSkillEditorContent = useCallback((value: string) => {
    setEditingSkillContent(value);
    if (workspaceEditor.kind !== 'skill-install') {
      return;
    }
    const activeFilePath = String(editingSkillFilePath || '').trim();
    if (!activeFilePath) {
      return;
    }
    setInstallSkillDraftFiles((current) => mergeSkillInstallDraftFiles(current, installSkillPreviewFiles, activeFilePath, value));
  }, [editingSkillFilePath, installSkillPreviewFiles, workspaceEditor.kind]);

  const onSelectSkillFile = useCallback(async (relativePath: string) => {
    const nextFilePath = String(relativePath || '').trim();
    if (!nextFilePath || nextFilePath === editingSkillFilePath || savingSkillContent || deletingSkillContent || loadingSkillFileContent || installingSkillContent) return;

    if (workspaceEditor.kind === 'skill-install') {
      const nextContent = Object.prototype.hasOwnProperty.call(installSkillDraftFiles, nextFilePath)
        ? installSkillDraftFiles[nextFilePath]
        : (installSkillPreviewFiles[nextFilePath] ?? '');
      const previewContent = installSkillPreviewFiles[nextFilePath] ?? '';
      setEditingSkillFilePath(nextFilePath);
      setEditingSkillMarkdownView('preview');
      setEditingSkillContent(nextContent);
      setSavedSkillContent(previewContent);
      return;
    }

    const skillId = String(editingSkillEntry?.skillId || '').trim();
    if (!skillId) return;

    const requestId = skillFileRequestIdRef.current + 1;
    skillFileRequestIdRef.current = requestId;
    setLoadingSkillFileContent(true);
    try {
      const content = await api.readSkillContent(skillId, nextFilePath);
      if (skillFileRequestIdRef.current !== requestId) {
        return;
      }
      setEditingSkillFilePath(nextFilePath);
      setEditingSkillMarkdownView('preview');
      setEditingSkillContent(typeof content === 'string' ? content : '');
      setSavedSkillContent(typeof content === 'string' ? content : '');
    } catch (error) {
      if (skillFileRequestIdRef.current !== requestId) {
        return;
      }
      setStatusText(safeMessage(error, 'Failed to load skill file.'), 'error');
    } finally {
      if (skillFileRequestIdRef.current === requestId) {
        setLoadingSkillFileContent(false);
      }
    }
  }, [api, deletingSkillContent, editingSkillEntry, editingSkillFilePath, installSkillDraftFiles, installSkillPreviewFiles, installingSkillContent, loadingSkillFileContent, savingSkillContent, setStatusText, workspaceEditor.kind]);

  const onBrowseInstallSkillSource = useCallback(async () => {
    try {
      const result = (typeof api.pickDirectory === 'function'
        ? await api.pickDirectory(installSkillSourcePath || workspace.workspacePath || undefined)
        : await api.openWorkspace(installSkillSourcePath || workspace.workspacePath || undefined)) as DirectorySelectionResult | null;
      const directoryPath = result?.directoryPath ?? result?.workspacePath;
      if (!result?.canceled && directoryPath) {
        onChangeInstallSkillSourcePath(String(directoryPath));
        void onLoadInstallLocalSkills(String(directoryPath));
      }
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to pick skill folder.'), 'error');
    }
  }, [api, installSkillSourcePath, onChangeInstallSkillSourcePath, onLoadInstallLocalSkills, setStatusText, workspace.workspacePath]);

  const onLoadInstallGitHubSkills = useCallback(async () => {
    const repo = installSkillRepo.trim();
    if (!repo) {
      setStatusText('GitHub repo is required.', 'error');
      return;
    }

    const requestId = installGitHubSkillLoadRequestIdRef.current + 1;
    installGitHubSkillLoadRequestIdRef.current = requestId;
    setLoadingInstallGitHubSkills(true);
    try {
      const skills = await api.listGitHubSkills(repo);
      if (!shouldApplyGitHubSkillLoadResult({
        activeRequestId: installGitHubSkillLoadRequestIdRef.current,
        requestId,
        currentRepo: installSkillRepo,
        requestRepo: repo,
      })) {
        return;
      }

      const normalizedSkills = Array.isArray(skills)
        ? skills
          .map((value) => {
            if (typeof value === 'string') {
              return {
                skillId: String(value || '').trim(),
                description: '',
              };
            }

            return {
              skillId: String(value?.skillId || '').trim(),
              description: String(value?.description || '').trim(),
            };
          })
          .filter((skill) => Boolean(skill.skillId))
        : [];
      const nextSkillName = resolveSelectedGitHubSkillName(installSkillItemName, normalizedSkills);
      if (nextSkillName !== installSkillItemName) {
        resetInstallPreviewState();
      }
      setInstallGitHubSkillOptions(normalizedSkills);
      setInstallSkillItemName(nextSkillName);
      if (normalizedSkills.length > 0) {
        setStatusText(`Loaded ${normalizedSkills.length} skill${normalizedSkills.length === 1 ? '' : 's'} from ${repo}.`, 'success');
      } else {
        setStatusText(`No skills found in ${repo}.`, 'info');
      }
    } catch (error) {
      if (!shouldApplyGitHubSkillLoadResult({
        activeRequestId: installGitHubSkillLoadRequestIdRef.current,
        requestId,
        currentRepo: installSkillRepo,
        requestRepo: repo,
      })) {
        return;
      }

      setInstallGitHubSkillOptions([]);
      setInstallSkillItemName('');
      resetInstallPreviewState();
      setStatusText(safeMessage(error, 'Failed to list GitHub skills.'), 'error');
    } finally {
      if (installGitHubSkillLoadRequestIdRef.current === requestId) {
        setLoadingInstallGitHubSkills(false);
      }
    }
  }, [api, installSkillItemName, installSkillRepo, resetInstallPreviewState, setStatusText]);

  const onPreviewInstallSkill = useCallback(async (nextSkillName?: string, nextLocalFolderPath?: string) => {
    const normalizedSkillName = String(nextSkillName || installSkillItemName || '').trim();
    if (installSkillSourceType === 'github' && !normalizedSkillName) {
      setStatusText('Select a skill to preview.', 'error');
      return;
    }

    if (nextSkillName) {
      setInstallSkillItemName(normalizedSkillName);
    }

    const localSelection = installSkillSourceType === 'local'
      ? resolveLocalSkillPreviewSelection(
        installLocalSkillOptions,
        normalizedSkillName,
        nextLocalFolderPath || installResolvedSourcePath,
      )
      : null;
    const localSourcePath = installSkillSourceType === 'local'
      ? (localSelection?.folderPath || installSkillSourcePath.trim())
      : '';
    const previewPayload = installSkillSourceType === 'github'
      ? {
        repo: installSkillRepo.trim(),
        itemName: normalizedSkillName,
      }
      : (localSourcePath
        ? {
          source: localSourcePath,
          ...(localSelection?.skillName ? { itemName: localSelection.skillName } : {}),
        }
        : undefined);
    setWorkspaceEditor((current) => (current.kind === 'skill-install'
      ? { kind: 'skill-install', stage: resolveSkillInstallEditorStageOnPreview() }
      : current));
    const loaded = await loadInstallSkillPreview(previewPayload);
    if (!loaded) {
      return;
    }

    if (installSkillSourceType === 'local') {
      setInstallResolvedSourcePath(localSourcePath);
      if (localSelection?.skillName) {
        setInstallSkillItemName(localSelection.skillName);
      }
    }

    setWorkspaceEditor((current) => (current.kind === 'skill-install'
      ? { kind: 'skill-install', stage: resolveSkillInstallEditorStageOnPreview(true) }
      : current));
  }, [installLocalSkillOptions, installResolvedSourcePath, installSkillItemName, installSkillRepo, installSkillSourcePath, installSkillSourceType, loadInstallSkillPreview, setStatusText]);

  const onSaveSkillContent = useCallback(async () => {
    const skillId = String(editingSkillEntry?.skillId || '').trim();
    if (!skillId) return;
    setSavingSkillContent(true);
    try {
      await api.saveSkillContent(skillId, editingSkillContent, editingSkillFilePath);
      setSavedSkillContent(editingSkillContent);
      setStatusText(`Saved ${editingSkillFilePath}.`, 'success');
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to save skill content.'), 'error');
    } finally {
      setSavingSkillContent(false);
    }
  }, [api, editingSkillContent, editingSkillEntry, editingSkillFilePath, setStatusText]);

  const onInstallSkillContent = useCallback(async () => {
    const skillName = String(installSkillItemName || '').trim();
    if (!skillName) {
      setStatusText('Preview a skill before installing it.', 'error');
      return;
    }

    if (editingSkillFolderEntries.length === 0) {
      setStatusText('Preview a skill before installing it.', 'error');
      return;
    }

    const filesToInstall = installSkillDraftFiles;

    setInstallingSkillContent(true);
    try {
      await api.importSkill({
        ...(installSkillSourceType === 'github'
          ? { repo: installSkillRepo.trim() }
          : ((installResolvedSourcePath || installSkillSourcePath.trim()) ? { source: installResolvedSourcePath || installSkillSourcePath.trim() } : {})),
        itemName: skillName,
        targetScope: installSkillTargetScope,
        ...(installSkillTargetScope === 'project' && selectedProjectPath
          ? { projectPath: selectedProjectPath }
          : {}),
        files: filesToInstall,
      });
      const enableResult = await ensureSkillEnabled(installSkillTargetScope, skillName);
      if (!enableResult.changed) {
        try {
          await refreshSkillRegistry();
        } catch {
          // Keep install successful even if the follow-up refresh fails.
        }
        setStatusText(`Installed skill: ${skillName}`, 'success');
      } else if (enableResult.saved) {
        setStatusText(`Installed and enabled skill: ${skillName}`, 'success');
      } else {
        try {
          await refreshSkillRegistry();
        } catch {
          // Keep install successful even if the follow-up refresh fails.
        }
        setStatusText(`Installed skill: ${skillName}, but enabling it failed.`, 'error');
      }
      onCloseSkillEditor();
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to install skill.'), 'error');
    } finally {
      setInstallingSkillContent(false);
    }
  }, [api, editingSkillFolderEntries.length, ensureSkillEnabled, installResolvedSourcePath, installSkillDraftFiles, installSkillItemName, installSkillRepo, installSkillSourcePath, installSkillSourceType, installSkillTargetScope, onCloseSkillEditor, refreshSkillRegistry, selectedProjectPath, setStatusText]);

  const onDeleteSkillContent = useCallback(async () => {
    const skillId = String(editingSkillEntry?.skillId || '').trim();
    if (!skillId) return;

    const shouldDelete = window.confirm(`Delete skill "${skillId}"? This action cannot be undone.`);
    if (!shouldDelete) return;

    setDeletingSkillContent(true);
    try {
      await api.deleteSkill(skillId);
      try {
        await refreshSkillRegistry();
      } catch {
        // Best-effort refresh; the delete already succeeded.
      }
      onCloseSkillEditor();
      setStatusText(`Skill deleted: ${skillId}`, 'success');
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to delete skill.'), 'error');
    } finally {
      setDeletingSkillContent(false);
    }
  }, [api, editingSkillEntry, onCloseSkillEditor, refreshSkillRegistry, setStatusText]);

  const agentStatusInput = useMemo(
    () => worldAgents.map((a: any) => ({ id: String(a.id || ''), name: String(a.name || '') })),
    [worldAgents]
  );
  const { chatStatus, agentStatuses } = useWorkingStatus(loadedWorld?.id, selectedSessionId, agentStatusInput);

  useEffect(() => {
    chatStatusRef.current = chatStatus;
  }, [chatStatus]);

  useEffect(() => {
    setSystemStatus((current) => {
      if (shouldDisplaySessionSystemStatus({
        status: current,
        chatStatus,
        draftText: composer,
      })) {
        return current;
      }
      return null;
    });
  }, [chatStatus, composer]);

  const workingStartTimeRef = useRef<number | null>(null);
  const [inlineElapsedMs, setInlineElapsedMs] = useState(0);
  useEffect(() => {
    if (chatStatus === 'working') {
      if (workingStartTimeRef.current === null) {
        workingStartTimeRef.current = Date.now();
      }
      const id = setInterval(() => {
        setInlineElapsedMs(Date.now() - (workingStartTimeRef.current ?? Date.now()));
      }, 250);
      return () => clearInterval(id);
    }
    workingStartTimeRef.current = null;
    setInlineElapsedMs(0);
    return undefined;
  }, [chatStatus]);

  useEffect(() => {
    const textarea = composerTextareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    const lineHeight = Number.parseInt(window.getComputedStyle(textarea).lineHeight, 10) || 20;
    const maxHeight = lineHeight * COMPOSER_MAX_ROWS;
    const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${nextHeight}px`;
  }, [composer]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const hasNewMessage = messages.length > previousMessageCountRef.current;
    requestAnimationFrame(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: hasNewMessage ? 'smooth' : 'auto'
      });
    });
    previousMessageCountRef.current = messages.length;
  }, [messages]);

  useEffect(() => {
    if (!activeHitlPrompt) return;
    const container = messagesContainerRef.current;
    if (!container) return;
    requestAnimationFrame(() => {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    });
  }, [activeHitlPrompt]);

  useEffect(() => {
    if (!selectedSessionId) return;
    const composerTextarea = composerTextareaRef.current;
    if (!composerTextarea) return;
    composerTextarea.focus({ preventScroll: true });
  }, [selectedSessionId]);

  const isCurrentSessionSending = Boolean(selectedSessionId && sendingSessionIds.has(selectedSessionId));
  const isCurrentSessionStopping = Boolean(selectedSessionId && stoppingSessionIds.has(selectedSessionId));
  const isCurrentSessionPendingResponse = Boolean(selectedSessionId && pendingResponseSessionIds.has(selectedSessionId));
  const isCurrentSessionWorking = chatStatus === 'working';
  const canStopCurrentSession = computeCanStopCurrentSession({
    selectedSessionId,
    isCurrentSessionSending,
    isCurrentSessionStopping,
    isCurrentSessionPendingResponse,
    isCurrentSessionWorking,
  });
  const showInlineWorkingIndicator = !activeHitlPrompt && (chatStatus === 'working' || isCurrentSessionSending);
  const workingAgentEntries = agentStatuses.filter((agent) => agent.status === 'working');
  const workingAgentNames = workingAgentEntries.map((agent) => agent.name);
  const workingAgentModels = workingAgentEntries
    .map((agent) => String(worldAgentsById.get(agent.id)?.model || '').trim())
    .filter(Boolean);
  const uniqueWorkingAgentModels = [...new Set(workingAgentModels)];
  const mainAgentModel = useMemo(() => {
    const normalizedMainAgent = normalizeAgentKey(loadedWorld?.mainAgent);
    if (!normalizedMainAgent) return '';

    const byId = worldAgents.find(
      (agent: any) => normalizeAgentKey(agent.id) === normalizedMainAgent
    );
    if (byId?.model) {
      return String(byId.model).trim();
    }

    const byName = worldAgents.find(
      (agent: any) => normalizeAgentKey(agent.name) === normalizedMainAgent
    );
    return String(byName?.model || '').trim();
  }, [loadedWorld?.mainAgent, worldAgents]);
  const fallbackContactModel = String(
    uniqueWorkingAgentModels[0]
    || mainAgentModel
    || worldAgents[0]?.model
    || loadedWorld?.chatLLMModel
    || ''
  ).trim();
  const inlineStatusText = (() => {
    if (workingAgentEntries.length === 1) {
      const singleAgent = workingAgentEntries[0];
      const singleModel = String(worldAgentsById.get(singleAgent.id)?.model || '').trim();
      return singleModel
        ? `${singleAgent.name} (${singleModel}) working...`
        : `${singleAgent.name} working...`;
    }
    if (workingAgentEntries.length > 1) {
      return `${workingAgentNames.join(', ')} working...`;
    }
    if (fallbackContactModel) {
      return `Contacting ${fallbackContactModel}...`;
    }
    return 'Contacting model...';
  })();
  const inlineDetailText = workingAgentEntries.length > 1 && uniqueWorkingAgentModels.length > 0
    ? `models: ${uniqueWorkingAgentModels.join(', ')}`
    : '';
  const inlineWorkingIndicatorState = showInlineWorkingIndicator
    ? {
      primaryText: workingAgentNames.length > 0 ? workingAgentNames.join(', ') : 'Agent',
      inlineStatusText,
      detailText: inlineDetailText,
      elapsedMs: inlineElapsedMs
    }
    : null;
  const hasConversationMessages = useMemo(() => {
    const shouldShowToolMessages = systemSettings.showToolMessages !== false;
    return messages.some((message) => {
      if (!isRenderableMessageEntry(message)) return false;
      if (shouldShowToolMessages) return true;
      return !isToolRelatedMessage(message);
    });
  }, [messages, systemSettings.showToolMessages]);

  const mainContentMessageListProps = createMainContentMessageListProps({
    worldViewMode,
    worldGridLayoutChoiceId,
    messagesContainerRef,
    messagesLoading: loading.messages,
    hasConversationMessages,
    selectedSession,
    refreshSkillRegistry,
    loadingSkillRegistry,
    visibleSkillRegistryEntries,
    skillRegistryError,
    showToolMessages: systemSettings.showToolMessages !== false,
    messages,
    messagesById,
    worldAgentsById,
    worldAgentsByName,
    editingText,
    setEditingText,
    editingMessageId,
    deletingMessageId,
    onCancelEditMessage,
    onSaveEditMessage,
    onStartEditMessage,
    onDeleteMessage,
    onBranchFromMessage,
    onCopyRawMarkdownFromMessage,
    showInlineWorkingIndicator,
    inlineWorkingIndicatorState,
    activeHitlPrompt,
    submittingHitlRequestId,
    onRespondHitlOption: (prompt: HitlPrompt, optionId: string) => respondToHitlPrompt(prompt, optionId),
  });

  const mainContentComposerProps = createMainContentComposerProps({
    onSubmitMessage,
    composerTextareaRef,
    composer,
    setComposer,
    onComposerKeyDown,
    onOpenProjectFolder: onSelectProject,
    onOpenProjectViewer: onOpenProjectFolderViewer,
    selectedProjectPath,
    reasoningEffort,
    onSetReasoningEffort,
    toolPermission,
    onSetToolPermission,
    canStopCurrentSession,
    isCurrentSessionStopping,
    isCurrentSessionSending,
    hasActiveHitlPrompt,
    onAddToQueue: selectedSessionId ? onAddToQueue : undefined,
  });

  const mainContentRightPanelShellProps = createMainContentRightPanelShellProps({
    panelOpen,
    panelMode,
    closePanel,
  });

  const mainContentRightPanelContentProps = createMainContentRightPanelContentProps({
    panelMode,
    loadedWorld,
    selectedAgentForPanel,
    themePreference,
    setThemePreference,
    systemSettings,
    setSystemSettings,
    workspace,
    api,
    globalSkillEntries,
    disabledGlobalSkillIdSet,
    setGlobalSkillsEnabled,
    toggleSkillEnabled,
    projectSkillEntries,
    disabledProjectSkillIdSet,
    setProjectSkillsEnabled,
    onCancelSettings,
    savingSystemSettings,
    onSaveSettings,
    settingsNeedRestart,
    onUpdateWorld,
    editingWorld,
    setEditingWorld,
    updatingWorld,
    deletingWorld,
    onOpenWorldTextEditor,
    onDeleteWorld,
    closePanel,
    onCreateAgent,
    creatingAgent,
    setCreatingAgent,
    onOpenAgentPromptEditor,
    savingAgent,
    onUpdateAgent,
    editingAgent,
    setEditingAgent,
    deletingAgent,
    onDeleteAgent,
    onCreateWorld,
    creatingWorld,
    setCreatingWorld,
    panelLogs: scopedPanelLogs,
    onClearPanelLogs,
    onEditSkill: onOpenSkillEditor,
    onInstallSkill: onOpenSkillInstallEditor,
  });

  const leftSidebarProps = createLeftSidebarProps({
    leftSidebarCollapsed,
    setLeftSidebarCollapsed,
    DRAG_REGION_STYLE,
    NO_DRAG_REGION_STYLE,
    appUpdateState,
    onCheckForUpdates: checkForUpdates,
    onInstallUpdateAndRestart: installUpdateAndRestart,
    availableWorlds,
    loadedWorld,
    panelMode,
    onOpenCreateWorldPanel,
    onOpenImportWorldPanel,
    onCloseImportWorldPanel,
    onImportWorld,
    onImportAgent,
    onExportWorld,
    onSelectWorld,
    loadingWorld,
    worldLoadError,
    worldInfoStats,
    heartbeatJob: selectedHeartbeatJob,
    heartbeatAction,
    refreshingWorldInfo,
    updatingWorld,
    deletingWorld,
    onRefreshWorldInfo,
    onOpenWorldEditPanel,
    onDeleteWorld,
    onStartHeartbeat,
    onStopHeartbeat,
    onCreateSession,
    sessionSearch,
    setSessionSearch,
    sessions,
    filteredSessions,
    selectedSessionId,
    onSelectSession,
    deletingSessionId,
    onDeleteSession,
  });

  const mainHeaderProps = createMainHeaderProps({
    leftSidebarCollapsed,
    setLeftSidebarCollapsed,
    loadedWorld,
    selectedSession,
    visibleWorldAgents,
    hiddenWorldAgentCount,
    activeHeaderAgentIds: [],
    selectedAgentId,
    onOpenEditAgentPanel,
    onOpenCreateAgentPanel,
    worldViewMode,
    worldGridLayoutChoiceId,
    isGridLayoutSubmenuOpen,
    onWorldViewModeChange: (nextMode: unknown) => {
      const normalizedMode = normalizeWorldViewMode(nextMode);
      setWorldViewMode(normalizedMode);
      if (normalizedMode !== 'grid') {
        setIsGridLayoutSubmenuOpen(false);
      }
    },
    onWorldGridLayoutChoiceChange: (nextChoiceId: unknown) => {
      setWorldGridLayoutChoiceId(normalizeWorldGridLayoutChoiceId(nextChoiceId));
      setIsGridLayoutSubmenuOpen(false);
    },
    onToggleGridLayoutSubmenu: (nextOpen: unknown) => {
      setIsGridLayoutSubmenuOpen(Boolean(nextOpen));
    },
    onOpenLogsPanel,
    onOpenSettingsPanel,
    panelMode,
    panelOpen,
    DRAG_REGION_STYLE,
    NO_DRAG_REGION_STYLE,
  });

  const workspaceEditorContent = (() => {
    if (workspaceEditor.kind === 'skill-install' && workspaceEditor.stage === 'browse') {
      return (
        <SkillInstallBrowser
          sourceType={installSkillSourceType}
          sourcePath={installSkillSourcePath}
          repo={installSkillRepo}
          availableGitHubSkills={installGitHubSkillOptions}
          availableLocalSkills={installLocalSkillOptions}
          searchQuery={installSkillSearchQuery}
          loadingGitHubOptions={loadingInstallGitHubSkills}
          loadingLocalOptions={loadingInstallLocalSkills}
          loadingPreview={loadingSkillFileContent}
          installing={installingSkillContent}
          leftSidebarCollapsed={leftSidebarCollapsed}
          onBack={onCloseSkillEditor}
          onSourceTypeChange={onChangeInstallSkillSourceType}
          onSourcePathChange={onChangeInstallSkillSourcePath}
          onBrowseSource={onBrowseInstallSkillSource}
          onRepoChange={onChangeInstallSkillRepo}
          onSearchQueryChange={onChangeInstallSkillSearchQuery}
          onLoadGitHubOptions={onLoadInstallGitHubSkills}
          onLoadLocalOptions={onLoadInstallLocalSkills}
          onPreviewSelection={onPreviewInstallSkill}
        />
      );
    }

    if (workspaceEditor.kind === 'skill-edit' || (workspaceEditor.kind === 'skill-install' && workspaceEditor.stage === 'preview')) {
      return (
        <SkillEditor
          mode={workspaceEditor.kind === 'skill-install' ? 'install' : 'edit'}
          skillId={workspaceEditor.kind === 'skill-edit' ? String(editingSkillEntry?.skillId || '') : installSkillItemName}
          sourceScope={workspaceEditor.kind === 'skill-edit' ? String(editingSkillEntry?.sourceScope || 'project') : installSkillTargetScope}
          leftSidebarCollapsed={leftSidebarCollapsed}
          selectedFilePath={editingSkillFilePath}
          markdownViewMode={editingSkillMarkdownView}
          content={editingSkillContent}
          onContentChange={onChangeSkillEditorContent}
          onMarkdownViewModeChange={setEditingSkillMarkdownView}
          onBack={workspaceEditor.kind === 'skill-install' ? onBackFromInstallPreview : onCloseSkillEditor}
          onSave={onSaveSkillContent}
          onDelete={onDeleteSkillContent}
          onSelectFile={onSelectSkillFile}
          folderEntries={editingSkillFolderEntries}
          hasUnsavedChanges={workspaceEditor.kind === 'skill-edit' && editingSkillContent !== savedSkillContent}
          loadingFile={loadingSkillFileContent}
          saving={savingSkillContent}
          deleting={deletingSkillContent}
          installItemName={installSkillItemName}
          installDescription={installSkillDescription}
          installTargetScope={installSkillTargetScope}
          onInstallTargetScopeChange={setInstallSkillTargetScope}
          onInstall={onInstallSkillContent}
          installing={installingSkillContent}
          currentFileEditable={workspaceEditor.kind !== 'skill-install' || isSkillInstallFileEditable(installSkillPreviewFiles, editingSkillFilePath)}
          emptyContentMessage={workspaceEditor.kind === 'skill-install'
            ? (loadingSkillFileContent
              ? 'Loading preview files…'
              : (installSkillPreviewStatusMessage || `Preview files are unavailable for ${installSkillItemName || 'this skill'}.`))
            : ''}
          folderEmptyStateText={workspaceEditor.kind === 'skill-install'
            ? (loadingSkillFileContent
              ? 'Loading preview files…'
              : (installSkillPreviewStatusMessage || `Preview files are unavailable for ${installSkillItemName || 'this skill'}.`))
            : ''}
        />
      );
    }

    if (workspaceEditor.kind === 'project-folder-viewer') {
      return (
        <ProjectFolderViewer
          rootPath={projectViewerRootPath}
          entries={projectViewerEntries}
          selectedFilePath={projectViewerSelectedFilePath}
          fileResult={projectViewerFileResult}
          content={projectViewerContent}
          markdownViewMode={projectViewerMarkdownView}
          loadingStructure={loadingProjectFolderStructure}
          loadingFile={loadingProjectFileContent}
          saving={savingProjectFileContent}
          hasUnsavedChanges={projectViewerContent !== savedProjectViewerContent}
          onSelectFile={onSelectProjectViewerFile}
          onContentChange={setProjectViewerContent}
          onMarkdownViewModeChange={setProjectViewerMarkdownView}
          onSave={onSaveProjectViewerContent}
          onBack={onCloseProjectFolderViewer}
          leftSidebarCollapsed={leftSidebarCollapsed}
        />
      );
    }

    if (workspaceEditor.kind === 'agent-system-prompt') {
      const sourceAgent = workspaceEditor.target === 'create' ? creatingAgent : editingAgent;
      const sourceValue = String(sourceAgent?.systemPrompt || '');

      return (
        <AgentPromptEditor
          draftContextLabel={workspaceEditor.target === 'create' ? 'Create Agent Draft' : 'Edit Agent Draft'}
          agentName={String(sourceAgent?.name || '').trim() || (workspaceEditor.target === 'create' ? 'New Agent' : 'Untitled Agent')}
          value={agentPromptEditorDraft}
          onChange={setAgentPromptEditorDraft}
          onBack={onBackAgentPromptEditor}
          onApply={onApplyAgentPromptEditor}
          hasUnappliedChanges={agentPromptEditorDraft !== sourceValue}
          leftSidebarCollapsed={leftSidebarCollapsed}
        />
      );
    }

    if (workspaceEditor.kind === 'world-text-field') {
      const sourceValue = String(editingWorld?.[workspaceEditor.field] || '');

      return (
        <WorldTextEditor
          worldName={String(editingWorld?.name || loadedWorld?.name || '').trim() || 'Untitled World'}
          field={workspaceEditor.field}
          value={worldTextEditorDraft}
          onChange={setWorldTextEditorDraft}
          onBack={onBackWorldTextEditor}
          onApply={onApplyWorldTextEditor}
          hasUnappliedChanges={worldTextEditorDraft !== sourceValue}
          leftSidebarCollapsed={leftSidebarCollapsed}
        />
      );
    }

    return undefined;
  })();

  return (
    <AppFrameLayout
      sidebar={<LeftSidebarPanel {...leftSidebarProps} />}
      mainContent={(
        <MainWorkspaceLayout
          mainHeaderProps={mainHeaderProps}
          mainContentAreaProps={{
            messageListProps: mainContentMessageListProps,
            composerProps: mainContentComposerProps,
            rightPanelShellProps: mainContentRightPanelShellProps,
            rightPanelContentProps: mainContentRightPanelContentProps,
          }}
          editorContent={workspaceEditorContent}
          queuePanel={(
            shouldShowQueuePanel(queuedMessages.length, Boolean(activeHitlPrompt)) ? (
              <MessageQueuePanel
                queuedMessages={queuedMessages}
                onRemove={removeMessageFromQueue}
                onRetry={retryMessageFromQueue}
                onPause={pauseQueue}
                onResume={resumeQueue}
                onStop={stopQueue}
                onClear={clearQueue}
              />
            ) : null
          )}
          statusBar={(
            <WorkingStatusBar chatStatus={chatStatus} agentStatuses={agentStatuses} notification={notification} systemStatus={systemStatus} />
          )}
        />
      )}
    />
  );
}

export default function RendererWorkspace() {
  const [api, setApi] = useState<DesktopApi | null>(() => readDesktopApi());
  const [bridgeTimedOut, setBridgeTimedOut] = useState(false);

  useEffect(() => {
    if (api || typeof window === 'undefined') {
      return;
    }

    let attempts = 0;

    const intervalId = window.setInterval(() => {
      const nextApi = readDesktopApi();
      if (nextApi) {
        setApi(nextApi);
        setBridgeTimedOut(false);
        window.clearInterval(intervalId);
        return;
      }

      attempts += 1;

      if (attempts >= DESKTOP_API_BOOTSTRAP_RETRY_LIMIT) {
        setBridgeTimedOut(true);
        window.clearInterval(intervalId);
      }
    }, DESKTOP_API_BOOTSTRAP_RETRY_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [api]);

  if (!api) {
    return <BridgeUnavailableScreen timedOut={bridgeTimedOut} />;
  }

  return <AppContent api={api} />;
}
