/**
 * RightPanelContent Settings Tests
 * Purpose:
 * - Verify the settings panel exposes the Project Skills install entry point.
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

vi.mock('../../../electron/renderer/src/components/AgentFormFields', () => ({
  default: Symbol('AgentFormFields'),
}));

vi.mock('../../../electron/renderer/src/components/SettingsSwitch', () => ({
  default: Symbol('SettingsSwitch'),
}));

vi.mock('../../../electron/renderer/src/components/SettingsSkillSwitch', () => ({
  default: Symbol('SettingsSkillSwitch'),
}));

import RightPanelContent from '../../../electron/renderer/src/components/RightPanelContent';

function allDescendants(node: any): any[] {
  if (!node || typeof node !== 'object') return [];
  const children = node.props?.children;
  if (!children) return [node];
  const childArr = Array.isArray(children) ? children : [children];
  return [node, ...childArr.flatMap(allDescendants)];
}

describe('RightPanelContent', () => {
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
      onInstallSkill,
    });

    const nodes = allDescendants(result);
    const installButton = nodes.find((node: any) => node?.type === 'button' && node?.props?.onClick === onInstallSkill);
    const renderedTree = JSON.stringify(result);

    expect(installButton).toBeDefined();
    expect(JSON.stringify(installButton)).toContain('Install Skill ...');
    expect(String(installButton.props.className || '')).toContain('cursor-pointer');
    expect(renderedTree.indexOf('No project skills discovered.')).toBeLessThan(renderedTree.indexOf('Install Skill ...'));

    installButton.props.onClick();
    expect(onInstallSkill).toHaveBeenCalledTimes(1);
  });
});