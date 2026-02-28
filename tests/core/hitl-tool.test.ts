/**
 * HITL Request Tool Tests
 *
 * Purpose:
 * - Validate built-in `human_intervention_request` tool argument handling and HITL flow behavior.
 *
 * Key Features:
 * - Covers validation errors for missing/invalid prompt configuration.
 * - Covers option mode and timeout outcomes.
 * - Verifies option defaults are forwarded into HITL runtime selection metadata.
 *
 * Implementation Notes:
 * - Uses vitest mocks for HITL runtime calls (no real storage or network).
 * - Executes tool through definition `execute()` to verify returned JSON contract.
 *
 * Recent Changes:
 * - 2026-02-28: Added regression coverage for shorthand `defaultOption` matching and ambiguous shorthand rejection.
 * - 2026-02-27: Added schema contract coverage to ensure removed confirmation parameters stay removed.
 * - 2026-02-27: Removed deprecated confirmation field coverage and added default-option forwarding coverage.
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

  it('does not expose deprecated confirmation fields in the tool schema', () => {
    const tool = createHitlToolDefinition();
    const properties = (tool.parameters as any)?.properties || {};
    expect(properties.requireConfirmation).toBeUndefined();
    expect(properties.confirmationMessage).toBeUndefined();
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

  it('returns timeout when option response times out', async () => {
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

  it('forwards defaultOption to the mapped runtime default option id', async () => {
    mockedRequestWorldOption.mockResolvedValueOnce({
      requestId: 'req-option-3',
      worldId: 'world-1',
      chatId: 'chat-1',
      optionId: 'opt_1',
      source: 'user',
    } as any);

    const tool = createHitlToolDefinition();
    await tool.execute(
      {
        question: 'Proceed?',
        options: ['Yes', 'No'],
        defaultOption: 'No',
      },
      undefined,
      undefined,
      { world: { id: 'world-1', currentChatId: 'chat-1' } as any, chatId: 'chat-1' },
    );
    expect(mockedRequestWorldOption).toHaveBeenCalledTimes(1);
    const firstCallArgs = mockedRequestWorldOption.mock.calls[0]?.[1] as any;
    expect(firstCallArgs.defaultOptionId).toBe('opt_2');
  });

  it('maps shorthand defaultOption to a single matching option label', async () => {
    mockedRequestWorldOption.mockResolvedValueOnce({
      requestId: 'req-option-4',
      worldId: 'world-1',
      chatId: 'chat-1',
      optionId: 'opt_2',
      source: 'user',
    } as any);

    const tool = createHitlToolDefinition();
    const result = await tool.execute(
      {
        question: 'Proceed?',
        options: ['Yes, create and run the script', 'No, do not run it'],
        defaultOption: 'No',
      },
      undefined,
      undefined,
      { world: { id: 'world-1', currentChatId: 'chat-1' } as any, chatId: 'chat-1' },
    );
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(true);
    expect(parsed.status).toBe('confirmed');
    const firstCallArgs = mockedRequestWorldOption.mock.calls[0]?.[1] as any;
    expect(firstCallArgs.defaultOptionId).toBe('opt_2');
  });

  it('rejects ambiguous shorthand defaultOption labels', async () => {
    const tool = createHitlToolDefinition();
    const result = await tool.execute(
      {
        question: 'Approve?',
        options: ['Yes once', 'Yes in this session', 'No'],
        defaultOption: 'Yes',
      },
      undefined,
      undefined,
      { world: { id: 'world-1', currentChatId: 'chat-1' } as any, chatId: 'chat-1' },
    );
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.status).toBe('error');
    expect(String(parsed.message || '')).toContain('ambiguous');
    expect(mockedRequestWorldOption).not.toHaveBeenCalled();
  });
});
