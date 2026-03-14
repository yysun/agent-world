/**
 * App Layout Prop Builders
 * Purpose:
 * - Build grouped prop objects for App layout composition components.
 *
 * Key Features:
 * - Centralizes verbose object literal assembly for sidebar/header/content regions.
 * - Keeps App component render section concise and easy to scan.
 *
 * Implementation Notes:
 * - Pure helpers with no side effects.
 * - Data-only transformations from provided inputs.
 *
 * Recent Changes:
 * - 2026-03-13: Added `reasoningEffort` and `onSetReasoningEffort` to composer props for world-level reasoning control.
 * - 2026-03-12: Added `toolPermission` and `onSetToolPermission` to composer props for world-level tool permission dropdown.
 * - 2026-03-04: Added grid submenu open-state wiring for grid icon submenu toggle/dismiss behavior.
 * - 2026-03-04: Added world-view mode and grid-layout prop wiring for header selector and message-list render strategies.
 * - 2026-02-28: Added right-panel settings autosave handlers wiring for skill scope toggles.
 * - 2026-02-27: Added `showToolMessages` wiring to message-list props for transcript-level tool-row visibility control.
 * - 2026-02-27: Added right-panel logs props wiring (`panelLogs`, `onClearPanelLogs`) and replaced header refresh wiring with `onOpenLogsPanel`.
 * - 2026-02-26: Added right-panel import props wiring (`onImportWorld`) to support import form mode.
 * - 2026-02-21: Added message-list prop wiring for assistant raw-markdown copy action.
 * - 2026-02-20: Added inline HITL message-card props to main message-list wiring (replacing overlay HITL modal usage).
 * - 2026-02-20: Added `activeHeaderAgentIds` wiring so header avatars can reflect active streaming agents.
 * - 2026-02-19: Added status-bar `agentStatusText` wiring for full per-agent activity summaries.
 * - 2026-02-19: Added inline working indicator state wiring for richer chat activity details.
 * - 2026-02-19: Added left-sidebar prop wiring for world export action.
 * - 2026-02-17: Extracted from App.tsx during CC pass.
 */

type PropBag = Record<string, unknown>;

export function createMainContentMessageListProps<T extends PropBag>(input: T) {
  return {
    worldViewMode: input.worldViewMode,
    worldGridLayoutChoiceId: input.worldGridLayoutChoiceId,
    messagesContainerRef: input.messagesContainerRef,
    messagesLoading: input.messagesLoading,
    hasConversationMessages: input.hasConversationMessages,
    selectedSession: input.selectedSession,
    refreshSkillRegistry: input.refreshSkillRegistry,
    loadingSkillRegistry: input.loadingSkillRegistry,
    visibleSkillRegistryEntries: input.visibleSkillRegistryEntries,
    skillRegistryError: input.skillRegistryError,
    showToolMessages: input.showToolMessages,
    messages: input.messages,
    messagesById: input.messagesById,
    worldAgentsById: input.worldAgentsById,
    worldAgentsByName: input.worldAgentsByName,
    editingText: input.editingText,
    setEditingText: input.setEditingText,
    editingMessageId: input.editingMessageId,
    deletingMessageId: input.deletingMessageId,
    onCancelEditMessage: input.onCancelEditMessage,
    onSaveEditMessage: input.onSaveEditMessage,
    onStartEditMessage: input.onStartEditMessage,
    onDeleteMessage: input.onDeleteMessage,
    onBranchFromMessage: input.onBranchFromMessage,
    onCopyRawMarkdownFromMessage: input.onCopyRawMarkdownFromMessage,
    showInlineWorkingIndicator: input.showInlineWorkingIndicator,
    inlineWorkingIndicatorState: input.inlineWorkingIndicatorState,
    activeHitlPrompt: input.activeHitlPrompt,
    submittingHitlRequestId: input.submittingHitlRequestId,
    onRespondHitlOption: input.onRespondHitlOption,
  };
}

