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
});
