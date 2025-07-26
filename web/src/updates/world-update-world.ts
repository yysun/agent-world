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

// World Edit Event Handlers (Updated for simplified state)
export const openWorldEdit = (state: WorldComponentState): WorldComponentState => ({
  ...state,
  showWorldEdit: true,
  worldEditMode: 'edit',
  selectedWorldForEdit: state.world
});

export const closeWorldEdit = (state: WorldComponentState): WorldComponentState => ({
  ...state,
  showWorldEdit: false
});

export const updateWorldForm = (state: WorldComponentState, field: string, e: Event): WorldComponentState => {
  // This function is no longer needed as the WorldEdit component handles its own form state
  // Keeping for backward compatibility but it won't be called
  return state;
};

export const saveWorld = async (state: WorldComponentState): Promise<WorldComponentState> => {
  // This function is no longer needed as the WorldEdit component handles its own save logic
  // Keeping for backward compatibility but it won't be called
  return state;
};

export const deleteWorldHandler = async (state: WorldComponentState, worldName: string): Promise<WorldComponentState> => {
  // This function is no longer needed as the WorldEdit component handles its own delete logic
  // Keeping for backward compatibility but it won't be called
  return state;
};

// Export object with all handler functions for easy import
export const worldUpdateHandlers = {
  'open-world-edit': openWorldEdit,
  'close-world-edit': closeWorldEdit,
  'update-world-form': updateWorldForm,
  'save-world': saveWorld,
  'delete-world': deleteWorldHandler
};
