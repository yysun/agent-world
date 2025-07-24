/**
 * World Update Handlers - Agent-related event handlers for World component
 * 
 * Features:
 * - Agent settings selection and management
 * - Agent message clearing functionality  
 * - Agent edit popup state management (create, update, delete)
 * - Agent form data handling and validation
 * - Agent CRUD operations with API integration
 * - Error handling and loading states for agent operations
 * 
 * Implementation:
 * - Extracted from World.tsx for better code organization
 * - AppRun MVU pattern compatibility
 * - Immutable state updates with spread operator
 * - Async generators for complex operations
 * - TypeScript interfaces for type safety
 * - API integration placeholders for future implementation
 * 
 * Changes:
 * - Extracted agent-related handlers from World component
 * - Maintained all existing functionality and state management
 * - Added proper TypeScript types and interfaces
 * - Preserved async/await patterns and error handling
 * - Consolidated types using centralized types/index.ts
 * - Eliminated duplicate interface definitions
 * - Reused core types for consistency
 */

import { clearAgentMemory } from '../api';
import type {
  WorldComponentState,
  Agent,
  World,
  AgentEditState,
  LLMProvider
} from '../types';

// Type aliases for backward compatibility
export type WorldAgent = Agent;
export type { WorldComponentState, AgentEditState };

// Agent Settings Selection Handlers
export const selectWorldSettings = (state: WorldComponentState): WorldComponentState => ({
  ...state,
  selectedSettingsTarget: 'world',
  selectedAgent: null,
  messages: (state.messages || []).filter(message => !message.userEntered)
});

export const selectAgentSettings = (state: WorldComponentState, agent: Agent): WorldComponentState => {
  // If clicking on already selected agent, deselect it (show world settings)
  if (state.selectedSettingsTarget === 'agent' && state.selectedAgent?.id === agent.id) {
    return {
      ...state,
      selectedSettingsTarget: 'world',
      selectedAgent: null,
      messages: (state.messages || []).filter(message => !message.userEntered)
    };
  }

  // Otherwise, select the agent
  return {
    ...state,
    selectedSettingsTarget: 'agent',
    selectedAgent: agent,
    messages: (state.messages || []).filter(message => !message.userEntered)
  };
};

// Agent Message Clearing Handlers
export const clearAgentMessages = async (state: WorldComponentState, agent: Agent): Promise<WorldComponentState> => {
  try {
    await clearAgentMemory(state.worldName, agent.name);

    // Update agent's message count and remove agent's messages from display
    const updatedAgents = state.agents.map(a =>
      a.id === agent.id ? { ...a, messageCount: 0 } : a
    );

    // Remove agent's messages from the message list
    const filteredMessages = (state.messages || []).filter(msg => msg.sender !== agent.name);

    // Update selected agent if it's the same one
    const updatedSelectedAgent = state.selectedAgent?.id === agent.id
      ? { ...state.selectedAgent, messageCount: 0 }
      : state.selectedAgent;

    // Update world object with updated agents
    const updatedWorld = state.world ? {
      ...state.world,
      agents: updatedAgents
    } : null;

    return {
      ...state,
      world: updatedWorld,
      agents: updatedAgents,
      messages: filteredMessages,
      selectedAgent: updatedSelectedAgent
    };
  } catch (error: any) {
    return {
      ...state,
      error: error.message || 'Failed to clear agent messages'
    };
  }
};

export const clearWorldMessages = async (state: WorldComponentState): Promise<WorldComponentState> => {
  try {
    // Clear messages for all agents
    await Promise.all(
      state.agents.map(agent => clearAgentMemory(state.worldName, agent.name))
    );

    // Update all agents' message counts
    const updatedAgents = state.agents.map(agent => ({ ...agent, messageCount: 0 }));

    // Update selected agent if any
    const updatedSelectedAgent = state.selectedAgent
      ? { ...state.selectedAgent, messageCount: 0 }
      : null;

    // Update world object with updated agents
    const updatedWorld = state.world ? {
      ...state.world,
      agents: updatedAgents
    } : null;

    return {
      ...state,
      world: updatedWorld,
      agents: updatedAgents,
      messages: [], // Clear all messages
      selectedAgent: updatedSelectedAgent
    };
  } catch (error: any) {
    return {
      ...state,
      error: error.message || 'Failed to clear world messages'
    };
  }
};

// Agent Edit Event Handlers
export const openAgentEdit = (state: WorldComponentState, mode: 'create' | 'edit', agent?: Agent): WorldComponentState => {
  const formData = mode === 'edit' && agent ? {
    name: agent.name,
    description: agent.description || '',
    provider: agent.provider || '',
    model: agent.model || '',
    temperature: agent.temperature || 0.7,
    systemPrompt: agent.systemPrompt || ''
  } : {
    name: '',
    description: '',
    provider: '',
    model: '',
    temperature: 0.7,
    systemPrompt: ''
  };

  return {
    ...state,
    agentEdit: {
      isOpen: true,
      mode,
      selectedAgent: agent || null,
      formData,
      loading: false,
      error: null
    }
  };
};

