/**
 * CLI HITL Helper Tests
 *
 * Purpose:
 * - Validate CLI HITL parsing and option-input resolution helpers.
 *
 * Coverage:
 * - Parsing valid/invalid pending-prompt and tool-event payloads.
 * - Mapping user input to option IDs by number and id.
 * - Fallback/invalid input behavior.
 */

import { describe, expect, it } from 'vitest';
import {
  markHitlRequestHandled,
  parseHitlPromptFromToolEvent,
  parseHitlOptionRequest,
  resolveHitlOptionSelectionInput,
} from '../../cli/hitl.js';

describe('cli/hitl', () => {
  it('parses a valid pending HITL prompt payload', () => {
    const parsed = parseHitlOptionRequest({
      chatId: 'chat-1',
      prompt: {
        requestId: 'req-1',
        title: 'Run scripts?',
        message: 'Please confirm.',
        defaultOptionId: 'yes_once',
        options: [
          { id: 'yes_once', label: 'Yes once' },
          { id: 'yes_in_session', label: 'Yes in this session' },
          { id: 'no', label: 'No' },
        ],
      },
    });

    expect(parsed).toEqual({
      requestId: 'req-1',
      title: 'Run scripts?',
      message: 'Please confirm.',
      chatId: 'chat-1',
      mode: 'option',
      defaultOptionId: 'yes_once',
      options: [
        { id: 'yes_once', label: 'Yes once', description: undefined },
        { id: 'yes_in_session', label: 'Yes in this session', description: undefined },
        { id: 'no', label: 'No', description: undefined },
      ],
    });
  });

  it('parses a valid HITL prompt from tool-progress metadata', () => {
    const parsed = parseHitlPromptFromToolEvent({
      chatId: 'chat-2',
      toolExecution: {
        metadata: {
          hitlPrompt: {
            requestId: 'req-tool-1',
            title: 'Approval required',
            message: 'Approve?',
            defaultOptionId: 'yes',
            options: [
              { id: 'yes', label: 'Yes' },
              { id: 'no', label: 'No' },
            ],
          }
        }
      }
    });

    expect(parsed?.requestId).toBe('req-tool-1');
    expect(parsed?.chatId).toBe('chat-2');
    expect(parsed?.defaultOptionId).toBe('yes');
  });

  it('returns null for non-hitl payloads', () => {
    expect(parseHitlOptionRequest({ prompt: { title: 'missing request id' } })).toBeNull();
    expect(parseHitlPromptFromToolEvent({ toolExecution: { metadata: {} } })).toBeNull();
  });

  it('resolves option by numeric selection', () => {
    const resolved = resolveHitlOptionSelectionInput(
      [
        { id: 'yes_once', label: 'Yes once' },
        { id: 'yes_in_session', label: 'Yes in this session' },
        { id: 'no', label: 'No' },
      ],
      '2',
      'no'
    );
    expect(resolved).toBe('yes_in_session');
  });

  it('resolves option by case-insensitive id', () => {
    const resolved = resolveHitlOptionSelectionInput(
      [
        { id: 'yes_once', label: 'Yes once' },
        { id: 'no', label: 'No' },
      ],
      'YES_ONCE',
      'no'
    );
    expect(resolved).toBe('yes_once');
  });

  it('uses fallback for empty input and null for invalid input', () => {
    const options = [
      { id: 'yes_once', label: 'Yes once' },
      { id: 'no', label: 'No' },
    ];
    expect(resolveHitlOptionSelectionInput(options, '', 'no')).toBe('no');
    expect(resolveHitlOptionSelectionInput(options, '999', 'no')).toBeNull();
  });

  it('marks replayed request IDs as duplicates after first handling', () => {
    const handled = new Set<string>();

    expect(markHitlRequestHandled(handled, 'req-1')).toBe(true);
    expect(markHitlRequestHandled(handled, 'req-1')).toBe(false);
    expect(markHitlRequestHandled(handled, '  req-1  ')).toBe(false);
    expect(markHitlRequestHandled(handled, 'req-2')).toBe(true);
  });

  it('rejects empty request IDs in duplicate handler helper', () => {
    const handled = new Set<string>();
    expect(markHitlRequestHandled(handled, '')).toBe(false);
    expect(markHitlRequestHandled(handled, '   ')).toBe(false);
    expect(handled.size).toBe(0);
  });
});
