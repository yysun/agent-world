/**
 * World Update Handlers - World-related event handlers for World component
 * 
 * Features:
 * - World edit popup state management (edit mode)
 * - World form data handling and validation
 * - World CRUD operations with API integration
 * - Error handling and loading states for world operations
 * - World deletion with confirmation and redirection
 * 
 * Implementation:
 * - Extracted from World.tsx for better code organization
 * - AppRun MVU pattern compatibility
 * - Immutable state updates with spread operator
 * - Async operations with proper error handling
 * - TypeScript interfaces for type safety
 * - API integration for world persistence
 * 
 * Changes:
 * - Extracted world-related handlers from World component
 * - Maintained all existing functionality and state management
 * - Added proper TypeScript types and interfaces
 * - Preserved async/await patterns and error handling
 * - Consolidated types using centralized types/index.ts
 */

import { updateWorld, deleteWorld } from '../api';
import type { WorldComponentState } from '../types';

// World Edit Event Handlers
export const openWorldEdit = (state: WorldComponentState): WorldComponentState => ({
  ...state,
  worldEdit: {
    ...state.worldEdit,
    isOpen: true,
    mode: 'edit',
    selectedWorld: state.world,
    formData: {
      name: state.world?.name || '',
      description: state.world?.description || '',
      turnLimit: state.world?.turnLimit || 5
    },
    error: null
  }
});

export const closeWorldEdit = (state: WorldComponentState): WorldComponentState => ({
  ...state,
  worldEdit: {
    ...state.worldEdit,
    isOpen: false,
    error: null
  }
});

export const updateWorldForm = (state: WorldComponentState, field: string, e: Event): WorldComponentState => {
  const target = e.target as HTMLInputElement;
  const value = field === 'turnLimit' ? parseInt(target.value) || 5 : target.value;

  return {
    ...state,
    worldEdit: {
      ...state.worldEdit,
      formData: {
        ...state.worldEdit.formData,
        [field]: value
      },
      error: null
    }
  };
};

export const saveWorld = async (state: WorldComponentState): Promise<WorldComponentState> => {
  const { formData, selectedWorld } = state.worldEdit;

  if (!formData.name.trim()) {
    return {
      ...state,
      worldEdit: {
        ...state.worldEdit,
        error: 'World name is required'
      }
    };
  }

  if (!selectedWorld) {
    return {
      ...state,
      worldEdit: {
        ...state.worldEdit,
        error: 'No world selected for editing'
      }
    };
  }

  try {
    // Set loading state
    const loadingState = {
      ...state,
      worldEdit: {
        ...state.worldEdit,
        loading: true,
        error: null
      }
    };

    // Note: In the actual implementation, this would be handled by the caller
    // app.run('#', loadingState);

    const updatedWorld = await updateWorld(selectedWorld.name, {
      name: formData.name,
      description: formData.description,
      turnLimit: formData.turnLimit
    });

    // If world name changed, redirect to new world name
    if (formData.name !== selectedWorld.name) {
      window.location.href = '/World/' + encodeURIComponent(formData.name);
      return state; // Return early since we're redirecting
    }

    return {
      ...state,
      world: {
        ...state.world!,
        ...updatedWorld
      },
      worldEdit: {
        ...state.worldEdit,
        isOpen: false,
        loading: false,
        error: null
      }
    };
  } catch (error) {
    return {
      ...state,
      worldEdit: {
        ...state.worldEdit,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to save world'
      }
    };
  }
};

export const deleteWorldHandler = async (state: WorldComponentState, worldName: string): Promise<WorldComponentState> => {
  if (!worldName) return state;

  if (!confirm(`Are you sure you want to delete "${worldName}"? This action cannot be undone.`)) {
    return state;
  }

  try {
    await deleteWorld(worldName);

    // Redirect to home page after deletion
    window.location.href = '/';
    return state; // Return early since we're redirecting
  } catch (error) {
    return {
      ...state,
      worldEdit: {
        ...state.worldEdit,
        error: error instanceof Error ? error.message : 'Failed to delete world'
      }
    };
  }
};

// Export object with all handler functions for easy import
export const worldUpdateHandlers = {
  'open-world-edit': openWorldEdit,
  'close-world-edit': closeWorldEdit,
  'update-world-form': updateWorldForm,
  'save-world': saveWorld,
  'delete-world': deleteWorldHandler
};
