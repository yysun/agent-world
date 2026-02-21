/**
 * HITL Request Tool Tests
 *
 * Purpose:
 * - Validate built-in `human_intervention_request` tool argument handling and HITL flow behavior.
 *
 * Key Features:
 * - Covers validation errors for missing/invalid prompt configuration.
 * - Covers option mode and confirmation-required behavior.
 * - Covers confirmation-required and timeout/cancel outcomes.
 *
 * Implementation Notes:
 * - Uses vitest mocks for HITL runtime calls (no real storage or network).
 * - Executes tool through definition `execute()` to verify returned JSON contract.
 *
 * Recent Changes:
 * - 2026-02-20: Updated coverage for strict options-only HITL policy.
 * - 2026-02-20: Added initial unit coverage for new built-in `human_intervention_request` tool.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { requestWorldOption } from '../../core/hitl.js';
import { createHitlToolDefinition } from '../../core/hitl-tool.js';

vi.mock('../../core/hitl.js', () => ({
  requestWorldOption: vi.fn(),
}));

const mockedRequestWorldOption = vi.mocked(requestWorldOption);

describe('core/hitl-tool', () => {
  beforeEach(() => {
    mockedRequestWorldOption.mockReset();
  });

  it('returns validation error when question is missing', async () => {
    const tool = createHitlToolDefinition();

    const result = await tool.execute({}, undefined, undefined, {
      world: { id: 'world-1', currentChatId: 'chat-1' } as any,
      chatId: 'chat-1',
    });
    const parsed = JSON.parse(result);

    expect(parsed.ok).toBe(false);
    expect(parsed.status).toBe('error');
    expect(parsed.message).toContain('question');
    expect(mockedRequestWorldOption).not.toHaveBeenCalled();
  });

  it('returns confirmed option response for option mode', async () => {
    mockedRequestWorldOption.mockResolvedValueOnce({
      requestId: 'req-option-1',
      worldId: 'world-1',
      chatId: 'chat-1',
      optionId: 'opt_2',
      source: 'user',
    } as any);

    const tool = createHitlToolDefinition();
    const result = await tool.execute(
      {
        question: 'Pick one',
        options: ['A', 'B'],
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
      selectedOption: 'B',
      source: 'user',
      requestId: 'req-option-1',
    });
  });

  it('returns timeout when option response times out without confirmation', async () => {
    mockedRequestWorldOption.mockResolvedValueOnce({
      requestId: 'req-option-timeout-1',
      worldId: 'world-1',
      chatId: 'chat-1',
      optionId: 'opt_1',
      source: 'timeout',
    } as any);

    const tool = createHitlToolDefinition();
    const result = await tool.execute(
      {
        question: 'Choose one',
        options: ['A', 'B'],
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
    expect(String(parsed.message || '')).toContain('at least one option');
  });

  it('returns canceled when confirmation is declined', async () => {
    mockedRequestWorldOption
      .mockResolvedValueOnce({
        requestId: 'req-option-3',
        worldId: 'world-1',
        chatId: 'chat-1',
        optionId: 'opt_1',
        source: 'user',
      } as any)
      .mockResolvedValueOnce({
        requestId: 'req-confirm-1',
        worldId: 'world-1',
        chatId: 'chat-1',
        optionId: 'cancel',
        source: 'user',
      } as any);

    const tool = createHitlToolDefinition();
    const result = await tool.execute(
      {
        question: 'Proceed?',
        options: ['Yes', 'No'],
        requireConfirmation: true,
      },
      undefined,
      undefined,
      { world: { id: 'world-1', currentChatId: 'chat-1' } as any, chatId: 'chat-1' },
    );
    const parsed = JSON.parse(result);

    expect(parsed.ok).toBe(false);
    expect(parsed.status).toBe('canceled');
    expect(parsed.selectedOption).toBe('Yes');
  });
});
