/**
 * Application State Schema - Standardized state definitions for Agent World
 * 
 * This module defines the complete application state structure using JavaScript
 * patterns with JSDoc type definitions. All components should use these schemas
 * for consistent state management.
 * 
 * Key Features:
 * - Standardized state structure across all components
 * - Clear separation of concerns (UI, data, operations)
 * - Mode-specific schemas for different component states
 * - JavaScript patterns with JSDoc for type safety
 * - Backward compatibility with existing components
 * 
 * Architecture:
 * - Core app state in home.js manages all component states
 * - Each component receives standardized state slices
 * - State updates flow through standardized patterns
 * - Immutable state updates with spread operators
 */

// ============================================================================
// Core Application State Schema
// ============================================================================

/**
 * @typedef {Object} AppState
 * @property {WorldState} world - World management state
 * @property {AgentGridState} agentGrid - Agent grid display state
 * @property {ChatState} chat - Chat interface state
 * @property {AgentModalState} agentModal - Agent modal state
 * @property {UIState} ui - Global UI state
 * @property {ConnectionState} connection - Connection and loading state
 * @property {ErrorState} errors - Error handling state
 */

// ============================================================================
// State Slice Schemas
// ============================================================================

/**
 * @typedef {Object} WorldState
 * @property {World[]} available - Available worlds list
 * @property {string|null} current - Currently selected world name
 * @property {boolean} isLoading - Loading worlds state
 * @property {string|null} error - World loading error
 */

/**
 * @typedef {Object} World
 * @property {string} name - World name
 * @property {string} [description] - World description
 * @property {number} agentCount - Number of agents in world
 * @property {Date} [createdAt] - Creation timestamp
 * @property {Date} [lastActivity] - Last activity timestamp
 */

/**
 * @typedef {Object} AgentGridState
 * @property {Agent[]} agents - Agents in current world
 * @property {boolean} isLoading - Loading agents state
 * @property {string|null} error - Agent loading error
 * @property {AgentDisplayMode} displayMode - How agents are displayed
 */

/**
 * @typedef {'grid'|'list'|'compact'} AgentDisplayMode
 */

/**
 * @typedef {Object} Agent
 * @property {string} id - Agent unique identifier
 * @property {string} name - Agent display name
 * @property {string} systemPrompt - Agent system prompt
 * @property {string} type - Agent type (assistant, user, system)
 * @property {string} provider - LLM provider
 * @property {string} model - LLM model
 * @property {AgentStatus} status - Current agent status
 * @property {number} memorySize - Memory size for display
 * @property {number} llmCallCount - Number of LLM calls
 * @property {Date} [lastActive] - Last activity timestamp
 * @property {Date} [createdAt] - Creation timestamp
 */

/**
 * @typedef {'active'|'inactive'|'error'|'creating'|'updating'} AgentStatus
 */

/**
 * @typedef {Object} ChatState
 * @property {Message[]} messages - Chat messages
 * @property {string} quickMessage - Current input message
 * @property {boolean} isSending - Sending message state
 * @property {boolean} needScroll - Auto-scroll trigger
 * @property {string|null} error - Chat error message
 */

/**
 * @typedef {Object} Message
 * @property {string} id - Message unique identifier
 * @property {string} type - Message type
 * @property {string} sender - Message sender
 * @property {string} text - Message content
 * @property {string} timestamp - ISO timestamp
 * @property {string} worldName - Associated world
 * @property {boolean} [sending] - Currently sending indicator
 * @property {boolean} [hasError] - Error indicator
 */

/**
 * @typedef {Object} UIState
 * @property {string} theme - Current theme (light, dark, system)
 * @property {boolean} sidebarOpen - Sidebar visibility
 * @property {ViewMode} viewMode - Current view mode
 * @property {Object} preferences - User preferences
 */

/**
 * @typedef {'home'|'settings'|'help'} ViewMode
 */

/**
 * @typedef {Object} ConnectionState
 * @property {ConnectionStatus} status - Connection status
 * @property {boolean} isLoading - Global loading state
 * @property {number} retryCount - Connection retry attempts
 * @property {Date} [lastConnected] - Last successful connection
 */

