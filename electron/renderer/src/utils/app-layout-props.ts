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
 * - 2026-02-17: Extracted from App.tsx during CC pass.
 */

type PropBag = Record<string, unknown>;

export function createMainContentMessageListProps<T extends PropBag>(input: T) {
  return {
    messagesContainerRef: input.messagesContainerRef,
    hasConversationMessages: input.hasConversationMessages,
    selectedSession: input.selectedSession,
    refreshSkillRegistry: input.refreshSkillRegistry,
    loadingSkillRegistry: input.loadingSkillRegistry,
    visibleSkillRegistryEntries: input.visibleSkillRegistryEntries,
    skillRegistryError: input.skillRegistryError,
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
    showInlineWorkingIndicator: input.showInlineWorkingIndicator,
    inlineWorkingAgentLabel: input.inlineWorkingAgentLabel,
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
    toggleSkillEnabled: input.toggleSkillEnabled,
    projectSkillEntries: input.projectSkillEntries,
    disabledProjectSkillIdSet: input.disabledProjectSkillIdSet,
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
    onSelectWorld: input.onSelectWorld,
    loadingWorld: input.loadingWorld,
    worldLoadError: input.worldLoadError,
    worldInfoStats: input.worldInfoStats,
    refreshingWorldInfo: input.refreshingWorldInfo,
    updatingWorld: input.updatingWorld,
    deletingWorld: input.deletingWorld,
    onRefreshWorldInfo: input.onRefreshWorldInfo,
    onOpenWorldEditPanel: input.onOpenWorldEditPanel,
    onDeleteWorld: input.onDeleteWorld,
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
    onOpenEditAgentPanel: input.onOpenEditAgentPanel,
    onOpenCreateAgentPanel: input.onOpenCreateAgentPanel,
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
    hasComposerActivity: input.hasComposerActivity,
    isAgentWorkInProgress: input.isAgentWorkInProgress,
    activeTools: input.activeTools,
    elapsedMs: input.elapsedMs,
  };
}
