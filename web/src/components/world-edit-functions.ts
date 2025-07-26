/**
 * WorldEdit Module-Level State Functions
 * 
 * These functions handle state updates for the WorldEdit component.
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
import { createWorld, updateWorld, deleteWorld as deleteWorldAPI } from '../api';
import type { World } from '../types';

// WorldEdit Component State Interface
export interface WorldEditState {
  mode: 'create' | 'edit' | 'delete';
  formData: Partial<World>
  loading: boolean;
  error: string | null;
  successMessage: string | null;
}

// Props interface for the component initialization
export interface WorldEditProps {
  world?: World | null;
  mode?: 'create' | 'edit' | 'delete';
}

// Helper function to get default form data
const getDefaultFormData = (): Partial<World> => ({
  name: '',
  description: '',
  turnLimit: 5
});

// Form field update function
export const updateField = (state: WorldEditState, field: string, e: Event): WorldEditState => {
  const target = e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  const value = field === 'turnLimit' ? parseInt(target.value) || 5 : target.value;
  
  return {
    ...state,
    formData: { ...state.formData, [field]: value },
    error: null
  };
};

// Save world function (handles both create and update)
export const saveWorld = async function* (state: WorldEditState): AsyncGenerator<WorldEditState> {
  // Form validation
  if (!state.formData.name.trim()) {
    yield { ...state, error: 'World name is required' };
    return;
  }

  // Set loading state
  yield { ...state, loading: true, error: null };

  try {
    if (state.mode === 'create') {
      await createWorld(state.formData);
    } else {
      // For update, we need the original world name, which should be preserved from initialization
      await updateWorld(state.formData.name, state.formData);
    }
    
    const successMessage = state.mode === 'create' 
      ? 'World created successfully!' 
      : 'World updated successfully!';
      
    // Show success message
    yield { ...state, loading: false, successMessage };
    
    // Auto-close after showing success message
    setTimeout(() => {
      if (state.mode === 'create') {
        // Redirect to new world
        window.location.href = '/World/' + encodeURIComponent(state.formData.name);
      } else {
        app.run('world-saved');
      }
    }, 2000);
    
  } catch (error: any) {
    yield { 
      ...state, 
      loading: false, 
      error: error.message || 'Failed to save world' 
    };
  }
};

// Delete world function
export const deleteWorld = async function* (state: WorldEditState): AsyncGenerator<WorldEditState> {
  // Set loading state
  yield { ...state, loading: true, error: null };

  try {
    await deleteWorldAPI(state.formData.name);
    
    // Show success message
    yield { 
      ...state, 
      loading: false, 
      successMessage: 'World deleted successfully!' 
    };
    
    // Auto-close and redirect to home after showing success message
    setTimeout(() => {
      window.location.href = '/';
    }, 2000);
    
  } catch (error: any) {
    yield { 
      ...state, 
      loading: false, 
      error: error.message || 'Failed to delete world' 
    };
  }
};

// Close modal function
export const closeModal = (): void => {
  app.run('close-world-edit');
};

// Initialize component state from props
export const initializeState = (props: WorldEditProps): WorldEditState => ({
  mode: props.mode || 'create',
  formData: props.world || getDefaultFormData(),
  loading: false,
  error: null,
  successMessage: null
});