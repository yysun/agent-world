/**
 * Historical Message Relevance Filter Tests
 *
 * Purpose:
 * - Verify `wouldAgentHaveRespondedToHistoricalMessage` excludes persisted shell stdout stream
 *   assistant messages from LLM continuation context.
 *
 * Key features:
 * - Shell stdout stream messages (messageId suffix `-stdout`) are excluded regardless of sender.
 * - Regular own assistant messages remain included.
 *
 * Notes:
 * - Pure unit tests; no storage or LLM calls.
 *
 * Recent changes:
 * - 2026-02-21: Initial coverage for shell stdout stream exclusion to prevent token amplification loops.
 */

import { describe, expect, test } from 'vitest';
import type { Agent, AgentMessage, LLMProvider } from '../../core/types.js';
import { wouldAgentHaveRespondedToHistoricalMessage } from '../../core/utils.js';

function createTestAgent(): Agent {
  return {
    id: 'agent-a',
    name: 'Agent A',
    type: 'assistant',
    autoReply: true,
    provider: 'openai' as LLMProvider,
    model: 'gpt-4o-mini',
    llmCallCount: 0,
    memory: []
  };
}

describe('wouldAgentHaveRespondedToHistoricalMessage', () => {
  test('excludes persisted shell stdout stream assistant messages', () => {
    const agent = createTestAgent();
    const shellStdoutMessage: AgentMessage = {
      role: 'assistant',
      content: 'very large command output...',
      sender: agent.id,
      messageId: 'tool-call-1-stdout',
      agentId: agent.id,
      createdAt: new Date()
    };

    const shouldInclude = wouldAgentHaveRespondedToHistoricalMessage(agent, shellStdoutMessage);
    expect(shouldInclude).toBe(false);
  });

  test('keeps regular own assistant messages', () => {
    const agent = createTestAgent();
    const ownAssistantMessage: AgentMessage = {
      role: 'assistant',
      content: 'normal assistant reply',
      sender: agent.id,
      messageId: 'msg-1',
      agentId: agent.id,
      createdAt: new Date()
    };

    const shouldInclude = wouldAgentHaveRespondedToHistoricalMessage(agent, ownAssistantMessage);
    expect(shouldInclude).toBe(true);
  });
});
