/**
 * AgentEdit Module-Level State Functions
 * 
 * These functions handle state updates for the AgentEdit component.
 * They are defined at module level to enable easy unit testing and
 * direct function references in AppRun $on directives.
 * 
 * Features:
 * - All CRUD operations: create, edit, delete
 * - Success messaging with auto-close functionality  
 * - Form validation and error handling
 * - Loading states for async operations
 * - Direct function references for better performance
 */

import { app } from 'apprun';
import { createAgent, updateAgent, deleteAgent as deleteAgentAPI } from '../api';
import type { Agent, LLMProvider } from '../types';

// AgentEdit Component State Interface
export interface AgentEditState {
  mode: 'create' | 'edit' | 'delete';
  worldName: string;
  agent: Partial<Agent>;
  loading: boolean;
  error: string | null;
  successMessage: string | null;
}

// Props interface for the component initialization
export interface AgentEditProps {
  agent?: Agent | null;
  mode?: 'create' | 'edit' | 'delete';
  worldName: string;
}

// Helper function to get default agent data
const getDefaultAgentData = (): Partial<Agent> => ({
  name: '',
  description: '',
  provider: 'ollama' as LLMProvider,
  model: 'llama3.2:3b',
  temperature: 0.7,
  systemPrompt: ''
});

// Save agent function (handles both create and update)
export const saveAgent = async function* (state: AgentEditState): AsyncGenerator<AgentEditState> {
  // Form validation
  if (!state.agent.name.trim()) {
    yield { ...state, error: 'Agent name is required' };
    return;
  }

  // Set loading state
  yield { ...state, loading: true, error: null };

  try {
    if (state.mode === 'create') {
      await createAgent(state.worldName, state.agent);
    } else {
      await updateAgent(state.worldName, state.agent.name, state.agent);
    }
    
    const successMessage = state.mode === 'create' 
      ? 'Agent created successfully!' 
      : 'Agent updated successfully!';
      
    // Show success message
    yield { ...state, loading: false, successMessage };
    
    // Auto-close after showing success message
    setTimeout(() => {
      app.run('agent-saved');
    }, 2000);
    
  } catch (error: any) {
    yield { 
      ...state, 
      loading: false, 
      error: error.message || 'Failed to save agent' 
    };
  }
};

// Delete agent function
export const deleteAgent = async function* (state: AgentEditState): AsyncGenerator<AgentEditState> {
  // Set loading state
  yield { ...state, loading: true, error: null };

  try {
    await deleteAgentAPI(state.worldName, state.agent.name);
    
    // Show success message
    yield { 
      ...state, 
      loading: false, 
      successMessage: 'Agent deleted successfully!' 
    };
    
    // Auto-close after showing success message
    setTimeout(() => {
      app.run('agent-deleted');
    }, 2000);
    
  } catch (error: any) {
    yield { 
      ...state, 
      loading: false, 
      error: error.message || 'Failed to delete agent' 
    };
  }
};

// Close modal function
export const closeModal = (): void => {
  app.run('close-agent-edit');
};

// Initialize component state from props
export const initializeState = (props: AgentEditProps): AgentEditState => ({
  mode: props.mode || 'create',
  worldName: props.worldName,
  agent: props.agent || getDefaultAgentData(),
  loading: false,
  error: null,
  successMessage: null
});