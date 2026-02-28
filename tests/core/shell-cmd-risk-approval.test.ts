/**
 * Shell Command Risk Approval Tests
 *
 * Purpose:
 * - Verify high-risk shell commands use shared HITL approval helper with approve/deny-only options.
 *
 * Key Features:
 * - Asserts `requestToolApproval` is called for `hitl_required` shell commands.
 * - Asserts approval options are per-call approve/deny (no session approval option).
 * - Asserts execution stops when approval is unavailable or denied.
 *
 * Implementation Notes:
 * - Mocks `requestToolApproval` to keep tests deterministic and avoid interactive HITL prompts.
 *
 * Recent Changes:
 * - 2026-02-28: Initial risk approval coverage for shell_cmd SS implementation.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRequestToolApproval = vi.hoisted(() => vi.fn());

vi.mock('../../core/tool-approval.js', () => ({
  requestToolApproval: mockRequestToolApproval,
}));

import { createShellCmdToolDefinition } from '../../core/shell-cmd-tool.js';

describe('shell_cmd risk approval flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses requestToolApproval with approve/deny options for high-risk commands', async () => {
    mockRequestToolApproval.mockResolvedValueOnce({
      approved: false,
      reason: 'user_denied',
      optionId: 'deny',
      source: 'user',
    });

    const tool = createShellCmdToolDefinition();

    await expect(
      tool.execute(
        {
          command: 'rm',
          parameters: ['-rf', './build'],
        },
        undefined,
        undefined,
        {
          world: { id: 'world-1', variables: 'working_directory=/tmp/project' },
          workingDirectory: '/tmp/project',
          chatId: 'chat-1',
          agentName: 'test-agent',
        },
      ),
    ).rejects.toThrow('not approved');

    expect(mockRequestToolApproval).toHaveBeenCalledTimes(1);
    const request = mockRequestToolApproval.mock.calls[0][0];
    expect(request.defaultOptionId).toBe('deny');
    expect(request.approvedOptionIds).toEqual(['approve']);
    expect(request.options).toEqual([
      expect.objectContaining({ id: 'approve', label: 'Approve' }),
      expect.objectContaining({ id: 'deny', label: 'Deny' }),
    ]);
  });

  it('fails with non-executed result when approval context is unavailable', async () => {
    const tool = createShellCmdToolDefinition();

    await expect(
      tool.execute(
        {
          command: 'rm',
          parameters: ['-rf', './build'],
        },
        undefined,
        undefined,
        {
          workingDirectory: '/tmp/project',
        },
      ),
    ).rejects.toThrow('Approval required');

    expect(mockRequestToolApproval).not.toHaveBeenCalled();
  });
});
