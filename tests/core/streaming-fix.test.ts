/**
 * Test for SSE Streaming Fix
 * 
 * Tests the handleStreamEnd fix to ensure streaming messages
 * are properly converted to final messages instead of being deleted.
 */

import {
  handleStreamStart,
  handleStreamChunk,
  handleStreamEnd
} from '../../web/src/utils/sse-client';
import type { SSEComponentState, Message } from '../../web/src/types';

// Mock state for testing
interface TestState extends SSEComponentState {
  worldName: string;
  agents: Array<{ id: string; name: string }>;
}

describe('SSE Streaming Fix', () => {
  let initialState: TestState;

  beforeEach(() => {
    initialState = {
      worldName: 'test-world',
      messages: [],
      agents: [
        { id: 'agent1', name: 'TestAgent' }
      ],
      connectionStatus: 'connected',
      wsError: null,
      needScroll: false
    };
  });

  describe('handleStreamEnd', () => {
    it('should replace streaming message with final message instead of deleting it', () => {
      // Step 1: Start a stream
      const startData = {
        messageId: 'test-msg-1',
        sender: 'TestAgent',
        worldName: 'test-world'
      };

      const stateAfterStart = handleStreamStart(initialState, startData);
      expect(stateAfterStart.messages).toHaveLength(1);
      expect(stateAfterStart.messages[0].isStreaming).toBe(true);
      expect(stateAfterStart.messages[0].text).toBe('');

      // Step 2: Add some content via chunk
      const chunkData = {
        messageId: 'test-msg-1',
        sender: 'TestAgent',
        content: 'Hello, this is streaming content',
        isAccumulated: false,
        worldName: 'test-world'
      };

      const stateAfterChunk = handleStreamChunk(stateAfterStart, chunkData);
      expect(stateAfterChunk.messages).toHaveLength(1);
      expect(stateAfterChunk.messages[0].isStreaming).toBe(true);
      expect(stateAfterChunk.messages[0].text).toBe('Hello, this is streaming content');

      // Step 3: End the stream - this should convert streaming message to final message
      const endData = {
        messageId: 'test-msg-1',
        sender: 'TestAgent',
        content: 'Hello, this is the final content',
        worldName: 'test-world'
      };

      const stateAfterEnd = handleStreamEnd(stateAfterChunk, endData);

      // Should still have 1 message (not 0 like before the fix)
      expect(stateAfterEnd.messages).toHaveLength(1);

      // Message should no longer be streaming
      expect(stateAfterEnd.messages[0].isStreaming).toBe(false);

      // Message should be marked as streamComplete
      expect(stateAfterEnd.messages[0].streamComplete).toBe(true);

      // Message should have final content
      expect(stateAfterEnd.messages[0].text).toBe('Hello, this is the final content');

      // Message type should be converted from 'agent-stream' to 'agent'
      expect(stateAfterEnd.messages[0].type).toBe('agent');

      // Should trigger scroll
      expect(stateAfterEnd.needScroll).toBe(true);
    });

    it('should create new message if no streaming message is found', () => {
      // End stream without starting one
      const endData = {
        messageId: 'test-msg-1',
        sender: 'TestAgent',
        content: 'Final content without stream start',
        worldName: 'test-world'
      };

      const stateAfterEnd = handleStreamEnd(initialState, endData);

      // Should create a new message
      expect(stateAfterEnd.messages).toHaveLength(1);
      expect(stateAfterEnd.messages[0].text).toBe('Final content without stream start');
      expect(stateAfterEnd.messages[0].isStreaming).toBe(false);
      expect(stateAfterEnd.messages[0].streamComplete).toBe(true);
      expect(stateAfterEnd.messages[0].type).toBe('agent');
    });

    it('should preserve fromAgentId when converting streaming message', () => {
      // Manually create a streaming message with fromAgentId
      const stateWithStreamingMessage: TestState = {
        ...initialState,
        messages: [{
          id: 'test-id',
          type: 'agent-stream',
          sender: 'TestAgent',
          text: 'Streaming...',
          createdAt: new Date().toISOString(),
          isStreaming: true,
          messageId: 'test-msg-1',
          fromAgentId: 'agent1'
        }]
      };

      const endData = {
        messageId: 'test-msg-1',
        sender: 'TestAgent',
        content: 'Final message',
        worldName: 'test-world'
      };

      const stateAfterEnd = handleStreamEnd(stateWithStreamingMessage, endData);

      expect(stateAfterEnd.messages).toHaveLength(1);
      expect(stateAfterEnd.messages[0].fromAgentId).toBe('agent1');
      expect(stateAfterEnd.messages[0].text).toBe('Final message');
      expect(stateAfterEnd.messages[0].isStreaming).toBe(false);
    });

    it('should handle multiple streaming messages correctly', () => {
      // Create state with multiple streaming messages
      const stateWithMultipleStreams: TestState = {
        ...initialState,
        messages: [
          {
            id: 'msg1',
            type: 'agent-stream',
            sender: 'Agent1',
            text: 'Stream 1',
            createdAt: new Date().toISOString(),
            isStreaming: true,
            messageId: 'stream-1'
          },
          {
            id: 'msg2',
            type: 'agent-stream',
            sender: 'Agent2',
            text: 'Stream 2',
            createdAt: new Date().toISOString(),
            isStreaming: true,
            messageId: 'stream-2'
          }
        ]
      };

      // End only the first stream
      const endData = {
        messageId: 'stream-1',
        sender: 'Agent1',
        content: 'Final content for Agent1',
        worldName: 'test-world'
      };

      const stateAfterEnd = handleStreamEnd(stateWithMultipleStreams, endData);

      expect(stateAfterEnd.messages).toHaveLength(2);

      // First message should be completed
      expect(stateAfterEnd.messages[0].isStreaming).toBe(false);
      expect(stateAfterEnd.messages[0].text).toBe('Final content for Agent1');

      // Second message should still be streaming
      expect(stateAfterEnd.messages[1].isStreaming).toBe(true);
      expect(stateAfterEnd.messages[1].text).toBe('Stream 2');
    });
  });

  describe('Full streaming flow', () => {
    it('should handle complete start->chunk->end flow correctly', () => {
      let state = initialState;

      // Start stream
      state = handleStreamStart(state, {
        messageId: 'flow-test',
        sender: 'TestAgent',
        worldName: 'test-world'
      });

      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].isStreaming).toBe(true);

      // Multiple chunks
      state = handleStreamChunk(state, {
        messageId: 'flow-test',
        sender: 'TestAgent',
        content: 'Hello ',
        isAccumulated: false,
        worldName: 'test-world'
      });

      state = handleStreamChunk(state, {
        messageId: 'flow-test',
        sender: 'TestAgent',
        content: 'Hello world!',
        isAccumulated: true,
        worldName: 'test-world'
      });

      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].text).toBe('Hello world!');
      expect(state.messages[0].isStreaming).toBe(true);

      // End stream
      state = handleStreamEnd(state, {
        messageId: 'flow-test',
        sender: 'TestAgent',
        content: 'Hello world! Final.',
        worldName: 'test-world'
      });

      // Final verification
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].text).toBe('Hello world! Final.');
      expect(state.messages[0].isStreaming).toBe(false);
      expect(state.messages[0].streamComplete).toBe(true);
      expect(state.messages[0].type).toBe('agent');
    });
  });
});
