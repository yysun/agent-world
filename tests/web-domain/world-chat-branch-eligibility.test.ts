/**
 * Web Chat Branch Eligibility Tests
 *
 * Purpose:
 * - Lock eligibility rules for showing branch actions on web messages.
 *
 * Coverage:
 * - Allows true assistant response messages.
 * - Rejects system/tool/error-like assistant messages.
 * - Rejects messages with tool call metadata.
 */

import { describe, expect, it } from 'vitest';
import { isBranchableAgentMessage } from '../../web/src/components/world-chat';

describe('web/world-chat branch eligibility', () => {
  it('allows true assistant response messages', () => {
    expect(isBranchableAgentMessage({
      role: 'assistant',
      sender: 'a1',
      text: 'Here is my response.'
    } as any)).toBe(true);
  });

  it('rejects system/tool/error-like assistant messages', () => {
    expect(isBranchableAgentMessage({
      role: 'assistant',
      sender: 'system',
      text: 'System response'
    } as any)).toBe(false);

    expect(isBranchableAgentMessage({
      role: 'assistant',
      sender: 'tool',
      text: 'Tool response'
    } as any)).toBe(false);

    expect(isBranchableAgentMessage({
      role: 'assistant',
      sender: 'a1',
      text: 'Error: operation failed'
    } as any)).toBe(false);
  });

  it('rejects assistant messages with tool-call metadata', () => {
    expect(isBranchableAgentMessage({
      role: 'assistant',
      sender: 'a1',
      text: 'Calling tool',
      tool_calls: [{ id: 'call-1' }]
    } as any)).toBe(false);

    expect(isBranchableAgentMessage({
      role: 'assistant',
      sender: 'a1',
      text: 'Tool call id present',
      tool_call_id: 'call-1'
    } as any)).toBe(false);

    expect(isBranchableAgentMessage({
      role: 'assistant',
      sender: 'a1',
      text: 'Tool status present',
      toolCallStatus: 'completed'
    } as any)).toBe(false);
  });
});
