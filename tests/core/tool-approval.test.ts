/**
 * Tool Approval Helper Tests
 *
 * Features:
 * - Verifies approved option mapping to standardized result
 * - Verifies denied and timeout results map to deterministic reasons
 *
 * Implementation Notes:
 * - Mocks requestWorldOption to keep tests deterministic and offline
 *
 * Recent Changes:
 * - 2026-03-12: Added durable synthetic approval prompt/resolution persistence coverage with distinct owning toolCallId.
 * - 2026-02-28: Added initial coverage for shared tool approval helper.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRequestWorldOption = vi.hoisted(() => vi.fn());

vi.mock('../../core/hitl.js', () => ({
  requestWorldOption: mockRequestWorldOption,
}));

import { requestToolApproval } from '../../core/tool-approval.js';

describe('tool approval helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns approved when option is in approvedOptionIds', async () => {
    mockRequestWorldOption.mockResolvedValueOnce({
      requestId: 'req-1',
      worldId: 'world-1',
      chatId: 'chat-1',
      optionId: 'yes',
      source: 'user',
    });

    const result = await requestToolApproval({
      world: { id: 'world-1' } as any,
      chatId: 'chat-1',
      title: 'Approve?',
      message: 'Please approve.',
      options: [
        { id: 'yes', label: 'Yes' },
        { id: 'no', label: 'No' },
      ],
      defaultOptionId: 'no',
      approvedOptionIds: ['yes'],
      metadata: { tool: 'test_tool' },
    });

    expect(result).toEqual({
      approved: true,
      reason: 'approved',
      optionId: 'yes',
      source: 'user',
    });
  });

  it('returns timeout reason when resolution source is timeout', async () => {
    mockRequestWorldOption.mockResolvedValueOnce({
      requestId: 'req-2',
      worldId: 'world-1',
      chatId: 'chat-1',
      optionId: 'no',
      source: 'timeout',
    });

    const result = await requestToolApproval({
      world: { id: 'world-1' } as any,
      chatId: 'chat-1',
      title: 'Approve?',
      message: 'Please approve.',
      options: [
        { id: 'yes', label: 'Yes' },
        { id: 'no', label: 'No' },
      ],
      defaultOptionId: 'no',
      approvedOptionIds: ['yes'],
    });

    expect(result).toEqual({
      approved: false,
      reason: 'timeout',
      optionId: 'no',
      source: 'timeout',
    });
  });

  it('persists synthetic approval prompt and resolution messages with a distinct owning toolCallId', async () => {
    mockRequestWorldOption.mockImplementationOnce(async (_world, request) => ({
      requestId: String(request?.requestId || ''),
      worldId: 'world-1',
      chatId: 'chat-1',
      optionId: 'no',
      source: 'user',
    }));

    const messages: any[] = [];
    const result = await requestToolApproval({
      world: { id: 'world-1' } as any,
      chatId: 'chat-1',
      toolCallId: 'shell-call-1',
      title: 'Approve shell command?',
      message: 'Run rm test.txt?',
      options: [
        { id: 'yes', label: 'Yes' },
        { id: 'no', label: 'No' },
      ],
      defaultOptionId: 'no',
      approvedOptionIds: ['yes'],
      metadata: { tool: 'shell_cmd' },
      agentName: 'planner',
      messages,
    });

    expect(result).toEqual({
      approved: false,
      reason: 'user_denied',
      optionId: 'no',
      source: 'user',
    });
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      role: 'assistant',
      chatId: 'chat-1',
      sender: 'planner',
      tool_calls: [
        expect.objectContaining({
          id: 'shell-call-1::approval',
          function: expect.objectContaining({ name: 'ask_user_input' }),
        }),
      ],
    });

    const promptArgs = JSON.parse(messages[0].tool_calls[0].function.arguments);
    expect(promptArgs).toMatchObject({
      type: 'single-select',
      allowSkip: false,
      metadata: {
        tool: 'shell_cmd',
        toolCallId: 'shell-call-1',
      },
    });
    expect(promptArgs.questions).toEqual([
      {
        id: 'question-1',
        header: 'Approve shell command?',
        question: 'Run rm test.txt?',
        options: [
          {
            id: 'yes',
            label: 'Yes',
          },
          {
            id: 'no',
            label: 'No',
          },
        ],
      },
    ]);

    expect(messages[1]).toMatchObject({
      role: 'tool',
      chatId: 'chat-1',
      tool_call_id: 'shell-call-1::approval',
      sender: 'planner',
    });
    expect(JSON.parse(messages[1].content)).toMatchObject({
      requestId: 'shell-call-1::approval',
      toolCallId: 'shell-call-1',
      tool: 'shell_cmd',
      status: 'denied',
      reason: 'user_denied',
    });
  });
});
