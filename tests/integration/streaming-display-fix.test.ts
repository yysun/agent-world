/**
 * Integration Test for Streaming Content Display Fix
 * 
 * This test simulates the actual usage pattern in the World component
 * to ensure streaming messages are properly displayed and converted.
 */

import type { WorldComponentState } from '../../web/src/types';
import { worldUpdateHandlers } from '../../web/src/pages/World.update';

// Create a minimal mock for the SSE handlers used in World.update.ts
const mockSSEHandlers = {
  handleStreamStart: worldUpdateHandlers.handleStreamStart,
  handleStreamChunk: worldUpdateHandlers.handleStreamChunk,
  handleStreamEnd: worldUpdateHandlers.handleStreamEnd,
};

describe('Streaming Display Integration Test', () => {
  let mockWorldState: WorldComponentState;

  beforeEach(() => {
    mockWorldState = {
      worldName: 'test-world',
      world: {
        name: 'test-world',
        agents: [
          {
            id: 'agent-1',
            name: 'TestAgent',
            type: 'default',
            provider: 'ollama' as any,
            model: 'llama3.2:3b',
            llmCallCount: 0,
            memory: [],
            spriteIndex: 0,
            messageCount: 0
          }
        ],
        llmCallLimit: 10
      },
      agents: [
        {
          id: 'agent-1',
          name: 'TestAgent',
          type: 'default',
          provider: 'ollama' as any,
          model: 'llama3.2:3b',
          llmCallCount: 0,
          memory: [],
          spriteIndex: 0,
          messageCount: 0
        }
      ],
      messages: [],
      userInput: '',
      loading: false,
      error: null,
      messagesLoading: false,
      isSending: false,
      isWaiting: false,
      selectedSettingsTarget: 'world',
      selectedAgent: null,
      activeAgent: null,
      showAgentEdit: false,
      agentEditMode: 'create',
      selectedAgentForEdit: null,
      showWorldEdit: false,
      worldEditMode: 'edit',
      selectedWorldForEdit: null,
      connectionStatus: 'connected',
      wsError: null,
      needScroll: false
    };
  });

  it('should handle complete streaming flow in World component context', () => {
    // Step 1: Start streaming
    const startData = {
      messageId: 'integration-test-1',
      sender: 'TestAgent',
      worldName: 'test-world'
    };

    let state = mockSSEHandlers.handleStreamStart(mockWorldState, startData);

    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].isStreaming).toBe(true);
    expect(state.messages[0].text).toBe('');
    expect(state.messages[0].sender).toBe('TestAgent');
    expect(state.activeAgent).toEqual({ spriteIndex: 0, name: 'TestAgent' });

    // Step 2: Receive chunks
    const chunkData1 = {
      messageId: 'integration-test-1',
      sender: 'TestAgent',
      content: 'Hello, I am ',
      isAccumulated: false,
      worldName: 'test-world'
    };

    state = mockSSEHandlers.handleStreamChunk(state, chunkData1);
    expect(state.messages[0].text).toBe('Hello, I am ');
    expect(state.messages[0].isStreaming).toBe(true);

    const chunkData2 = {
      messageId: 'integration-test-1',
      sender: 'TestAgent',
      content: 'Hello, I am responding to your message with a streaming response.',
      isAccumulated: true,
      worldName: 'test-world'
    };

    state = mockSSEHandlers.handleStreamChunk(state, chunkData2);
    expect(state.messages[0].text).toBe('Hello, I am responding to your message with a streaming response.');
    expect(state.messages[0].isStreaming).toBe(true);

    // Step 3: End streaming - this is where the bug was
    const endData = {
      messageId: 'integration-test-1',
      sender: 'TestAgent',
      content: 'Hello, I am responding to your message with a streaming response. Final.',
      worldName: 'test-world'
    };

    state = mockSSEHandlers.handleStreamEnd(state, endData);

    // Critical assertions - this is what was broken before the fix
    expect(state.messages).toHaveLength(1); // Should still have the message, not 0
    expect(state.messages[0].isStreaming).toBe(false); // Should no longer be streaming
    expect(state.messages[0].streamComplete).toBe(true); // Should be marked complete
    expect(state.messages[0].text).toBe('Hello, I am responding to your message with a streaming response. Final.');
    expect(state.messages[0].type).toBe('agent'); // Should be converted from 'agent-stream'
    expect(state.activeAgent).toBeNull(); // activeAgent should be cleared
    expect(state.needScroll).toBe(true); // Should trigger scroll

    // Verify agent message count was incremented
    expect(state.agents[0].messageCount).toBe(1);
    expect(state.world?.agents[0].messageCount).toBe(1);
  });

  it('should handle multiple concurrent streams correctly', () => {
    // Start two streams from different agents
    const agent2 = {
      id: 'agent-2',
      name: 'SecondAgent',
      type: 'default',
      provider: 'ollama' as any,
      model: 'llama3.2:3b',
      llmCallCount: 0,
      memory: [],
      spriteIndex: 1,
      messageCount: 0
    };

    // Add second agent to state
    const initialState = {
      ...mockWorldState,
      agents: [...mockWorldState.agents, agent2],
      world: {
        ...mockWorldState.world!,
        agents: [...mockWorldState.world!.agents, agent2]
      }
    };

    // Start first stream
    let state = mockSSEHandlers.handleStreamStart(initialState, {
      messageId: 'stream-1',
      sender: 'TestAgent',
      worldName: 'test-world'
    });

    // Start second stream
    state = mockSSEHandlers.handleStreamStart(state, {
      messageId: 'stream-2',
      sender: 'SecondAgent',
      worldName: 'test-world'
    });

    expect(state.messages).toHaveLength(2);
    expect(state.messages[0].sender).toBe('TestAgent');
    expect(state.messages[1].sender).toBe('SecondAgent');

    // End first stream
    state = mockSSEHandlers.handleStreamEnd(state, {
      messageId: 'stream-1',
      sender: 'TestAgent',
      content: 'First agent final message',
      worldName: 'test-world'
    });

    expect(state.messages).toHaveLength(2);
    expect(state.messages[0].isStreaming).toBe(false); // First should be complete
    expect(state.messages[1].isStreaming).toBe(true);  // Second should still be streaming

    // End second stream
    state = mockSSEHandlers.handleStreamEnd(state, {
      messageId: 'stream-2',
      sender: 'SecondAgent',
      content: 'Second agent final message',
      worldName: 'test-world'
    });

    expect(state.messages).toHaveLength(2);
    expect(state.messages[0].isStreaming).toBe(false);
    expect(state.messages[1].isStreaming).toBe(false);
    expect(state.messages[0].text).toBe('First agent final message');
    expect(state.messages[1].text).toBe('Second agent final message');
  });

  it('should properly filter messages in WorldChat component context', () => {
    // Simulate a complete streaming flow and then test filtering
    let state = mockWorldState;

    // Add a user message first
    state = {
      ...state,
      messages: [{
        id: 'user-msg-1',
        type: 'user',
        sender: 'HUMAN',
        text: 'Hello everyone!',
        createdAt: new Date().toISOString(),
        worldName: 'test-world'
      }]
    };

    // Complete a streaming response
    state = mockSSEHandlers.handleStreamStart(state, {
      messageId: 'agent-response-1',
      sender: 'TestAgent',
      worldName: 'test-world'
    });

    state = mockSSEHandlers.handleStreamChunk(state, {
      messageId: 'agent-response-1',
      sender: 'TestAgent',
      content: 'Hello! I received your message.',
      isAccumulated: true,
      worldName: 'test-world'
    });

    state = mockSSEHandlers.handleStreamEnd(state, {
      messageId: 'agent-response-1',
      sender: 'TestAgent',
      content: 'Hello! I received your message and here is my response.',
      worldName: 'test-world'
    });

    // Test the filtering logic that WorldChat component uses
    const filteredMessages = state.messages.filter(message => {
      // Always show user messages
      if (message.sender === 'HUMAN' || message.sender === 'USER' || message.type === 'user' || message.sender === 'system' || message.sender === 'SYSTEM') {
        return true;
      }

      // For agent messages: 
      // Show completed streams (streamComplete === true) 
      // OR show currently streaming messages that are not yet complete (isStreaming === true && streamComplete !== true)
      // OR show regular non-streaming messages (no streaming properties)
      if (message.isStreaming === true && message.streamComplete !== true) {
        return true; // Currently streaming
      }
      if (message.streamComplete === true) {
        return true; // Completed stream
      }
      if (message.streamComplete === undefined && message.isStreaming === undefined) {
        return true; // Regular message (like GM notifications)
      }
      return false; // Filter out incomplete or duplicate messages
    });

    expect(filteredMessages).toHaveLength(2); // User message + completed agent message
    expect(filteredMessages[0].sender).toBe('HUMAN');
    expect(filteredMessages[1].sender).toBe('TestAgent');
    expect(filteredMessages[1].streamComplete).toBe(true);
    expect(filteredMessages[1].isStreaming).toBe(false);
  });
});
