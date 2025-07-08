/**
 * State Manager - Backward-compatible state management for gradual migration
 * 
 * This module provides a bridge between the current state management and the new
 * standardized schema. It allows for gradual migration while maintaining
 * backward compatibility with existing components.
 * 
 * Features:
 * - Backward compatibility with current state structure
 * - Gradual migration path to new schema
 * - State transformation utilities
 * - Legacy support for existing components
 * 
 * Usage:
 * ```javascript
 * import { StateManager } from './state-manager.js';
 * 
 * // Initialize with legacy state
 * const stateManager = new StateManager(legacyState);
 * 
 * // Get standardized state slices
 * const modalState = stateManager.getAgentModalState();
 * const chatState = stateManager.getChatState();
 * 
 * // Update with new schema
 * stateManager.updateAgentModal(newModalState);
 * ```
 */

import {
  createInitialAppState,
  createInitialAgentModalState,
  createInitialCreateModalData,
  createInitialEditModalData,
  createInitialModalErrors,
  migrateLegacyState,
  validateAgentModalState
} from '../types/app-state-schema.js';

/**
 * State Manager Class - Manages state migration and compatibility
 */
export class StateManager {
  /**
   * @param {Object} initialState - Initial state (legacy or new format)
   */
  constructor(initialState = {}) {
    this.state = this.migrateState(initialState);
    this.legacyMode = this.detectLegacyMode(initialState);
  }

  /**
   * Detect if state is in legacy format
   * @param {Object} state - State to check
   * @returns {boolean} True if legacy format
   */
  detectLegacyMode(state) {
    // Check for legacy properties that don't exist in new schema
    return (
      state.hasOwnProperty('worldName') ||
      state.hasOwnProperty('loading') ||
      state.hasOwnProperty('wsError') ||
      (state.agentModal && state.agentModal.hasOwnProperty('isLoading'))
    );
  }

  /**
   * Migrate state to new format if needed
   * @param {Object} state - State to migrate
   * @returns {Object} Migrated state
   */
  migrateState(state) {
    if (this.detectLegacyMode(state)) {
      return migrateLegacyState(state);
    }
    return { ...createInitialAppState(), ...state };
  }

  /**
   * Get current state in legacy format for backward compatibility
   * @returns {Object} Legacy format state
   */
  getLegacyState() {
    return {
      // World state
      worlds: this.state.world.available,
      worldName: this.state.world.current,

      // Agent grid state
      agents: this.state.agentGrid.agents,
      loading: this.state.agentGrid.isLoading,

      // Chat state
      messages: this.state.chat.messages,
      quickMessage: this.state.chat.quickMessage,
      needScroll: this.state.chat.needScroll,
      isSending: this.state.chat.isSending,

      // Agent modal state (legacy format)
      agentModal: this.getLegacyModalState(),

      // UI state
      theme: this.state.ui.theme,

      // Connection state
      connectionStatus: this.state.connection.status,

      // Error state
      wsError: this.state.errors.global,
      error: this.state.errors.global
    };
  }

  /**
   * Get agent modal state in legacy format
   * @returns {Object} Legacy modal state
   */
  getLegacyModalState() {
    const modal = this.state.agentModal;
    return {
      isOpen: modal.isOpen,
      mode: modal.mode,
      agent: modal.agent,
      isLoading: modal.operation.status === 'loading',
      error: modal.errors.operation,
      validationErrors: Object.values(modal.errors.validation)
    };
  }

  /**
   * Get standardized agent modal state
   * @returns {Object} Standardized modal state
   */
  getAgentModalState() {
    return this.state.agentModal;
  }

  /**
   * Get standardized chat state
   * @returns {Object} Standardized chat state
   */
  getChatState() {
    return this.state.chat;
  }

  /**
   * Get standardized world state
   * @returns {Object} Standardized world state
   */
  getWorldState() {
    return this.state.world;
  }

  /**
   * Get standardized agent grid state
   * @returns {Object} Standardized agent grid state
   */
  getAgentGridState() {
    return this.state.agentGrid;
  }

