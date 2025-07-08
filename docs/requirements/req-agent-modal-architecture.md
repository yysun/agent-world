# Agent Modal Architecture Requirements

## Current State Analysis

### Current Implementation
The Agent Modal currently exists as a **hybrid component**:

- **UI Component**: `AgentModal` function exports a template
- **State Management**: Multiple state functions exported from modal file
- **Event Handlers**: Registered in `home.js` update object
- **Business Logic**: API operations in modal file

### Issues with Current Architecture

#### 1. Split Responsibility
- **Event handlers** live in `home.js` but operate on modal state
- **State logic** lives in `agent-modal.js` but events dispatched from `home.js`
- Creates coupling between main app and modal component

#### 2. State Management Complexity
- Modal state mixed with main app state in `home.js`
- `updateModalAgentName` and `updateModalAgentSystemPrompt` handlers in main app
- Creates cross-component dependencies

#### 3. AppRun Pattern Violations
- Uses `run('updateModalAgentName')` from modal UI but handler in main app
- Event propagation across component boundaries
- Breaks component encapsulation

#### 4. Testing and Maintenance
- Modal behavior spread across multiple files
- Hard to test modal in isolation
- Changes require updates in multiple locations

## Requirements for Improved Architecture

### Functional Requirements

#### FR1: Component Encapsulation
- Modal should be a self-contained AppRun component
- All modal state and event handlers within modal component
- No modal-specific events in main app

#### FR2: Clean Interface
- Main app only needs to trigger: open/close modal
- Modal communicates back via callbacks or global events
- Simple prop-passing interface

#### FR3: State Isolation
- Modal manages its own internal state
- Main app provides initial data and receives results
- No shared state mutations

#### FR4: Event Handling
- All modal events handled within modal component
- Use local `run()` calls for modal-internal events
- Global events only for cross-component communication

### Technical Requirements

#### TR1: AppRun Component Pattern
- Modal as full AppRun Component with state/view/update
- Or functional component with internal state management
- Follow established patterns from other components

#### TR2: API Integration
- Modal handles all agent CRUD operations
- Returns success/failure to parent via callbacks
- Proper error handling and loading states

#### TR3: Validation
- Form validation handled within modal
- Error display managed by modal component
- No validation logic in main app

## Proposed Solutions

### Option 1: Full AppRun Component
Convert modal to standalone Component with:
- Own state initialization
- Complete update object
- Self-contained event handling
- Callback-based parent communication

### Option 2: Enhanced Functional Component
Keep functional approach but add:
- Internal state management hooks
- Self-contained event handlers
- Proper component boundaries

### Option 3: Hybrid with Clear Boundaries
Current approach but with:
- All event handlers moved to modal file
- Clear interface contract
- Reduced coupling

## Recommendation

**Option 1: Full AppRun Component** is recommended because:

1. **Follows AppRun patterns** - Matches established component architecture
2. **Complete encapsulation** - All modal logic in one place
3. **Easy testing** - Component can be tested in isolation
4. **Maintainable** - Clear boundaries and responsibilities
5. **Reusable** - Can be used in other parts of app

## Implementation Plan

1. Create standalone modal component with Component class
2. Move all event handlers to modal component
3. Implement callback-based communication
4. Update main app to use simplified interface
5. Remove modal events from main app update object
6. Test modal functionality independently

## Success Criteria

- [ ] Modal functions independently of main app
- [ ] All modal events handled within modal component  
- [ ] Main app only calls open/close with callbacks
- [ ] No modal-specific state in main app
- [ ] Modal can be tested in isolation
- [ ] Code is more maintainable and readable
