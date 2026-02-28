/**
 * Reconstruct Skill Approvals from Message History Tests
 *
 * Validates that `reconstructSkillApprovalsFromMessages` correctly repopulates
 * the in-memory skill approval caches from persisted tool-result messages,
 * enabling approval grants to survive app restarts.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  reconstructSkillApprovalsFromMessages,
  clearChatSkillApprovals,
} from '../../core/load-skill-tool.js';

vi.mock('../../core/skill-registry.js', () => ({
  getSkill: vi.fn(),
  getSkillSourcePath: vi.fn(),
  getSkillSourceScope: vi.fn(() => 'global'),
  waitForInitialSkillSync: vi.fn(async () => ({
    added: 0, updated: 0, removed: 0, unchanged: 0, total: 0,
  })),
}));
vi.mock('../../core/hitl.js', () => ({
  requestWorldOption: vi.fn(),
}));
vi.mock('../../core/shell-cmd-tool.js', () => ({
  executeShellCommand: vi.fn(),
  formatResultForLLM: vi.fn(),
  validateShellCommandScope: vi.fn(),
}));
vi.mock('../../core/logger.js', () => ({
  createCategoryLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));
vi.mock('../../core/utils.js', () => ({
  generateId: vi.fn(() => 'mock-id'),
}));
vi.mock('../../core/skill-settings.js', () => ({
  parseSkillIdListFromEnv: vi.fn(() => []),
}));
vi.mock('../../core/storage/storage-factory.js', () => ({
  createStorageWithWrappers: vi.fn(),
}));

const WORLD_ID = 'test-world';
const CHAT_ID = 'test-chat';

function makeUserMessage(messageId: string, content: string, chatId = CHAT_ID) {
  return {
    role: 'user',
    content,
    messageId,
    chatId,
    createdAt: new Date(),
  };
}

function makeApprovalToolMessage(skillId: string, optionId: string, chatId = CHAT_ID) {
  return {
    role: 'tool',
    content: JSON.stringify({ skillId, optionId, requestId: 'load_skill_approval::req-1', source: 'user' }),
    tool_call_id: `approval-${skillId}-${optionId}`,
    chatId,
    messageId: `tool-msg-${skillId}`,
    createdAt: new Date(),
  };
}

function makeNonLoadSkillApprovalLikeToolMessage(skillId: string, optionId: string, chatId = CHAT_ID) {
  return {
    role: 'tool',
    content: JSON.stringify({ skillId, optionId, requestId: 'other_tool_req', source: 'user' }),
    tool_call_id: `other-${skillId}-${optionId}`,
    chatId,
    messageId: `tool-msg-other-${skillId}`,
    createdAt: new Date(),
  };
}

function makeUnrelatedToolMessage() {
  return {
    role: 'tool',
    content: JSON.stringify({ result: 'some tool output' }),
    tool_call_id: 'unrelated-tool-1',
    chatId: CHAT_ID,
    messageId: 'unrelated-msg',
    createdAt: new Date(),
  };
}

describe('reconstructSkillApprovalsFromMessages', () => {
  beforeEach(() => {
    clearChatSkillApprovals(WORLD_ID, CHAT_ID);
    clearChatSkillApprovals(WORLD_ID, null);
  });

  it('restores yes_in_session approval from message history', () => {
    const messages = [
      makeUserMessage('user-1', 'hello'),
      makeApprovalToolMessage('my-skill', 'yes_in_session'),
    ];

    const restored = reconstructSkillApprovalsFromMessages(WORLD_ID, CHAT_ID, messages);

    expect(restored).toBe(1);

    // Verify the approval survives by checking a second reconstruction returns the same
    clearChatSkillApprovals(WORLD_ID, CHAT_ID);
    const restored2 = reconstructSkillApprovalsFromMessages(WORLD_ID, CHAT_ID, messages);
    expect(restored2).toBe(1);
  });

  it('restores yes_once approval only for current turn', () => {
    const messages = [
      makeUserMessage('user-1', 'first turn'),
      makeApprovalToolMessage('skill-a', 'yes_once'),
      makeUserMessage('user-2', 'second turn'),
      makeApprovalToolMessage('skill-b', 'yes_once'),
    ];

    const restored = reconstructSkillApprovalsFromMessages(WORLD_ID, CHAT_ID, messages);

    // Only skill-b (after last user message) should be restored
    expect(restored).toBe(1);
  });

  it('does not restore yes_once from a previous turn', () => {
    const messages = [
      makeUserMessage('user-1', 'first turn'),
      makeApprovalToolMessage('old-skill', 'yes_once'),
      makeUserMessage('user-2', 'second turn'),
      // No approvals after last user message
    ];

    const restored = reconstructSkillApprovalsFromMessages(WORLD_ID, CHAT_ID, messages);
    expect(restored).toBe(0);
  });

  it('does not cache "no" decisions', () => {
    const messages = [
      makeUserMessage('user-1', 'hello'),
      makeApprovalToolMessage('declined-skill', 'no'),
    ];

    const restored = reconstructSkillApprovalsFromMessages(WORLD_ID, CHAT_ID, messages);
    expect(restored).toBe(0);
  });

  it('skips malformed and non-approval tool messages', () => {
    const messages = [
      makeUserMessage('user-1', 'hello'),
      makeUnrelatedToolMessage(),
      { role: 'tool', content: 'not json', tool_call_id: 'bad', chatId: CHAT_ID },
      { role: 'tool', content: JSON.stringify({ skillId: 'x' }), tool_call_id: 'partial', chatId: CHAT_ID },
      { role: 'tool', content: JSON.stringify({ optionId: 'yes_once' }), tool_call_id: 'partial2', chatId: CHAT_ID },
    ];

    const restored = reconstructSkillApprovalsFromMessages(WORLD_ID, CHAT_ID, messages);
    expect(restored).toBe(0);
  });

  it('ignores non-load_skill approval-like tool messages', () => {
    const messages = [
      makeUserMessage('user-1', 'hello'),
      makeNonLoadSkillApprovalLikeToolMessage('my-skill', 'yes_in_session'),
    ];

    const restored = reconstructSkillApprovalsFromMessages(WORLD_ID, CHAT_ID, messages);
    expect(restored).toBe(0);
  });

  it('returns 0 for empty message list', () => {
    expect(reconstructSkillApprovalsFromMessages(WORLD_ID, CHAT_ID, [])).toBe(0);
  });

  it('returns 0 for missing worldId', () => {
    const messages = [
      makeUserMessage('user-1', 'hello'),
      makeApprovalToolMessage('my-skill', 'yes_in_session'),
    ];
    expect(reconstructSkillApprovalsFromMessages('', CHAT_ID, messages)).toBe(0);
  });

  it('restores multiple session approvals from different skills', () => {
    const messages = [
      makeUserMessage('user-1', 'hello'),
      makeApprovalToolMessage('skill-a', 'yes_in_session'),
      makeApprovalToolMessage('skill-b', 'yes_in_session'),
      makeApprovalToolMessage('skill-c', 'yes_in_session'),
    ];

    const restored = reconstructSkillApprovalsFromMessages(WORLD_ID, CHAT_ID, messages);
    expect(restored).toBe(3);
  });

  it('restores session approvals from earlier turns (not just current)', () => {
    const messages = [
      makeUserMessage('user-1', 'first turn'),
      makeApprovalToolMessage('early-skill', 'yes_in_session'),
      makeUserMessage('user-2', 'second turn'),
      // early-skill approval should still be restored (session-scoped)
    ];

    const restored = reconstructSkillApprovalsFromMessages(WORLD_ID, CHAT_ID, messages);
    expect(restored).toBe(1);
  });

  it('handles null chatId gracefully', () => {
    const messages = [
      { role: 'user', content: 'hello', messageId: 'u1', chatId: null, createdAt: new Date() },
      {
        role: 'tool',
        content: JSON.stringify({ skillId: 'sk', optionId: 'yes_in_session', requestId: 'load_skill_approval::r', source: 'user' }),
        tool_call_id: 'tc1',
        chatId: null,
        messageId: 'tm1',
        createdAt: new Date(),
      },
    ];

    const restored = reconstructSkillApprovalsFromMessages(WORLD_ID, null, messages);
    expect(restored).toBe(1);
  });
});
