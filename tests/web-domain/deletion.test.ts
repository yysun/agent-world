/**
 * Deletion Domain Module Tests
 * 
 * Tests for message deletion confirmation and state management.
 */

import * as DeletionDomain from '../../web/src/domain/deletion';
import type { WorldComponentState } from '../../web/src/types';

describe('Deletion Domain Module', () => {
  let mockState: WorldComponentState;

  beforeEach(() => {
    mockState = {
      worldName: 'test-world',
      world: null,
      messages: [{
        id: 'msg-123',
        messageId: 'backend-123',
        text: 'Test message',
        type: 'user',
        sender: 'human',
        createdAt: new Date()
      }] as any,
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
      currentChat: { id: 'chat-1', name: 'Test Chat' } as any,
      editingMessageId: null,
      editingText: '',
      messageToDelete: null,
      activeAgentFilters: []
    };
  });

  describe('showDeleteConfirmation', () => {
    it('should set messageToDelete when valid message exists', () => {
      const result = DeletionDomain.showDeleteConfirmation(
        mockState,
        'msg-123',
        'backend-123',
        'Test message',
        false
      );
      
      expect(result.messageToDelete).toEqual({
        id: 'msg-123',
        messageId: 'backend-123',
        chatId: 'chat-1'
      });
    });

    it('should return unchanged state when message not found', () => {
      const result = DeletionDomain.showDeleteConfirmation(
        mockState,
        'nonexistent',
        'backend-123',
        'Text',
        false
      );
      
      expect(result.messageToDelete).toBeNull();
    });

    it('should return unchanged state when message has no messageId', () => {
      mockState.messages = [{
        id: 'msg-123',
        text: 'Test',
        type: 'user',
        sender: 'human',
        createdAt: new Date()
      }] as any;
      
      const result = DeletionDomain.showDeleteConfirmation(
        mockState,
        'msg-123',
        'backend-123',
        'Test',
        false
      );
      
      expect(result.messageToDelete).toBeNull();
    });

    it('should return unchanged state when no currentChat', () => {
      mockState.currentChat = null;
      
      const result = DeletionDomain.showDeleteConfirmation(
        mockState,
        'msg-123',
        'backend-123',
        'Test message',
        false
      );
      
      expect(result.messageToDelete).toBeNull();
    });

    it('should preserve other state properties', () => {
      mockState.userInput = 'test input';
      mockState.loading = true;
      
      const result = DeletionDomain.showDeleteConfirmation(
        mockState,
        'msg-123',
        'backend-123',
        'Test message',
        false
      );
      
      expect(result.userInput).toBe('test input');
      expect(result.loading).toBe(true);
    });
  });

  describe('hideDeleteConfirmation', () => {
    it('should clear messageToDelete', () => {
      mockState.messageToDelete = {
        id: 'msg-123',
        messageId: 'backend-123',
        chatId: 'chat-1'
      };
      
      const result = DeletionDomain.hideDeleteConfirmation(mockState);
      
      expect(result.messageToDelete).toBeNull();
    });

    it('should preserve other state properties', () => {
      mockState.messageToDelete = {
        id: 'msg-123',
        messageId: 'backend-123',
        chatId: 'chat-1'
      };
      mockState.messages = [{ id: 'msg1' }] as any;
      mockState.userInput = 'input';
      
      const result = DeletionDomain.hideDeleteConfirmation(mockState);
      
      expect(result.messages).toEqual(mockState.messages);
      expect(result.userInput).toBe('input');
    });

    it('should work when messageToDelete is already null', () => {
      mockState.messageToDelete = null;
      
      const result = DeletionDomain.hideDeleteConfirmation(mockState);
      
      expect(result.messageToDelete).toBeNull();
    });
  });

  describe('canProceedWithDeletion', () => {
    it('should return true when messageToDelete is set', () => {
      const messageToDelete = {
        id: 'msg-123',
        messageId: 'backend-123',
        chatId: 'chat-1'
      };
      
      expect(DeletionDomain.canProceedWithDeletion(messageToDelete)).toBe(true);
    });

    it('should return false when messageToDelete is null', () => {
      expect(DeletionDomain.canProceedWithDeletion(null)).toBe(false);
    });
  });

  describe('createDeletionErrorState', () => {
    it('should set error and clear messageToDelete', () => {
      mockState.messageToDelete = {
        id: 'msg-123',
        messageId: 'backend-123',
        chatId: 'chat-1'
      };
      
      const result = DeletionDomain.createDeletionErrorState(
        mockState,
        'Delete failed'
      );
      
      expect(result.error).toBe('Delete failed');
      expect(result.messageToDelete).toBeNull();
    });

    it('should preserve other state properties', () => {
      mockState.messageToDelete = {
        id: 'msg-123',
        messageId: 'backend-123',
        chatId: 'chat-1'
      };
      mockState.messages = [{ id: 'msg1' }] as any;
      mockState.isSending = true;
      
      const result = DeletionDomain.createDeletionErrorState(
        mockState,
        'Error'
      );
      
      expect(result.messages).toEqual(mockState.messages);
      expect(result.isSending).toBe(true);
    });
  });

  describe('createDeletionSuccessState', () => {
    it('should clear messageToDelete', () => {
      mockState.messageToDelete = {
        id: 'msg-123',
        messageId: 'backend-123',
        chatId: 'chat-1'
      };
      
      const result = DeletionDomain.createDeletionSuccessState(mockState);
      
      expect(result.messageToDelete).toBeNull();
    });

    it('should preserve other state properties', () => {
      mockState.messageToDelete = {
        id: 'msg-123',
        messageId: 'backend-123',
        chatId: 'chat-1'
      };
      mockState.messages = [{ id: 'msg1' }] as any;
      mockState.error = 'previous error';
      
      const result = DeletionDomain.createDeletionSuccessState(mockState);
      
      expect(result.messages).toEqual(mockState.messages);
      expect(result.error).toBe('previous error');
    });
  });

  describe('Deletion Flow', () => {
    it('should support complete deletion workflow', () => {
      let state = mockState;
      
      // Show confirmation
      state = DeletionDomain.showDeleteConfirmation(
        state,
        'msg-123',
        'backend-123',
        'Test message',
        false
      );
      expect(state.messageToDelete).not.toBeNull();
      expect(DeletionDomain.canProceedWithDeletion(state.messageToDelete)).toBe(true);
      
      // Success
      state = DeletionDomain.createDeletionSuccessState(state);
      expect(state.messageToDelete).toBeNull();
    });

    it('should handle deletion cancellation', () => {
      let state = mockState;
      
      // Show confirmation
      state = DeletionDomain.showDeleteConfirmation(
        state,
        'msg-123',
        'backend-123',
        'Test message',
        false
      );
      expect(state.messageToDelete).not.toBeNull();
      
      // Cancel
      state = DeletionDomain.hideDeleteConfirmation(state);
      expect(state.messageToDelete).toBeNull();
    });

    it('should handle deletion error', () => {
      let state = mockState;
      
      // Show confirmation
      state = DeletionDomain.showDeleteConfirmation(
        state,
        'msg-123',
        'backend-123',
        'Test message',
        false
      );
      expect(state.messageToDelete).not.toBeNull();
      
      // Error occurs
      state = DeletionDomain.createDeletionErrorState(state, 'Network error');
      expect(state.messageToDelete).toBeNull();
      expect(state.error).toBe('Network error');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long message text in confirmation', () => {
      const longText = 'a'.repeat(10000);
      const result = DeletionDomain.showDeleteConfirmation(
        mockState,
        'msg-123',
        'backend-123',
        longText,
        false
      );
      
      expect(result.messageToDelete).not.toBeNull();
    });

    it('should handle special characters in message text', () => {
      const specialText = '<script>alert("xss")</script>';
      const result = DeletionDomain.showDeleteConfirmation(
        mockState,
        'msg-123',
        'backend-123',
        specialText,
        false
      );
      
      expect(result.messageToDelete).not.toBeNull();
    });

    it('should handle multiple messages with same frontend id', () => {
      mockState.messages = [
        {
          id: 'msg-123',
          messageId: 'backend-1',
          text: 'First',
          type: 'user',
          sender: 'human',
          createdAt: new Date()
        },
        {
          id: 'msg-123', // Duplicate ID (shouldn't happen but test defensive code)
          messageId: 'backend-2',
          text: 'Second',
          type: 'user',
          sender: 'human',
          createdAt: new Date()
        }
      ] as any;
      
      const result = DeletionDomain.showDeleteConfirmation(
        mockState,
        'msg-123',
        'backend-1',
        'First',
        false
      );
      
      // Should find first matching message
      expect(result.messageToDelete).not.toBeNull();
      expect(result.messageToDelete?.messageId).toBe('backend-1');
    });
  });
});
