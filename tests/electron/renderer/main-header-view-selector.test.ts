/**
 * Electron Renderer Main Header View Selector Tests
 *
 * Purpose:
 * - Verify the world view selector is rendered in the header controls and positioned
 *   before Logs and Settings actions.
 *
 * Key Features:
 * - Confirms presence of world-view icon button controls.
 * - Confirms Grid mode reveals grid-layout submenu under the Grid icon.
 * - Confirms selector group is ordered before log/settings action buttons.
 *
 * Implementation Notes:
 * - Uses JSX-runtime virtual mocks and inspects rendered element props directly.
 * - Avoids browser DOM dependencies to keep tests deterministic.
 *
 * Summary of Recent Changes:
 * - 2026-03-04: Updated coverage to reflect SVG icon button selector and grid-layout submenu options.
 */

import { describe, expect, it, vi } from 'vitest';

const jsxFactory = (type: unknown, props: Record<string, unknown> | null, key?: unknown) => ({
  type,
  props: props ?? {},
  key,
});

vi.mock('react', () => ({
  default: { createElement: jsxFactory },
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

import MainHeaderBar from '../../../electron/renderer/src/components/MainHeaderBar';

function collectElementIdsByType(node: any, typeName: string): string[] {
  if (!node || typeof node !== 'object') {
    return [];
  }

  const ids: string[] = [];
  if (node.type === typeName && typeof node?.props?.id === 'string') {
    ids.push(node.props.id);
  }

  const children = node?.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      ids.push(...collectElementIdsByType(child, typeName));
    }
  } else if (children) {
    ids.push(...collectElementIdsByType(children, typeName));
  }

  return ids;
}

function collectButtonIds(node: any): string[] {
  return collectElementIdsByType(node, 'button');
}

function findElementById(node: any, typeName: string, targetId: string): any {
  if (!node || typeof node !== 'object') {
    return null;
  }

  if (node.type === typeName && node?.props?.id === targetId) {
    return node;
  }

  const children = node?.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findElementById(child, typeName, targetId);
      if (found) {
        return found;
      }
    }
    return null;
  }

  return children ? findElementById(children, typeName, targetId) : null;
}

function createProps(overrides: Record<string, unknown> = {}) {
  return {
    leftSidebarCollapsed: false,
    setLeftSidebarCollapsed: () => { },
    selectedWorld: { name: 'World A', mainAgent: 'planner' },
    selectedSession: { name: 'Session A' },
    visibleWorldAgents: [],
    hiddenWorldAgentCount: 0,
    activeHeaderAgentIds: [],
    onOpenEditAgentPanel: () => { },
    onOpenCreateAgentPanel: () => { },
    onOpenSettingsPanel: () => { },
    onOpenLogsPanel: () => { },
    worldViewMode: 'chat',
    worldGridLayoutChoiceId: '1+2',
    isGridLayoutSubmenuOpen: false,
    onWorldViewModeChange: () => { },
    onWorldGridLayoutChoiceChange: () => { },
    onToggleGridLayoutSubmenu: () => { },
    panelMode: 'logs',
    panelOpen: true,
    dragRegionStyle: {},
    noDragRegionStyle: {},
    ...overrides,
  };
}

describe('MainHeaderBar world view selector', () => {
  it('renders world view icon buttons before Logs and Settings buttons', () => {
    const tree = MainHeaderBar(createProps()) as {
      props?: { children?: Array<{ props?: { children?: Array<any> } }> };
    };

    const topLevelChildren = tree.props?.children ?? [];
    const rightControls = topLevelChildren[2];
    const rightControlsChildren = rightControls?.props?.children ?? [];
    const selectorButtonIds = collectButtonIds(rightControlsChildren[0]);

    expect(rightControlsChildren[0]?.type).toBe('div');
    expect(selectorButtonIds).toContain('world-view-chat-btn');
    expect(selectorButtonIds).toContain('world-view-board-btn');
    expect(selectorButtonIds).toContain('world-view-grid-btn');
    expect(selectorButtonIds).toContain('world-view-canvas-btn');
    expect(rightControlsChildren[1]?.props?.title).toBe('Logs');
    expect(rightControlsChildren[2]?.props?.title).toBe('Settings');
  });

  it('shows grid layout submenu when Grid View is selected and submenu is open', () => {
    const tree = MainHeaderBar(createProps({ worldViewMode: 'grid', isGridLayoutSubmenuOpen: true })) as {
      props?: { children?: Array<{ props?: { children?: Array<any> } }> };
    };

    const topLevelChildren = tree.props?.children ?? [];
    const rightControls = topLevelChildren[2];
    const selectorGroup = rightControls?.props?.children?.[0];
    const buttonIds = collectButtonIds(selectorGroup);
    const submenu = findElementById(selectorGroup, 'div', 'grid-layout-submenu');

    expect(buttonIds).toContain('world-view-grid-btn');
    expect(submenu?.props?.role).toBe('menu');
  });

  it('renders expected grid submenu options', () => {
    const tree = MainHeaderBar(createProps({ worldViewMode: 'grid', isGridLayoutSubmenuOpen: true, worldGridLayoutChoiceId: '2+1' })) as {
      props?: { children?: Array<{ props?: { children?: Array<any> } }> };
    };

    const topLevelChildren = tree.props?.children ?? [];
    const rightControls = topLevelChildren[2];
    const selectorGroup = rightControls?.props?.children?.[0];
    const optionOne = findElementById(selectorGroup, 'button', 'grid-layout-option-1-2');
    const optionTwo = findElementById(selectorGroup, 'button', 'grid-layout-option-2-1');
    const optionThree = findElementById(selectorGroup, 'button', 'grid-layout-option-2-2');

    expect(optionOne?.props?.role).toBe('menuitemradio');
    expect(optionTwo?.props?.role).toBe('menuitemradio');
    expect(optionThree?.props?.role).toBe('menuitemradio');
    expect(optionOne?.props?.['aria-checked']).toBe(false);
    expect(optionTwo?.props?.['aria-checked']).toBe(true);
    expect(optionThree?.props?.['aria-checked']).toBe(false);
  });

  it('dismisses submenu when selecting a grid option', () => {
    const onWorldGridLayoutChoiceChange = vi.fn();
    const onToggleGridLayoutSubmenu = vi.fn();
    const tree = MainHeaderBar(createProps({
      worldViewMode: 'grid',
      isGridLayoutSubmenuOpen: true,
      worldGridLayoutChoiceId: '1+2',
      onWorldGridLayoutChoiceChange,
      onToggleGridLayoutSubmenu,
    })) as {
      props?: { children?: Array<{ props?: { children?: Array<any> } }> };
    };

    const topLevelChildren = tree.props?.children ?? [];
    const rightControls = topLevelChildren[2];
    const selectorGroup = rightControls?.props?.children?.[0];
    const option = findElementById(selectorGroup, 'button', 'grid-layout-option-2-1');

    option?.props?.onClick?.();

    expect(onWorldGridLayoutChoiceChange).toHaveBeenCalledWith('2+1');
    expect(onToggleGridLayoutSubmenu).toHaveBeenCalledWith(false);
  });
});