  /**
   * Update agent modal state (accepts both legacy and new formats)
   * @param {Object} modalState - Modal state update
   * @returns {StateManager} This instance for chaining
   */
  updateAgentModal(modalState) {
    if (this.isLegacyModalUpdate(modalState)) {
      this.updateLegacyModalState(modalState);
    } else {
      this.state.agentModal = { ...this.state.agentModal, ...modalState };
    }
    return this;
  }

  /**
   * Check if modal update is in legacy format
   * @param {Object} modalState - Modal state to check
   * @returns {boolean} True if legacy format
   */
  isLegacyModalUpdate(modalState) {
    return (
      modalState.hasOwnProperty('isLoading') ||
      Array.isArray(modalState.validationErrors)
    );
  }

  /**
   * Update modal state from legacy format
   * @param {Object} legacyModal - Legacy modal state
   */
  updateLegacyModalState(legacyModal) {
    const modal = this.state.agentModal;

    if (legacyModal.hasOwnProperty('isOpen')) {
      modal.isOpen = legacyModal.isOpen;
    }
    if (legacyModal.hasOwnProperty('mode')) {
      modal.mode = legacyModal.mode;
    }
    if (legacyModal.hasOwnProperty('agent')) {
      modal.agent = legacyModal.agent;
    }
    if (legacyModal.hasOwnProperty('isLoading')) {
      modal.operation.status = legacyModal.isLoading ? 'loading' : 'idle';
    }
    if (legacyModal.hasOwnProperty('error')) {
      modal.errors.operation = legacyModal.error;
    }
    if (legacyModal.hasOwnProperty('validationErrors')) {
      modal.errors.validation = Array.isArray(legacyModal.validationErrors)
        ? legacyModal.validationErrors.reduce((acc, error, index) => {
          acc[`field_${index}`] = error;
          return acc;
        }, {})
        : legacyModal.validationErrors;
    }
  }

  /**
   * Open agent modal for creating new agent
   * @param {Object} [overrides] - Override default create settings
   * @returns {StateManager} This instance for chaining
   */
  openCreateAgentModal(overrides = {}) {
    const createData = createInitialCreateModalData();

    // Apply any override defaults
    if (overrides.defaults) {
      createData.defaults = { ...createData.defaults, ...overrides.defaults };
    }

    this.state.agentModal = {
      ...createInitialAgentModalState(),
      isOpen: true,
      mode: 'create',
      agent: {
        name: createData.defaults.name || '',
        systemPrompt: createData.defaults.systemPrompt,
        type: createData.defaults.type,
        provider: createData.defaults.provider,
        model: createData.defaults.model,
        temperature: createData.defaults.temperature,
        maxTokens: createData.defaults.maxTokens
      },
      data: createData,
      ...overrides
    };

    return this;
  }

  /**
   * Open agent modal for editing existing agent
   * @param {Object} agent - Agent to edit
   * @param {Object} [overrides] - Override default edit settings
   * @returns {StateManager} This instance for chaining
   */
  openEditAgentModal(agent, overrides = {}) {
    const editData = createInitialEditModalData(agent.id || agent.name);

    this.state.agentModal = {
      ...createInitialAgentModalState(),
      isOpen: true,
      mode: 'edit',
      agent: { ...agent },
      originalAgent: { ...agent },
      data: editData,
      ...overrides
    };

    return this;
  }

  /**
   * Close agent modal
   * @returns {StateManager} This instance for chaining
   */
  closeAgentModal() {
    this.state.agentModal = createInitialAgentModalState();
    return this;
  }

  /**
   * Set modal loading state
   * @param {boolean} isLoading - Loading state
   * @param {string} [message] - Optional loading message
   * @returns {StateManager} This instance for chaining
   */
  setModalLoading(isLoading, message = null) {
    this.state.agentModal.operation.status = isLoading ? 'loading' : 'idle';
    this.state.agentModal.operation.message = message;
    return this;
  }

  /**
   * Set modal error
   * @param {string} error - Error message
   * @param {string} [type='operation'] - Error type
   * @returns {StateManager} This instance for chaining
   */
  setModalError(error, type = 'operation') {
    this.state.agentModal.errors[type] = error;
    this.state.agentModal.operation.status = 'error';
    return this;
  }

