/**
 * Left Sidebar Import Panel Tests
 * Purpose:
 * - Verify the Electron left sidebar renders and drives the world import flow.
 *
 * Key Features:
 * - Confirms import mode renders the inline left-sidebar import panel.
 * - Confirms successful local import calls the world-import action and closes the import panel.
 * - Confirms non-import modes do not render the import panel.
 *
 * Implementation Notes:
 * - Uses virtual React/JSX mocks and inspects the returned element tree directly.
 * - Avoids DOM runtime dependencies for deterministic unit coverage.
 *
 * Recent Changes:
 * - 2026-03-14: Updated coverage for the full import-form layouts after removing placeholder status chips.
 * - 2026-03-14: Added coverage for world/agent/skill import targets in the redesigned import form.
 * - 2026-03-14: Added regression coverage for left-sidebar world import rendering.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { hookState, jsxFactory } = vi.hoisted(() => ({
  hookState: {
    values: [] as unknown[],
    cursor: 0,
    reset() {
      this.values = [];
      this.cursor = 0;
    },
  },
  jsxFactory: (type: unknown, props: Record<string, unknown> | null, key?: unknown) => ({
    type,
    props: props ?? {},
    key,
  }),
}));

vi.mock('react', () => ({
  default: { createElement: jsxFactory },
  useEffect: () => undefined,
  useRef: (value?: unknown) => ({ current: value ?? null }),
  useState: (initial: unknown) => {
    const index = hookState.cursor;
    hookState.cursor += 1;
    if (!(index in hookState.values)) {
      hookState.values[index] = initial;
    }

    const setValue = (next: unknown) => {
      hookState.values[index] = typeof next === 'function'
        ? (next as (value: unknown) => unknown)(hookState.values[index])
        : next;
    };

    return [hookState.values[index], setValue];
  },
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

const { worldInfoCardStub } = vi.hoisted(() => ({
  worldInfoCardStub: Symbol('WorldInfoCard'),
}));

vi.mock('../../../electron/renderer/src/components/WorldInfoCard', () => ({
  default: worldInfoCardStub,
}));

import LeftSidebarPanel from '../../../electron/renderer/src/components/LeftSidebarPanel';

function renderTree(overrides: Record<string, unknown> = {}) {
  hookState.cursor = 0;
  return LeftSidebarPanel(createProps(overrides));
}

function allDescendants(node: any): any[] {
  if (!node || typeof node !== 'object') return [];
  const children = node.props?.children;
  if (!children) return [node];
  const childArray = Array.isArray(children) ? children : [children];
  return [node, ...childArray.flatMap(allDescendants)];
}

function createProps(overrides: Record<string, unknown> = {}) {
  return {
    leftSidebarCollapsed: false,
    setLeftSidebarCollapsed: () => { },
    dragRegionStyle: {},
    noDragRegionStyle: {},
    availableWorlds: [],
    loadedWorld: null,
    panelMode: 'create-world',
    onOpenCreateWorldPanel: () => { },
    onOpenImportWorldPanel: () => { },
    onCloseImportWorldPanel: () => { },
    onImportWorld: async () => false,
    onImportAgent: async () => false,
    onImportSkill: async () => false,
    onExportWorld: () => { },
    onSelectWorld: () => { },
    loadingWorld: false,
    worldLoadError: '',
    worldInfoStats: null,
    heartbeatJob: null,
    heartbeatAction: null,
    refreshingWorldInfo: false,
    updatingWorld: false,
    deletingWorld: false,
    onRefreshWorldInfo: () => { },
    onOpenWorldEditPanel: () => { },
    onDeleteWorld: () => { },
    onStartHeartbeat: () => { },
    onStopHeartbeat: () => { },
    onCreateSession: () => { },
    sessionSearch: '',
    setSessionSearch: () => { },
    sessions: [],
    filteredSessions: [],
    selectedSessionId: null,
    onSelectSession: () => { },
    deletingSessionId: null,
    onDeleteSession: () => { },
    ...overrides,
  };
}

beforeEach(() => {
  hookState.reset();
});

describe('LeftSidebarPanel import mode', () => {
  it('replaces the normal sidebar, shows import targets, and closes after a successful local world import', async () => {
    const onImportWorld = vi.fn(async () => true);
    const onCloseImportWorldPanel = vi.fn();
    const tree: any = renderTree({
      panelMode: 'import-world',
      onImportWorld,
      onCloseImportWorldPanel,
    });

    const nodes = allDescendants(tree);
    const importPanel = nodes.find((node: any) => node?.props?.['data-testid'] === 'left-sidebar-import-panel');
    const worldTarget = nodes.find((node: any) => node?.props?.['data-testid'] === 'import-target-world');
    const agentTarget = nodes.find((node: any) => node?.props?.['data-testid'] === 'import-target-agent');
    const skillTarget = nodes.find((node: any) => node?.props?.['data-testid'] === 'import-target-skill');
    const worldPanel = nodes.find((node: any) => node?.props?.['data-testid'] === 'left-sidebar-import-world-panel');
    const localImportButton = nodes.find((node: any) => (
      node?.type === 'button' && node?.props?.children === 'Open local world folder'
    ));
    const worldSelector = nodes.find((node: any) => node?.props?.['data-testid'] === 'world-selector');
    const sessionList = nodes.find((node: any) => node?.props?.['data-testid'] === 'session-list');

    expect(importPanel).toBeDefined();
    expect(worldTarget).toBeDefined();
    expect(agentTarget).toBeDefined();
    expect(skillTarget).toBeDefined();
    expect(worldPanel).toBeDefined();
    expect(localImportButton).toBeDefined();
    expect(worldSelector).toBeUndefined();
    expect(sessionList).toBeUndefined();
    expect(JSON.stringify(importPanel || {})).toContain('Import World');
    expect(JSON.stringify(importPanel || {})).toContain('Import Agent');
    expect(JSON.stringify(importPanel || {})).toContain('Import Skill');
    expect(JSON.stringify(importPanel || {})).not.toContain('Coming soon');
    expect(JSON.stringify(importPanel || {})).not.toContain('From GitHub shorthand');

    await localImportButton.props.onClick();

    expect(onImportWorld).toHaveBeenCalledTimes(1);
    expect(onCloseImportWorldPanel).toHaveBeenCalledTimes(1);
  });

  it('submits explicit GitHub repo and world name fields for world import', async () => {
    const onImportWorld = vi.fn(async () => true);
    const onCloseImportWorldPanel = vi.fn();

    let tree: any = renderTree({
      panelMode: 'import-world',
      onImportWorld,
      onCloseImportWorldPanel,
    });
    let nodes = allDescendants(tree);
    const githubRadio = nodes.find((node: any) => node?.type === 'input' && node?.props?.name === 'left-world-import-source-type' && node?.props?.value === 'github');
    githubRadio.props.onChange();

    tree = renderTree({
      panelMode: 'import-world',
      onImportWorld,
      onCloseImportWorldPanel,
    });
    nodes = allDescendants(tree);
    const repoInput = nodes.find((node: any) => node?.type === 'input' && node?.props?.placeholder === 'owner/repo');
    const nameInput = nodes.find((node: any) => node?.type === 'input' && node?.props?.placeholder === 'infinite-etude');
    expect(repoInput?.props?.value).toBe('yysun/awesome-agent-world');
    repoInput.props.onChange({ target: { value: 'octo/worlds' } });
    nameInput.props.onChange({ target: { value: 'city-lab' } });

    tree = renderTree({
      panelMode: 'import-world',
      onImportWorld,
      onCloseImportWorldPanel,
    });
    nodes = allDescendants(tree);
    const importButton = nodes.find((node: any) => node?.type === 'button' && node?.props?.children === 'Import World');

    await importButton.props.onClick();

    expect(onImportWorld).toHaveBeenCalledWith({ repo: 'octo/worlds', itemName: 'city-lab' });
    expect(onCloseImportWorldPanel).toHaveBeenCalledTimes(1);
  });

  it('switches between world, agent, and skill import detail panels', () => {
    let tree: any = renderTree({ panelMode: 'import-world' });
    let nodes = allDescendants(tree);

    const agentTarget = nodes.find((node: any) => node?.props?.['data-testid'] === 'import-target-agent');
    expect(agentTarget).toBeDefined();

    agentTarget.props.onClick();
    tree = renderTree({ panelMode: 'import-world' });
    nodes = allDescendants(tree);

    const agentPanel = nodes.find((node: any) => node?.props?.['data-testid'] === 'left-sidebar-import-agent-panel');
    const agentImportButton = nodes.find((node: any) => node?.type === 'button' && node?.props?.children === 'Open local agent folder');
    expect(agentPanel).toBeDefined();
    expect(agentImportButton?.props?.disabled).toBe(true);
    expect(JSON.stringify(agentPanel || {})).toContain('Destination World');
    expect(JSON.stringify(agentPanel || {})).toContain('From GitHub');
    expect(JSON.stringify(agentPanel || {})).not.toContain('Coming soon');

    const skillTarget = nodes.find((node: any) => node?.props?.['data-testid'] === 'import-target-skill');
    expect(skillTarget).toBeDefined();

    skillTarget.props.onClick();
    tree = renderTree({ panelMode: 'import-world' });
    nodes = allDescendants(tree);

    const skillPanel = nodes.find((node: any) => node?.props?.['data-testid'] === 'left-sidebar-import-skill-panel');
    const skillImportButton = nodes.find((node: any) => node?.type === 'button' && node?.props?.children === 'Open local skill folder');
    expect(skillPanel).toBeDefined();
    expect(skillImportButton?.props?.disabled).toBe(false);
    expect(JSON.stringify(skillPanel || {})).toContain('Destination Scope');
    expect(JSON.stringify(skillPanel || {})).toContain('From GitHub');
    expect(JSON.stringify(skillPanel || {})).not.toContain('Coming soon');
  });

  it('calls the wired agent import handler and closes after a successful local import', async () => {
    const onImportAgent = vi.fn(async () => true);
    const onCloseImportWorldPanel = vi.fn();

    let tree: any = renderTree({ panelMode: 'import-world', loadedWorld: { id: 'world-1', name: 'World 1' }, onImportAgent, onCloseImportWorldPanel });
    let nodes = allDescendants(tree);
    const agentTarget = nodes.find((node: any) => node?.props?.['data-testid'] === 'import-target-agent');
    agentTarget.props.onClick();

    tree = renderTree({ panelMode: 'import-world', loadedWorld: { id: 'world-1', name: 'World 1' }, onImportAgent, onCloseImportWorldPanel });
    nodes = allDescendants(tree);
    const agentImportButton = nodes.find((node: any) => node?.type === 'button' && node?.props?.children === 'Open local agent folder');
    await agentImportButton.props.onClick();

    expect(onImportAgent).toHaveBeenCalledTimes(1);
    expect(onCloseImportWorldPanel).toHaveBeenCalledTimes(1);
  });

  it('calls the wired skill import handler and closes after a successful local import', async () => {
    const onImportSkill = vi.fn(async () => true);
    const onCloseImportWorldPanel = vi.fn();

    let tree: any = renderTree({ panelMode: 'import-world', onImportSkill, onCloseImportWorldPanel });
    let nodes = allDescendants(tree);
    const skillTarget = nodes.find((node: any) => node?.props?.['data-testid'] === 'import-target-skill');
    skillTarget.props.onClick();

    tree = renderTree({ panelMode: 'import-world', onImportSkill, onCloseImportWorldPanel });
    nodes = allDescendants(tree);
    const skillImportButton = nodes.find((node: any) => node?.type === 'button' && node?.props?.children === 'Open local skill folder');
    await skillImportButton.props.onClick();

    expect(onImportSkill).toHaveBeenCalledTimes(1);
    expect(onCloseImportWorldPanel).toHaveBeenCalledTimes(1);
  });

  it('does not render the import panel when import mode is not active', () => {
    const tree: any = renderTree({ panelMode: 'create-world' });

    const nodes = allDescendants(tree);
    const importPanel = nodes.find((node: any) => node?.props?.['data-testid'] === 'left-sidebar-import-panel');
    const worldSelector = nodes.find((node: any) => node?.props?.['data-testid'] === 'world-selector');

    expect(importPanel).toBeUndefined();
    expect(worldSelector).toBeDefined();
  });
});