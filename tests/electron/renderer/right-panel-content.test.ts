/**
 * RightPanelContent Settings Tests
 * Purpose:
 * - Verify the settings panel exposes the Project Skills install entry point.
 * - Verify system settings present canonical skill roots to the user.
 * - Verify world-form field interactions continue to update parent state.
 * - Verify selection-control primitives still drive parent state updates.
 */

import { describe, expect, it, vi } from 'vitest';

const { jsxFactory } = vi.hoisted(() => ({
  jsxFactory: (type: unknown, props: Record<string, unknown> | null, key?: unknown) => ({
    type,
    props: props ?? {},
    key,
  }),
}));

vi.mock('react', () => ({
  default: { createElement: jsxFactory },
  useEffect: () => undefined,
  useRef: (initialValue: unknown) => ({ current: initialValue }),
}), { virtual: true });

vi.mock('react/jsx-runtime', () => ({
  Fragment: 'Fragment',
  jsx: jsxFactory,
  jsxs: jsxFactory,
}), { virtual: true });

vi.mock('react/jsx-dev-runtime', () => ({
  Fragment: 'Fragment',
  jsxDEV: jsxFactory,
}), { virtual: true });

import SettingsPanelContent from '../../../electron/renderer/src/features/settings/components/SettingsPanelContent';
import WorldPanelContent from '../../../electron/renderer/src/features/worlds/components/WorldPanelContent';
import Checkbox from '../../../electron/renderer/src/design-system/primitives/Checkbox';

function allDescendants(node: any): any[] {
  if (!node || typeof node !== 'object') return [];
  if (typeof node.type === 'function') {
    return [node, ...allDescendants(node.type(node.props ?? {}))];
  }
  const children = node.props?.children;
  if (!children) return [node];
  const childArr = Array.isArray(children) ? children : [children];
  return [node, ...childArr.flatMap(allDescendants)];
}

function RightPanelContent(props: any) {
  return props.panelMode === 'settings'
    ? SettingsPanelContent(props)
    : WorldPanelContent(props);
}

