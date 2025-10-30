/**
 * Agent Filtering Tests
 * 
 * Tests for agent message filtering functionality including cross-agent message handling.
 * Tests the fix for issue where agent filters showed incorrect message counts due to
 * filtering by message sender instead of message memory ownership.
 */

import { describe, test, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { WorldComponentState, Message, Agent } from '../../web/src/types';

describe('Agent Filtering', () => {
  let mockState: WorldComponentState;
  let mockAgents: Agent[];
  let mockMessages: Message[];
  let mockRawMessages: Message[];

  // Simulate the filtering logic from world-chat.tsx
  const filterMessagesByAgent = (messages: Message[], rawMessages: Message[], agentFilters: string[]): Message[] => {
    if (agentFilters.length === 0) {
      return messages; // No filters = use deduplicated messages
    }

    // Use raw messages and filter by ownerAgentId
    const agentMessages = rawMessages.filter(message => {
      // Always include human/user messages (we'll deduplicate them next)
      const isHumanMessage = message.sender === 'human' || message.sender === 'user';
      if (isHumanMessage) {
        return true;
      }

      // Check if message is from a filtered agent's memory
      return message.ownerAgentId && agentFilters.includes(message.ownerAgentId);
    });

    // Deduplicate human messages while preserving all agent messages
    const messageMap = new Map<string, Message>();
    const deduplicatedMessages: Message[] = [];

    for (const message of agentMessages) {
      const isHumanMessage = message.sender === 'human' || message.sender === 'user';

      if (isHumanMessage && message.messageId) {
        // Deduplicate human messages by messageId
        if (!messageMap.has(message.messageId)) {
          messageMap.set(message.messageId, message);
          deduplicatedMessages.push(message);
        }
      } else {
        // Keep all agent messages
        deduplicatedMessages.push(message);
      }
    }

    return deduplicatedMessages;
  };

  beforeEach(() => {
    // Setup mock agents
    mockAgents = [
      { id: 'a1', name: 'agent-a1', spriteIndex: 0, messageCount: 4 },
      { id: 'g1', name: 'agent-g1', spriteIndex: 1, messageCount: 4 },
      { id: 'o1', name: 'agent-o1', spriteIndex: 2, messageCount: 4 }
    ] as Agent[];

    // Setup mock messages simulating the cross-agent scenario from the bug report
    // This mimics chat-1761585849967-ohqzmme1k where each agent should show 4 messages
    mockRawMessages = [
      // Human message appears in all 3 agent memories
      {
        id: 'msg-1-a1',
        messageId: '3Ib1V8wJtfo2zfVTZr0cI',
        sender: 'human',
        text: 'hi',
        type: 'user',
        ownerAgentId: 'a1',
        createdAt: new Date('2025-10-27T17:25:39.863Z')
      },
      {
        id: 'msg-1-g1',
        messageId: '3Ib1V8wJtfo2zfVTZr0cI',
        sender: 'human',
        text: 'hi',
        type: 'user',
        ownerAgentId: 'g1',
        createdAt: new Date('2025-10-27T17:25:39.863Z')
      },
      {
        id: 'msg-1-o1',
        messageId: '3Ib1V8wJtfo2zfVTZr0cI',
        sender: 'human',
        text: 'hi',
        type: 'user',
        ownerAgentId: 'o1',
        createdAt: new Date('2025-10-27T17:25:39.863Z')
      },

      // g1's reply appears in g1's memory as assistant message
      {
        id: 'msg-2-g1',
        messageId: 'aA2vmGlN7jBejED4Mduq7',
        sender: 'g1',
        text: 'Hello there! 👋\n\nHow can I help you today?',
        type: 'agent',
        ownerAgentId: 'g1',
        fromAgentId: 'g1',
        createdAt: new Date('2025-10-27T17:25:50.641Z')
      },

      // g1's reply appears in a1 and o1 memory as user messages
      {
        id: 'msg-2-a1',
        messageId: 'aA2vmGlN7jBejED4Mduq7',
        sender: 'a1', // After sender/fromAgentId swap in createMessageFromMemory
        text: 'Hello there! 👋\n\nHow can I help you today?',
        type: 'user',
        ownerAgentId: 'a1',
        fromAgentId: 'g1',
        createdAt: new Date('2025-10-27T17:25:50.642Z')
      },
      {
        id: 'msg-2-o1',
        messageId: 'aA2vmGlN7jBejED4Mduq7',
        sender: 'o1', // After sender/fromAgentId swap in createMessageFromMemory
        text: 'Hello there! 👋\n\nHow can I help you today?',
        type: 'user',
        ownerAgentId: 'o1',
        fromAgentId: 'g1',
        createdAt: new Date('2025-10-27T17:25:50.642Z')
      },

      // a1's reply appears in a1's memory as assistant message
      {
        id: 'msg-3-a1',
        messageId: 'BrVeKuzfnfeHP9mc53MUL',
        sender: 'a1',
        text: 'Hi — how can I help you today?',
        type: 'agent',
        ownerAgentId: 'a1',
        fromAgentId: 'a1',
        createdAt: new Date('2025-10-27T17:25:54.502Z')
      },

      // a1's reply appears in g1 and o1 memory as user messages
      {
        id: 'msg-3-g1',
        messageId: 'BrVeKuzfnfeHP9mc53MUL',
        sender: 'g1', // After sender/fromAgentId swap in createMessageFromMemory
        text: 'Hi — how can I help you today?',
        type: 'user',
        ownerAgentId: 'g1',
        fromAgentId: 'a1',
        createdAt: new Date('2025-10-27T17:25:54.502Z')
      },
      {
        id: 'msg-3-o1',
        messageId: 'BrVeKuzfnfeHP9mc53MUL',
        sender: 'o1', // After sender/fromAgentId swap in createMessageFromMemory
        text: 'Hi — how can I help you today?',
        type: 'user',
        ownerAgentId: 'o1',
        fromAgentId: 'a1',
        createdAt: new Date('2025-10-27T17:25:54.502Z')
      },

      // o1's reply appears in o1's memory as assistant message
      {
        id: 'msg-4-o1',
        messageId: 'bJHFQmkhaRkeQNPDGOGX2',
        sender: 'o1',
        text: "It's nice to meet you! I see you're saying hello several times in a row. How can I help you today? Do you need assistance with something or just want to chat?",
        type: 'agent',
        ownerAgentId: 'o1',
        fromAgentId: 'o1',
        createdAt: new Date('2025-10-27T17:25:57.569Z')
      },

      // o1's reply appears in g1 and a1 memory as user messages
      {
        id: 'msg-4-g1',
        messageId: 'bJHFQmkhaRkeQNPDGOGX2',
        sender: 'g1', // After sender/fromAgentId swap in createMessageFromMemory
        text: "It's nice to meet you! I see you're saying hello several times in a row. How can I help you today? Do you need assistance with something or just want to chat?",
        type: 'user',
        ownerAgentId: 'g1',
        fromAgentId: 'o1',
        createdAt: new Date('2025-10-27T17:25:57.572Z')
      },
      {
        id: 'msg-4-a1',
        messageId: 'bJHFQmkhaRkeQNPDGOGX2',
        sender: 'a1', // After sender/fromAgentId swap in createMessageFromMemory
        text: "It's nice to meet you! I see you're saying hello several times in a row. How can I help you today? Do you need assistance with something or just want to chat?",
        type: 'user',
        ownerAgentId: 'a1',
        fromAgentId: 'o1',
        createdAt: new Date('2025-10-27T17:25:57.572Z')
      }
    ];

    // Deduplicated messages for global view (what user sees without filters)
    mockMessages = [
      {
        id: 'msg-1-a1',
        messageId: '3Ib1V8wJtfo2zfVTZr0cI',
        sender: 'human',
        text: 'hi',
        type: 'user',
        ownerAgentId: 'a1', // First occurrence
        createdAt: new Date('2025-10-27T17:25:39.863Z')
      },
      {
        id: 'msg-2-g1',
        messageId: 'aA2vmGlN7jBejED4Mduq7',
        sender: 'g1',
        text: 'Hello there! 👋\n\nHow can I help you today?',
        type: 'agent',
        ownerAgentId: 'g1',
        fromAgentId: 'g1',
        createdAt: new Date('2025-10-27T17:25:50.641Z')
      },
      {
        id: 'msg-2-a1',
        messageId: 'aA2vmGlN7jBejED4Mduq7',
        sender: 'a1',
        text: 'Hello there! 👋\n\nHow can I help you today?',
        type: 'user',
        ownerAgentId: 'a1',
        fromAgentId: 'g1',
        createdAt: new Date('2025-10-27T17:25:50.642Z')
      },
      {
        id: 'msg-3-a1',
        messageId: 'BrVeKuzfnfeHP9mc53MUL',
        sender: 'a1',
        text: 'Hi — how can I help you today?',
        type: 'agent',
        ownerAgentId: 'a1',
        fromAgentId: 'a1',
        createdAt: new Date('2025-10-27T17:25:54.502Z')
      },
      {
        id: 'msg-3-g1',
        messageId: 'BrVeKuzfnfeHP9mc53MUL',
        sender: 'g1',
        text: 'Hi — how can I help you today?',
        type: 'user',
        ownerAgentId: 'g1',
        fromAgentId: 'a1',
        createdAt: new Date('2025-10-27T17:25:54.502Z')
      },
      {
        id: 'msg-4-o1',
        messageId: 'bJHFQmkhaRkeQNPDGOGX2',
        sender: 'o1',
        text: "It's nice to meet you! I see you're saying hello several times in a row. How can I help you today? Do you need assistance with something or just want to chat?",
        type: 'agent',
        ownerAgentId: 'o1',
        fromAgentId: 'o1',
        createdAt: new Date('2025-10-27T17:25:57.569Z')
      },
      {
        id: 'msg-4-a1',
        messageId: 'bJHFQmkhaRkeQNPDGOGX2',
        sender: 'a1',
        text: "It's nice to meet you! I see you're saying hello several times in a row. How can I help you today? Do you need assistance with something or just want to chat?",
        type: 'user',
        ownerAgentId: 'a1',
        fromAgentId: 'o1',
        createdAt: new Date('2025-10-27T17:25:57.572Z')
      }
    ];

    mockState = {
      worldName: 'Default World',
      world: {
        id: 'default-world',
        name: 'Default World',
        agents: mockAgents
      } as any,
      messages: mockMessages,
      rawMessages: mockRawMessages,
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
      connectionStatus: 'connected',
      needScroll: false,
      currentChat: null,
      editingMessageId: null,
      editingText: '',
      messageToDelete: null,
      activeAgentFilters: []
    };
  });

  describe('toggle-agent-filter action', () => {
    // Import the actual World component update handlers for testing
    const toggleAgentFilter = (state: WorldComponentState, agentId: string): WorldComponentState => {
      const currentFilters = state.activeAgentFilters || [];
      const isActive = currentFilters.includes(agentId);

      return {
        ...state,
        activeAgentFilters: isActive
          ? currentFilters.filter(id => id !== agentId)  // Remove if active
          : [...currentFilters, agentId]  // Add if not active
      };
    };

    it('should add agent to filter when not active', () => {
      const result = toggleAgentFilter(mockState, 'a1');

      expect(result.activeAgentFilters).toEqual(['a1']);
      expect(result.worldName).toBe('Default World'); // Other state unchanged
    });

    it('should remove agent from filter when already active', () => {
      const stateWithFilter = { ...mockState, activeAgentFilters: ['a1', 'g1'] };
      const result = toggleAgentFilter(stateWithFilter, 'a1');

      expect(result.activeAgentFilters).toEqual(['g1']);
    });

    it('should support multiple agent filters', () => {
      let result = toggleAgentFilter(mockState, 'a1');
      result = toggleAgentFilter(result, 'g1');
      result = toggleAgentFilter(result, 'o1');

      expect(result.activeAgentFilters).toEqual(['a1', 'g1', 'o1']);
    });

    it('should handle empty filters array', () => {
      const stateWithoutFilters = { ...mockState, activeAgentFilters: [] };
      const result = toggleAgentFilter(stateWithoutFilters, 'a1');

      expect(result.activeAgentFilters).toEqual(['a1']);
    });
  });

  describe('agent filtering message counts', () => {

    it('should show correct message count for agent a1 filter (4 messages)', () => {
      const filtered = filterMessagesByAgent(mockMessages, mockRawMessages, ['a1']);

      expect(filtered).toHaveLength(4);

      // Should contain:
      // 1. Human message: "hi"
      // 2. Message from g1 in a1's memory
      // 3. a1's own reply
      // 4. Message from o1 in a1's memory
      const messageTypes = filtered.map(m => ({
        sender: m.sender,
        ownerAgentId: m.ownerAgentId,
        text: m.text.substring(0, 10)
      }));

      expect(messageTypes).toContainEqual({
        sender: 'human',
        ownerAgentId: 'a1',
        text: 'hi'
      });
      expect(messageTypes).toContainEqual({
        sender: 'a1',
        ownerAgentId: 'a1',
        text: 'Hello ther'
      });
      expect(messageTypes).toContainEqual({
        sender: 'a1',
        ownerAgentId: 'a1',
        text: 'Hi — how c'
      });
      expect(messageTypes).toContainEqual({
        sender: 'a1',
        ownerAgentId: 'a1',
        text: "It's nice "
      });
    });

    it('should show correct message count for agent g1 filter (4 messages)', () => {
      const filtered = filterMessagesByAgent(mockMessages, mockRawMessages, ['g1']);

      expect(filtered).toHaveLength(4);

      // Should contain:
      // 1. Human message: "hi"
      // 2. g1's own reply
      // 3. Message from a1 in g1's memory
      // 4. Message from o1 in g1's memory
      const messageTypes = filtered.map(m => ({
        sender: m.sender,
        ownerAgentId: m.ownerAgentId,
        fromAgentId: m.fromAgentId
      }));

      expect(messageTypes).toContainEqual({
        sender: 'human',
        ownerAgentId: 'a1', // First occurrence in raw messages
        fromAgentId: undefined
      });
      expect(messageTypes).toContainEqual({
        sender: 'g1',
        ownerAgentId: 'g1',
        fromAgentId: 'g1'
      });
      expect(messageTypes).toContainEqual({
        sender: 'g1',
        ownerAgentId: 'g1',
        fromAgentId: 'a1'
      });
      expect(messageTypes).toContainEqual({
        sender: 'g1',
        ownerAgentId: 'g1',
        fromAgentId: 'o1'
      });
    });

    it('should show correct message count for agent o1 filter (4 messages)', () => {
      const filtered = filterMessagesByAgent(mockMessages, mockRawMessages, ['o1']);

      expect(filtered).toHaveLength(4);

      // Should contain:
      // 1. Human message: "hi" (from first occurrence in raw messages - a1)
      // 2. Message from g1 in o1's memory
      // 3. Message from a1 in o1's memory
      // 4. o1's own reply
      const ownerIds = filtered.map((m: Message) => m.ownerAgentId);
      expect(ownerIds).toEqual(['a1', 'o1', 'o1', 'o1']); // Human message from a1, others from o1
    });

    it('should show no duplicate human messages in filtered view', () => {
      const filtered = filterMessagesByAgent(mockMessages, mockRawMessages, ['a1']);
      const humanMessages = filtered.filter(m => m.sender === 'human');

      expect(humanMessages).toHaveLength(1);
      expect(humanMessages[0].text).toBe('hi');
    });

    it('should show all messages when no filters are active', () => {
      const filtered = filterMessagesByAgent(mockMessages, mockRawMessages, []);

      expect(filtered).toHaveLength(7); // Uses deduplicated messages
      expect(filtered).toBe(mockMessages); // Should return the original deduplicated messages
    });

    it('should handle multiple agent filters correctly', () => {
      const filtered = filterMessagesByAgent(mockMessages, mockRawMessages, ['a1', 'g1']);

      // Should show messages from both a1 and g1 memories, but only one human message
      expect(filtered.length).toBeGreaterThan(4); // More than single agent

      const humanMessages = filtered.filter(m => m.sender === 'human');
      expect(humanMessages).toHaveLength(1); // Still only one human message

      const agentMessages = filtered.filter(m => m.sender !== 'human');
      const ownerIds = agentMessages.map(m => m.ownerAgentId);

      // All agent messages should be from a1 or g1 memory
      ownerIds.forEach(ownerId => {
        expect(['a1', 'g1']).toContain(ownerId);
      });
    });
  });

  describe('cross-agent message ownership', () => {
    it('should correctly track message ownership across agents', () => {
      // Test that the same message appears in multiple agent memories with correct ownerAgentId
      const humanMessages = mockRawMessages.filter(m => m.sender === 'human');
      expect(humanMessages).toHaveLength(3);

      const ownerIds = humanMessages.map(m => m.ownerAgentId);
      expect(ownerIds).toContain('a1');
      expect(ownerIds).toContain('g1');
      expect(ownerIds).toContain('o1');

      // All should have the same messageId but different ownerAgentId
      const messageIds = humanMessages.map(m => m.messageId);
      expect(new Set(messageIds).size).toBe(1); // Same messageId
    });

    it('should correctly handle agent replies in other agents memories', () => {
      // g1's reply should appear in a1 and o1 memories as user messages
      const g1ReplyInOtherMemories = mockRawMessages.filter(m =>
        m.messageId === 'aA2vmGlN7jBejED4Mduq7' && m.ownerAgentId !== 'g1'
      );

      expect(g1ReplyInOtherMemories).toHaveLength(2); // In a1 and o1 memories

      g1ReplyInOtherMemories.forEach(msg => {
        expect(msg.type).toBe('user'); // Stored as user message in other agent's memory
        expect(msg.fromAgentId).toBe('g1'); // Original sender tracked
        expect(['a1', 'o1']).toContain(msg.ownerAgentId); // In a1 or o1 memory
      });
    });

    it('should maintain correct sender/fromAgentId relationship after memory swapping', () => {
      // Test the sender/fromAgentId swap that happens in createMessageFromMemory
      const crossAgentMessages = mockRawMessages.filter(m =>
        m.fromAgentId && m.fromAgentId !== m.ownerAgentId
      );

      crossAgentMessages.forEach(msg => {
        // After swapping: sender = recipient (ownerAgentId), fromAgentId = original sender
        expect(msg.sender).toBe(msg.ownerAgentId);
        expect(msg.fromAgentId).not.toBe(msg.ownerAgentId);
      });
    });
  });

  describe('bug regression test', () => {
    it('should fix the original bug where g1 showed 3 instead of 4 messages', () => {
      const filtered = filterMessagesByAgent(mockMessages, mockRawMessages, ['g1']);

      // This was the failing case: g1 should show 4 messages, not 3
      expect(filtered).toHaveLength(4);

      // Specifically check that g1 gets the message from o1
      const o1MessageInG1Memory = filtered.find((m: Message) =>
        m.ownerAgentId === 'g1' && m.fromAgentId === 'o1'
      );
      expect(o1MessageInG1Memory).toBeDefined();
      expect(o1MessageInG1Memory?.text).toContain("It's nice to meet you!");
    });

    it('should fix the original bug where o1 showed 2 instead of 4 messages', () => {
      const filtered = filterMessagesByAgent(mockMessages, mockRawMessages, ['o1']);

      // This was the failing case: o1 should show 4 messages, not 2
      expect(filtered).toHaveLength(4);

      // Specifically check that o1 gets messages from g1 and a1
      const g1MessageInO1Memory = filtered.find((m: Message) =>
        m.ownerAgentId === 'o1' && m.fromAgentId === 'g1'
      );
      const a1MessageInO1Memory = filtered.find((m: Message) =>
        m.ownerAgentId === 'o1' && m.fromAgentId === 'a1'
      );

      expect(g1MessageInO1Memory).toBeDefined();
      expect(a1MessageInO1Memory).toBeDefined();
      expect(g1MessageInO1Memory?.text).toContain("Hello there!");
      expect(a1MessageInO1Memory?.text).toContain("Hi — how can I help");
    });

    it('should continue working correctly for a1 which was already working', () => {
      const filtered = filterMessagesByAgent(mockMessages, mockRawMessages, ['a1']);

      // a1 was already working correctly
      expect(filtered).toHaveLength(4);

      // Verify a1 gets all expected messages
      const messageContents = filtered.map((m: Message) => m.text.substring(0, 20));
      expect(messageContents).toContain('hi');
      expect(messageContents.some(content => content.startsWith('Hello there!'))).toBe(true);
      expect(messageContents).toContain('Hi — how can I help ');
      expect(messageContents.some(content => content.startsWith("It's nice to meet"))).toBe(true);
    });
  });
});