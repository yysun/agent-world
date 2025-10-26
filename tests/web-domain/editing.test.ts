/**
 * Editing Domain Module Tests
 * 
 * Tests for message editing state management and validation.
 */

import * as EditingDomain from '../../web/src/domain/editing';
import type { WorldComponentState } from '../../web/src/types';

describe('Editing Domain Module', () => {
  let mockState: WorldComponentState;

  beforeEach(() => {
    mockState = {
      worldName: 'test-world',
      world: null,
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

  describe('startEditMessage', () => {
    it('should set editing state with messageId and text', () => {
      const result = EditingDomain.startEditMessage(mockState, 'msg-123', 'Original text');
      
      expect(result.editingMessageId).toBe('msg-123');
      expect(result.editingText).toBe('Original text');
    });

    it('should preserve other state properties', () => {
      mockState.worldName = 'my-world';
      mockState.messages = [{ id: 'msg1' }] as any;
      
      const result = EditingDomain.startEditMessage(mockState, 'msg-123', 'Text');
      
      expect(result.worldName).toBe('my-world');
      expect(result.messages).toEqual(mockState.messages);
    });

    it('should handle empty text', () => {
      const result = EditingDomain.startEditMessage(mockState, 'msg-123', '');
      
      expect(result.editingMessageId).toBe('msg-123');
      expect(result.editingText).toBe('');
    });

    it('should override previous editing state', () => {
      mockState.editingMessageId = 'old-msg';
      mockState.editingText = 'old text';
      
      const result = EditingDomain.startEditMessage(mockState, 'new-msg', 'new text');
      
      expect(result.editingMessageId).toBe('new-msg');
      expect(result.editingText).toBe('new text');
    });
  });

  describe('cancelEditMessage', () => {
    it('should clear editing state', () => {
      mockState.editingMessageId = 'msg-123';
      mockState.editingText = 'Some text';
      
      const result = EditingDomain.cancelEditMessage(mockState);
      
      expect(result.editingMessageId).toBeNull();
      expect(result.editingText).toBe('');
    });

    it('should preserve other state properties', () => {
      mockState.editingMessageId = 'msg-123';
      mockState.editingText = 'Text';
      mockState.userInput = 'User input';
      mockState.messages = [{ id: 'msg1' }] as any;
      
      const result = EditingDomain.cancelEditMessage(mockState);
      
      expect(result.userInput).toBe('User input');
      expect(result.messages).toEqual(mockState.messages);
    });

    it('should work when no editing is active', () => {
      mockState.editingMessageId = null;
      mockState.editingText = '';
      
      const result = EditingDomain.cancelEditMessage(mockState);
      
      expect(result.editingMessageId).toBeNull();
      expect(result.editingText).toBe('');
    });
  });

  describe('updateEditText', () => {
    it('should update editingText with provided value', () => {
      mockState.editingMessageId = 'msg-123';
      mockState.editingText = 'Original';
      
      const result = EditingDomain.updateEditText(mockState, 'Updated text');
      
      expect(result.editingText).toBe('Updated text');
    });

    it('should preserve editingMessageId', () => {
      mockState.editingMessageId = 'msg-123';
      
      const result = EditingDomain.updateEditText(mockState, 'New text');
      
      expect(result.editingMessageId).toBe('msg-123');
    });

    it('should handle empty string', () => {
      mockState.editingText = 'Some text';
      
      const result = EditingDomain.updateEditText(mockState, '');
      
      expect(result.editingText).toBe('');
    });

    it('should handle incremental updates', () => {
      let state = mockState;
      state.editingMessageId = 'msg-123';
      
      state = EditingDomain.updateEditText(state, 'H');
      expect(state.editingText).toBe('H');
      
      state = EditingDomain.updateEditText(state, 'He');
      expect(state.editingText).toBe('He');
      
      state = EditingDomain.updateEditText(state, 'Hello');
      expect(state.editingText).toBe('Hello');
    });
  });

  describe('isEditTextValid', () => {
    it('should return true for valid text', () => {
      expect(EditingDomain.isEditTextValid('Hello world')).toBe(true);
      expect(EditingDomain.isEditTextValid('a')).toBe(true);
    });

    it('should return false for empty or whitespace-only text', () => {
      expect(EditingDomain.isEditTextValid('')).toBe(false);
      expect(EditingDomain.isEditTextValid('   ')).toBe(false);
      expect(EditingDomain.isEditTextValid('\n\t')).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(EditingDomain.isEditTextValid(undefined)).toBe(false);
    });

    it('should trim whitespace when validating', () => {
      expect(EditingDomain.isEditTextValid('  Hello  ')).toBe(true);
      expect(EditingDomain.isEditTextValid('\nHello\n')).toBe(true);
    });
  });

  describe('Edit Lifecycle', () => {
    it('should support complete edit workflow', () => {
      let state = mockState;
      
      // Start editing
      state = EditingDomain.startEditMessage(state, 'msg-123', 'Original text');
      expect(state.editingMessageId).toBe('msg-123');
      expect(state.editingText).toBe('Original text');
      
      // Update text
      state = EditingDomain.updateEditText(state, 'Modified text');
      expect(state.editingText).toBe('Modified text');
      
      // Validate
      expect(EditingDomain.isEditTextValid(state.editingText)).toBe(true);
      
      // Cancel
      state = EditingDomain.cancelEditMessage(state);
      expect(state.editingMessageId).toBeNull();
      expect(state.editingText).toBe('');
    });

    it('should handle edit-cancel-edit sequence', () => {
      let state = mockState;
      
      // First edit
      state = EditingDomain.startEditMessage(state, 'msg-1', 'Text 1');
      expect(state.editingMessageId).toBe('msg-1');
      
      // Cancel
      state = EditingDomain.cancelEditMessage(state);
      expect(state.editingMessageId).toBeNull();
      
      // Second edit
      state = EditingDomain.startEditMessage(state, 'msg-2', 'Text 2');
      expect(state.editingMessageId).toBe('msg-2');
      expect(state.editingText).toBe('Text 2');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long text', () => {
      const longText = 'a'.repeat(100000);
      const result = EditingDomain.updateEditText(mockState, longText);
      
      expect(result.editingText).toBe(longText);
      expect(EditingDomain.isEditTextValid(longText)).toBe(true);
    });

    it('should handle special characters', () => {
      const specialText = '<script>alert("xss")</script> @mention #tag';
      const result = EditingDomain.updateEditText(mockState, specialText);
      
      expect(result.editingText).toBe(specialText);
      expect(EditingDomain.isEditTextValid(specialText)).toBe(true);
    });

    it('should handle unicode characters', () => {
      const unicodeText = '你好 🚀 مرحبا Здравствуйте';
      const result = EditingDomain.updateEditText(mockState, unicodeText);
      
      expect(result.editingText).toBe(unicodeText);
      expect(EditingDomain.isEditTextValid(unicodeText)).toBe(true);
    });

    it('should handle newlines and formatting', () => {
      const multilineText = 'Line 1\nLine 2\n\nLine 4';
      const result = EditingDomain.updateEditText(mockState, multilineText);
      
      expect(result.editingText).toBe(multilineText);
      expect(EditingDomain.isEditTextValid(multilineText)).toBe(true);
    });
  });
});
