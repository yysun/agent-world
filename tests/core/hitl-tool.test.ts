/**
 * HITL Request Tool Tests
 *
 * Purpose:
 * - Validate built-in `ask_user_input` tool argument handling and HITL flow behavior.
 *
 * Key Features:
 * - Covers validation errors for missing/invalid prompt configuration.
 * - Covers structured question execution and timeout outcomes.
 * - Verifies legacy flat arguments are normalized for compatibility.
 *
 * Implementation Notes:
 * - Uses vitest mocks for HITL runtime calls (no real storage or network).
 * - Executes tool through definition `execute()` to verify returned JSON contract.
 *
 * Recent Changes:
 * - 2026-04-24: Migrated coverage to structured `ask_user_input` questions and legacy flat-argument normalization.
 * - 2026-02-20: Updated coverage for strict options-only HITL policy.
 * - 2026-02-20: Added initial unit coverage for new built-in `human_intervention_request` tool.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { requestWorldInput } from '../../core/hitl.js';
import { createHitlToolDefinition } from '../../core/hitl-tool.js';

vi.mock('../../core/hitl.js', () => ({
  requestWorldInput: vi.fn(),
}));

const mockedRequestWorldInput = vi.mocked(requestWorldInput);

describe('core/hitl-tool', () => {
  beforeEach(() => {
    mockedRequestWorldInput.mockReset();
  });

  it('does not expose deprecated confirmation fields in the tool schema', () => {
    const tool = createHitlToolDefinition();
    const properties = (tool.parameters as any)?.properties || {};
    expect(properties.requireConfirmation).toBeUndefined();
    expect(properties.confirmationMessage).toBeUndefined();
  });

  it('returns validation error when questions are missing', async () => {
    const tool = createHitlToolDefinition();

    const result = await tool.execute({}, undefined, undefined, {
      world: { id: 'world-1', currentChatId: 'chat-1' } as any,
      chatId: 'chat-1',
    });
    const parsed = JSON.parse(result);

    expect(parsed.ok).toBe(false);
    expect(parsed.status).toBe('error');
    expect(parsed.message).toContain('question');
    expect(mockedRequestWorldInput).not.toHaveBeenCalled();
  });

  it('returns confirmed response for structured questions', async () => {
    mockedRequestWorldInput.mockResolvedValueOnce({
      requestId: 'req-option-1',
      worldId: 'world-1',
      chatId: 'chat-1',
      answers: [{ questionId: 'question-1', optionIds: ['opt_2'] }],
      optionId: 'opt_2',
      skipped: false,
      source: 'user',
    } as any);

    const tool = createHitlToolDefinition();
    const result = await tool.execute(
      {
        type: 'single-select',
        questions: [{
          id: 'question-1',
          header: 'Pick one',
          question: 'Pick one',
          options: [
            { id: 'opt_1', label: 'A' },
            { id: 'opt_2', label: 'B' },
          ],
        }],
      },
      undefined,
      undefined,
      { world: { id: 'world-1', currentChatId: 'chat-1' } as any, chatId: 'chat-1' },
    );
    const parsed = JSON.parse(result);

    expect(parsed).toMatchObject({
      ok: true,
      status: 'confirmed',
      confirmed: true,
      skipped: false,
      answers: [{ questionId: 'question-1', optionIds: ['opt_2'] }],
      selectedOption: 'B',
      source: 'user',
      requestId: 'req-option-1',
    });
  });

  it('returns timeout when option response times out', async () => {
    mockedRequestWorldInput.mockResolvedValueOnce({
      requestId: 'req-option-timeout-1',
      worldId: 'world-1',
      chatId: 'chat-1',
      answers: [{ questionId: 'question-1', optionIds: ['opt_1'] }],
      optionId: 'opt_1',
      skipped: false,
      source: 'timeout',
    } as any);

    const tool = createHitlToolDefinition();
    const result = await tool.execute(
      {
        questions: [{
          id: 'question-1',
          header: 'Choose one',
          question: 'Choose one',
          options: [
            { id: 'opt_1', label: 'A' },
            { id: 'opt_2', label: 'B' },
          ],
        }],
      },
      undefined,
      undefined,
      { world: { id: 'world-1', currentChatId: 'chat-1' } as any, chatId: 'chat-1' },
    );
    const parsed = JSON.parse(result);

    expect(parsed.ok).toBe(false);
    expect(parsed.status).toBe('timeout');
    expect(parsed.selectedOption).toBe('A');
  });

  it('rejects requests that omit options', async () => {
    const tool = createHitlToolDefinition();
    const result = await tool.execute(
      {
        question: 'Select or type',
      },
      undefined,
      undefined,
      { world: { id: 'world-1', currentChatId: 'chat-1' } as any, chatId: 'chat-1' },
    );
    const parsed = JSON.parse(result);

    expect(parsed.ok).toBe(false);
    expect(parsed.status).toBe('error');
    expect(String(parsed.message || '')).toContain('at least one valid question');
  });

  it('normalizes legacy flat question/options arguments for compatibility', async () => {
    mockedRequestWorldInput.mockResolvedValueOnce({
      requestId: 'req-option-3',
      worldId: 'world-1',
      chatId: 'chat-1',
      answers: [{ questionId: 'question-1', optionIds: ['opt_1'] }],
      optionId: 'opt_1',
      skipped: false,
      source: 'user',
    } as any);

    const tool = createHitlToolDefinition();
    await tool.execute(
      {
        question: 'Proceed?',
        options: ['Yes', 'No'],
      },
      undefined,
      undefined,
      { world: { id: 'world-1', currentChatId: 'chat-1' } as any, chatId: 'chat-1' },
    );
    expect(mockedRequestWorldInput).toHaveBeenCalledTimes(1);
    const firstCallArgs = mockedRequestWorldInput.mock.calls[0]?.[1] as any;
    expect(firstCallArgs).toMatchObject({
      type: 'single-select',
      allowSkip: false,
      questions: [{
        id: 'question-1',
        header: 'Human input required',
        question: 'Proceed?',
        options: [
          { id: 'opt_1', label: 'Yes' },
          { id: 'opt_2', label: 'No' },
        ],
      }],
    });
  });
});
