/**
 * Message Display Domain Module Tests
 * 
 * Tests for message UI state management and display operations.
 */

import * as MessageDisplayDomain from '../../web/src/domain/message-display';
import type { WorldComponentState, Message } from '../../web/src/types';

describe('Message Display Domain Module', () => {
  let mockState: WorldComponentState;
  let mockMessages: Message[];

  beforeEach(() => {
    mockMessages = [
      {
        id: 'msg-1',
        sender: 'TestAgent',
        text: 'Hello world',
        type: 'agent',
        createdAt: new Date(),
        isLogExpanded: false,
        logEvent: {
          level: 'info',
          category: 'test',
          message: 'Test log',
          timestamp: new Date().toISOString(),
          messageId: 'msg-1'
        }
      },
      {
        id: 'msg-2',
        sender: 'human',
        text: 'Hi there',
        type: 'user',
        createdAt: new Date(),
        isLogExpanded: true
      },
      {
        id: 'msg-3',
        sender: 'AnotherAgent',
        text: 'Good morning',
        type: 'agent',
        createdAt: new Date(),
        isToolEvent: true,
        expandable: true,
        toolExecution: {
          toolName: 'test-tool',
          toolCallId: 'call-123',
          phase: 'completed',
          input: { param: 'value' },
          result: { success: true }
        }
      }
    ];

    mockState = {
      worldName: 'test-world',
      world: null,
      messages: [...mockMessages],
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
      chatToDelete: null,
      connectionStatus: 'connected',
      needScroll: true,
      currentChat: null,
      editingMessageId: null,
      editingText: '',
      messageToDelete: null,
      activeAgentFilters: []
    };
  });

  describe('toggleLogDetails', () => {
    it('should toggle log expansion for specified message', () => {
      const result = MessageDisplayDomain.toggleLogDetails(mockState, 'msg-1');

      expect(result.messages[0].isLogExpanded).toBe(true); // Was false, now true
      expect(result.messages[1].isLogExpanded).toBe(true); // Unchanged
      expect(result.messages[2].isLogExpanded).toBeUndefined(); // Unchanged
      expect(result.needScroll).toBe(false); // Should not trigger scroll
    });

    it('should collapse already expanded log', () => {
      const result = MessageDisplayDomain.toggleLogDetails(mockState, 'msg-2');

      expect(result.messages[1].isLogExpanded).toBe(false); // Was true, now false
      expect(result.messages[0].isLogExpanded).toBe(false); // Unchanged
    });

    it('should handle string messageId', () => {
      const result = MessageDisplayDomain.toggleLogDetails(mockState, 'msg-1');

      expect(result.messages[0].isLogExpanded).toBe(true);
    });

    it('should handle numeric messageId', () => {
      const result = MessageDisplayDomain.toggleLogDetails(mockState, 1);

      // Should not match any message since IDs are strings
      expect(result.messages[0].isLogExpanded).toBe(false);
      expect(result.messages[1].isLogExpanded).toBe(true);
      expect(result.needScroll).toBe(false); // State changed but no message matched
    });

    it('should handle non-existent messageId', () => {
      const result = MessageDisplayDomain.toggleLogDetails(mockState, 'non-existent');

      expect(result.messages[0].isLogExpanded).toBe(false); // Unchanged
      expect(result.messages[1].isLogExpanded).toBe(true); // Unchanged
      expect(result.needScroll).toBe(false);
    });

    it('should handle empty messageId', () => {
      const result = MessageDisplayDomain.toggleLogDetails(mockState, '');

      expect(result).toBe(mockState); // State unchanged
    });

    it('should handle null/undefined messageId', () => {
      const resultNull = MessageDisplayDomain.toggleLogDetails(mockState, null as any);
      const resultUndefined = MessageDisplayDomain.toggleLogDetails(mockState, undefined as any);

      expect(resultNull).toBe(mockState);
      expect(resultUndefined).toBe(mockState);
    });

    it('should handle state with no messages', () => {
      const stateWithNoMessages = { ...mockState, messages: [] };
      const result = MessageDisplayDomain.toggleLogDetails(stateWithNoMessages, 'msg-1');

      expect(result.messages).toEqual([]);
      expect(result.needScroll).toBe(false);
    });

    it('should handle state with null messages', () => {
      const stateWithNullMessages = { ...mockState, messages: null as any };
      const result = MessageDisplayDomain.toggleLogDetails(stateWithNullMessages, 'msg-1');

      expect(result).toBe(stateWithNullMessages); // State unchanged
    });
  });

  describe('acknowledgeScroll', () => {
    it('should set needScroll to false', () => {
      const result = MessageDisplayDomain.acknowledgeScroll(mockState);

      expect(result.needScroll).toBe(false);
      expect(result.worldName).toBe('test-world'); // Other state unchanged
    });

    it('should work when needScroll is already false', () => {
      const stateWithNoScroll = { ...mockState, needScroll: false };
      const result = MessageDisplayDomain.acknowledgeScroll(stateWithNoScroll);

      expect(result.needScroll).toBe(false);
    });
  });

  describe('Helper Functions', () => {
    describe('findMessageById', () => {
      it('should find message by string ID', () => {
        const result = MessageDisplayDomain.findMessageById(mockMessages, 'msg-2');

        expect(result).toBe(mockMessages[1]);
        expect(result?.sender).toBe('human');
      });

      it('should find message by numeric ID (with string conversion)', () => {
        const messagesWithNumericIds = [
          { ...mockMessages[0], id: '1' },
          { ...mockMessages[1], id: '2' }
        ];

        const result = MessageDisplayDomain.findMessageById(messagesWithNumericIds, 2);

        expect(result).toBe(messagesWithNumericIds[1]);
      });

      it('should return undefined for non-existent ID', () => {
        const result = MessageDisplayDomain.findMessageById(mockMessages, 'non-existent');

        expect(result).toBeUndefined();
      });

      it('should handle empty messages array', () => {
        const result = MessageDisplayDomain.findMessageById([], 'msg-1');

        expect(result).toBeUndefined();
      });
    });

    describe('updateMessageLogExpansion', () => {
      it('should update message log expansion state', () => {
        const message = mockMessages[0];
        const result = MessageDisplayDomain.updateMessageLogExpansion(message, true);

        expect(result.isLogExpanded).toBe(true);
        expect(result.id).toBe(message.id); // Other properties preserved
        expect(result.sender).toBe(message.sender);
      });

      it('should not mutate original message', () => {
        const message = mockMessages[0];
        const original = { ...message };

        MessageDisplayDomain.updateMessageLogExpansion(message, true);

        expect(message).toEqual(original);
      });
    });

    describe('toggleMessageLogExpansion', () => {
      it('should toggle from false to true', () => {
        const message = { ...mockMessages[0], isLogExpanded: false };
        const result = MessageDisplayDomain.toggleMessageLogExpansion(message);

        expect(result.isLogExpanded).toBe(true);
      });

      it('should toggle from true to false', () => {
        const message = { ...mockMessages[1], isLogExpanded: true };
        const result = MessageDisplayDomain.toggleMessageLogExpansion(message);

        expect(result.isLogExpanded).toBe(false);
      });

      it('should handle undefined initial state', () => {
        const message = { ...mockMessages[0] };
        delete (message as any).isLogExpanded;

        const result = MessageDisplayDomain.toggleMessageLogExpansion(message);

        expect(result.isLogExpanded).toBe(true); // !undefined = true
      });
    });

    describe('hasExpandableContent', () => {
      it('should return true for message with expandable flag', () => {
        const message = { ...mockMessages[0], expandable: true };
        const result = MessageDisplayDomain.hasExpandableContent(message);

        expect(result).toBe(true);
      });

      it('should return true for tool event message', () => {
        const message = mockMessages[2]; // Has isToolEvent: true
        const result = MessageDisplayDomain.hasExpandableContent(message);

        expect(result).toBe(true);
      });

      it('should return true for message with log event', () => {
        const message = mockMessages[0]; // Has logEvent
        const result = MessageDisplayDomain.hasExpandableContent(message);

        expect(result).toBe(true);
      });

      it('should return false for message without expandable content', () => {
        const message = { ...mockMessages[1] }; // Basic user message
        delete (message as any).logEvent;

        const result = MessageDisplayDomain.hasExpandableContent(message);

        expect(result).toBe(false);
      });
    });

    describe('updateMessages', () => {
      const updateFn = (msg: Message) => ({ ...msg, isLogExpanded: !msg.isLogExpanded });
      const predicate = (msg: Message) => msg.type === 'agent';

      it('should update messages matching predicate', () => {
        const result = MessageDisplayDomain.updateMessages(mockMessages, updateFn, predicate);

        expect(result[0].isLogExpanded).toBe(true); // Was false, agent message
        expect(result[1].isLogExpanded).toBe(true); // Unchanged, user message
        expect(result[2].isLogExpanded).toBe(true); // Was undefined, agent message -> true
      });

      it('should not mutate original messages', () => {
        const original = [...mockMessages];

        MessageDisplayDomain.updateMessages(mockMessages, updateFn, predicate);

        expect(mockMessages).toEqual(original);
      });

      it('should handle empty messages array', () => {
        const result = MessageDisplayDomain.updateMessages([], updateFn, predicate);

        expect(result).toEqual([]);
      });
    });

    describe('updateScrollState', () => {
      it('should update needScroll flag', () => {
        const result = MessageDisplayDomain.updateScrollState(mockState, false);

        expect(result.needScroll).toBe(false);
        expect(result.worldName).toBe('test-world'); // Other state preserved
      });

      it('should set needScroll to true', () => {
        const stateWithNoScroll = { ...mockState, needScroll: false };
        const result = MessageDisplayDomain.updateScrollState(stateWithNoScroll, true);

        expect(result.needScroll).toBe(true);
      });
    });

    describe('updateMessagesWithScroll', () => {
      it('should update messages and scroll state', () => {
        const newMessages = [mockMessages[0]]; // Subset of messages
        const result = MessageDisplayDomain.updateMessagesWithScroll(mockState, newMessages, true);

        expect(result.messages).toBe(newMessages);
        expect(result.needScroll).toBe(true);
        expect(result.worldName).toBe('test-world'); // Other state preserved
      });

      it('should default needScroll to false', () => {
        const newMessages = [mockMessages[0]];
        const result = MessageDisplayDomain.updateMessagesWithScroll(mockState, newMessages);

        expect(result.messages).toBe(newMessages);
        expect(result.needScroll).toBe(false);
      });

      it('should handle empty messages array', () => {
        const result = MessageDisplayDomain.updateMessagesWithScroll(mockState, [], false);

        expect(result.messages).toEqual([]);
        expect(result.needScroll).toBe(false);
      });
    });
  });
});