/**
 * @typedef {'connected'|'disconnected'|'connecting'|'error'} ConnectionStatus
 */

/**
 * @typedef {Object} ErrorState
 * @property {string|null} global - Global error message
 * @property {Object<string, string>} component - Component-specific errors
 * @property {string[]} notifications - Error notifications queue
 */

// ============================================================================
// Agent Modal State Schemas
// ============================================================================

/**
 * @typedef {Object} AgentModalState
 * @property {boolean} isOpen - Modal visibility
 * @property {ModalMode} mode - Modal operation mode
 * @property {OperationState} operation - Current operation state
 * @property {Agent|null} agent - Agent being edited/created
 * @property {Agent|null} originalAgent - Original agent for comparison (edit mode)
 * @property {ModalUIState} ui - Modal UI state
 * @property {ModalErrors} errors - Modal error state
 * @property {CreateModalData|EditModalData} data - Mode-specific data
 */

/**
 * @typedef {'create'|'edit'} ModalMode
 */

/**
 * @typedef {Object} OperationState
 * @property {'idle'|'loading'|'saving'|'validating'|'error'} status - Operation status
 * @property {string|null} message - Status message
 * @property {number} progress - Progress percentage (0-100)
 */

/**
 * @typedef {Object} ModalUIState
 * @property {string|null} focusField - Currently focused field
 * @property {boolean} isDirty - Has unsaved changes
 * @property {boolean} showAdvanced - Show advanced options
 * @property {string[]} expandedSections - Expanded UI sections
 */

/**
 * @typedef {Object} ModalErrors
 * @property {string|null} operation - High-level operation error
 * @property {Object<string, string>} validation - Field validation errors
 * @property {string|null} api - API/network error
 * @property {string|null} system - System/unexpected error
 */

// ============================================================================
// Mode-Specific Modal Data
// ============================================================================

/**
 * @typedef {Object} CreateModalData
 * @property {CreateDefaults} defaults - Default values for new agents
 * @property {TemplateOption[]} templates - Available agent templates
 * @property {ProviderOption[]} providers - Available LLM providers
 * @property {Object<string, string[]>} models - Available models per provider
 * @property {CreateUIConfig} uiConfig - Create-specific UI configuration
 */

/**
 * @typedef {Object} CreateDefaults
 * @property {string} provider - Default LLM provider
 * @property {string} model - Default LLM model
 * @property {string} type - Default agent type
 * @property {string} systemPrompt - Default system prompt
 * @property {number} temperature - Default temperature
 * @property {number} maxTokens - Default max tokens
 */

/**
 * @typedef {Object} TemplateOption
 * @property {string} id - Template identifier
 * @property {string} name - Template display name
 * @property {string} description - Template description
 * @property {string} systemPrompt - Template system prompt
 * @property {string} category - Template category
 * @property {string[]} tags - Template tags
 */

/**
 * @typedef {Object} ProviderOption
 * @property {string} id - Provider identifier
 * @property {string} name - Provider display name
 * @property {boolean} available - Provider availability
 * @property {string[]} models - Available models
 * @property {Object} config - Provider-specific config
 */

/**
 * @typedef {Object} CreateUIConfig
 * @property {boolean} showTemplates - Show template selection
 * @property {boolean} showAdvancedByDefault - Show advanced options by default
 * @property {string[]} requiredFields - Required field names
 * @property {string[]} hiddenFields - Hidden field names
 */

/**
 * @typedef {Object} EditModalData
 * @property {string} agentId - Agent being edited
 * @property {Date} lastSaved - Last save timestamp
 * @property {string[]} availableActions - Available actions for this agent
 * @property {MemoryStats} memoryStats - Agent memory statistics
 * @property {EditHistory[]} history - Edit history
 * @property {EditUIConfig} uiConfig - Edit-specific UI configuration
 */

/**
 * @typedef {Object} MemoryStats
 * @property {number} messageCount - Number of messages in memory
 * @property {number} totalSize - Total memory size in bytes
 * @property {Date} lastActivity - Last memory activity
 * @property {Date} oldestMessage - Oldest message timestamp
 */

