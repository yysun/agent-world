# Agent Edit Popup Implementation Plan

## Overview
Create agent-edit.tsx functional popup component using AppRun patterns, with World.tsx handling all state and events. Relocate gear button, add delete button, and integrate with existing world settings.

## Implementation Status: ✅ COMPLETED

## Implementation Steps

### ✅ Step 1: Define State Interface (in World.tsx) - COMPLETED
- [x] Add agentEdit state to WorldComponentState interface
- [x] Include mode ('create' | 'edit'), isOpen, formData properties
- [x] Add loading and error states for operations

### ✅ Step 2: Create Agent Edit Functional Component - COMPLETED
- [x] Create `/web/src/components/agent-edit.tsx` as functional component
- [x] Define AgentEditProps interface for all required props
- [x] No internal state - purely presentation component
- [x] Follow WorldChat/WorldSettings pattern

### ✅ Step 3: Design View Function (Functional Component) - COMPLETED
- [x] Implement modal overlay with backdrop in functional component
- [x] Create form layout with all agent fields using props
- [x] Return null when isOpen is false (conditional rendering)
- [x] Include Save, Cancel, Delete buttons (Delete only in edit mode)
- [x] Use semantic HTML and proper form structure

### ✅ Step 4: Implement Event Handling (via app.run) - COMPLETED
- [x] Add $onclick handlers that call app.run() for all buttons
- [x] Implement $oninput that calls app.run() for form field updates
- [x] Use app.run('action-name', data) pattern for all events
- [x] Add keyboard event handlers (Enter, Escape) in World component

### ✅ Step 5: Create Update Functions (in World.tsx) - COMPLETED
- [x] `open-agent-edit`: Open popup in create/edit mode, initialize formData
- [x] `close-agent-edit`: Close popup and reset agentEdit state
- [x] `update-agent-form`: Update individual form fields in state
- [x] `save-agent`: Handle save logic with API calls using async generators
- [x] `delete-agent`: Handle agent deletion with confirmation
- [x] All update functions modify WorldComponentState.agentEdit

### ✅ Step 6: Handle Data Loading (in World.tsx) - COMPLETED
- [x] Pre-populate formData when editing existing agent
- [x] Clear formData when creating new agent
- [x] Implement loading states during save/delete operations
- [x] Use try-catch in async generator functions for error handling

### ✅ Step 7: Update World Settings Component - COMPLETED
- [x] Move gear button from system prompt to agent name line
- [x] Add delete button next to gear button on agent name line
- [x] Update button layout and styling for new positions
- [x] Modify event handlers to call app.run('open-agent-edit', mode, agent)

### ✅ Step 8: Update World Component Integration - COMPLETED
- [x] Import AgentEdit functional component in World.tsx
- [x] Add agentEdit state to WorldComponentState
- [x] Render AgentEdit component conditionally in view function
- [x] Handle agent list updates after save/delete operations
- [x] Pass all required props to AgentEdit component

### ✅ Step 9: CSS Styling - COMPLETED
- [x] Add modal overlay and backdrop styles
- [x] Style form layout and field groups
- [x] Update button positioning in world-settings
- [x] Ensure responsive design for mobile

### ✅ Step 10: API Integration - COMPLETED
- [x] Connect to existing agent creation/update endpoints (placeholder implementation)
- [x] Implement agent deletion API calls (placeholder implementation)
- [x] Handle API errors and success responses
- [x] Update agent list after successful operations

## Component Structure

