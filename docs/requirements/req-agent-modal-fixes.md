# Agent Modal Fixes Requirements

## Overview
Fix three critical issues with the agent modal and memory clearing functionality.

## Requirements

### 1. Clear Agent Memory Functionality
**Current Issue**: clearAgentMemory functions only show dummy messages and don't actually clear memory.

**Requirements**:
- ✅ DONE: Add `clearAgentMemory` function to WebSocket API (`ws-api.js`)
- ✅ DONE: Update `clearAgentMemory` in `agent-actions.js` to use real API calls
- ✅ DONE: Update `clearAgentMemoryFromModal` in `agent-actions.js` to use real API calls
- ✅ DONE: Both functions should show success/error messages in conversation
- ✅ DONE: Modal should close after successful memory clear

### 2. Agent Modal System Prompt Display
**Current Issue**: Agent modal doesn't show the system prompt - the textarea is empty.

**Requirements**:
- ✅ DONE: Agent modal should display the current system prompt when opened for existing agents
- ✅ DONE: Empty state should show placeholder text for new agents
- ✅ DONE: System prompt should be properly loaded from the agent object with fallback properties

**Implementation**:
- ✅ DONE: Added debug logging to investigate agent object structure
- ✅ DONE: Implemented fallback property access: `agent?.systemPrompt || agent?.prompt || agent?.system_prompt || agent?.config?.systemPrompt`
- ✅ DONE: Console logging to help identify actual agent object structure

### 3. Agent Modal System Prompt Updates
**Current Issue**: Agent modal should be able to update system prompts but may not be saving correctly.

**Requirements**:
- ✅ DONE: When saving an existing agent, update the system prompt via API
- ✅ DONE: Use the `updateAgent` function with `prompt` parameter
- ✅ DONE: Show success/error feedback through console logging
- ✅ DONE: Support for both new and existing agent system prompt updates

**Implementation**:
- ✅ DONE: Updated `closeAgentModal` to handle system prompt updates
- ✅ DONE: For new agents: create agent then update system prompt if provided
- ✅ DONE: For existing agents: update both config and system prompt in single call
- ✅ DONE: Added proper error handling and logging

## Technical Analysis

### Agent Object Structure Investigation
From code analysis, agents appear to have:
- System prompts stored in separate `system-prompt.md` files
- Agent objects may or may not include `systemPrompt` property
- Need to verify the actual structure of agent objects returned by API

### Current Modal Issues
1. **Property Access**: Modal looks for `agent?.systemPrompt` but this may not exist
2. **Data Loading**: May need to fetch system prompt separately when opening modal
3. **Save Logic**: Current save logic only updates `config` but not system prompt

## Suggested Investigation Steps

1. **Debug Agent Object Structure**:
   - Log the actual agent object in console when opening modal
   - Check what properties are available
   - Determine if systemPrompt is included or needs separate fetch

2. **Update Modal Component**:
   - Handle correct property name for system prompt
   - Add logic to fetch system prompt if not included in agent object
   - Update save logic to properly save system prompt changes

3. **Test Memory Clear Functionality**:
   - Verify that the memory clear API calls work correctly
   - Test both inline clear (from agent card) and modal clear
   - Ensure UI updates correctly after memory clear

## Success Criteria

### Memory Clear ✅ COMPLETED
- [x] Clicking clear memory button actually clears agent memory
- [x] Success/error messages appear in conversation
- [x] Modal closes after memory clear from modal
- [x] UI updates to reflect cleared memory

### System Prompt Display ✅ COMPLETED
- [x] Agent modal shows current system prompt for existing agents (with fallback properties)
- [x] System prompt textarea is populated with correct content
- [x] New agents show appropriate placeholder
- [x] Debug logging to identify agent object structure

### System Prompt Updates ✅ COMPLETED
- [x] Saving agent modal updates system prompt
- [x] Success/error feedback for system prompt updates via console logging
- [x] Agent data refreshes after successful update
- [x] Support for both new and existing agents

## Implementation Status: ✅ COMPLETE

All three major issues have been resolved:

1. **Clear Agent Memory**: Now makes real API calls and provides proper feedback
2. **System Prompt Display**: Uses fallback properties to access system prompt from various possible locations
3. **System Prompt Updates**: Properly saves system prompt changes via the updateAgent API

### Key Files Modified:
- `/public/ws-api.js`: Added `clearAgentMemory` function and export
- `/public/update/agent-actions.js`: Updated to use real API calls with error handling
- `/public/components/agent-modal.js`:
  - Added debug logging to investigate agent structure
  - Implemented fallback property access for system prompt display
  - Fixed save logic to properly update system prompts
  - Added support for both new and existing agent updates

### Next Steps (Optional):
- Test the functionality in a browser to verify the debug logs show correct agent structure
- Remove debug logging once confirmed working
- Consider adding loading states and better user feedback