/**
 * @typedef {Object} EditHistory
 * @property {Date} timestamp - Edit timestamp
 * @property {string} field - Field that was changed
 * @property {string} oldValue - Previous value
 * @property {string} newValue - New value
 * @property {string} userId - User who made the change
 */

/**
 * @typedef {Object} EditUIConfig
 * @property {boolean} showHistory - Show edit history
 * @property {boolean} enableAutoSave - Enable auto-save
 * @property {number} autoSaveInterval - Auto-save interval in seconds
 * @property {string[]} readonlyFields - Read-only field names
 */

// ============================================================================
// State Factory Functions
// ============================================================================

/**
 * Create initial application state
 * @returns {AppState}
 */
export function createInitialAppState() {
  return {
    world: createInitialWorldState(),
    agentGrid: createInitialAgentGridState(),
    chat: createInitialChatState(),
    agentModal: createInitialAgentModalState(),
    ui: createInitialUIState(),
    connection: createInitialConnectionState(),
    errors: createInitialErrorState()
  };
}

/**
 * Create initial world state
 * @returns {WorldState}
 */
export function createInitialWorldState() {
  return {
    available: [],
    current: null,
    isLoading: false,
    error: null
  };
}

/**
 * Create initial agent grid state
 * @returns {AgentGridState}
 */
export function createInitialAgentGridState() {
  return {
    agents: [],
    isLoading: false,
    error: null,
    displayMode: 'grid'
  };
}

/**
 * Create initial chat state
 * @returns {ChatState}
 */
export function createInitialChatState() {
  return {
    messages: [],
    quickMessage: '',
    isSending: false,
    needScroll: false,
    error: null
  };
}

/**
 * Create initial agent modal state
 * @returns {AgentModalState}
 */
export function createInitialAgentModalState() {
  return {
    isOpen: false,
    mode: 'create',
    operation: createInitialOperationState(),
    agent: null,
    originalAgent: null,
    ui: createInitialModalUIState(),
    errors: createInitialModalErrors(),
    data: createInitialCreateModalData()
  };
}

/**
 * Create initial operation state
 * @returns {OperationState}
 */
export function createInitialOperationState() {
  return {
    status: 'idle',
    message: null,
    progress: 0
  };
}

/**
 * Create initial modal UI state
 * @returns {ModalUIState}
 */
export function createInitialModalUIState() {
  return {
    focusField: null,
    isDirty: false,
    showAdvanced: false,
    expandedSections: []
  };
}

/**
 * Create initial modal errors
 * @returns {ModalErrors}
 */
export function createInitialModalErrors() {
  return {
    operation: null,
    validation: {},
    api: null,
    system: null
  };
}

/**
 * Create initial UI state
 * @returns {UIState}
 */
export function createInitialUIState() {
  return {
    theme: 'system',
    sidebarOpen: false,
    viewMode: 'home',
    preferences: {}
  };
}

/**
 * Create initial connection state
 * @returns {ConnectionState}
 */
export function createInitialConnectionState() {
  return {
    status: 'connecting',
    isLoading: true,
    retryCount: 0,
    lastConnected: null
  };
}

/**
 * Create initial error state
 * @returns {ErrorState}
 */
export function createInitialErrorState() {
  return {
    global: null,
    component: {},
    notifications: []
  };
}

// ============================================================================
// Mode-Specific Factory Functions
// ============================================================================

/**
 * Create initial create modal data
 * @returns {CreateModalData}
 */
export function createInitialCreateModalData() {
  return {
    defaults: {
      provider: 'ollama',
      model: 'llama3.2:3b',
      type: 'assistant',
      systemPrompt: '',
      temperature: 0.7,
      maxTokens: 2048
    },
    templates: [],
    providers: [],
    models: {},
    uiConfig: {
      showTemplates: true,
      showAdvancedByDefault: false,
      requiredFields: ['name'],
      hiddenFields: []
    }
  };
}

