# End-to-End Testing: World Chat System with Auto-Title Generation

## Test Overview
This document provides comprehensive end-to-end testing steps for the world chat system features, including automatic chat title generation, persistence, and real-time UI updates via SSE integration.

## Prerequisites
- [ ] Server running on http://localhost:8080
- [ ] Web frontend built and accessible
- [ ] Browser with developer tools access for monitoring SSE events

---

## Test Suite 1: Basic System Setup and Verification

### 1.1 Server Startup and Health Check
- [ ] Navigate to project directory
- [ ] Run `npm run server` 
- [ ] Verify server starts without errors
- [ ] Confirm server accessible at displayed URL (typically http://127.0.0.1:port)
- [ ] Check server logs show successful startup

### 1.2 Frontend Access Verification
- [ ] Open browser and navigate to server URL
- [ ] Verify main world selection page loads
- [ ] Confirm no console errors in browser developer tools
- [ ] Check that default world appears in world selection

---

## Test Suite 2: World Chat System Core Functionality

### 2.1 World Setup and Agent Creation
- [ ] Click on "Default World" (or create new world if needed)
- [ ] Verify world interface loads successfully
- [ ] Click "Create Agent" button
- [ ] Enter agent name: "TestAgent"
- [ ] Select provider: "openai" (or available provider)
- [ ] Enter API key or use existing configuration
- [ ] Click "Create Agent" to complete setup
- [ ] Verify agent appears in agent list with active status

### 2.2 Chat History Sidebar Verification
- [ ] Locate chat history toggle button (usually gear icon or similar)
- [ ] Click to toggle between settings and chat history views
- [ ] Verify chat history sidebar is initially empty (no previous chats)
- [ ] Confirm "New Chat" button is visible and functional
- [ ] Check that the UI properly switches between settings and chat history modes

---

## Test Suite 3: Auto-Title Generation and Persistence

### 3.1 First Message and Auto-Title Generation
- [ ] In the chat input field, type: "Hello, can you help me plan a vacation to Japan?"
- [ ] Click "Send" or press Enter
- [ ] **Monitor SSE Events**: Open browser developer tools → Network tab → Filter by "chat"
- [ ] Verify message is sent successfully
- [ ] Wait for agent response (may take a few seconds depending on LLM provider)
- [ ] **Critical Check**: Observe for SSE event type `chat-created` in network logs
- [ ] Verify chat history sidebar automatically refreshes (may see loading indicator briefly)

### 3.2 Auto-Generated Chat Title Verification
- [ ] Check chat history sidebar for new chat entry
- [ ] Verify auto-generated title appears (should be similar to "help me plan a vacation to Japan..." or similar)
- [ ] Confirm title is meaningful and derived from first agent message content
- [ ] Verify title is ≤10 words and has appropriate truncation with "..." if needed
- [ ] Check that creation timestamp is displayed correctly

### 3.3 Chat Persistence Verification
- [ ] Note the chat ID and title from the sidebar
- [ ] Refresh the browser page (F5 or Ctrl+R)
- [ ] Verify that after page reload, the chat appears in history
- [ ] Confirm auto-generated title is preserved correctly
- [ ] Check that message content is maintained

---

## Test Suite 4: Chat History Management Features

### 4.1 Multiple Chat Creation
- [ ] Click "New Chat" button in chat history sidebar
- [ ] Verify interface clears and shows fresh chat session
- [ ] Send another message: "What's the weather like today?"
- [ ] Wait for agent response
- [ ] Verify second chat appears in history with different auto-generated title
- [ ] Confirm both chats are visible in sidebar with distinct titles

### 4.2 Chat Loading and Switching
- [ ] Click on the first chat in the history sidebar
- [ ] Verify the conversation loads correctly
- [ ] Confirm message history is restored
- [ ] Click on the second chat
- [ ] Verify conversation switches to second chat
- [ ] Confirm proper context switching between chats

### 4.3 Chat Management Operations
- [ ] Hover over a chat entry in the sidebar
- [ ] Verify action buttons appear (📂 Load, 📝 Summarize, 🗑️ Delete)
- [ ] Click the summarize button (📝) on one of the chats
- [ ] Verify summary generation process works
- [ ] Click delete button (🗑️) on a test chat
- [ ] Confirm deletion confirmation dialog appears
- [ ] Click "Delete Chat" to confirm
- [ ] Verify chat is removed from sidebar

---

## Test Suite 5: Real-Time SSE Integration

### 5.1 SSE Event Monitoring
- [ ] Open browser developer tools → Network tab
- [ ] Filter by "EventStream" or search for SSE connections
- [ ] Send a message to trigger agent response
- [ ] **Monitor for SSE Events**:
  - [ ] `connected` event when chat starts
  - [ ] `response` event when message is sent
  - [ ] `start` event when agent begins responding
  - [ ] `chunk` events during streaming response
  - [ ] `end` event when response completes
  - [ ] `chat-created` event when first agent message triggers auto-save

### 5.2 Real-Time UI Updates
- [ ] Start a new chat session
- [ ] Send a message and observe the UI during response
- [ ] Verify loading indicators appear appropriately
- [ ] Confirm streaming text appears in real-time (if supported)
- [ ] Check that chat history updates automatically without manual refresh
- [ ] Verify no manual page refresh is needed to see new chats

---

## Test Suite 6: Edge Cases and Error Handling

### 6.1 Empty and Invalid Inputs
- [ ] Try sending empty message (should be prevented)
- [ ] Send very long message (>1000 characters)
- [ ] Verify proper handling and response
- [ ] Test special characters and emoji in messages
- [ ] Confirm auto-title generation handles special content correctly

### 6.2 Network and Connection Issues
- [ ] Send a message while monitoring network tab
- [ ] Verify graceful handling if response is slow
- [ ] Check error handling if agent response fails
- [ ] Confirm UI provides appropriate feedback for errors

### 6.3 Chat History Limits
- [ ] Create multiple chats (5+ if possible)
- [ ] Verify chat history displays properly with many entries
- [ ] Check scrolling behavior in chat history sidebar
- [ ] Confirm performance remains acceptable

---

## Test Suite 7: Browser Compatibility and Persistence

### 7.1 Cross-Session Persistence
- [ ] Create a chat with auto-generated title
- [ ] Close browser tab completely
- [ ] Open new browser tab and navigate to application
- [ ] Verify chat history is preserved
- [ ] Confirm auto-generated titles are maintained

### 7.2 Multiple Tab Behavior
- [ ] Open application in two browser tabs
- [ ] Create a chat in first tab
- [ ] Switch to second tab and refresh
- [ ] Verify chat appears in second tab's history (may require refresh)

---

## Expected Results Summary

### ✅ Success Criteria
1. **Auto-Title Generation**: Each new conversation automatically generates a meaningful title from the first agent response
2. **Persistence**: Chat titles and content are automatically saved without user intervention
3. **Real-Time Updates**: Chat history sidebar updates automatically via SSE events
4. **UI Responsiveness**: AppRun patterns work correctly with `$onclick` directives
5. **Error Handling**: Graceful degradation when network or API issues occur
6. **Cross-Session**: Chat history persists across browser sessions

### ⚠️ Known Limitations
- Auto-title generation only occurs after first agent response
- SSE events require active network connection
- Chat history refresh may have slight delay (100ms by design)

---

## Troubleshooting Guide

### Common Issues
1. **No auto-titles appearing**: Check SSE events in network tab, verify agent responses are being received
2. **Chat history not updating**: Confirm SSE connection is active, check for JavaScript errors
3. **AppRun handlers not working**: Verify `$onclick` syntax and handler definitions in World.update.ts
4. **API errors**: Check server logs and network tab for detailed error messages

### Debug Commands
```bash
# Check server logs
npm run server

# Verify TypeScript compilation
npm run check

# Run test suite
npm run test

# Build frontend
cd web && npm run build
```

---

## Test Completion Checklist

- [ ] All test suites completed successfully
- [ ] Auto-title generation working consistently  
- [ ] Chat persistence verified across sessions
- [ ] SSE integration confirmed via network monitoring
- [ ] Chat history management functions properly
- [ ] Error handling tested and working
- [ ] UI/UX is responsive and intuitive
- [ ] No console errors or warnings
- [ ] Performance is acceptable with multiple chats

**Testing completed on**: _______________  
**Browser**: _______________  
**Test status**: _______________