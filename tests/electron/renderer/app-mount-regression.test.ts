/**
 * Electron Renderer App Mount Regression Tests
 * Purpose:
 * - Verify the top-level App component can evaluate without throwing during initial mount.
 *
 * Key Features:
 * - Covers the renderer mount path with lightweight hook/component mocks.
 * - Guards against temporal-dead-zone regressions when derived state reads hook outputs too early.
 *
 * Implementation Notes:
 * - Uses virtual React hook mocks instead of jsdom to keep the regression deterministic.
 * - Focuses on initial App evaluation only; child hooks/components are stubbed.
 *
 * Recent Changes:
 * - 2026-03-06: Added regression coverage for the `loadedWorld` initialization ordering crash.
 */

import { describe, expect, it, vi } from 'vitest';

const { jsxFactory, defaultWorldForm, defaultAgentForm } = vi.hoisted(() => ({
  jsxFactory: (type: unknown, props: Record<string, unknown> | null, key?: unknown) => ({
    type,
    props: props ?? {},
    key,
  }),
  defaultWorldForm: {
    name: '',
    description: '',
    turnLimit: 5,
    mainAgent: '',
    chatLLMProvider: 'openai',
    chatLLMModel: 'gpt-4.1',
    heartbeatEnabled: false,
    heartbeatInterval: '*/5 * * * *',
    heartbeatPrompt: '',
    mcpConfig: '',
    variables: '',
  },
  defaultAgentForm: {
    name: '',
    autoReply: false,
    provider: 'openai',
    model: 'gpt-4.1',
    systemPrompt: '',
    temperature: '',
    maxTokens: '',
  },
}));

vi.mock('react', () => ({
  default: { createElement: jsxFactory },
  useCallback: (fn: unknown) => fn,
  useEffect: () => undefined,
  useMemo: (fn: () => unknown) => fn(),
  useRef: (value?: unknown) => ({ current: value }),
  useState: (value: unknown) => [typeof value === 'function' ? (value as () => unknown)() : value, () => undefined],
}));

vi.mock('react/jsx-runtime', () => ({
  Fragment: 'Fragment',
  jsx: jsxFactory,
  jsxs: jsxFactory,
}));

vi.mock('react/jsx-dev-runtime', () => ({
  Fragment: 'Fragment',
  jsxDEV: jsxFactory,
}));

vi.mock('../../../electron/renderer/src/components/index', () => ({
  LeftSidebarPanel: 'LeftSidebarPanel',
  AppFrameLayout: 'AppFrameLayout',
  MainWorkspaceLayout: 'MainWorkspaceLayout',
  AppOverlaysHost: 'AppOverlaysHost',
  WorkingStatusBar: 'WorkingStatusBar',
  MessageQueuePanel: 'MessageQueuePanel',
}));

vi.mock('../../../electron/renderer/src/hooks/useWorkingStatus', () => ({
  useWorkingStatus: () => ({ chatStatus: 'idle', agentStatuses: [] }),
}));

vi.mock('../../../electron/renderer/src/domain/desktop-api', () => ({
  getDesktopApi: () => ({}),
  safeMessage: (_error: unknown, fallback: string) => fallback,
}));

vi.mock('../../../electron/renderer/src/hooks/useSkillRegistry', () => ({
  useSkillRegistry: () => ({
    skillRegistryEntries: [],
    loadingSkillRegistry: false,
    skillRegistryError: null,
    refreshSkillRegistry: async () => undefined,
  }),
}));

vi.mock('../../../electron/renderer/src/hooks/useStreamingActivity', () => ({
  useStreamingActivity: () => ({
    streamingStateRef: { current: { handleEnd: vi.fn(), endAllToolStreams: vi.fn(() => []) } },
    resetActivityRuntimeState: vi.fn(),
  }),
}));

vi.mock('../../../electron/renderer/src/hooks/useMessageManagement', () => ({
  useMessageManagement: () => ({
    composer: '',
    setComposer: vi.fn(),
    sendingSessionIds: new Set(),
    stoppingSessionIds: new Set(),
    pendingResponseSessionIds: new Set(),
    editingMessageId: null,
    editingText: '',
    setEditingText: vi.fn(),
    deletingMessageId: null,
    onSendMessage: async () => undefined,
    onStopMessage: async () => undefined,
    onSubmitMessage: async () => undefined,
    onStartEditMessage: vi.fn(),
    onCancelEditMessage: vi.fn(),
    onSaveEditMessage: async () => undefined,
    onDeleteMessage: async () => undefined,
    onBranchFromMessage: async () => undefined,
    onCopyRawMarkdownFromMessage: async () => undefined,
    clearEditDeleteState: vi.fn(),
    resetMessageRuntimeState: vi.fn(),
  }),
}));

vi.mock('../../../electron/renderer/src/hooks/useSessionManagement', () => ({
  useSessionManagement: () => ({
    sessions: [],
    setSessions: vi.fn(),
    sessionSearch: '',
    setSessionSearch: vi.fn(),
    selectedSessionId: null,
    setSelectedSessionId: vi.fn(),
    deletingSessionId: null,
    filteredSessions: [],
    refreshSessions: async () => undefined,
    onCreateSession: async () => undefined,
    onSelectSession: async () => undefined,
    onDeleteSession: async () => undefined,
  }),
}));