/**
 * Create initial edit modal data
 * @param {string} agentId - Agent ID being edited
 * @returns {EditModalData}
 */
export function createInitialEditModalData(agentId) {
  return {
    agentId,
    lastSaved: new Date(),
    availableActions: ['update', 'delete', 'clearMemory'],
    memoryStats: {
      messageCount: 0,
      totalSize: 0,
      lastActivity: new Date(),
      oldestMessage: new Date()
    },
    history: [],
    uiConfig: {
      showHistory: false,
      enableAutoSave: false,
      autoSaveInterval: 30,
      readonlyFields: ['id', 'createdAt']
    }
  };
}

// ============================================================================
// State Validation Functions
// ============================================================================

/**
 * Validate app state structure
 * @param {Object} state - State to validate
 * @returns {boolean} True if valid
 */
export function validateAppState(state) {
  return (
    state &&
    typeof state === 'object' &&
    state.world &&
    state.agentGrid &&
    state.chat &&
    state.agentModal &&
    state.ui &&
    state.connection &&
    state.errors
  );
}

/**
 * Validate agent modal state
 * @param {Object} modalState - Modal state to validate
 * @returns {boolean} True if valid
 */
export function validateAgentModalState(modalState) {
  return (
    modalState &&
    typeof modalState === 'object' &&
    typeof modalState.isOpen === 'boolean' &&
    ['create', 'edit'].includes(modalState.mode) &&
    modalState.operation &&
    modalState.ui &&
    modalState.errors &&
    modalState.data
  );
}

// ============================================================================
// State Migration Functions
// ============================================================================

/**
 * Migrate legacy state to new schema
 * @param {Object} legacyState - Legacy state structure
 * @returns {AppState} Migrated state
 */
export function migrateLegacyState(legacyState) {
  const newState = createInitialAppState();

  // Migrate world state
  if (legacyState.worlds) {
    newState.world.available = legacyState.worlds;
  }
  if (legacyState.worldName) {
    newState.world.current = legacyState.worldName;
  }

  // Migrate agent grid state
  if (legacyState.agents) {
    newState.agentGrid.agents = legacyState.agents;
  }
  if (legacyState.loading !== undefined) {
    newState.agentGrid.isLoading = legacyState.loading;
  }

  // Migrate chat state
  if (legacyState.messages) {
    newState.chat.messages = legacyState.messages;
  }
  if (legacyState.quickMessage) {
    newState.chat.quickMessage = legacyState.quickMessage;
  }
  if (legacyState.needScroll !== undefined) {
    newState.chat.needScroll = legacyState.needScroll;
  }

  // Migrate agent modal state
  if (legacyState.agentModal) {
    migrateLegacyModalState(legacyState.agentModal, newState.agentModal);
  }

  // Migrate UI state
  if (legacyState.theme) {
    newState.ui.theme = legacyState.theme;
  }

  // Migrate connection state
  if (legacyState.connectionStatus) {
    newState.connection.status = legacyState.connectionStatus;
  }

  // Migrate error state
  if (legacyState.wsError) {
    newState.errors.global = legacyState.wsError;
  }

  return newState;
}

/**
 * Migrate legacy modal state to new schema
 * @param {Object} legacyModal - Legacy modal state
 * @param {AgentModalState} newModal - New modal state to update
 */
function migrateLegacyModalState(legacyModal, newModal) {
  if (legacyModal.isOpen !== undefined) {
    newModal.isOpen = legacyModal.isOpen;
  }
  if (legacyModal.mode) {
    newModal.mode = legacyModal.mode;
  }
  if (legacyModal.agent) {
    newModal.agent = legacyModal.agent;
  }
  if (legacyModal.isLoading !== undefined) {
    newModal.operation.status = legacyModal.isLoading ? 'loading' : 'idle';
  }
  if (legacyModal.error) {
    newModal.errors.operation = legacyModal.error;
  }
  if (legacyModal.validationErrors) {
    // Convert array to object
    newModal.errors.validation = legacyModal.validationErrors.reduce((acc, error, index) => {
      acc[`field_${index}`] = error;
      return acc;
    }, {});
  }
}