export const closeAgentEdit = (state: WorldComponentState): WorldComponentState => ({
  ...state,
  agentEdit: {
    ...state.agentEdit,
    isOpen: false,
    error: null
  }
});

export const updateAgentForm = (state: WorldComponentState, field: string, event: Event): WorldComponentState => {
  const target = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  let value: any;

  // Handle different input types
  if (target.type === 'number') {
    value = parseFloat(target.value) || 0;
  } else {
    value = target.value;
  }

  return {
    ...state,
    agentEdit: {
      ...state.agentEdit,
      formData: {
        ...state.agentEdit.formData,
        [field]: value
      },
      error: null // Clear error when user starts typing
    }
  };
};

export const saveAgent = async function* (state: WorldComponentState): AsyncGenerator<WorldComponentState> {
  // Validation
  if (!state.agentEdit.formData.name.trim()) {
    yield {
      ...state,
      agentEdit: {
        ...state.agentEdit,
        error: 'Agent name is required'
      }
    };
    return;
  }

  try {
    yield {
      ...state,
      agentEdit: {
        ...state.agentEdit,
        loading: true,
        error: null
      }
    };

    // TODO: Implement API call for save agent
    // For now, simulate save
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Update agents list (placeholder logic)
    const newAgent: Agent = {
      id: state.agentEdit.mode === 'create' ? `agent-${Date.now()}` : state.agentEdit.selectedAgent?.id,
      name: state.agentEdit.formData.name,
      description: state.agentEdit.formData.description,
      provider: state.agentEdit.formData.provider as any, // Type assertion for form compatibility
      model: state.agentEdit.formData.model,
      temperature: state.agentEdit.formData.temperature,
      systemPrompt: state.agentEdit.formData.systemPrompt,
      messageCount: state.agentEdit.selectedAgent?.messageCount || 0,
      spriteIndex: state.agentEdit.selectedAgent?.spriteIndex || state.agents.length % 9,
      // Required properties from core interface
      type: 'default',
      status: 'active',
      llmCallCount: 0,
      memory: [],
      createdAt: new Date(),
      lastActive: new Date()
    };

    let updatedAgents: Agent[];
    if (state.agentEdit.mode === 'create') {
      updatedAgents = [...state.agents, newAgent];
    } else {
      updatedAgents = state.agents.map(agent =>
        agent.id === newAgent.id ? newAgent : agent
      );
    }

    const updatedWorld = state.world ? {
      ...state.world,
      agents: updatedAgents
    } : null;

    yield {
      ...state,
      agents: updatedAgents,
      world: updatedWorld,
      agentEdit: {
        ...state.agentEdit,
        isOpen: false,
        loading: false
      }
    };

  } catch (error: any) {
    yield {
      ...state,
      agentEdit: {
        ...state.agentEdit,
        loading: false,
        error: error.message || 'Failed to save agent'
      }
    };
  }
};

export const deleteAgent = async function* (state: WorldComponentState, agentId?: string): AsyncGenerator<WorldComponentState> {
  if (!agentId || !state.agentEdit.selectedAgent) {
    return;
  }

  // Confirmation (handled by browser confirm for now)
  if (!confirm(`Are you sure you want to delete agent "${state.agentEdit.selectedAgent.name}"?`)) {
    return;
  }

  try {
    yield {
      ...state,
      agentEdit: {
        ...state.agentEdit,
        loading: true,
        error: null
      }
    };

    // TODO: Implement API call for delete agent
    // For now, simulate delete
    await new Promise(resolve => setTimeout(resolve, 500));

    const updatedAgents = state.agents.filter(agent => agent.id !== agentId);

    const updatedWorld = state.world ? {
      ...state.world,
      agents: updatedAgents
    } : null;

    yield {
      ...state,
      agents: updatedAgents,
      world: updatedWorld,
      agentEdit: {
        ...state.agentEdit,
        isOpen: false,
        loading: false
      },
      // Clear selected agent if it was the deleted one
      selectedAgent: state.selectedAgent?.id === agentId ? null : state.selectedAgent,
      selectedSettingsTarget: state.selectedAgent?.id === agentId ? 'world' : state.selectedSettingsTarget
    };

  } catch (error: any) {
    yield {
      ...state,
      agentEdit: {
        ...state.agentEdit,
        loading: false,
        error: error.message || 'Failed to delete agent'
      }
    };
  }
};

// Export object with all handler functions for easy import
export const agentUpdateHandlers = {
  'select-world-settings': selectWorldSettings,
  'select-agent-settings': selectAgentSettings,
  'clear-agent-messages': clearAgentMessages,
  'clear-world-messages': clearWorldMessages,
  'open-agent-edit': openAgentEdit,
  'close-agent-edit': closeAgentEdit,
  'update-agent-form': updateAgentForm,
  'save-agent': saveAgent,
  'delete-agent': deleteAgent
};