vi.mock('../../../electron/renderer/src/hooks/useThemeSettings', () => ({
  useThemeSettings: () => ({
    themePreference: 'system',
    setThemePreference: vi.fn(),
    systemSettings: { showToolMessages: true },
    setSystemSettings: vi.fn(),
    savingSystemSettings: false,
    settingsNeedRestart: false,
    hasUnsavedSystemSettingsChanges: false,
    disabledGlobalSkillIdSet: new Set(),
    disabledProjectSkillIdSet: new Set(),
    visibleSkillRegistryEntries: [],
    globalSkillEntries: [],
    projectSkillEntries: [],
    setGlobalSkillsEnabled: vi.fn(),
    setProjectSkillsEnabled: vi.fn(),
    toggleSkillEnabled: vi.fn(),
    loadSystemSettings: async () => undefined,
    resetSystemSettings: vi.fn(),
    saveSystemSettings: async () => ({ saved: true, needsRestart: false }),
  }),
}));

vi.mock('../../../electron/renderer/src/hooks/useWorldManagement', () => ({
  useWorldManagement: () => ({
    loadedWorld: null,
    setLoadedWorld: vi.fn(),
    worldLoadError: null,
    setWorldLoadError: vi.fn(),
    loadingWorld: false,
    setLoadingWorld: vi.fn(),
    availableWorlds: [],
    setAvailableWorlds: vi.fn(),
    creatingWorld: { ...defaultWorldForm },
    setCreatingWorld: vi.fn(),
    editingWorld: { ...defaultWorldForm },
    setEditingWorld: vi.fn(),
    updatingWorld: false,
    deletingWorld: false,
    refreshingWorldInfo: false,
    onSelectWorld: async () => undefined,
    onCreateWorld: async () => undefined,
    refreshWorldDetails: async () => undefined,
    onRefreshWorldInfo: async () => undefined,
    onUpdateWorld: async () => undefined,
    onDeleteWorld: async () => undefined,
    onImportWorld: async () => undefined,
    onExportWorld: async () => undefined,
  }),
}));

vi.mock('../../../electron/renderer/src/hooks/useAppActionHandlers', () => ({
  useAppActionHandlers: () => ({
    closePanel: vi.fn(),
    onOpenSettingsPanel: async () => undefined,
    onCancelSettings: vi.fn(),
    onSaveSettings: async () => undefined,
    onOpenCreateWorldPanel: vi.fn(),
    onOpenImportWorldPanel: vi.fn(),
    onOpenLogsPanel: vi.fn(),
    onOpenWorldEditPanel: vi.fn(),
    onOpenCreateAgentPanel: vi.fn(),
    onOpenEditAgentPanel: vi.fn(),
    onCreateAgent: async () => undefined,
    onUpdateAgent: async () => undefined,
    onDeleteAgent: async () => undefined,
    onSelectProject: async () => undefined,
    onComposerKeyDown: vi.fn(),
  }),
}));

vi.mock('../../../electron/renderer/src/hooks/useChatEventSubscriptions', () => ({
  useChatEventSubscriptions: () => undefined,
}));

vi.mock('../../../electron/renderer/src/hooks/useMessageQueue', () => ({
  useMessageQueue: () => ({
    queuedMessages: [],
    addToQueue: async () => undefined,
    removeFromQueue: async () => undefined,
    pauseQueue: async () => undefined,
    resumeQueue: async () => undefined,
    stopQueue: async () => undefined,
    clearQueue: async () => undefined,
    retryQueueMessage: async () => undefined,
  }),
}));

vi.mock('../../../electron/renderer/src/utils/app-layout-props', () => ({
  createLeftSidebarProps: () => ({}),
  createMainContentComposerProps: () => ({}),
  createMainContentMessageListProps: () => ({}),
  createMainContentRightPanelContentProps: () => ({}),
  createMainContentRightPanelShellProps: () => ({}),
  createMainHeaderProps: () => ({}),
}));

vi.mock('../../../electron/renderer/src/utils/logger', () => ({
  initializeRendererLogger: async () => undefined,
  rendererLogger: {
    subscribe: () => () => undefined,
    debug: vi.fn(),
  },
}));

vi.mock('../../../electron/renderer/src/domain/session-system-status', () => ({
  createSessionSystemStatus: () => null,
  retainSessionSystemStatusForContext: (current: unknown) => current,
}));

vi.mock('../../../electron/renderer/src/utils/app-helpers', () => ({
  getAgentDisplayName: (agent: any, index: number) => String(agent?.name || `Agent ${index + 1}`),
  getAgentInitials: (name: string) => String(name || '').slice(0, 2).toUpperCase(),
  getDefaultWorldForm: () => ({ ...defaultWorldForm }),
  getEnvValueFromText: () => '',
  getWorldFormFromWorld: () => ({ ...defaultWorldForm }),
  parseOptionalInteger: (value: unknown, fallback: number) => {
    const next = Number(value);
    return Number.isFinite(next) ? next : fallback;
  },
}));

vi.mock('../../../electron/shared/conversation-message-counts', () => ({
  countAgentConversationResponses: () => 0,
  countConversationDisplayMessages: (messages: unknown[]) => messages.length,
}));

import App from '../../../electron/renderer/src/App';

describe('electron/renderer App mount regression', () => {
  it('does not throw before loadedWorld is initialized by useWorldManagement', () => {
    expect(() => App()).not.toThrow();
  });
});