describe('RightPanelContent', () => {
  it('renders canonical skill-root guidance in the settings panel', () => {
    const result: any = RightPanelContent({
      panelMode: 'settings',
      loadedWorld: null,
      selectedAgentForPanel: null,
      themePreference: 'system',
      setThemePreference: () => { },
      systemSettings: { enableGlobalSkills: true, enableProjectSkills: true, storageType: 'sqlite', sqliteDatabase: '', dataPath: '' },
      setSystemSettings: () => { },
      workspace: { workspacePath: null },
      api: { pickFile: async () => ({ canceled: true }), pickDirectory: async () => ({ canceled: true }) },
      globalSkillEntries: [],
      disabledGlobalSkillIdSet: new Set(),
      setGlobalSkillsEnabled: () => { },
      toggleSkillEnabled: () => { },
      projectSkillEntries: [],
      disabledProjectSkillIdSet: new Set(),
      setProjectSkillsEnabled: () => { },
      onCancelSettings: () => { },
      savingSystemSettings: false,
      onSaveSettings: () => { },
      settingsNeedRestart: false,
      onUpdateWorld: () => { },
      editingWorld: {},
      setEditingWorld: () => { },
      updatingWorld: false,
      deletingWorld: false,
      setWorldConfigEditorField: () => { },
      setWorldConfigEditorValue: () => { },
      setWorldConfigEditorTarget: () => { },
      setWorldConfigEditorOpen: () => { },
      onDeleteWorld: () => { },
      closePanel: () => { },
      onCreateAgent: () => { },
      creatingAgent: {},
      setCreatingAgent: () => { },
      setPromptEditorValue: () => { },
      setPromptEditorTarget: () => { },
      setPromptEditorOpen: () => { },
      savingAgent: false,
      onUpdateAgent: () => { },
      editingAgent: {},
      setEditingAgent: () => { },
      deletingAgent: false,
      onDeleteAgent: () => { },
      onCreateWorld: () => { },
      creatingWorld: {},
      setCreatingWorld: () => { },
      panelLogs: [],
      onClearPanelLogs: () => { },
      onEditSkill: () => { },
      onInstallSkill: () => { },
    });

    const renderedTree = JSON.stringify(result);
    expect(renderedTree).toContain('~/.agent-world/skills');
    expect(renderedTree).toContain('./.agent-world/skills');
    expect(renderedTree).not.toContain('Legacy global roots remain readable during transition.');
    expect(renderedTree).not.toContain('legacy project roots remain readable');
    expect(renderedTree).not.toContain('workspace skills directory');
    expect(renderedTree).not.toContain('~/.agents/skills');
    expect(renderedTree).not.toContain('./agents/skills');
  });

  it('shows canonical skill-root guidance only for scopes with no discovered skills', () => {
    const result: any = RightPanelContent({
      panelMode: 'settings',
      loadedWorld: null,
      selectedAgentForPanel: null,
      themePreference: 'system',
      setThemePreference: () => { },
      systemSettings: { enableGlobalSkills: true, enableProjectSkills: true, storageType: 'sqlite', sqliteDatabase: '', dataPath: '' },
      setSystemSettings: () => { },
      workspace: { workspacePath: null },
      api: { pickFile: async () => ({ canceled: true }), pickDirectory: async () => ({ canceled: true }) },
      globalSkillEntries: [{ skillId: 'reviewer', description: 'Reviews plans', sourceScope: 'global' }],
      disabledGlobalSkillIdSet: new Set(),
      setGlobalSkillsEnabled: () => { },
      toggleSkillEnabled: () => { },
      projectSkillEntries: [],
      disabledProjectSkillIdSet: new Set(),
      setProjectSkillsEnabled: () => { },
      onCancelSettings: () => { },
      savingSystemSettings: false,
      onSaveSettings: () => { },
      settingsNeedRestart: false,
      onUpdateWorld: () => { },
      editingWorld: {},
      setEditingWorld: () => { },
      updatingWorld: false,
      deletingWorld: false,
      onOpenWorldTextEditor: () => { },
      onDeleteWorld: () => { },
      closePanel: () => { },
      onCreateAgent: () => { },
      creatingAgent: {},
      setCreatingAgent: () => { },
      onOpenAgentPromptEditor: () => { },
      savingAgent: false,
      onUpdateAgent: () => { },
      editingAgent: {},
      setEditingAgent: () => { },
      deletingAgent: false,
      onDeleteAgent: () => { },
      onCreateWorld: () => { },
      creatingWorld: {},
      setCreatingWorld: () => { },
      panelLogs: [],
      onClearPanelLogs: () => { },
      onEditSkill: () => { },
      onInstallSkill: () => { },
    });

    const renderedTree = JSON.stringify(result);

    expect(renderedTree).not.toContain('Global skills default to ~/.agent-world/skills.');
    expect(renderedTree).toContain('Project skills default to ');
    expect(renderedTree).toContain('./.agent-world/skills');
    expect(renderedTree).toContain('reviewer');
  });

  it('hides canonical skill-root guidance when the corresponding scope is disabled', () => {
    const result: any = RightPanelContent({
      panelMode: 'settings',
      loadedWorld: null,
      selectedAgentForPanel: null,
      themePreference: 'system',
      setThemePreference: () => { },
      systemSettings: { enableGlobalSkills: false, enableProjectSkills: false, storageType: 'sqlite', sqliteDatabase: '', dataPath: '' },
      setSystemSettings: () => { },
      workspace: { workspacePath: null },
      api: { pickFile: async () => ({ canceled: true }), pickDirectory: async () => ({ canceled: true }) },
      globalSkillEntries: [],
      disabledGlobalSkillIdSet: new Set(),
      setGlobalSkillsEnabled: () => { },
      toggleSkillEnabled: () => { },
      projectSkillEntries: [],
      disabledProjectSkillIdSet: new Set(),
      setProjectSkillsEnabled: () => { },
      onCancelSettings: () => { },
      savingSystemSettings: false,
      onSaveSettings: () => { },
      settingsNeedRestart: false,
      onUpdateWorld: () => { },
      editingWorld: {},
      setEditingWorld: () => { },
      updatingWorld: false,
      deletingWorld: false,
      onOpenWorldTextEditor: () => { },
      onDeleteWorld: () => { },
      closePanel: () => { },
      onCreateAgent: () => { },
      creatingAgent: {},
      setCreatingAgent: () => { },
      onOpenAgentPromptEditor: () => { },
      savingAgent: false,
      onUpdateAgent: () => { },
      editingAgent: {},
      setEditingAgent: () => { },
      deletingAgent: false,
      onDeleteAgent: () => { },
      onCreateWorld: () => { },
      creatingWorld: {},
      setCreatingWorld: () => { },
      panelLogs: [],
      onClearPanelLogs: () => { },
      onEditSkill: () => { },
      onInstallSkill: () => { },
    });

    const renderedTree = JSON.stringify(result);

    expect(renderedTree).not.toContain('Global skills default to ');
    expect(renderedTree).not.toContain('Project skills default to ');
  });

  it('does not render top border separators above the tool-message settings row', () => {
    const result: any = RightPanelContent({
      panelMode: 'settings',
      loadedWorld: null,
      selectedAgentForPanel: null,
      themePreference: 'system',
      setThemePreference: () => { },
      systemSettings: { showToolMessages: true, enableGlobalSkills: true, enableProjectSkills: true, storageType: 'sqlite', sqliteDatabase: '', dataPath: '' },
      setSystemSettings: () => { },
      workspace: { workspacePath: null },
      api: { pickFile: async () => ({ canceled: true }), pickDirectory: async () => ({ canceled: true }) },
      globalSkillEntries: [],
      disabledGlobalSkillIdSet: new Set(),
      setGlobalSkillsEnabled: () => { },
      toggleSkillEnabled: () => { },
      projectSkillEntries: [],
      disabledProjectSkillIdSet: new Set(),
      setProjectSkillsEnabled: () => { },
      onCancelSettings: () => { },
      savingSystemSettings: false,
      onSaveSettings: () => { },
      settingsNeedRestart: false,
      onUpdateWorld: () => { },
      editingWorld: {},
      setEditingWorld: () => { },
      updatingWorld: false,
      deletingWorld: false,
      setWorldConfigEditorField: () => { },
      setWorldConfigEditorValue: () => { },
      setWorldConfigEditorTarget: () => { },
      setWorldConfigEditorOpen: () => { },
      onDeleteWorld: () => { },
      closePanel: () => { },
      onCreateAgent: () => { },
      creatingAgent: {},
      setCreatingAgent: () => { },
      setPromptEditorValue: () => { },
      setPromptEditorTarget: () => { },
      setPromptEditorOpen: () => { },
      savingAgent: false,
      onUpdateAgent: () => { },
      editingAgent: {},
      setEditingAgent: () => { },
      deletingAgent: false,
      onDeleteAgent: () => { },
      onCreateWorld: () => { },
      creatingWorld: {},
      setCreatingWorld: () => { },
      panelLogs: [],
      onClearPanelLogs: () => { },
      onEditSkill: () => { },
      onInstallSkill: () => { },
    });

    const renderedTree = JSON.stringify(result);

    expect(renderedTree).toContain('Show tool messages');
    expect(renderedTree).not.toContain('border-t border-sidebar-border pt-4');
    expect(renderedTree).not.toContain('mt-2 border-t border-sidebar-border pt-2');
  });

  it('renders the settings install-skill link below the project skill list with pointer cursor styling', () => {
    const onInstallSkill = vi.fn();

    const result: any = RightPanelContent({
      panelMode: 'settings',
      loadedWorld: null,
      selectedAgentForPanel: null,
      themePreference: 'system',
      setThemePreference: () => { },
      systemSettings: { enableGlobalSkills: true, enableProjectSkills: true, storageType: 'sqlite', sqliteDatabase: '', dataPath: '' },
      setSystemSettings: () => { },
      workspace: { workspacePath: null },
      api: { pickFile: async () => ({ canceled: true }), pickDirectory: async () => ({ canceled: true }) },
      globalSkillEntries: [],
      disabledGlobalSkillIdSet: new Set(),
      setGlobalSkillsEnabled: () => { },
      toggleSkillEnabled: () => { },
      projectSkillEntries: [],
      disabledProjectSkillIdSet: new Set(),
      setProjectSkillsEnabled: () => { },
      onCancelSettings: () => { },
      savingSystemSettings: false,
      onSaveSettings: () => { },
      settingsNeedRestart: false,
      onUpdateWorld: () => { },
      editingWorld: {},
      setEditingWorld: () => { },
      updatingWorld: false,
      deletingWorld: false,
      onOpenWorldTextEditor: () => { },
      onDeleteWorld: () => { },
      closePanel: () => { },
      onCreateAgent: () => { },
      creatingAgent: {},
      setCreatingAgent: () => { },
      onOpenAgentPromptEditor: () => { },
      savingAgent: false,
      onUpdateAgent: () => { },
      editingAgent: {},
      setEditingAgent: () => { },
      deletingAgent: false,
      onDeleteAgent: () => { },
      onCreateWorld: () => { },
      creatingWorld: {},
      setCreatingWorld: () => { },
      panelLogs: [],
      onClearPanelLogs: () => { },
      onEditSkill: () => { },
      onInstallSkill,
    });

    const nodes = allDescendants(result);
    const installButton = nodes.find((node: any) => node?.type === 'button' && node?.props?.onClick === onInstallSkill);
    const renderedTree = JSON.stringify(result);

    expect(installButton).toBeDefined();
    expect(JSON.stringify(installButton)).toContain('Install Skill ...');
    expect(String(installButton.props.className || '')).toContain('cursor-pointer');
    expect(renderedTree.indexOf('Project skills default to ')).toBeLessThan(renderedTree.indexOf('Install Skill ...'));
    expect(renderedTree).not.toContain('No global skills discovered.');
    expect(renderedTree).not.toContain('No project skills discovered.');

    installButton.props.onClick();
    expect(onInstallSkill).toHaveBeenCalledTimes(1);
  });

  it('does not render storage settings controls in the system settings panel', () => {
    const result: any = RightPanelContent({
      panelMode: 'settings',
      loadedWorld: null,
      selectedAgentForPanel: null,
      themePreference: 'system',
      setThemePreference: () => { },
      systemSettings: { enableGlobalSkills: true, enableProjectSkills: true, storageType: 'file', sqliteDatabase: '/tmp/database.db', dataPath: '/tmp/data.json' },
      setSystemSettings: () => { },
      workspace: { workspacePath: '/tmp/workspace' },
      api: {
        pickFile: async () => ({ canceled: true }),
        pickDirectory: async () => ({ canceled: true }),
        openWorkspace: async () => ({ canceled: true })
      },
      globalSkillEntries: [],
      disabledGlobalSkillIdSet: new Set(),
      setGlobalSkillsEnabled: () => { },
      toggleSkillEnabled: () => { },
      projectSkillEntries: [],
      disabledProjectSkillIdSet: new Set(),
      setProjectSkillsEnabled: () => { },
      onCancelSettings: () => { },
      savingSystemSettings: false,
      onSaveSettings: () => { },
      settingsNeedRestart: false,
      onUpdateWorld: () => { },
      editingWorld: {},
      setEditingWorld: () => { },
      updatingWorld: false,
      deletingWorld: false,
      onOpenWorldTextEditor: () => { },
      onDeleteWorld: () => { },
      closePanel: () => { },
      onCreateAgent: () => { },
      creatingAgent: {},
      setCreatingAgent: () => { },
      onOpenAgentPromptEditor: () => { },
      savingAgent: false,
      onUpdateAgent: () => { },
      editingAgent: {},
      setEditingAgent: () => { },
      deletingAgent: false,
      onDeleteAgent: () => { },
      onCreateWorld: () => { },
      creatingWorld: {},
      setCreatingWorld: () => { },
      panelLogs: [],
      onClearPanelLogs: () => { },
      onEditSkill: () => { },
      onInstallSkill: () => { },
    });

    const renderedTree = JSON.stringify(result);

    expect(renderedTree).not.toContain('Storage Type');
    expect(renderedTree).not.toContain('Data File Path');
    expect(renderedTree).not.toContain('Database File');
    expect(renderedTree).not.toContain('AGENT_WORLD_DATA_PATH');
    expect(renderedTree).not.toContain('AGENT_WORLD_SQLITE_DATABASE');
    expect(renderedTree).not.toContain('Browse folder...');
    expect(renderedTree).not.toContain('Browse file...');
  });

  it('routes create-world field updates through the provided setter callbacks', () => {
    const setCreatingWorld = vi.fn();

    const result: any = RightPanelContent({
      panelMode: 'create-world',
      loadedWorld: null,
      selectedAgentForPanel: null,
      themePreference: 'system',
      setThemePreference: () => { },
      systemSettings: { enableGlobalSkills: true, enableProjectSkills: true, storageType: 'sqlite', sqliteDatabase: '', dataPath: '' },
      setSystemSettings: () => { },
      workspace: { workspacePath: null },
      api: { pickFile: async () => ({ canceled: true }), pickDirectory: async () => ({ canceled: true }) },
      globalSkillEntries: [],
      disabledGlobalSkillIdSet: new Set(),
      setGlobalSkillsEnabled: () => { },
      toggleSkillEnabled: () => { },
      projectSkillEntries: [],
      disabledProjectSkillIdSet: new Set(),
      setProjectSkillsEnabled: () => { },
      onCancelSettings: () => { },
      savingSystemSettings: false,
      onSaveSettings: () => { },
      settingsNeedRestart: false,
      onUpdateWorld: () => { },
      editingWorld: {},
      setEditingWorld: () => { },
      updatingWorld: false,
      deletingWorld: false,
      onOpenWorldTextEditor: () => { },
      onDeleteWorld: () => { },
      closePanel: () => { },
      onCreateAgent: () => { },
      creatingAgent: {},
      setCreatingAgent: () => { },
      onOpenAgentPromptEditor: () => { },
      savingAgent: false,
      onUpdateAgent: () => { },
      editingAgent: {},
      setEditingAgent: () => { },
      deletingAgent: false,
      onDeleteAgent: () => { },
      onCreateWorld: () => { },
      creatingWorld: {
        name: 'World One',
        description: '',
        chatLLMProvider: '',
        chatLLMModel: '',
        turnLimit: 10,
        mainAgent: '',
      },
      setCreatingWorld,
      panelLogs: [],
      onClearPanelLogs: () => { },
      onEditSkill: () => { },
      onInstallSkill: () => { },
    });

    const nodes = allDescendants(result);
    const worldNameField = nodes.find((node: any) => node?.props?.placeholder === 'World name');
    const descriptionField = nodes.find((node: any) => node?.props?.placeholder === 'Description (optional)');

    expect(worldNameField).toBeDefined();
    expect(descriptionField).toBeDefined();

    worldNameField.props.onChange({ target: { value: 'Updated World' } });
    descriptionField.props.onChange({ target: { value: 'New description' } });

    expect(setCreatingWorld).toHaveBeenCalledTimes(2);

    const updateName = setCreatingWorld.mock.calls[0][0];
    const updateDescription = setCreatingWorld.mock.calls[1][0];

    expect(updateName({ name: 'World One' })).toEqual({ name: 'Updated World' });
    expect(updateDescription({ description: '' })).toEqual({ description: 'New description' });
  });

  it('routes the heartbeat checkbox through the provided world setter callback', () => {
    const setEditingWorld = vi.fn();

    const result: any = RightPanelContent({
      panelMode: 'edit-world',
      loadedWorld: { id: 'world-1', name: 'World 1' },
      selectedAgentForPanel: null,
      themePreference: 'system',
      setThemePreference: () => { },
      systemSettings: { enableGlobalSkills: true, enableProjectSkills: true, storageType: 'sqlite', sqliteDatabase: '', dataPath: '' },
      setSystemSettings: () => { },
      workspace: { workspacePath: null },
      api: { pickFile: async () => ({ canceled: true }), pickDirectory: async () => ({ canceled: true }) },
      globalSkillEntries: [],
      disabledGlobalSkillIdSet: new Set(),
      setGlobalSkillsEnabled: () => { },
      toggleSkillEnabled: () => { },
      projectSkillEntries: [],
      disabledProjectSkillIdSet: new Set(),
      setProjectSkillsEnabled: () => { },
      onCancelSettings: () => { },
      savingSystemSettings: false,
      onSaveSettings: () => { },
      settingsNeedRestart: false,
      onUpdateWorld: () => { },
      editingWorld: {
        name: 'World 1',
        description: '',
        chatLLMProvider: '',
        chatLLMModel: '',
        turnLimit: 10,
        mainAgent: '',
        heartbeatEnabled: false,
      },
      setEditingWorld,
      updatingWorld: false,
      deletingWorld: false,
      onOpenWorldTextEditor: () => { },
      onDeleteWorld: () => { },
      closePanel: () => { },
      onCreateAgent: () => { },
      creatingAgent: {},
      setCreatingAgent: () => { },
      onOpenAgentPromptEditor: () => { },
      savingAgent: false,
      onUpdateAgent: () => { },
      editingAgent: {},
      setEditingAgent: () => { },
      deletingAgent: false,
      onDeleteAgent: () => { },
      onCreateWorld: () => { },
      creatingWorld: {},
      setCreatingWorld: () => { },
      panelLogs: [],
      onClearPanelLogs: () => { },
      onEditSkill: () => { },
      onInstallSkill: () => { },
    });

    const nodes = allDescendants(result);
    const heartbeatCheckbox = nodes.find((node: any) => node?.type === Checkbox);

    expect(heartbeatCheckbox).toBeDefined();
    heartbeatCheckbox.props.onChange({ target: { checked: true } });

    expect(setEditingWorld).toHaveBeenCalledTimes(1);
    const updater = setEditingWorld.mock.calls[0][0];
    expect(updater({ heartbeatEnabled: false })).toEqual({ heartbeatEnabled: true });
  });
  it('routes world long-text expand buttons through the workspace editor callback', () => {
    const onOpenWorldTextEditor = vi.fn();

    const result: any = RightPanelContent({
      panelMode: 'edit-world',
      loadedWorld: { id: 'world-1', name: 'World 1' },
      selectedAgentForPanel: null,
      themePreference: 'system',
      setThemePreference: () => { },
      systemSettings: { enableGlobalSkills: true, enableProjectSkills: true, storageType: 'sqlite', sqliteDatabase: '', dataPath: '' },
      setSystemSettings: () => { },
      workspace: { workspacePath: null },
      api: { pickFile: async () => ({ canceled: true }), pickDirectory: async () => ({ canceled: true }) },
      globalSkillEntries: [],
      disabledGlobalSkillIdSet: new Set(),
      setGlobalSkillsEnabled: () => { },
      toggleSkillEnabled: () => { },
      projectSkillEntries: [],
      disabledProjectSkillIdSet: new Set(),
      setProjectSkillsEnabled: () => { },
      onCancelSettings: () => { },
      savingSystemSettings: false,
      onSaveSettings: () => { },
      settingsNeedRestart: false,
      onUpdateWorld: () => { },
      editingWorld: {
        name: 'World 1',
        description: '',
        chatLLMProvider: '',
        chatLLMModel: '',
        turnLimit: 10,
        mainAgent: '',
        variables: 'OPENAI_API_KEY=test',
        mcpConfig: '{"mcpServers":{}}',
        heartbeatEnabled: false,
      },
      setEditingWorld: () => { },
      updatingWorld: false,
      deletingWorld: false,
      onOpenWorldTextEditor,
      onDeleteWorld: () => { },
      closePanel: () => { },
      onCreateAgent: () => { },
      creatingAgent: {},
      setCreatingAgent: () => { },
      onOpenAgentPromptEditor: () => { },
      savingAgent: false,
      onUpdateAgent: () => { },
      editingAgent: {},
      setEditingAgent: () => { },
      deletingAgent: false,
      onDeleteAgent: () => { },
      onCreateWorld: () => { },
      creatingWorld: {},
      setCreatingWorld: () => { },
      panelLogs: [],
      onClearPanelLogs: () => { },
      onEditSkill: () => { },
      onInstallSkill: () => { },
    });

    const nodes = allDescendants(result);
    const variablesButton = nodes.find((node: any) => node?.type === 'button' && node?.props?.title === 'Expand variables editor');
    const mcpButton = nodes.find((node: any) => node?.type === 'button' && node?.props?.title === 'Expand MCP editor');

    expect(variablesButton).toBeDefined();
    expect(mcpButton).toBeDefined();

    variablesButton.props.onClick();
    mcpButton.props.onClick();

    expect(onOpenWorldTextEditor).toHaveBeenNthCalledWith(1, 'variables');
    expect(onOpenWorldTextEditor).toHaveBeenNthCalledWith(2, 'mcpConfig');
  });
});
