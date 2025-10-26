/**
 * Input Domain Module Tests
 * 
 * Tests for user input handling, validation, and state transitions.
 */

import * as InputDomain from '../../web/src/domain/input';
import type { WorldComponentState } from '../../web/src/types';

describe('Input Domain Module', () => {
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
      
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]).toBe(userMessage);
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

  describe('Edge Cases', () => {
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
