/**
 * User Actions Domain Tests - Consolidated
 * 
 * Tests for user interaction state management including:
 * - Message input handling and validation
 * - Message editing workflows
 * - Message deletion confirmations
 * 
 * Consolidates:
 * - input.test.ts (21 tests)
 * - editing.test.ts (21 tests) 
 * - deletion.test.ts (20 tests)
 */

import { describe, test, it, expect, beforeEach } from 'vitest';
import * as InputDomain from '../../web/src/domain/input';
import * as EditingDomain from '../../web/src/domain/editing';
import * as DeletionDomain from '../../web/src/domain/deletion';
import type { WorldComponentState } from '../../web/src/types';

describe('User Actions Domain', () => {
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
      agentActivities: {},
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

  describe('Input Handling', () => {
    describe('updateInput', () => {
      it('should update userInput with provided value', () => {
        const result = InputDomain.updateInput(mockState, 'Hello world');
        expect(result.userInput).toBe('Hello world');
        expect(result.worldName).toBe('test-world'); // Other state unchanged
      });

      it('should handle empty string', () => {
        const result = InputDomain.updateInput(mockState, '');
        expect(result.userInput).toBe('');
      });

      it('should handle whitespace-only input', () => {
        const result = InputDomain.updateInput(mockState, '   ');
        expect(result.userInput).toBe('   ');
      });
    });

    describe('shouldSendOnEnter', () => {
      it('should return true when Enter pressed with valid input', () => {
        expect(InputDomain.shouldSendOnEnter('Enter', 'Hello')).toBe(true);
        expect(InputDomain.shouldSendOnEnter('Enter', '  Hello  ')).toBe(true);
      });

      it('should return false when Enter pressed with empty input', () => {
        expect(InputDomain.shouldSendOnEnter('Enter', '')).toBe(false);
        expect(InputDomain.shouldSendOnEnter('Enter', '   ')).toBe(false);
      });

      it('should return false when non-Enter key pressed', () => {
        expect(InputDomain.shouldSendOnEnter('a', 'Hello')).toBe(false);
        expect(InputDomain.shouldSendOnEnter('Escape', 'Hello')).toBe(false);
      });

      it('should handle undefined input', () => {
        expect(InputDomain.shouldSendOnEnter('Enter', undefined)).toBe(false);
      });
    });

    describe('validateAndPrepareMessage', () => {
      it('should prepare valid message', () => {
        const result = InputDomain.validateAndPrepareMessage('Hello world', 'test-world');

        expect(result).not.toBeNull();
        expect(result!.text).toBe('Hello world');
        expect(result!.message.text).toBe('Hello world');
        expect(result!.message.sender).toBe('human');
        expect(result!.message.type).toBe('user');
        expect(result!.message.userEntered).toBe(true);
        expect(result!.message.worldName).toBe('test-world');
        expect(result!.message.id).toMatch(/^user-/);
        expect(result!.message.createdAt).toBeInstanceOf(Date);
      });

      it('should trim whitespace from input', () => {
        const result = InputDomain.validateAndPrepareMessage('  Hello  ', 'test-world');
        expect(result!.text).toBe('Hello');
        expect(result!.message.text).toBe('Hello');
      });

      it('should return null for empty input', () => {
        expect(InputDomain.validateAndPrepareMessage('', 'test-world')).toBeNull();
        expect(InputDomain.validateAndPrepareMessage('   ', 'test-world')).toBeNull();
      });

      it('should return null for undefined input', () => {
        expect(InputDomain.validateAndPrepareMessage(undefined, 'test-world')).toBeNull();
      });

      it('should generate unique message IDs', () => {
        const result1 = InputDomain.validateAndPrepareMessage('Hello', 'test-world');
        const result2 = InputDomain.validateAndPrepareMessage('World', 'test-world');
        expect(result1!.message.id).not.toBe(result2!.message.id);
      });
    });

    describe('createSendingState', () => {
      it('should add message and set sending flags', () => {
        const userMessage = {
          id: 'user-123',
          sender: 'human',
          text: 'Hello',
          createdAt: new Date(),
          type: 'user',
          userEntered: true,
          worldName: 'test-world'
        };

        const result = InputDomain.createSendingState(mockState, userMessage);

        expect(result.messages).toHaveLength(2); // Already has one message
        expect(result.messages[1]).toBe(userMessage);
        expect(result.userInput).toBe('');
        expect(result.isSending).toBe(true);
        expect(result.isWaiting).toBe(true);
        expect(result.needScroll).toBe(true);
      });

      it('should append to existing messages', () => {
        mockState.messages = [{ id: 'msg1', text: 'Previous', type: 'user', sender: 'human', createdAt: new Date() }] as any;

        const userMessage = {
          id: 'user-123',
          sender: 'human',
          text: 'Hello',
          createdAt: new Date(),
          type: 'user',
          userEntered: true,
          worldName: 'test-world'
        };

        const result = InputDomain.createSendingState(mockState, userMessage);
        expect(result.messages).toHaveLength(2);
        expect(result.messages[0].id).toBe('msg1');
        expect(result.messages[1]).toBe(userMessage);
      });
    });

    describe('createSentState', () => {
      it('should clear isSending flag', () => {
        mockState.isSending = true;
        mockState.isWaiting = true;

        const result = InputDomain.createSentState(mockState);
        expect(result.isSending).toBe(false);
        expect(result.isWaiting).toBe(true); // Should remain true until stream ends
      });

      it('should preserve other state', () => {
        mockState.isSending = true;
        mockState.messages = [{ id: 'msg1' }] as any;
        mockState.userInput = 'test';

        const result = InputDomain.createSentState(mockState);
        expect(result.messages).toEqual(mockState.messages);
        expect(result.userInput).toBe('test');
      });
    });

    describe('createSendErrorState', () => {
      it('should set error and clear sending flags', () => {
        mockState.isSending = true;
        mockState.isWaiting = true;

        const result = InputDomain.createSendErrorState(mockState, 'Network error');
        expect(result.isSending).toBe(false);
        expect(result.isWaiting).toBe(false);
        expect(result.error).toBe('Network error');
      });

      it('should preserve messages', () => {
        mockState.messages = [{ id: 'msg1' }, { id: 'msg2' }] as any;
        const result = InputDomain.createSendErrorState(mockState, 'Error occurred');
        expect(result.messages).toEqual(mockState.messages);
      });
    });

    describe('Input Edge Cases', () => {
      it('should handle very long input text', () => {
        const longText = 'a'.repeat(10000);
        const result = InputDomain.validateAndPrepareMessage(longText, 'test-world');
        expect(result!.text).toBe(longText);
        expect(result!.message.text).toBe(longText);
      });

      it('should handle special characters in input', () => {
        const specialText = '@agent1 Hello! <script>alert("test")</script>';
        const result = InputDomain.validateAndPrepareMessage(specialText, 'test-world');
        expect(result!.text).toBe(specialText);
      });

      it('should handle unicode characters', () => {
        const unicodeText = '你好世界 🚀 مرحبا';
        const result = InputDomain.validateAndPrepareMessage(unicodeText, 'test-world');
        expect(result!.text).toBe(unicodeText);
      });
    });
  });

  describe('Message Editing', () => {
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

    describe('Editing Edge Cases', () => {
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

  describe('Message Deletion', () => {
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

    describe('Deletion Edge Cases', () => {
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
});