  /**
   * Clear modal errors
   * @param {string} [type] - Specific error type to clear, or all if not specified
   * @returns {StateManager} This instance for chaining
   */
  clearModalErrors(type = null) {
    if (type) {
      this.state.agentModal.errors[type] = null;
    } else {
      this.state.agentModal.errors = createInitialModalErrors();
    }
    return this;
  }

  /**
   * Update agent in modal
   * @param {Object} updates - Agent property updates
   * @returns {StateManager} This instance for chaining
   */
  updateModalAgent(updates) {
    if (this.state.agentModal.agent) {
      this.state.agentModal.agent = { ...this.state.agentModal.agent, ...updates };
      this.state.agentModal.ui.isDirty = true;
    }
    return this;
  }

  /**
   * Update chat state
   * @param {Object} updates - Chat state updates
   * @returns {StateManager} This instance for chaining
   */
  updateChat(updates) {
    this.state.chat = { ...this.state.chat, ...updates };
    return this;
  }

  /**
   * Add message to chat
   * @param {Object} message - Message to add
   * @returns {StateManager} This instance for chaining
   */
  addMessage(message) {
    this.state.chat.messages = [...this.state.chat.messages, message];
    this.state.chat.needScroll = true;
    return this;
  }

  /**
   * Clear chat messages
   * @returns {StateManager} This instance for chaining
   */
  clearMessages() {
    this.state.chat.messages = [];
    this.state.chat.error = null;
    return this;
  }

  /**
   * Update world state
   * @param {Object} updates - World state updates
   * @returns {StateManager} This instance for chaining
   */
  updateWorld(updates) {
    this.state.world = { ...this.state.world, ...updates };
    return this;
  }

  /**
   * Select world
   * @param {string} worldName - World name to select
   * @returns {StateManager} This instance for chaining
   */
  selectWorld(worldName) {
    this.state.world.current = worldName;
    return this;
  }

  /**
   * Update agent grid state
   * @param {Object} updates - Agent grid updates
   * @returns {StateManager} This instance for chaining
   */
  updateAgentGrid(updates) {
    this.state.agentGrid = { ...this.state.agentGrid, ...updates };
    return this;
  }

  /**
   * Set agents in grid
   * @param {Object[]} agents - Agents array
   * @returns {StateManager} This instance for chaining
   */
  setAgents(agents) {
    this.state.agentGrid.agents = agents;
    this.state.agentGrid.isLoading = false;
    return this;
  }

  /**
   * Get current state (automatically returns appropriate format)
   * @param {boolean} [forceLegacy=false] - Force legacy format
   * @returns {Object} Current state
   */
  getState(forceLegacy = false) {
    return forceLegacy || this.legacyMode ? this.getLegacyState() : this.state;
  }

  /**
   * Clone state manager with current state
   * @returns {StateManager} New state manager instance
   */
  clone() {
    return new StateManager(this.state);
  }
}

// ============================================================================
// Convenience Functions for Backward Compatibility
// ============================================================================

/**
 * Create state manager from legacy state
 * @param {Object} legacyState - Legacy state object
 * @returns {StateManager} State manager instance
 */
export function createStateManagerFromLegacy(legacyState) {
  return new StateManager(legacyState);
}

/**
 * Transform legacy modal state to new format
 * @param {Object} legacyModal - Legacy modal state
 * @returns {Object} New format modal state
 */
export function transformLegacyModalState(legacyModal) {
  const stateManager = new StateManager();
  stateManager.updateLegacyModalState(legacyModal);
  return stateManager.getAgentModalState();
}

/**
 * Transform new modal state to legacy format
 * @param {Object} newModal - New format modal state
 * @returns {Object} Legacy format modal state
 */
export function transformToLegacyModalState(newModal) {
  return {
    isOpen: newModal.isOpen,
    mode: newModal.mode,
    agent: newModal.agent,
    isLoading: newModal.operation.status === 'loading',
    error: newModal.errors.operation,
    validationErrors: Object.values(newModal.errors.validation)
  };
}

// Export default instance for global use
export default StateManager;
