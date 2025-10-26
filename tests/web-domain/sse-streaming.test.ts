/**
 * SSE Streaming Domain Module Tests
 * 
 * Tests for Server-Sent Events streaming state management.
 */

import * as SSEStreamingDomain from '../../web/src/domain/sse-streaming';
import type { WorldComponentState } from '../../web/src/types';

describe('SSE Streaming Domain Module', () => {
  let mockState: WorldComponentState;

  beforeEach(() => {
    mockState = {
      worldName: 'test-world',
      world: {
        id: 'world-1',
        name: 'test-world',
        agents: [
          { id: 'agent-1', name: 'agent1', spriteIndex: 0 },
          { id: 'agent-2', name: 'agent2', spriteIndex: 1 }
        ]
      } as any,
      messages: [],
      userInput: '',
      loading: false,
      error: null,
      messagesLoading: false,
      isSending: false,
      isWaiting: false,
      selectedSettingsTarget: 'chat',
      selectedAgent: null,
      activeAgent: null,
      showAgentEdit: false,
      agentEditMode: 'create',
      selectedAgentForEdit: null,
      showWorldEdit: false,
      worldEditMode: 'edit',
      selectedWorldForEdit: null,
      chatToDelete: null,
      connectionStatus: 'disconnected',
      needScroll: false,
      currentChat: null,
      editingMessageId: null,
      editingText: '',
      messageToDelete: null,
      activeAgentFilters: []
    };
  });

  describe('createStreamStartState', () => {
    it('should set activeAgent and waiting flags', () => {
      const result = SSEStreamingDomain.createStreamStartState(mockState, 'agent1');
      
      expect(result.activeAgent).toEqual({ id: 'agent-1', name: 'agent1', spriteIndex: 0 });
      expect(result.isWaiting).toBe(true);
      expect(result.needScroll).toBe(true);
    });

    it('should handle non-existent agent name', () => {
      const result = SSEStreamingDomain.createStreamStartState(mockState, 'nonexistent');
      
      expect(result.activeAgent).toBeNull();
      expect(result.isWaiting).toBe(true);
    });

    it('should preserve other state properties', () => {
      mockState.userInput = 'test';
      mockState.messages = [{ id: 'msg1' }] as any;
      
      const result = SSEStreamingDomain.createStreamStartState(mockState, 'agent1');
      
      expect(result.userInput).toBe('test');
      expect(result.messages).toEqual(mockState.messages);
    });
  });

  describe('createStreamChunkState', () => {
    it('should set needScroll flag', () => {
      mockState.needScroll = false;
      
      const result = SSEStreamingDomain.createStreamChunkState(mockState);
      
      expect(result.needScroll).toBe(true);
    });

    it('should preserve other state properties', () => {
      mockState.activeAgent = { id: 'agent-1', name: 'agent1' } as any;
      mockState.isWaiting = true;
      mockState.messages = [{ id: 'msg1' }] as any;
      
      const result = SSEStreamingDomain.createStreamChunkState(mockState);
      
      expect(result.activeAgent).toEqual(mockState.activeAgent);
      expect(result.isWaiting).toBe(true);
      expect(result.messages).toEqual(mockState.messages);
    });
  });

  describe('createStreamEndState', () => {
    it('should clear activeAgent and waiting flag', () => {
      mockState.activeAgent = { id: 'agent-1', name: 'agent1' } as any;
      mockState.isWaiting = true;
      
      const result = SSEStreamingDomain.createStreamEndState(mockState);
      
      expect(result.activeAgent).toBeNull();
      expect(result.isWaiting).toBe(false);
      expect(result.needScroll).toBe(true);
    });

    it('should preserve messages', () => {
      mockState.activeAgent = { id: 'agent-1', name: 'agent1' } as any;
      mockState.isWaiting = true;
      mockState.messages = [{ id: 'msg1' }, { id: 'msg2' }] as any;
      
      const result = SSEStreamingDomain.createStreamEndState(mockState);
      
      expect(result.messages).toEqual(mockState.messages);
    });
  });

  describe('createStreamErrorState', () => {
    it('should clear streaming state and set error', () => {
      mockState.activeAgent = { id: 'agent-1', name: 'agent1' } as any;
      mockState.isWaiting = true;
      mockState.isSending = true;
      
      const result = SSEStreamingDomain.createStreamErrorState(mockState, 'Stream error');
      
      expect(result.activeAgent).toBeNull();
      expect(result.isWaiting).toBe(false);
      expect(result.isSending).toBe(false);
      expect(result.error).toBe('Stream error');
    });

    it('should preserve messages', () => {
      mockState.messages = [{ id: 'msg1' }] as any;
      
      const result = SSEStreamingDomain.createStreamErrorState(mockState, 'Error');
      
      expect(result.messages).toEqual(mockState.messages);
    });
  });

  describe('isStreaming', () => {
    it('should return true when actively streaming', () => {
      const state = {
        isWaiting: true,
        activeAgent: { id: 'agent-1', name: 'agent1' }
      } as any;
      
      expect(SSEStreamingDomain.isStreaming(state)).toBe(true);
    });

    it('should return false when not waiting', () => {
      const state = {
        isWaiting: false,
        activeAgent: { id: 'agent-1', name: 'agent1' }
      } as any;
      
      expect(SSEStreamingDomain.isStreaming(state)).toBe(false);
    });

    it('should return false when no active agent', () => {
      const state = {
        isWaiting: true,
        activeAgent: null
      } as any;
      
      expect(SSEStreamingDomain.isStreaming(state)).toBe(false);
    });

    it('should return false when neither condition met', () => {
      const state = {
        isWaiting: false,
        activeAgent: null
      } as any;
      
      expect(SSEStreamingDomain.isStreaming(state)).toBe(false);
    });
  });

  describe('getActiveAgentName', () => {
    it('should return agent name when active agent exists', () => {
      const state = {
        activeAgent: { id: 'agent-1', name: 'agent1' }
      } as any;
      
      expect(SSEStreamingDomain.getActiveAgentName(state)).toBe('agent1');
    });

    it('should return null when no active agent', () => {
      const state = {
        activeAgent: null
      } as any;
      
      expect(SSEStreamingDomain.getActiveAgentName(state)).toBeNull();
    });

    it('should return null when active agent has no name', () => {
      const state = {
        activeAgent: { id: 'agent-1' }
      } as any;
      
      expect(SSEStreamingDomain.getActiveAgentName(state)).toBeNull();
    });
  });

  describe('Streaming Lifecycle', () => {
    it('should support complete streaming workflow', () => {
      let state = mockState;
      
      // Start streaming
      state = SSEStreamingDomain.createStreamStartState(state, 'agent1');
      expect(state.activeAgent?.name).toBe('agent1');
      expect(state.isWaiting).toBe(true);
      expect(SSEStreamingDomain.isStreaming(state)).toBe(true);
      
      // Chunk received
      state = SSEStreamingDomain.createStreamChunkState(state);
      expect(state.needScroll).toBe(true);
      expect(SSEStreamingDomain.isStreaming(state)).toBe(true);
      
      // Stream ends
      state = SSEStreamingDomain.createStreamEndState(state);
      expect(state.activeAgent).toBeNull();
      expect(state.isWaiting).toBe(false);
      expect(SSEStreamingDomain.isStreaming(state)).toBe(false);
    });

    it('should handle streaming error', () => {
      let state = mockState;
      
      // Start streaming
      state = SSEStreamingDomain.createStreamStartState(state, 'agent1');
      expect(SSEStreamingDomain.isStreaming(state)).toBe(true);
      
      // Error occurs
      state = SSEStreamingDomain.createStreamErrorState(state, 'Network error');
      expect(state.activeAgent).toBeNull();
      expect(state.isWaiting).toBe(false);
      expect(state.error).toBe('Network error');
      expect(SSEStreamingDomain.isStreaming(state)).toBe(false);
    });

    it('should handle multiple chunks', () => {
      let state = mockState;
      
      // Start
      state = SSEStreamingDomain.createStreamStartState(state, 'agent1');
      
      // Multiple chunks
      state = SSEStreamingDomain.createStreamChunkState(state);
      expect(SSEStreamingDomain.isStreaming(state)).toBe(true);
      
      state = SSEStreamingDomain.createStreamChunkState(state);
      expect(SSEStreamingDomain.isStreaming(state)).toBe(true);
      
      state = SSEStreamingDomain.createStreamChunkState(state);
      expect(SSEStreamingDomain.isStreaming(state)).toBe(true);
      
      // End
      state = SSEStreamingDomain.createStreamEndState(state);
      expect(SSEStreamingDomain.isStreaming(state)).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle stream start with no world', () => {
      mockState.world = null;
      
      const result = SSEStreamingDomain.createStreamStartState(mockState, 'agent1');
      
      expect(result.activeAgent).toBeNull();
      expect(result.isWaiting).toBe(true);
    });

    it('should handle stream start with empty agents array', () => {
      mockState.world!.agents = [];
      
      const result = SSEStreamingDomain.createStreamStartState(mockState, 'agent1');
      
      expect(result.activeAgent).toBeNull();
      expect(result.isWaiting).toBe(true);
    });

    it('should handle very long error messages', () => {
      const longError = 'a'.repeat(10000);
      const result = SSEStreamingDomain.createStreamErrorState(mockState, longError);
      
      expect(result.error).toBe(longError);
    });

    it('should handle special characters in error messages', () => {
      const specialError = '<script>alert("xss")</script>';
      const result = SSEStreamingDomain.createStreamErrorState(mockState, specialError);
      
      expect(result.error).toBe(specialError);
    });

    it('should handle agent name with special characters', () => {
      mockState.world!.agents = [
        { id: 'agent-1', name: 'agent@#$%', spriteIndex: 0 }
      ] as any;
      
      const result = SSEStreamingDomain.createStreamStartState(mockState, 'agent@#$%');
      
      expect(result.activeAgent?.name).toBe('agent@#$%');
    });
  });
});
