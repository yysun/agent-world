# Agent Modal Logic Consolidation Requirements

## Current Analysis

### Issues Identified
1. **Inconsistent Agent Data Handling**: Different property fallbacks (`systemPrompt`, `prompt`, `system_prompt`, `config.systemPrompt`) suggest unclear data structure contracts
2. **Redundant Logic**: Multiple similar state updates for `showAgentModel` and `editingAgent` 
3. **Error Handling Inconsistency**: Different error handling patterns between create and edit flows
4. **Status Detection Logic**: Using `agent.status === 'New'` as primary differentiator is fragile
5. **API Call Patterns**: Two-step process for new agents (create then update prompt) could be consolidated
6. **State Management**: Mixed responsibilities between modal component and parent state management

### Current Flow Analysis

#### New Agent Creation
```
openAgentModal(state, null) 
→ Sets editingAgent: { name: 'New Agent', config: {} }
→ closeAgentModal with save
→ createAgent API call
→ updateAgent API call (if prompt provided)
```

#### Edit Existing Agent
```
openAgentModal(state, agent)
→ getAgent API call to fetch full data
→ Sets editingAgent: fullAgent
→ closeAgentModal with save  
→ updateAgent API call with prompt and config
```

## Requirements

### R1: Unified Agent Data Structure
- Define consistent agent data interface
- Standardize system prompt property name across all components
- Eliminate property name fallbacks through proper API contracts

### R2: Simplified Modal State Management
- Consolidate modal open/close logic into single state update pattern
- Reduce redundant state properties
- Clear separation between modal display state and agent editing state

### R3: Unified Save Operation
- Single save flow that handles both create and edit scenarios
- Eliminate two-step API calls for new agent creation
- Consistent error handling across all operations

### R4: Improved Agent Type Detection
- Replace fragile status-based detection with more robust method
- Use presence/absence of agent ID or similar immutable property
- Clear distinction between "new" vs "existing" agent workflows

### R5: Error Handling Standardization
- Consistent error messaging and user feedback
- Proper fallback behaviors for failed API calls
- User-friendly error states in modal

### R6: Form Validation
- Validate required fields (agent name, etc.)
- Prevent submission with invalid data
- Clear validation feedback to users

## Success Criteria
- Single, clear agent data flow from API to UI
- Reduced code duplication in modal operations  
- Consistent user experience for create vs edit workflows
- Robust error handling with proper user feedback
- Maintainable code structure with clear responsibilities
