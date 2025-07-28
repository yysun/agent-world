/**
 * Test for Error Message Visibility Fix
 * 
 * Validates that when LLM errors occur, both SSE error events
 * and regular chat messages are published so the frontend can 
 * display them in the chat interface.
 */

import { processAgentMessage } from '../../core/events';
import { createMockAgent } from './mock-helpers';
import { World, Agent, WorldMessageEvent } from '../../core/types';
import { EventEmitter } from 'events';

// Mock the LLM manager to throw errors
jest.mock('../../core/llm-manager', () => ({
  streamAgentResponse: jest.fn().mockRejectedValue(new Error('LLM service unavailable'))
}));

describe('Error Message Visibility', () => {
  let mockWorld: World;
  let mockAgent: Agent;
  let sseEvents: any[];
  let messageEvents: any[];

  beforeEach(() => {
    // Reset event arrays
    sseEvents = [];
    messageEvents = [];

    // Create mock world with event emitter
    const eventEmitter = new EventEmitter();
    eventEmitter.emit = jest.fn((eventType: string, eventData: any) => {
      if (eventType === 'sse') {
        sseEvents.push(eventData);
      } else if (eventType === 'message') {
        messageEvents.push(eventData);
      }
      return true;
    });

    mockWorld = {
      id: 'test-world',
      name: 'Test World',
      rootPath: '/tmp/test',
      eventEmitter,
      agents: new Map()
    } as World;

    // Create mock agent
    mockAgent = createMockAgent({
      id: 'test-agent',
      name: 'Test Agent'
    });

    // Add agent to world
    mockWorld.agents.set('test-agent', mockAgent);
  });

  it('should publish both SSE error event and chat message when LLM fails', async () => {
    // Create a test message event
    const messageEvent: WorldMessageEvent = {
      content: 'Hello agent',
      sender: 'HUMAN',
      timestamp: new Date(),
      messageId: 'test-message-id'
    };

    // Process the message - this should trigger an LLM error
    await processAgentMessage(mockWorld, mockAgent, messageEvent);

    // Verify that an SSE error event was published
    const sseErrorEvents = sseEvents.filter(event => event.type === 'error');
    expect(sseErrorEvents).toHaveLength(1);
    expect(sseErrorEvents[0]).toMatchObject({
      agentName: 'test-agent',
      type: 'error',
      error: 'LLM service unavailable'
    });

    // Verify that a chat message was also published
    const chatMessages = messageEvents.filter(event => event.content?.includes('[Error]'));
    expect(chatMessages).toHaveLength(1);
    expect(chatMessages[0]).toMatchObject({
      content: '[Error] LLM service unavailable',
      sender: 'system'
    });
  });

  it('should include error details in both event types', async () => {
    const messageEvent: WorldMessageEvent = {
      content: 'Test error message',
      sender: 'HUMAN',
      timestamp: new Date(),
      messageId: 'test-message-id-2'
    };

    await processAgentMessage(mockWorld, mockAgent, messageEvent);

    // Check SSE error event details
    const sseErrorEvent = sseEvents.find(event => event.type === 'error');
    expect(sseErrorEvent).toBeDefined();
    expect(sseErrorEvent.error).toBe('LLM service unavailable');
    expect(sseErrorEvent.agentName).toBe('test-agent');

    // Check chat message details
    const chatMessage = messageEvents.find(event => event.content?.includes('[Error]'));
    expect(chatMessage).toBeDefined();
    expect(chatMessage.content).toBe('[Error] LLM service unavailable');
    expect(chatMessage.sender).toBe('system');
  });
});