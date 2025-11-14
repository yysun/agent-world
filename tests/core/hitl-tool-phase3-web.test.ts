/**
 * Phase 3: Client-Side Detection & UI (Web)
 * 
 * Tests:
 * - HITLRequest interface type safety
 * - Message.hitlData property
 * - WorldComponentState.hitlRequest property
 * - WorldEvents union includes HITL events
 * - Update handlers type signatures
 */
import { describe, it, expect } from 'vitest';
import type { HITLRequest, Message, WorldComponentState } from '../../web/src/types/index.js';
import type { WorldEvents } from '../../web/src/types/events.js';

describe('Phase 3: Web Types', () => {
  it('should define HITLRequest interface correctly', () => {
    const hitlRequest: HITLRequest = {
      toolCallId: 'hitl_123',
      prompt: 'Choose deployment environment',
      options: ['staging', 'production', 'cancel'],
      context: { service: 'api-server', version: 'v2.1.0' },
      agentId: 'agent:g1'
    };

    expect(hitlRequest.toolCallId).toBe('hitl_123');
    expect(hitlRequest.prompt).toBe('Choose deployment environment');
    expect(hitlRequest.options).toHaveLength(3);
    expect(hitlRequest.context).toEqual({ service: 'api-server', version: 'v2.1.0' });
    expect(hitlRequest.agentId).toBe('agent:g1');
  });

  it('should allow optional originalToolCall in HITLRequest', () => {
    const hitlRequest: HITLRequest = {
      toolCallId: 'hitl_456',
      originalToolCall: {
        id: 'call_abc123',
        name: 'deploy',
        args: {}
      },
      prompt: 'Select option',
      options: ['A', 'B'],
      agentId: 'agent:g1'
    };

    expect(hitlRequest.originalToolCall?.id).toBe('call_abc123');
  });

  it('should support hitlData in Message interface', () => {
    const message: Message = {
      id: 'msg1',
      type: 'message',
      sender: 'agent:g1',
      text: 'HITL request message',
      createdAt: new Date(),
      isHITLRequest: true,
      hitlData: {
        toolCallId: 'hitl_789',
        prompt: 'Confirm action?',
        options: ['Yes', 'No'],
        agentId: 'agent:g1'
      }
    };

    expect(message.isHITLRequest).toBe(true);
    expect(message.hitlData?.toolCallId).toBe('hitl_789');
    expect(message.hitlData?.prompt).toBe('Confirm action?');
    expect(message.hitlData?.options).toEqual(['Yes', 'No']);
  });

  it('should support choice in Message.hitlData for responses', () => {
    const message: Message = {
      id: 'msg2',
      type: 'message',
      sender: 'human',
      text: 'HITL response',
      createdAt: new Date(),
      isHITLResponse: true,
      hitlData: {
        toolCallId: 'hitl_789',
        prompt: 'Confirm action?',
        options: ['Yes', 'No'],
        choice: 'Yes',
        agentId: 'agent:g1'
      }
    };

    expect(message.isHITLResponse).toBe(true);
    expect(message.hitlData?.choice).toBe('Yes');
  });

  it('should include hitlRequest in WorldComponentState', () => {
    const state: Pick<WorldComponentState, 'hitlRequest'> = {
      hitlRequest: {
        toolCallId: 'hitl_999',
        prompt: 'Choose branch',
        options: ['main', 'develop'],
        agentId: 'agent:g1'
      }
    };

    expect(state.hitlRequest).not.toBeNull();
    expect(state.hitlRequest?.toolCallId).toBe('hitl_999');
  });

  it('should allow null hitlRequest in WorldComponentState', () => {
    const state: Pick<WorldComponentState, 'hitlRequest'> = {
      hitlRequest: null
    };

    expect(state.hitlRequest).toBeNull();
  });
});

describe('Phase 3: Web Events', () => {
  it('should include show-hitl-request in WorldEvents union', () => {
    const event: WorldEvents = {
      name: 'show-hitl-request',
      payload: {
        toolCallId: 'hitl_123',
        prompt: 'Select environment',
        options: ['dev', 'prod'],
        agentId: 'agent:g1'
      }
    };

    expect(event.name).toBe('show-hitl-request');
    expect(event.payload.prompt).toBe('Select environment');
  });

  it('should include hide-hitl-request in WorldEvents union', () => {
    const event: WorldEvents = {
      name: 'hide-hitl-request',
      payload: undefined
    };

    expect(event.name).toBe('hide-hitl-request');
  });

  it('should include submit-hitl-decision in WorldEvents union', () => {
    const event: WorldEvents = {
      name: 'submit-hitl-decision',
      payload: {
        toolCallId: 'hitl_123',
        choice: 'prod'
      }
    };

    expect(event.name).toBe('submit-hitl-decision');
    expect(event.payload.choice).toBe('prod');
  });
});
