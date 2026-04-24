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

import { describe, expect, it, vi } from 'vitest';
import {
  markHitlRequestHandled,
  parseHitlPromptFromToolEvent,
  parseHitlOptionRequest,
  resolveHitlPromptSelectionInput,
  resolveHitlOptionSelectionInput,
  submitCliHitlSelection,
} from '../../cli/hitl.js';

describe('cli/hitl', () => {
  it('parses a valid structured pending HITL prompt payload', () => {
    const parsed = parseHitlOptionRequest({
      chatId: 'chat-1',
      prompt: {
        requestId: 'req-1',
        type: 'single-select',
        questions: [{
          id: 'question-1',
          header: 'Run scripts?',
          question: 'Please confirm.',
          options: [
            { id: 'yes_once', label: 'Yes once' },
            { id: 'yes_in_session', label: 'Yes in this session' },
            { id: 'no', label: 'No' },
          ],
        }],
      },
    });

    expect(parsed).toEqual({
      requestId: 'req-1',
      title: 'Run scripts?',
      message: 'Please confirm.',
      chatId: 'chat-1',
      mode: 'option',
      allowSkip: false,
      defaultOptionId: 'no',
      options: [
        { id: 'yes_once', label: 'Yes once', description: undefined },
        { id: 'yes_in_session', label: 'Yes in this session', description: undefined },
        { id: 'no', label: 'No', description: undefined },
      ],
    });
  });

  it('parses a valid structured HITL prompt from tool-progress metadata', () => {
    const parsed = parseHitlPromptFromToolEvent({
      chatId: 'chat-2',
      toolExecution: {
        metadata: {
          hitlPrompt: {
            requestId: 'req-tool-1',
            type: 'single-select',
            questions: [{
              id: 'question-1',
              header: 'Approval required',
              question: 'Approve?',
              options: [
                { id: 'yes', label: 'Yes' },
                { id: 'no', label: 'No' },
              ],
            }],
          }
        }
      }
    });

    expect(parsed?.requestId).toBe('req-tool-1');
    expect(parsed?.chatId).toBe('chat-2');
    expect(parsed?.allowSkip).toBe(false);
    expect(parsed?.defaultOptionId).toBe('no');
  });

  it('parses allowSkip from a structured pending HITL prompt payload', () => {
    const parsed = parseHitlOptionRequest({
      chatId: 'chat-skip',
      prompt: {
        requestId: 'req-skip',
        type: 'single-select',
        allowSkip: true,
        questions: [{
          id: 'question-1',
          header: 'Optional follow-up',
          question: 'Skip if you do not want to answer now.',
          options: [
            { id: 'yes', label: 'Yes' },
            { id: 'no', label: 'No' },
          ],
        }],
      },
    });

    expect(parsed?.allowSkip).toBe(true);
    expect(parsed?.defaultOptionId).toBe('no');
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

  it('resolves skip input only when the prompt allows skipping', () => {
    const options = [
      { id: 'yes_once', label: 'Yes once' },
      { id: 'no', label: 'No' },
    ];

    expect(resolveHitlPromptSelectionInput(options, 'skip', 'no', true)).toEqual({ kind: 'skip' });
    expect(resolveHitlPromptSelectionInput(options, 'S', 'no', true)).toEqual({ kind: 'skip' });
    expect(resolveHitlPromptSelectionInput(options, 'skip', 'no', false)).toBeNull();
    expect(resolveHitlPromptSelectionInput(options, '', 'no', true)).toEqual({ kind: 'option', optionId: 'no' });
  });

  it('submits an interactive skip response with skipped=true', () => {
    const submitResponse = vi.fn(() => ({ accepted: true }));

    const result = submitCliHitlSelection(submitResponse, {
      worldId: 'world-1',
      request: {
        requestId: 'req-skip',
        title: 'Optional step',
        message: 'You may skip this prompt.',
        chatId: 'chat-1',
        mode: 'option',
        allowSkip: true,
        options: [
          { id: 'yes', label: 'Yes' },
          { id: 'no', label: 'No' },
        ],
        defaultOptionId: 'no',
      },
      selection: { kind: 'skip' },
    });

    expect(submitResponse).toHaveBeenCalledWith({
      worldId: 'world-1',
      requestId: 'req-skip',
      skipped: true,
      chatId: 'chat-1',
    });
    expect(result).toMatchObject({
      accepted: true,
      successMessage: 'Submitted HITL skip response.',
    });
  });

  it('submits an interactive option response with optionId', () => {
    const submitResponse = vi.fn(() => ({ accepted: true }));

    const result = submitCliHitlSelection(submitResponse, {
      worldId: 'world-1',
      request: {
        requestId: 'req-option',
        title: 'Approval required',
        message: 'Choose an option.',
        chatId: 'chat-1',
        mode: 'option',
        allowSkip: false,
        options: [
          { id: 'yes_once', label: 'Yes once' },
          { id: 'no', label: 'No' },
        ],
        defaultOptionId: 'no',
      },
      selection: { kind: 'option', optionId: 'yes_once' },
    });

    expect(submitResponse).toHaveBeenCalledWith({
      worldId: 'world-1',
      requestId: 'req-option',
      optionId: 'yes_once',
      chatId: 'chat-1',
    });
    expect(result).toMatchObject({
      accepted: true,
      successMessage: 'Submitted HITL option response.',
    });
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
