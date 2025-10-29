/**
 * Agent Management Domain Module Tests
 * 
 * Tests for agent deletion, memory clearing, and state management.
 */

import * as AgentManagementDomain from '../../web/src/domain/agent-management';
import type { WorldComponentState, Agent } from '../../web/src/types';
import { LLMProvider } from '../../core/types';
import api from '../../web/src/api';

// Mock the API
jest.mock('../../web/src/api', () => ({
  deleteAgent: jest.fn(),
  clearAgentMemory: jest.fn(),
}));

const mockApi = api as jest.Mocked<typeof api>;

describe('Agent Management Domain Module', () => {
  let mockState: WorldComponentState;
  let mockAgent: Agent;
  let mockAgents: Agent[];

  beforeEach(() => {
    mockAgent = {
      id: 'agent-1',
      name: 'TestAgent',
      type: 'LLM',
      provider: LLMProvider.ANTHROPIC,
      model: 'claude-3-sonnet',
      llmCallCount: 0,
      memory: [],
      spriteIndex: 0,
      messageCount: 5
    };

    const secondAgent = {
      id: 'agent-2',
      name: 'SecondAgent',
      type: 'LLM',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4',
      llmCallCount: 0,
      memory: [],
      spriteIndex: 1,
      messageCount: 3
    };

    mockAgents = [mockAgent, secondAgent];

    mockState = {
      worldName: 'test-world',
      world: {
        id: 'world-1',
        name: 'test-world',
        turnLimit: 10,
        currentChatId: 'chat-1',
        mcpConfig: null,
        agents: mockAgents,
        chats: []
      },
      messages: [
        { id: 'msg-1', sender: 'TestAgent', text: 'Hello', type: 'agent', createdAt: new Date() },
        { id: 'msg-2', sender: 'human', text: 'Hi', type: 'user', createdAt: new Date() },
        { id: 'msg-3', sender: 'SecondAgent', text: 'World', type: 'agent', createdAt: new Date() }
      ],
      userInput: '',
      loading: false,
      error: null,
      messagesLoading: false,
      isSending: false,
      isWaiting: false,
      agentActivities: {},
      selectedSettingsTarget: 'agent',
      selectedAgent: mockAgent,
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

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('deleteAgent', () => {
    it('should delete agent and update state successfully', async () => {
      mockApi.deleteAgent.mockResolvedValueOnce(undefined);

      const result = await AgentManagementDomain.deleteAgent(mockState, mockAgent, 'test-world');

      expect(mockApi.deleteAgent).toHaveBeenCalledWith('test-world', 'TestAgent');
      expect(result.world?.agents).toHaveLength(1);
      expect(result.world?.agents[0].id).toBe('agent-2');
      expect(result.messages).toHaveLength(2);
      expect(result.messages.find(msg => msg.sender === 'TestAgent')).toBeUndefined();
      expect(result.selectedAgent).toBeNull();
      expect(result.selectedSettingsTarget).toBe('world');
    });

    it('should handle API error during agent deletion', async () => {
      const errorMessage = 'Failed to delete agent';
      mockApi.deleteAgent.mockRejectedValueOnce(new Error(errorMessage));

      const result = await AgentManagementDomain.deleteAgent(mockState, mockAgent, 'test-world');

      expect(result.error).toBe(errorMessage);
      expect(result.world?.agents).toHaveLength(2); // State unchanged
      expect(result.selectedAgent).toBe(mockAgent); // State unchanged
    });

    it('should not reset selectedAgent if deleting different agent', async () => {
      mockApi.deleteAgent.mockResolvedValueOnce(undefined);
      const differentAgent = mockAgents[1];

      const result = await AgentManagementDomain.deleteAgent(mockState, differentAgent, 'test-world');

      expect(result.selectedAgent).toBe(mockAgent); // Still selected
      expect(result.selectedSettingsTarget).toBe('agent'); // Unchanged
    });

    it('should handle empty agents array', async () => {
      mockApi.deleteAgent.mockResolvedValueOnce(undefined);
      const stateWithNoAgents = { ...mockState, world: { ...mockState.world!, agents: [] } };

      const result = await AgentManagementDomain.deleteAgent(stateWithNoAgents, mockAgent, 'test-world');

      expect(result.world?.agents).toHaveLength(0);
    });
  });

  describe('clearAgentMessages', () => {
    it('should clear agent memory and update state successfully', async () => {
      mockApi.clearAgentMemory.mockResolvedValueOnce(undefined);

      const result = await AgentManagementDomain.clearAgentMessages(mockState, mockAgent, 'test-world');

      expect(mockApi.clearAgentMemory).toHaveBeenCalledWith('test-world', 'TestAgent');
      expect(result.world?.agents[0].messageCount).toBe(0);
      expect(result.messages).toHaveLength(2);
      expect(result.messages.find(msg => msg.sender === 'TestAgent')).toBeUndefined();
      expect(result.selectedAgent?.messageCount).toBe(0);
    });

    it('should handle API error during memory clearing', async () => {
      const errorMessage = 'Failed to clear memory';
      mockApi.clearAgentMemory.mockRejectedValueOnce(new Error(errorMessage));

      const result = await AgentManagementDomain.clearAgentMessages(mockState, mockAgent, 'test-world');

      expect(result.error).toBe(errorMessage);
      expect(result.world?.agents[0].messageCount).toBe(5); // State unchanged
    });

    it('should update selectedAgent messageCount if it matches cleared agent', async () => {
      mockApi.clearAgentMemory.mockResolvedValueOnce(undefined);

      const result = await AgentManagementDomain.clearAgentMessages(mockState, mockAgent, 'test-world');

      expect(result.selectedAgent?.messageCount).toBe(0);
    });

    it('should not update selectedAgent if clearing different agent', async () => {
      mockApi.clearAgentMemory.mockResolvedValueOnce(undefined);
      const differentAgent = mockAgents[1];

      const result = await AgentManagementDomain.clearAgentMessages(mockState, differentAgent, 'test-world');

      expect(result.selectedAgent?.messageCount).toBe(5); // Unchanged
    });
  });

  describe('clearWorldMessages', () => {
    it('should clear all agent memories and update state successfully', async () => {
      mockApi.clearAgentMemory.mockResolvedValue(undefined);

      const result = await AgentManagementDomain.clearWorldMessages(mockState, 'test-world');

      expect(mockApi.clearAgentMemory).toHaveBeenCalledTimes(2);
      expect(mockApi.clearAgentMemory).toHaveBeenCalledWith('test-world', 'TestAgent');
      expect(mockApi.clearAgentMemory).toHaveBeenCalledWith('test-world', 'SecondAgent');
      expect(result.world?.agents.every(agent => agent.messageCount === 0)).toBe(true);
      expect(result.messages).toHaveLength(0);
      expect(result.selectedAgent?.messageCount).toBe(0);
    });

    it('should handle API error during world memory clearing', async () => {
      const errorMessage = 'Failed to clear world memory';
      mockApi.clearAgentMemory.mockRejectedValueOnce(new Error(errorMessage));

      const result = await AgentManagementDomain.clearWorldMessages(mockState, 'test-world');

      expect(result.error).toBe(errorMessage);
    });

    it('should handle empty agents array', async () => {
      const stateWithNoAgents = { ...mockState, world: { ...mockState.world!, agents: [] } };

      const result = await AgentManagementDomain.clearWorldMessages(stateWithNoAgents, 'test-world');

      expect(mockApi.clearAgentMemory).not.toHaveBeenCalled();
      expect(result.messages).toHaveLength(0);
    });

    it('should handle null selectedAgent', async () => {
      mockApi.clearAgentMemory.mockResolvedValue(undefined);
      const stateWithNoSelection = { ...mockState, selectedAgent: null };

      const result = await AgentManagementDomain.clearWorldMessages(stateWithNoSelection, 'test-world');

      expect(result.selectedAgent).toBeNull();
    });
  });

  describe('Helper Functions', () => {
    describe('updateAgentMessageCount', () => {
      it('should update message count for specific agent', () => {
        const result = AgentManagementDomain.updateAgentMessageCount(mockAgents, 'agent-1', 10);

        expect(result[0].messageCount).toBe(10);
        expect(result[1].messageCount).toBe(3); // Unchanged
      });

      it('should not modify original array', () => {
        const original = [...mockAgents];
        AgentManagementDomain.updateAgentMessageCount(mockAgents, 'agent-1', 10);

        expect(mockAgents).toEqual(original);
      });
    });

    describe('filterMessagesByAgent', () => {
      const messages = [
        { id: 'msg-1', sender: 'TestAgent', text: 'Hello' },
        { id: 'msg-2', sender: 'human', text: 'Hi' },
        { id: 'msg-3', sender: 'TestAgent', text: 'World' }
      ];

      it('should filter out messages from specific agent', () => {
        const result = AgentManagementDomain.filterMessagesByAgent(messages, 'TestAgent');

        expect(result).toHaveLength(1);
        expect(result[0].sender).toBe('human');
      });

      it('should return all messages if agent not found', () => {
        const result = AgentManagementDomain.filterMessagesByAgent(messages, 'NonExistentAgent');

        expect(result).toHaveLength(3);
      });
    });

    describe('resetSelectedAgentIfMatch', () => {
      it('should return null if selected agent matches target', () => {
        const result = AgentManagementDomain.resetSelectedAgentIfMatch(mockAgent, 'agent-1');

        expect(result).toBeNull();
      });

      it('should return selected agent if no match', () => {
        const result = AgentManagementDomain.resetSelectedAgentIfMatch(mockAgent, 'agent-2');

        expect(result).toBe(mockAgent);
      });

      it('should handle null selected agent', () => {
        const result = AgentManagementDomain.resetSelectedAgentIfMatch(null, 'agent-1');

        expect(result).toBeNull();
      });
    });

    describe('resetSettingsTargetIfAgentDeleted', () => {
      it('should reset to world if deleted agent was selected', () => {
        const result = AgentManagementDomain.resetSettingsTargetIfAgentDeleted('agent', mockAgent, 'agent-1');

        expect(result).toBe('world');
      });

      it('should keep current target if different agent deleted', () => {
        const result = AgentManagementDomain.resetSettingsTargetIfAgentDeleted('agent', mockAgent, 'agent-2');

        expect(result).toBe('agent');
      });

      it('should handle null selected agent', () => {
        const result = AgentManagementDomain.resetSettingsTargetIfAgentDeleted('agent', null, 'agent-1');

        expect(result).toBe('agent');
      });
    });
  });
});