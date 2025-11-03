# Phase 8: Integration Testing Guide

**Date:** 2025-11-03  
**Status:** Ready for Testing  
**Related Plan:** `.docs/plans/2025-11-03/plan-vite-react-frontend.md`

## Overview

This guide provides step-by-step instructions for testing the new Vite + React frontend with WebSocket integration.

## Prerequisites

- ✅ Phases 1-7 complete (70% done)
- ✅ All TypeScript compilation successful
- ✅ WebSocket server ready (ws/)
- ✅ React dev server configured

## Starting the Servers

### Option 1: Separate Terminals (Recommended for testing)

**Terminal 1: WebSocket Server**
```bash
npm run ws:watch
# Should see: "WebSocket server listening on port 3001"
```

**Terminal 2: React Dev Server**
```bash
npm run react:dev
# Waits for ws:3001, then starts on http://localhost:5173
```

### Option 2: Single Command (Parallel)
```bash
npm run react:watch
# Starts both ws and react in watch mode
```

## Testing Checklist

### ✅ Phase 8.1: Connection & Basic UI

- [ ] **Open Browser**
  - Navigate to http://localhost:5173
  - Should see HomePage with "Agent World" title
  
- [ ] **Check Connection Status**
  - Header should show green dot with "connected"
  - If yellow "connecting", wait a few seconds
  - If red "disconnected", check WebSocket server is running

- [ ] **Verify Layout**
  - Header: Title + version + ConnectionStatus
  - Footer: Copyright notice
  - No console errors

### ✅ Phase 8.2: World Management

- [ ] **Create World**
  - Click "Create New World" button
  - Form should appear inline
  - Enter name: "Test World"
  - Enter description: "My first test world"
  - Click "Create World"
  - Should add world card to grid
  - Form should close

- [ ] **View World List**
  - Should see "Test World" card
  - Card shows name and description
  - Hover should show shadow effect

- [ ] **Navigate to World**
  - Click "Test World" card
  - Should navigate to /world/:id
  - Should see world name in sidebar
  - Should see empty agent list
  - Should see chat interface (no messages yet)

- [ ] **Return to Home**
  - Click "← Back to Worlds" in sidebar
  - Should return to HomePage
  - World list should still show "Test World"

### ✅ Phase 8.3: Agent Management

- [ ] **Create Agent (in World)**
  - Navigate to "Test World"
  - Click "+ Add" button in Agents section
  - Form appears inline
  - Enter name: "Assistant Bot"
  - Click "Create"
  - Should see agent in sidebar list with avatar

- [ ] **Agent Display**
  - Agent shows 2-letter abbreviation (AB)
  - Agent name displayed
  - No system prompt shown yet (default)

- [ ] **Select Agent**
  - Click on "Assistant Bot" in sidebar
  - Agent name appears in main tab
  - Chat interface ready

### ✅ Phase 8.4: Chat Functionality

- [ ] **Send Message (No Agent Selected)**
  - In main tab (world view), message input enabled
  - Type: "Hello world"
  - Click "Send" or press Enter
  - Message appears in chat box
  - Shows "You" sender, timestamp
  - Message appears in blue bubble (right-aligned)

- [ ] **WebSocket Event Verification**
  - Check browser console for WebSocket messages
  - Should see event subscription
  - Should see message event sent
  - No errors

- [ ] **Send Message (Agent Selected)**
  - Select "Assistant Bot" from sidebar
  - Tab changes to "Assistant Bot"
  - Type: "Hi Assistant Bot"
  - Click "Send"
  - Message appears in chat
  - Agent response should stream in (if LLM configured)
  - Agent message appears in white bubble (left-aligned)

- [ ] **Connection State Handling**
  - With message typed, open DevTools
  - Stop WebSocket server (Ctrl+C in Terminal 1)
  - Connection status should turn red "disconnected"
  - Input should be disabled
  - Warning banner should appear
  - Restart ws server
  - Connection should reconnect (yellow → green)
  - Input should re-enable

### ✅ Phase 8.5: Settings & Editing

- [ ] **Edit World Settings**
  - In WorldPage, click "World Settings" tab
  - MarkdownEditor should appear
  - Shows YAML frontmatter:
    ```yaml
    ---
    name: "Test World"
    ---
    My first test world
    ```
  - Modify description in editor
  - Add markdown: "## Features\n- Chat\n- Agents"
  - Click "Save"
  - Should return to main tab
  - Changes saved (verify by re-opening settings)

