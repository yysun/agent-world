/**
 * Electron Renderer Main Header Agent Highlight Tests
 *
 * Purpose:
 * - Verify header agent avatars expose distinct visual treatment and labels for main-agent and editing-agent states.
 *
 * Key Features:
 * - Editing an agent applies a blue highlight and accessible editing label.
 * - Main-agent highlight remains available for non-editing agents.
 * - Editing highlight takes precedence over the main-agent amber tone while preserving main-agent labeling.
 *
 * Implementation Notes:
 * - Tests the pure header badge helpers directly for deterministic coverage.
 *
 * Summary of Recent Changes:
 * - 2026-03-15: Added regression coverage for edit-state highlighting in the Electron header agent strip.
 */

import { describe, expect, it } from 'vitest';

import {
  getAgentBadgeAriaLabel,
  getAgentBadgeClassName,
  getAgentBadgeTitle,
} from '../../../electron/renderer/src/app/shell/components/MainHeaderBar';

describe('MainHeaderBar agent highlights', () => {
  it('uses a distinct editing tone and editing labels for the agent being edited', () => {
    const className = getAgentBadgeClassName({
      isEditingAgent: true,
      isMainAgent: false,
      isActiveStreamingAgent: false,
    });
    const title = getAgentBadgeTitle({
      agentName: 'Builder',
      messageCount: 1,
      isEditingAgent: true,
      isMainAgent: false,
      isActiveStreamingAgent: false,
    });
    const ariaLabel = getAgentBadgeAriaLabel({
      agentName: 'Builder',
      isEditingAgent: true,
      isMainAgent: false,
      isActiveStreamingAgent: false,
    });

    expect(className).toContain('bg-sky-200');
    expect(className).toContain('ring-sky-400');
    expect(className).not.toContain('bg-amber-200');
    expect(title).toBe('Builder • 1 message • Editing');
    expect(ariaLabel).toBe('Edit agent Builder (editing)');
  });

  it('keeps main-agent labeling while giving an edited main agent the editing tone', () => {
    const className = getAgentBadgeClassName({
      isEditingAgent: true,
      isMainAgent: true,
      isActiveStreamingAgent: false,
    });
    const title = getAgentBadgeTitle({
      agentName: 'Planner',
      messageCount: 3,
      isEditingAgent: true,
      isMainAgent: true,
      isActiveStreamingAgent: false,
    });
    const ariaLabel = getAgentBadgeAriaLabel({
      agentName: 'Planner',
      isEditingAgent: true,
      isMainAgent: true,
      isActiveStreamingAgent: false,
    });

    expect(className).toContain('bg-sky-200');
    expect(className).not.toContain('bg-amber-200');
    expect(title).toBe('Planner • 3 messages • Main agent • Editing');
    expect(ariaLabel).toBe('Edit agent Planner (main agent) (editing)');
  });
});