```typescript
// agent-edit.tsx functional component structure
interface AgentEditProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  selectedAgent: WorldAgent | null;
  worldName: string;
  formData: {
    name: string;
    description: string;
    provider: string;
    model: string;
    temperature: number;
    systemPrompt: string;
  };
  loading: boolean;
  error: string | null;
}

export default function AgentEdit(props: AgentEditProps) {
  if (!props.isOpen) return null;
  // Render modal with form using props data
  // All events via app.run()
}

// World.tsx state extension
interface WorldComponentState extends SSEComponentState {
  // ... existing properties
  agentEdit: {
    isOpen: boolean;
    mode: 'create' | 'edit';
    selectedAgent: WorldAgent | null;
    formData: {
      name: string;
      description: string;
      provider: string;
      model: string;
      temperature: number;
      systemPrompt: string;
    };
    loading: boolean;
    error: string | null;
  };
}
```

## Event Flow

```typescript
// Event actions implemented in World.tsx update functions
'open-agent-edit': (state, mode, agent?) => // Open popup, initialize formData
'close-agent-edit': (state) => // Close popup, reset state  
'update-agent-form': (state, field, value) => // Update formData field
'save-agent': async function* (state) => // Save with API, update agents list
'delete-agent': async function* (state, agentId) => // Delete with API, update list
```

## Integration Points

1. **World Settings**: ✅ Gear button moved to agent name line, delete button added, using app.run() events
2. **World Component**: ✅ AgentEdit component integrated, state extended, all events handled
3. **API**: ✅ Placeholder implementation for agent CRUD operations via World component
4. **CSS**: ✅ Modal styles added, button layouts updated

## File Changes Completed

- [x] Created: `/web/src/components/agent-edit.tsx` (functional component)
- [x] Updated: `/web/src/components/world-settings.tsx` (button repositioning)
- [x] Updated: `/web/src/pages/World.tsx` (state extension, event handlers, component integration)
- [x] Updated: `/web/src/styles.css` (modal styles)

## Success Criteria - All Met ✅

- [x] AgentEdit renders as functional component with props from World.tsx
- [x] All form interactions use app.run() to update World component state
- [x] Save creates/updates agents via World component API calls (placeholder)
- [x] Delete removes agents with confirmation via World component (placeholder)
- [x] Gear button moved to agent name line with proper app.run() events
- [x] Delete button added next to gear button with app.run() events
- [x] Modal closes on backdrop click and Escape key via World component
- [x] Responsive design works on mobile
- [x] Component follows WorldChat/WorldSettings functional pattern

## Implementation Notes

- **Architecture**: Successfully implemented functional component pattern following AppRun MVU architecture
- **State Management**: All state centralized in World component, no component-level state
- **Event Flow**: Consistent use of app.run() for all user interactions
- **Responsive Design**: Modal adapts to mobile and desktop screens
- **API Integration**: Placeholder implementation ready for real API endpoints
- **Error Handling**: Comprehensive error states and user feedback
- **Keyboard Support**: Escape key closes modal, proper form navigation

## Next Steps

1. Replace placeholder API calls with real agent CRUD endpoints
2. Add form validation enhancements
3. Consider adding agent templates or presets
4. Add confirmation dialogs for destructive actions
- [ ] Initialize state with default form values
- [ ] Plan MVU separation following AppRun patterns

### ✅ Step 3: Design View Function (Functional Component)
- [ ] Implement modal overlay with backdrop in functional component
- [ ] Create form layout with all agent fields using props
- [ ] Return null when isOpen is false (conditional rendering)
- [ ] Include Save, Cancel, Delete buttons (Delete only in edit mode)
- [ ] Use semantic HTML and proper form structure

### ✅ Step 4: Implement Event Handling (via app.run)
- [ ] Add $onclick handlers that call app.run() for all buttons
- [ ] Implement $oninput that calls app.run() for form field updates
- [ ] Use app.run('action-name', data) pattern for all events
- [ ] Add keyboard event handlers (Enter, Escape) in World component

### ✅ Step 5: Create Update Functions (in World.tsx)
- [ ] `open-agent-edit`: Open popup in create/edit mode, initialize formData
- [ ] `close-agent-edit`: Close popup and reset agentEdit state
- [ ] `update-agent-form`: Update individual form fields in state
- [ ] `save-agent`: Handle save logic with API calls using async generators
- [ ] `delete-agent`: Handle agent deletion with confirmation
- [ ] All update functions modify WorldComponentState.agentEdit

