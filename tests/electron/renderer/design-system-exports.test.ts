/**
 * Electron Renderer Design-System Export Surface Tests
 *
 * Purpose:
 * - Verify the design-system public surface exposes only approved generic modules.
 *
 * Key Features:
 * - Locks the root export list to the approved atomic primitive and pattern set.
 * - Guards against accidental business-specific exports.
 *
 * Implementation Notes:
 * - Imports the design-system root barrel directly.
 * - Avoids rendering concerns and checks module shape only.
 *
 * Recent Changes:
 * - 2026-03-23: Added field-control primitives and the reusable text-editor dialog pattern.
 * - 2026-03-23: Replaced the transitional widget export expectations with the corrected atomic primitive surface.
 */

import { describe, expect, it } from 'vitest';
import * as designSystem from '../../../electron/renderer/src/design-system';

describe('electron renderer design-system exports', () => {
  it('exposes only the approved primitive and pattern modules', () => {
    expect(Object.keys(designSystem).sort()).toEqual([
      'AppFrameLayout',
      'BaseEditor',
      'Button',
      'Card',
      'Checkbox',
      'IconButton',
      'Input',
      'LabeledField',
      'MenuItem',
      'PanelActionBar',
      'Radio',
      'Select',
      'Switch',
      'TextEditorDialog',
      'Textarea',
    ]);
  });

  it('does not expose business-specific renderer components', () => {
    expect('ActivityPulse' in designSystem).toBe(false);
    expect('MainHeaderBar' in designSystem).toBe(false);
    expect('MessageListPanel' in designSystem).toBe(false);
    expect('RightPanelContent' in designSystem).toBe(false);
    expect('SettingsSwitch' in designSystem).toBe(false);
    expect('SidebarToggleButton' in designSystem).toBe(false);
    expect('SkillEditor' in designSystem).toBe(false);
    expect('ThinkingIndicator' in designSystem).toBe(false);
  });
});