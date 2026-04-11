/**
 * Electron Renderer Feature Entry Point Tests
 *
 * Purpose:
 * - Verify business-specific renderer UI is exposed through feature-scoped entry points.
 *
 * Key Features:
 * - Confirms chat, queue, skills, and settings barrels expose their feature-owned UI.
 * - Confirms the app-shell barrel exposes app-owned composition surfaces.
 * - Confirms the design-system root remains free of feature-owned exports.
 * - Confirms the narrowed business-components barrel no longer re-exports migrated feature or shell UI.
 *
 * Implementation Notes:
 * - Asserts module-boundary behavior rather than rendering UI.
 * - Keeps the incremental migration safe while feature folders expand.
 *
 * Summary of Recent Changes:
 * - 2026-03-23: Added focused regression coverage for the new feature-scoped renderer entry points.
 */

import { describe, expect, it } from 'vitest';

import * as shell from '../../../electron/renderer/src/app/shell';
import * as agents from '../../../electron/renderer/src/features/agents';
import * as chat from '../../../electron/renderer/src/features/chat';
import * as queue from '../../../electron/renderer/src/features/queue';
import * as settings from '../../../electron/renderer/src/features/settings';
import * as skills from '../../../electron/renderer/src/features/skills';
import * as worlds from '../../../electron/renderer/src/features/worlds';
import * as components from '../../../electron/renderer/src/components';
import * as designSystem from '../../../electron/renderer/src/design-system';

describe('renderer feature entry points', () => {
  it('exposes migrated business UI through dedicated feature barrels', () => {
    expect(typeof agents.AgentPromptEditor).toBe('function');
    expect(typeof chat.ComposerBar).toBe('function');
    expect(typeof chat.EditorChatPane).toBe('function');
    expect(typeof chat.MessageListPanel).toBe('function');
    expect(typeof chat.MessageContent).toBe('function');
    expect(typeof queue.MessageQueuePanel).toBe('function');
    expect(typeof skills.SkillEditor).toBe('function');
    expect(typeof skills.SkillFolderPane).toBe('function');
    expect(typeof skills.SkillInstallBrowser).toBe('function');
    expect(typeof settings.SettingsSwitch).toBe('function');
    expect(typeof settings.SettingsSkillSwitch).toBe('function');
    expect(typeof worlds.WorldTextEditor).toBe('function');
  });

  it('exposes app-owned shell composition through the app-shell barrel', () => {
    expect(typeof shell.LeftSidebarPanel).toBe('function');
    expect(typeof shell.MainContentArea).toBe('function');
    expect(typeof shell.MainHeaderBar).toBe('function');
    expect(typeof shell.MainWorkspaceLayout).toBe('function');
    expect(typeof shell.RightPanelShell).toBe('function');
    expect(typeof shell.SidebarToggleButton).toBe('function');
  });

  it('keeps the design-system root free of feature-owned exports', () => {
    expect((designSystem as Record<string, unknown>).ComposerBar).toBeUndefined();
    expect((designSystem as Record<string, unknown>).SkillEditor).toBeUndefined();
    expect((designSystem as Record<string, unknown>).SettingsSwitch).toBeUndefined();
    expect((designSystem as Record<string, unknown>).MessageQueuePanel).toBeUndefined();
    expect((designSystem as Record<string, unknown>).MainWorkspaceLayout).toBeUndefined();
  });

  it('keeps migrated feature and shell UI out of the narrowed components barrel', () => {
    expect((components as Record<string, unknown>).ComposerBar).toBeUndefined();
    expect((components as Record<string, unknown>).EditorChatPane).toBeUndefined();
    expect((components as Record<string, unknown>).MessageContent).toBeUndefined();
    expect((components as Record<string, unknown>).MessageListPanel).toBeUndefined();
    expect((components as Record<string, unknown>).SkillEditor).toBeUndefined();
    expect((components as Record<string, unknown>).SkillFolderPane).toBeUndefined();
    expect((components as Record<string, unknown>).SkillInstallBrowser).toBeUndefined();
    expect((components as Record<string, unknown>).SettingsSkillSwitch).toBeUndefined();
    expect((components as Record<string, unknown>).MessageQueuePanel).toBeUndefined();
    expect((components as Record<string, unknown>).MainContentArea).toBeUndefined();
    expect((components as Record<string, unknown>).MainHeaderBar).toBeUndefined();
    expect((components as Record<string, unknown>).MainWorkspaceLayout).toBeUndefined();
    expect((components as Record<string, unknown>).RightPanelShell).toBeUndefined();
    expect((components as Record<string, unknown>).AppOverlaysHost).toBeUndefined();
  });
});