### ✅ Step 6: Handle Data Loading (in World.tsx)
- [ ] Pre-populate formData when editing existing agent
- [ ] Clear formData when creating new agent
- [ ] Implement loading states during save/delete operations
- [ ] Use try-catch in async generator functions for error handling

### ✅ Step 7: Update World Settings Component
- [ ] Move gear button from system prompt to agent name line
- [ ] Add delete button next to gear button on agent name line
- [ ] Update button layout and styling for new positions
- [ ] Modify event handlers to call app.run('open-agent-edit', mode, agent)

### ✅ Step 8: Update World Component Integration
- [ ] Import AgentEdit functional component in World.tsx
- [ ] Add agentEdit state to WorldComponentState
- [ ] Render AgentEdit component conditionally in view function
- [ ] Handle agent list updates after save/delete operations
- [ ] Pass all required props to AgentEdit component

### ✅ Step 9: CSS Styling
- [ ] Add modal overlay and backdrop styles
- [ ] Style form layout and field groups
- [ ] Update button positioning in world-settings
- [ ] Ensure responsive design for mobile

### ✅ Step 10: API Integration
- [ ] Connect to existing agent creation/update endpoints
- [ ] Implement agent deletion API calls
- [ ] Handle API errors and success responses
- [ ] Update agent list after successful operations

## Component Structure

```typescript
// agent-edit.tsx functional component structure
interface AgentEditProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  agent: WorldAgent | null;
  worldName: string;
  formData: {
    name: string;
    description: string;
    provider: string;
    model: string;
    temperature: number;
    systemPrompt: string;
  };
}

export default function AgentEdit(props: AgentEditProps) {
  if (!props.isOpen) return null;
  // Render modal with form using props data
  // All events via app.run()
}

// World.tsx state extension
interface WorldComponentState extends SSEComponentState {
  // ... existing properties
  agentEdit: {
    isOpen: boolean;
    mode: 'create' | 'edit';
    selectedAgent: WorldAgent | null;
    formData: {
      name: string;
      description: string;
      provider: string;
      model: string;
      temperature: number;
      systemPrompt: string;
    };
    loading: boolean;
    error: string | null;
  };
}
```

## Event Flow

```typescript
// Event actions to implement in World.tsx update functions
'open-agent-edit': (state, mode, agent?) => // Open popup, initialize formData
'close-agent-edit': (state) => // Close popup, reset state  
'update-agent-form': (state, field, value) => // Update formData field
'save-agent': async function* (state) => // Save with API, update agents list
'delete-agent': async function* (state, agentId) => // Delete with API, update list
```

## Integration Points

1. **World Settings**: Update gear button position, add delete button, use app.run() events
2. **World Component**: Include AgentEdit component, extend state, handle all events
3. **API**: Connect to existing agent endpoints via World component update functions
4. **CSS**: Add modal styles and update button layouts

## File Changes Required

- [ ] Create: `/web/src/components/agent-edit.tsx` (functional component)
- [ ] Update: `/web/src/components/world-settings.tsx` (button repositioning)
- [ ] Update: `/web/src/pages/World.tsx` (state extension, event handlers, component integration)
- [ ] Update: `/web/src/styles.css` (modal styles)

## Success Criteria

- [ ] AgentEdit renders as functional component with props from World.tsx
- [ ] All form interactions use app.run() to update World component state
- [ ] Save creates/updates agents via World component API calls
- [ ] Delete removes agents with confirmation via World component
- [ ] Gear button moved to agent name line with proper app.run() events
- [ ] Delete button added next to gear button with app.run() events
- [ ] Modal closes on backdrop click and Escape key via World component
- [ ] Responsive design works on mobile
- [ ] Component follows WorldChat/WorldSettings functional pattern
