/**
 * MessageListPanel Default Collapse Policy Tests
 *
 * Purpose:
 * - Verify collapsible message cards render expanded by default.
 *
 * Recent changes:
 * - 2026-03-01: Added regression coverage for default-expanded tool/assistant message cards.
 */

import { describe, expect, it } from 'vitest';
import { getInitialMessageCollapsedState } from '../../../electron/renderer/src/components/MessageListPanel';

describe('MessageListPanel default collapse policy', () => {
  it('defaults collapsible tool rows to expanded', () => {
    const toolMessage = {
      role: 'tool',
      content: '{"status":"done"}',
    };

    expect(getInitialMessageCollapsedState(toolMessage, true)).toBe(false);
  });

  it('defaults collapsible assistant rows to expanded', () => {
    const assistantMessage = {
      role: 'assistant',
      content: 'I will write and render score',
      tool_calls: [
        {
          id: 'call_1',
          type: 'function',
          function: {
            name: 'write_file',
            arguments: '{"filePath":"./score.musicxml","content":"<xml/>"}',
          },
        },
      ],
    };

    expect(getInitialMessageCollapsedState(assistantMessage, true)).toBe(false);
  });
});