export function createMainContentComposerProps<T extends PropBag>(input: T) {
  return {
    onSubmitMessage: input.onSubmitMessage,
    composerTextareaRef: input.composerTextareaRef,
    composer: input.composer,
    onComposerChange: input.setComposer,
    onComposerKeyDown: input.onComposerKeyDown,
    onSelectProject: input.onSelectProject,
    selectedProjectPath: input.selectedProjectPath,
    canStopCurrentSession: input.canStopCurrentSession,
    isCurrentSessionStopping: input.isCurrentSessionStopping,
    isCurrentSessionSending: input.isCurrentSessionSending,
    hasActiveHitlPrompt: input.hasActiveHitlPrompt,
    onAddToQueue: input.onAddToQueue,
    reasoningEffort: input.reasoningEffort,
    onSetReasoningEffort: input.onSetReasoningEffort,
    toolPermission: input.toolPermission,
    onSetToolPermission: input.onSetToolPermission,
  };
}

export function createMainContentRightPanelShellProps<T extends PropBag>(input: T) {
  return {
    panelOpen: input.panelOpen,
    panelMode: input.panelMode,
    onClose: input.closePanel,
  };
}

export function createMainContentRightPanelContentProps<T extends PropBag>(input: T) {
  return {
    panelMode: input.panelMode,
    loadedWorld: input.loadedWorld,
    selectedAgentForPanel: input.selectedAgentForPanel,
    themePreference: input.themePreference,
    setThemePreference: input.setThemePreference,
    systemSettings: input.systemSettings,
    setSystemSettings: input.setSystemSettings,
    workspace: input.workspace,
    api: input.api,
    globalSkillEntries: input.globalSkillEntries,
    disabledGlobalSkillIdSet: input.disabledGlobalSkillIdSet,
    setGlobalSkillsEnabled: input.setGlobalSkillsEnabled,
    toggleSkillEnabled: input.toggleSkillEnabled,
    projectSkillEntries: input.projectSkillEntries,
    disabledProjectSkillIdSet: input.disabledProjectSkillIdSet,
    setProjectSkillsEnabled: input.setProjectSkillsEnabled,
    onCancelSettings: input.onCancelSettings,
    savingSystemSettings: input.savingSystemSettings,
    onSaveSettings: input.onSaveSettings,
    settingsNeedRestart: input.settingsNeedRestart,
    onUpdateWorld: input.onUpdateWorld,
    editingWorld: input.editingWorld,
    setEditingWorld: input.setEditingWorld,
    updatingWorld: input.updatingWorld,
    deletingWorld: input.deletingWorld,
    setWorldConfigEditorField: input.setWorldConfigEditorField,
    setWorldConfigEditorValue: input.setWorldConfigEditorValue,
    setWorldConfigEditorTarget: input.setWorldConfigEditorTarget,
    setWorldConfigEditorOpen: input.setWorldConfigEditorOpen,
    onDeleteWorld: input.onDeleteWorld,
    closePanel: input.closePanel,
    onCreateAgent: input.onCreateAgent,
    creatingAgent: input.creatingAgent,
    setCreatingAgent: input.setCreatingAgent,
    setPromptEditorValue: input.setPromptEditorValue,
    setPromptEditorTarget: input.setPromptEditorTarget,
    setPromptEditorOpen: input.setPromptEditorOpen,
    savingAgent: input.savingAgent,
    onUpdateAgent: input.onUpdateAgent,
    editingAgent: input.editingAgent,
    setEditingAgent: input.setEditingAgent,
    deletingAgent: input.deletingAgent,
    onDeleteAgent: input.onDeleteAgent,
    onCreateWorld: input.onCreateWorld,
    creatingWorld: input.creatingWorld,
    setCreatingWorld: input.setCreatingWorld,
    onImportWorld: input.onImportWorld,
    panelLogs: input.panelLogs,
    onClearPanelLogs: input.onClearPanelLogs,
    onEditSkill: input.onEditSkill,
  };
}

