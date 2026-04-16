/**
 * appendToolRulesToSystemMessage Tests
 *
 * Purpose:
 * - Verify tool-aware system-message injection in llm-manager.
 *
 * Features tested:
 * - Injects shell working-directory scope only when `shell_cmd` is available.
 * - Omits shell scope text when `shell_cmd` is unavailable.
 * - Omits shell scope text when no working directory option is provided.
 *
 * Notes on Implementation:
 * - Uses a minimal system-message fixture and exercises the exported helper directly.
 * - Focuses on injected prompt content, not provider execution.
 *
 * Recent Changes:
 * - 2026-03-06: Added regression coverage for shell scope prompt gating in llm-manager.
 */

import { describe, expect, test } from 'vitest';
import { appendToolRulesToSystemMessage } from '../../core/llm-runtime.js';
import type { AgentMessage } from '../../core/types.js';

function createSystemMessages(): AgentMessage[] {
  return [
    {
      role: 'system',
      content: 'Base system prompt',
      createdAt: new Date(),
    },
  ];
}

describe('appendToolRulesToSystemMessage', () => {
  test('injects shell scope rule when shell_cmd is available and working directory is provided', () => {
    const result = appendToolRulesToSystemMessage(createSystemMessages(), ['shell_cmd'], {
      workingDirectory: '/tmp/agent-world',
    });

    expect(result[0]?.content).toContain('When using `shell_cmd`, execute commands only within this trusted working directory scope: /tmp/agent-world');
    expect(result[0]?.content).toContain('You have access to tools.');
  });

  test('omits shell scope rule when shell_cmd is not available', () => {
    const result = appendToolRulesToSystemMessage(createSystemMessages(), ['grep'], {
      workingDirectory: '/tmp/agent-world',
    });

    expect(result[0]?.content).not.toContain('working directory scope');
    expect(result[0]?.content).toContain('For grep');
  });

  test('omits shell scope rule when working directory is missing', () => {
    const result = appendToolRulesToSystemMessage(createSystemMessages(), ['shell_cmd']);

    expect(result[0]?.content).not.toContain('working directory scope');
    expect(result[0]?.content).toContain('You have access to tools.');
  });
});