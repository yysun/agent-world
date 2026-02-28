/**
 * Electron Renderer Message Content Status Label Tests
 *
 * Purpose:
 * - Verify tool status label formatting and tool-name resolution behavior.
 *
 * Key Features:
 * - Enforces `tool: <name> - <status>` label format.
 * - Verifies resolved-name override support for history rows missing direct tool metadata.
 * - Verifies fallback to `toolExecution.toolName` metadata.
 *
 * Implementation Notes:
 * - Tests pure helper output only; no DOM rendering is required.
 * - Uses deterministic in-memory message fixtures.
 *
 * Summary of Recent Changes:
 * - 2026-02-28: Added regression coverage for tool-body rendering with linked assistant request metadata (`Args` + `Result`).
 * - 2026-02-28: Added regression coverage for tool-name-inclusive status labels.
 */

import { describe, expect, it } from 'vitest';
import { getToolBodyContent, getToolStatusLabel } from '../../../electron/renderer/src/components/MessageContent';

describe('message content tool status label', () => {
  it('formats label as tool-name-status when direct tool name exists', () => {
    const label = getToolStatusLabel({
      role: 'tool',
      toolName: 'shell_cmd',
      content: '{"ok":true}',
    });

    expect(label).toBe('tool: shell_cmd - done');
  });

  it('uses resolved tool-name override for history tool rows', () => {
    const label = getToolStatusLabel({
      role: 'tool',
      content: '{"ok":true}',
    }, false, 'human_intervention_request');

    expect(label).toBe('tool: human_intervention_request - done');
  });

  it('falls back to toolExecution toolName metadata when present', () => {
    const label = getToolStatusLabel({
      role: 'tool',
      toolExecution: { toolName: 'read_file' },
      content: '{"ok":true}',
    });

    expect(label).toBe('tool: read_file - done');
  });

  it('renders Args and Result when tool row is linked to assistant tool request metadata', () => {
    const content = getToolBodyContent({
      role: 'tool',
      tool_call_id: 'call_shell_1',
      content: 'status: failed\nexit_code: 1\nreason: non_zero_exit',
      linkedToolRequest: {
        role: 'assistant',
        tool_calls: [{
          id: 'call_shell_1',
          type: 'function',
          function: {
            name: 'shell_cmd',
            arguments: '{"command":"ls -la","directory":"./"}'
          }
        }]
      }
    });

    expect(content).toContain('Args:');
    expect(content).toContain('shell_cmd');
    expect(content).toContain('"command":"ls -la"');
    expect(content).toContain('Result:');
    expect(content).toContain('status: failed');
  });
});
