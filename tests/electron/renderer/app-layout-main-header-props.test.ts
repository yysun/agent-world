/**
 * Electron Renderer Main Header Prop Builder Tests
 *
 * Purpose:
 * - Verify main-header prop wiring exposes the current editing agent only while the edit-agent panel is active.
 *
 * Key Features:
 * - `createMainHeaderProps` forwards `selectedAgentId` as `editingAgentId` during agent editing.
 * - Forwards project-editor header wiring from renderer workspace state.
 * - Non-agent panel modes clear the editing highlight input.
 *
 * Implementation Notes:
 * - Tests the pure prop-builder helper directly for deterministic coverage.
 *
 * Summary of Recent Changes:
 * - 2026-03-15: Added regression coverage for header edit-highlight prop wiring.
 */

import { describe, expect, it } from 'vitest';

import { createMainHeaderProps } from '../../../electron/renderer/src/utils/app-layout-props';

function createInput(overrides: Record<string, unknown> = {}) {
  return {
    leftSidebarCollapsed: false,
    setLeftSidebarCollapsed: () => { },
    loadedWorld: null,
    selectedSession: null,
    visibleWorldAgents: [],
    hiddenWorldAgentCount: 0,
    activeHeaderAgentIds: [],
    selectedAgentId: 'builder',
    onOpenEditAgentPanel: () => { },
    onOpenCreateAgentPanel: () => { },
    onOpenProjectViewer: () => { },
    selectedProjectPath: '/Users/test/project',
    worldViewMode: 'chat',
    worldGridLayoutChoiceId: '1+2',
    isGridLayoutSubmenuOpen: false,
    onWorldViewModeChange: () => { },
    onWorldGridLayoutChoiceChange: () => { },
    onToggleGridLayoutSubmenu: () => { },
    onOpenLogsPanel: () => { },
    onOpenSettingsPanel: () => { },
    panelMode: 'edit-agent',
    panelOpen: true,
    DRAG_REGION_STYLE: {},
    NO_DRAG_REGION_STYLE: {},
    ...overrides,
  };
}

describe('createMainHeaderProps', () => {
  it('passes the selected agent as editingAgentId while editing an agent', () => {
    const result = createMainHeaderProps(createInput());

    expect(result.editingAgentId).toBe('builder');
  });

  it('forwards the project-editor header action and selected project path', () => {
    const onOpenProjectViewer = () => { };
    const result = createMainHeaderProps(createInput({
      onOpenProjectViewer,
      selectedProjectPath: '/Users/demo/project',
    }));

    expect(result.onOpenProjectViewer).toBe(onOpenProjectViewer);
    expect(result.selectedProjectPath).toBe('/Users/demo/project');
  });

  it('clears editingAgentId outside the edit-agent panel', () => {
    const result = createMainHeaderProps(createInput({ panelMode: 'settings' }));

    expect(result.editingAgentId).toBeNull();
  });
});
