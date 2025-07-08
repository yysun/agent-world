# Standardized State Schema Documentation

## Overview

This document describes the new standardized state schema for Agent World, implemented in JavaScript with JSDoc type definitions. The schema provides consistency, type safety, and clear separation of concerns while maintaining backward compatibility.

## Core Principles

### 1. **Separation of Concerns**
State is organized into logical slices:
- **World State**: World management and selection
- **Agent Grid State**: Agent display and management
- **Chat State**: Messaging and conversation
- **Agent Modal State**: Modal operations and form data
- **UI State**: Theme, preferences, and interface
- **Connection State**: Loading and connectivity
- **Error State**: Error handling and notifications

### 2. **Mode-Specific Optimization**
Different component modes have specialized state structures:
- **Create Mode**: Optimized for new agent creation with templates and defaults
- **Edit Mode**: Optimized for existing agent editing with history and memory stats

### 3. **Backward Compatibility**
The new schema works alongside existing code through:
- Legacy state transformation
- Automatic migration utilities
- Gradual adoption patterns

## State Structure

### Root Application State

```javascript
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
```

### Agent Modal State (Enhanced)

```javascript
/**
 * @typedef {Object} AgentModalState
 * @property {boolean} isOpen - Modal visibility
 * @property {ModalMode} mode - Modal operation mode ('create'|'edit')
 * @property {OperationState} operation - Current operation state
 * @property {Agent|null} agent - Agent being edited/created
 * @property {Agent|null} originalAgent - Original agent for comparison
 * @property {ModalUIState} ui - Modal UI state
 * @property {ModalErrors} errors - Modal error state
 * @property {CreateModalData|EditModalData} data - Mode-specific data
 */
```

### Create vs Edit Mode Differences

#### Create Mode State
```javascript
/**
 * @typedef {Object} CreateModalData
 * @property {CreateDefaults} defaults - Default values for new agents
 * @property {TemplateOption[]} templates - Available agent templates
 * @property {ProviderOption[]} providers - Available LLM providers
 * @property {Object<string, string[]>} models - Available models per provider
 * @property {CreateUIConfig} uiConfig - Create-specific UI configuration
 */
```

**Create Mode Features:**
- Agent templates for quick setup
- Provider and model selection
- Configurable defaults
- Template-based system prompts
- Required field validation

#### Edit Mode State
```javascript
/**
 * @typedef {Object} EditModalData
 * @property {string} agentId - Agent being edited
 * @property {Date} lastSaved - Last save timestamp
 * @property {string[]} availableActions - Available actions for this agent
 * @property {MemoryStats} memoryStats - Agent memory statistics
 * @property {EditHistory[]} history - Edit history
 * @property {EditUIConfig} uiConfig - Edit-specific UI configuration
 */
```

**Edit Mode Features:**
- Edit history tracking
- Memory statistics display
- Available actions (update, delete, clear memory)
- Auto-save capabilities
- Read-only field management

## Usage Patterns

### 1. **Basic State Manager Usage**

```javascript
import { StateManager } from './utils/state-manager.js';

// Create from legacy state
const stateManager = new StateManager(legacyState);

// Get standardized state slices
const modalState = stateManager.getAgentModalState();
const chatState = stateManager.getChatState();

// Update using fluent API
stateManager
  .updateModalAgent({ name: 'New Name' })
  .setModalLoading(true)
  .addMessage(newMessage);

// Get final state (legacy format for compatibility)
const updatedState = stateManager.getState(true);
```

### 2. **Opening Agent Modal for Create**

```javascript
// Legacy way
const newState = openCreateAgentModal(state);

// Enhanced way with options
const newState = openCreateAgentModal(state, {
  defaults: {
    provider: 'anthropic',
    model: 'claude-3-sonnet',
    systemPrompt: 'You are a helpful assistant...'
  }
});
```

### 3. **Component Integration**

```javascript
// In home.js update handlers
const updateModalAgentName = (state, e) => {
  const stateManager = new StateManager(state);
  stateManager.updateModalAgent({ name: e.target.value });
  return stateManager.getState(true); // Legacy format
};
```