export function createLeftSidebarProps<T extends PropBag>(input: T) {
  return {
    leftSidebarCollapsed: input.leftSidebarCollapsed,
    setLeftSidebarCollapsed: input.setLeftSidebarCollapsed,
    dragRegionStyle: input.DRAG_REGION_STYLE,
    noDragRegionStyle: input.NO_DRAG_REGION_STYLE,
    availableWorlds: input.availableWorlds,
    loadedWorld: input.loadedWorld,
    onOpenCreateWorldPanel: input.onOpenCreateWorldPanel,
    onImportWorld: input.onImportWorld,
    onExportWorld: input.onExportWorld,
    onSelectWorld: input.onSelectWorld,
    loadingWorld: input.loadingWorld,
    worldLoadError: input.worldLoadError,
    worldInfoStats: input.worldInfoStats,
    heartbeatJob: input.heartbeatJob,
    heartbeatAction: input.heartbeatAction,
    refreshingWorldInfo: input.refreshingWorldInfo,
    updatingWorld: input.updatingWorld,
    deletingWorld: input.deletingWorld,
    onRefreshWorldInfo: input.onRefreshWorldInfo,
    onOpenWorldEditPanel: input.onOpenWorldEditPanel,
    onDeleteWorld: input.onDeleteWorld,
    onStartHeartbeat: input.onStartHeartbeat,
    onStopHeartbeat: input.onStopHeartbeat,
    onCreateSession: input.onCreateSession,
    sessionSearch: input.sessionSearch,
    setSessionSearch: input.setSessionSearch,
    sessions: input.sessions,
    filteredSessions: input.filteredSessions,
    selectedSessionId: input.selectedSessionId,
    onSelectSession: input.onSelectSession,
    deletingSessionId: input.deletingSessionId,
    onDeleteSession: input.onDeleteSession,
  };
}

export function createMainHeaderProps<T extends PropBag>(input: T) {
  return {
    leftSidebarCollapsed: input.leftSidebarCollapsed,
    setLeftSidebarCollapsed: input.setLeftSidebarCollapsed,
    selectedWorld: input.loadedWorld,
    selectedSession: input.selectedSession,
    visibleWorldAgents: input.visibleWorldAgents,
    hiddenWorldAgentCount: input.hiddenWorldAgentCount,
    activeHeaderAgentIds: input.activeHeaderAgentIds,
    onOpenEditAgentPanel: input.onOpenEditAgentPanel,
    onOpenCreateAgentPanel: input.onOpenCreateAgentPanel,
    worldViewMode: input.worldViewMode,
    worldGridLayoutChoiceId: input.worldGridLayoutChoiceId,
    isGridLayoutSubmenuOpen: input.isGridLayoutSubmenuOpen,
    onWorldViewModeChange: input.onWorldViewModeChange,
    onWorldGridLayoutChoiceChange: input.onWorldGridLayoutChoiceChange,
    onToggleGridLayoutSubmenu: input.onToggleGridLayoutSubmenu,
    onOpenLogsPanel: input.onOpenLogsPanel,
    onOpenSettingsPanel: input.onOpenSettingsPanel,
    panelMode: input.panelMode,
    panelOpen: input.panelOpen,
    dragRegionStyle: input.DRAG_REGION_STYLE,
    noDragRegionStyle: input.NO_DRAG_REGION_STYLE,
  };
}

export function createStatusActivityBarProps<T extends PropBag>(input: T) {
  return {
    status: input.status,
    agentStatusText: input.agentStatusText,
    hasComposerActivity: input.hasComposerActivity,
    isAgentWorkInProgress: input.isAgentWorkInProgress,
    activeTools: input.activeTools,
    elapsedMs: input.elapsedMs,
  };
}