- [ ] **Edit Agent Settings**
  - Select "Assistant Bot"
  - Click "Agent Settings" tab
  - MarkdownEditor appears with agent data
  - Modify systemPrompt: "You are a friendly assistant."
  - Add description: "## About\nThis is a test agent."
  - Click "Save"
  - Should return to main tab
  - Changes saved

- [ ] **Cancel Edit**
  - Open World Settings
  - Make changes
  - Click "Cancel"
  - Should return to main tab without saving

### ✅ Phase 8.6: Error Handling

- [ ] **Invalid YAML**
  - Open World Settings
  - Break YAML syntax (remove closing quotes)
  - Should see "YAML Parse Error" message
  - Save button should be disabled
  - Fix YAML, error should clear

- [ ] **Network Error Simulation**
  - Stop WebSocket server
  - Try to create world
  - Should see error message
  - Connection status shows "disconnected"
  - Restart server, reconnects automatically

- [ ] **404 Page**
  - Navigate to http://localhost:5173/invalid-route
  - Should see "404 Page not found"
  - "Go back home" link works

### ✅ Phase 8.7: Real-Time & Multi-Tab

- [ ] **Multiple Browser Tabs**
  - Open two tabs to same world
  - Send message in Tab 1
  - Message should appear in Tab 2 (real-time)
  - Both tabs show same chat history

- [ ] **WebSocket Reconnection**
  - Open WorldPage
  - Stop ws server (Ctrl+C)
  - Wait 5 seconds
  - Restart ws server
  - Client should auto-reconnect
  - Connection status: yellow → green
  - Chat should still work

- [ ] **HMR (Hot Module Replacement)**
  - With dev server running, edit a component
  - Save file
  - Browser should update without full reload
  - WebSocket may disconnect (expected with HMR)
  - Should auto-reconnect

### ✅ Phase 8.8: Responsive Design

- [ ] **Desktop (1920x1080)**
  - Layout looks good
  - Sidebar fixed width
  - Chat area flexible

- [ ] **Tablet (768px)**
  - Open DevTools, resize to 768px
  - Layout adjusts
  - Sidebar still visible
  - No horizontal scroll

- [ ] **Mobile (375px)**
  - Resize to 375px width
  - Cards stack vertically
  - Text remains readable
  - No broken layout

### ✅ Phase 8.9: Performance

- [ ] **Bundle Size**
  ```bash
  cd react
  npm run build
  # Check dist/ folder size
  # Target: < 500KB gzipped
  ```

- [ ] **Load Time**
  - Clear browser cache
  - Reload page
  - Should load in < 2 seconds
  - No flash of unstyled content

- [ ] **Memory Leaks**
  - Open DevTools → Performance
  - Record while navigating between pages
  - Stop recording
  - Check for memory growth
  - Should be stable

## Common Issues & Solutions

### Issue: Connection stays "connecting"
**Solution:** Check WebSocket server is running on port 3001
```bash
lsof -i :3001
```

### Issue: CORS errors in console
**Solution:** WebSocket server should allow all origins. Check ws/ws-server.ts

### Issue: Messages not appearing
**Solution:** 
- Check browser console for errors
- Verify WebSocket connection in Network tab
- Check event subscription in console logs

### Issue: Hot reload breaks WebSocket
**Solution:** This is expected. WebSocket reconnects automatically after HMR.

### Issue: TypeScript errors in IDE
**Solution:** 
```bash
npm run check --workspace=react
```

## Expected Console Output

### Browser Console (Normal Operation)
```
WebSocket connecting to ws://localhost:3001
WebSocket connected
Subscribed to world events: world-id-123
Sending command: create-agent
Received response: {...}
```

### WebSocket Server Console
```
WebSocket server listening on port 3001
Client connected
Received: create-world
Sending response: {...}
```

## Completion Criteria

All checkboxes above should be ✅ before moving to Phase 9 (Polish & Performance).

## Next Steps

After testing is complete:
1. Document any bugs found
2. Fix critical issues
3. Move to Phase 9: Polish & Performance
4. Then Phase 10: Cleanup & Documentation

## Notes

- Runtime testing deferred from Phase 4 - doing comprehensive testing now
- WebSocket server must be running for all tests
- Tests assume clean database (no existing worlds/agents)
- For CI/CD, consider automating these tests with Playwright or Cypress