### 4. **Error Handling**

```javascript
// Structured error handling
const stateManager = new StateManager(state);

// Different error types
stateManager.setModalError('API Error', 'api');
stateManager.setModalError('Invalid name', 'validation');
stateManager.setModalError('Unexpected error', 'system');

// Clear specific errors
stateManager.clearModalErrors('validation');
```

## Migration Strategy

### Phase 1: Infrastructure (✅ Complete)
- [x] Create standardized state schema
- [x] Implement StateManager with backward compatibility
- [x] Update agent modal state utilities
- [x] Create migration utilities

### Phase 2: Gradual Component Migration
- [ ] Migrate home.js to use StateManager internally
- [ ] Update modal components to use enhanced state
- [ ] Migrate chat handlers to new schema
- [ ] Update agent grid components

### Phase 3: Full Migration
- [ ] Remove legacy state transformation
- [ ] Update all components to use new schema directly
- [ ] Remove backward compatibility layer
- [ ] Update documentation

### Phase 4: Advanced Features
- [ ] Implement auto-save functionality
- [ ] Add edit history tracking
- [ ] Implement agent templates
- [ ] Add advanced error recovery

## Benefits

### 1. **Type Safety**
JSDoc provides IDE support:
```javascript
/** @type {AgentModalState} */
const modalState = stateManager.getAgentModalState();
// IDE now knows about modalState.operation.status, etc.
```

### 2. **Clear State Organization**
```javascript
// Instead of scattered properties
state.loading, state.wsError, state.agentModal.isLoading

// Organized structure
state.connection.isLoading
state.errors.global
state.agentModal.operation.status
```

### 3. **Mode-Specific Optimization**
```javascript
// Create mode has templates and defaults
const createData = modalState.data; // CreateModalData
const templates = createData.templates;
const defaults = createData.defaults;

// Edit mode has history and memory stats
const editData = modalState.data; // EditModalData
const history = editData.history;
const memoryStats = editData.memoryStats;
```

### 4. **Consistent Error Handling**
```javascript
// Structured error categorization
const errors = modalState.errors;
const operationError = errors.operation;
const validationErrors = errors.validation;
const apiError = errors.api;
```

## Best Practices

### 1. **Use StateManager for Complex Updates**
```javascript
// Good
const stateManager = new StateManager(state);
stateManager.updateModalAgent(updates).setModalLoading(false);
return stateManager.getState(true);

// Avoid direct state manipulation
return { ...state, agentModal: { ...state.agentModal, ... } };
```

### 2. **Leverage Mode-Specific Data**
```javascript
// Check mode and access appropriate data
if (modalState.mode === 'create') {
  const templates = modalState.data.templates;
  const defaults = modalState.data.defaults;
} else {
  const memoryStats = modalState.data.memoryStats;
  const history = modalState.data.history;
}
```

### 3. **Validate State Structure**
```javascript
import { validateAgentModalState } from './types/app-state-schema.js';

if (!validateAgentModalState(modalState)) {
  console.error('Invalid modal state structure');
}
```

### 4. **Use Fluent API for Multiple Updates**
```javascript
stateManager
  .updateModalAgent({ name: 'New Name' })
  .clearModalErrors()
  .setModalLoading(false)
  .updateChat({ needScroll: true });
```

## File Organization

```
public/
├── types/
│   ├── app-state-schema.js       # Main schema definitions
│   └── agent-types.js            # Agent-specific types
├── utils/
│   ├── state-manager.js          # StateManager class
│   ├── agent-modal-state.js      # Enhanced modal utilities
│   └── state-integration-example.js # Migration examples
├── components/
│   └── agent-modal.js            # Enhanced modal component
└── home.js                       # Main component (to be migrated)
```

## Examples

See `public/utils/state-integration-example.js` for complete examples of:
- Enhanced state initialization
- Message handling with new schema
- Modal operations
- Migration patterns
- Component integration

This standardized approach provides a solid foundation for future development while maintaining compatibility with existing code.
