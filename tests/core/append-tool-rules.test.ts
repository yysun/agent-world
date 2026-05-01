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
 * - 2026-05-10: Added coverage ensuring late tool-rule injection preserves precedence by inserting runtime guidance before project and skill sections.
 * - 2026-03-06: Added regression coverage for shell scope prompt gating in llm-manager.
 */

import { describe, expect, test } from 'vitest';
import { appendToolRulesToSystemMessage, prepareMessagesForRuntime } from '../../core/llm-runtime.js';
import type { AgentMessage } from '../../core/types.js';
import { composeSystemPromptFromSections } from '../../core/utils.js';

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

  test('inserts runtime tool guidance before project and skill sections when present', () => {
    const systemPromptSections = {
      authoredPrompt: 'Base system prompt',
      runtimeGuidanceSections: [
        'Only use @mentions when handing off to another agent; for normal user replies, do not mention agents.',
      ],
      projectInstructionSection: [
        '## Project Instructions',
        '<project_agents_md>',
        '# Project Rules',
        '</project_agents_md>',
      ].join('\n'),
      skillSection: ['## Agent Skills', '<available_skills>', '</available_skills>'].join('\n'),
    };
    const result = appendToolRulesToSystemMessage([
      {
        role: 'system',
        content: composeSystemPromptFromSections(systemPromptSections),
        createdAt: new Date(),
        systemPromptSections,
      },
    ], ['shell_cmd'], {
      workingDirectory: '/tmp/project',
    });

    const content = result[0]?.content ?? '';
    expect(content.indexOf('When using `shell_cmd`')).toBeGreaterThan(content.indexOf('Only use @mentions'));
    expect(content.indexOf('When using `shell_cmd`')).toBeLessThan(content.indexOf('## Project Instructions'));
    expect(content.indexOf('## Project Instructions')).toBeLessThan(content.indexOf('## Agent Skills'));
  });

  test('preserves structured prompt ordering through the runtime preparation pipeline', () => {
    const systemPromptSections = {
      authoredPrompt: 'Base system prompt',
      runtimeGuidanceSections: [
        'Only use @mentions when handing off to another agent; for normal user replies, do not mention agents.',
      ],
      projectInstructionSection: [
        '## Project Instructions',
        '<project_agents_md>',
        '# Project Rules',
        '</project_agents_md>',
      ].join('\n'),
      skillSection: ['## Agent Skills', '<available_skills>', '</available_skills>'].join('\n'),
    };

    const result = prepareMessagesForRuntime([
      {
        role: 'system',
        content: composeSystemPromptFromSections(systemPromptSections),
        createdAt: new Date(),
        systemPromptSections,
        sender: 'system',
      },
    ], ['shell_cmd'], {
      workingDirectory: '/tmp/project',
    });

    const systemMessage = result[0];
    const content = systemMessage?.content ?? '';

    expect(content.indexOf('When using `shell_cmd`')).toBeGreaterThan(content.indexOf('Only use @mentions'));
    expect(content.indexOf('When using `shell_cmd`')).toBeLessThan(content.indexOf('## Project Instructions'));
    expect(content.indexOf('## Project Instructions')).toBeLessThan(content.indexOf('## Agent Skills'));
    expect('systemPromptSections' in (systemMessage ?? {})).toBe(false);
    expect('sender' in (systemMessage ?? {})).toBe(false);
  });
});