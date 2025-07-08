# Requirements: Home State Refactor and TypeScript Migration

## Overview
Reorganize home-related state update functions and agent-modal functions into separate modules with proper TypeScript definitions, and clean up unused files.

## Core Requirements

### 1. State Function Organization
- **WHAT**: Group related state update functions into logical modules
- **WHAT**: Separate home page UI operations from agent modal operations  
- **WHAT**: Maintain clear separation of concerns between different UI areas

### 2. TypeScript Definition Migration
- **WHAT**: Replace JSDoc comments with proper `.d.ts` files
- **WHAT**: Create specific interfaces for each module's state requirements
- **WHAT**: Ensure type safety for all exported functions and state operations

### 3. File Structure Reorganization
- **WHAT**: Create `home-update.js` for home page specific state updates
- **WHAT**: Create `agent-modal-update.js` for agent modal specific state updates
- **WHAT**: Update import/export structure to maintain functionality
- **WHAT**: Update main `update/index.js` to re-export from new modules

### 4. Unused File Cleanup
- **WHAT**: Identify and remove unused JavaScript files
- **WHAT**: Identify and remove unused TypeScript definition files
- **WHAT**: Identify and remove unused CSS files or assets
- **WHAT**: Clean up redundant or obsolete configuration files

## Functional Scope

### Home Update Functions to Extract:
- Input field state management (`onQuickInput`, `onQuickKeypress`)
- Message sending with generator pattern (`sendQuickMessage`) 
- Navigation utilities (`scrollToTop`, `scrollToBottom`)
- Message clearing utility (`clearMessages`)
- State helper utilities (`getSelectedWorldName`)

### Agent Modal Update Functions to Extract:
- Modal opening operations (`openAgentModal`, `openAgentModalCreate`)
- Modal closing operations (`closeAgentModal`)
- Agent refresh after updates (`handleAgentUpdated`)
- Memory count updates (`handleAgentMemoryCleared`)

### TypeScript Interface Requirements:
- Home state interface for UI operations
- Agent modal state interface for modal operations
- Event handler type definitions
- API operation type definitions
- Utility function type definitions

## Quality Standards
- Maintain backward compatibility during transition
- Ensure all imports/exports work correctly
- Preserve existing functionality exactly
- Follow existing code patterns and conventions
- Ensure type safety with proper `.d.ts` files

## Success Criteria
- All home-related functions grouped in `home-update.js`
- All agent-modal functions grouped in `agent-modal-update.js`
- Proper TypeScript definitions for all modules
- All unused files identified and removed
- All existing functionality preserved
- Clean import/export structure maintained
