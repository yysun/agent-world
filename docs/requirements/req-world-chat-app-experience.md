# Requirements: World Chat App Experience

## Overview
Transform the world chat functionality to work like a common chat app experience with comprehensive chat history management, URL routing, auto-save, and restoration capabilities.

## Current State Analysis
- ✅ Chat history API endpoints exist (`/worlds/:worldName/chats/*`)
- ✅ Basic chat creation, loading, and deletion functionality implemented  
- ✅ WorldChatHistory component exists with UI for managing chats
- ✅ Auto-save logic partially implemented with `shouldAutoSaveChat` utility
- ✅ Chat title generation with `generateChatTitle` utility
- ❌ No URL routing for specific chats (`/world/:worldId/:chatId`)
- ❌ Last chat restoration on page load not implemented
- ❌ Complete world state restoration from chat snapshots needs work
- ❌ Frontend memory chat management before auto-save incomplete

## Functional Requirements

### 1. Chat Session Management

#### 1.1 Load and Restore Last Chat
**Priority: High**

- **FR-1.1.1**: On world page load (`/world/:worldName`), automatically load and restore the most recent chat session
- **FR-1.1.2**: If no chat history exists, create a new unsaved chat session in memory
- **FR-1.1.3**: Display loading states during chat restoration
- **FR-1.1.4**: Handle restoration errors gracefully with fallback to new chat

**Acceptance Criteria:**
- User visits `/world/MyWorld` and sees their last conversation immediately
- If last chat was from yesterday, all messages and agent states are restored
- Loading indicator shows during restoration process
- Error states are handled without breaking the UI

#### 1.2 New Chat Creation
**Priority: High**

- **FR-1.2.1**: "New Chat" button creates fresh chat session, clearing all messages and resetting agent states
- **FR-1.2.2**: New chat stays in frontend memory until auto-save triggers
- **FR-1.2.3**: Unsaved chats display "New Chat" title with unsaved indicator
- **FR-1.2.4**: User can continue chatting without requiring immediate save

**Acceptance Criteria:**
- Click "New Chat" → all messages disappear, fresh conversation starts
- Chat shows as "New Chat" with unsaved indicator until first agent message
- No API calls made until auto-save trigger condition met
- URL updates to `/world/:worldName` (no chatId until saved)

#### 1.3 Frontend Memory Management
**Priority: Medium**

- **FR-1.3.1**: Unsaved chats persist in browser session storage
- **FR-1.3.2**: Browser refresh preserves unsaved chat contents
- **FR-1.3.3**: Clear session storage when chat is explicitly saved or discarded
- **FR-1.3.4**: Warn user before navigating away from unsaved chat with substantial content

**Acceptance Criteria:**
- Browser refresh keeps unsaved messages visible
- Navigation warning appears if unsaved chat has >3 messages
- Session storage clears after successful auto-save

### 2. URL Routing and Navigation

#### 2.1 Chat-Specific URLs
**Priority: High**

- **FR-2.1.1**: Implement URL pattern `/world/:worldName/:chatId` for specific chats
- **FR-2.1.2**: Direct navigation to chat URL loads that specific chat session
- **FR-2.1.3**: URL updates when loading different chats from history
- **FR-2.1.4**: Browser back/forward buttons work correctly with chat navigation

**Acceptance Criteria:**
- `/world/MyWorld/chat-123` loads specific chat with all messages
- URL bar updates when clicking chat in history
- Browser back button returns to previous chat
- Bookmark URLs work for sharing specific conversations

#### 2.2 URL State Management
**Priority: Medium**

- **FR-2.2.1**: Invalid chatId in URL shows error with option to create new chat
- **FR-2.2.2**: Deleted chats with bookmarked URLs redirect gracefully
- **FR-2.2.3**: URL parameters preserve chat state across page refreshes

**Acceptance Criteria:**
- `/world/MyWorld/invalid-chat-id` shows "Chat not found" with "Start New Chat" button
- Dead links redirect to `/world/MyWorld` with error message
- Page refresh maintains current chat context

### 3. Auto-Save Functionality

#### 3.1 Trigger Conditions
**Priority: High**

- **FR-3.1.1**: Auto-save triggers on first agent message in unsaved chat
- **FR-3.1.2**: Generate short title (≤10 words) from agent messages for chat name
- **FR-3.1.3**: Use LLM provider/model from agent config if available, fallback to world default
- **FR-3.1.4**: Update URL to include chatId after successful save

**Acceptance Criteria:**
- Human types, agent responds → chat auto-saves with generated title
- Title reflects conversation content (e.g., "Discuss Python programming tips")
- Chat title appears in history list immediately after save
- URL changes from `/world/MyWorld` to `/world/MyWorld/chat-xyz`

#### 3.2 Title Generation
**Priority: Medium**

- **FR-3.2.1**: Extract meaningful keywords from first agent responses
- **FR-3.2.2**: Fallback to generic titles if content is too short/generic
- **FR-3.2.3**: Avoid technical jargon in titles (messageId, timestamps, etc.)
- **FR-3.2.4**: Support multiple languages in title generation

**Acceptance Criteria:**
- "Hello! I'm here to help with coding" → "Coding assistance chat"
- Short responses generate "Quick conversation" or similar
- Non-English content generates appropriate titles
- No UUIDs or technical terms in user-visible titles

### 4. Chat History and Loading

#### 4.1 Chat History Interface
**Priority: High**

- **FR-4.1.1**: Chat list ordered by most recent first
- **FR-4.1.2**: Each chat shows title, message count, last updated timestamp
- **FR-4.1.3**: Click chat in history loads full conversation and updates URL
- **FR-4.1.4**: Delete button removes chat from history with confirmation

**Acceptance Criteria:**
- Today's chats appear at top of list
- Hover shows full metadata (creation date, agent participants, message count)
- Single click loads chat instantly
- Delete requires confirmation modal

#### 4.2 Complete State Restoration
**Priority: High**

- **FR-4.2.1**: Loading chat restores complete world configuration from snapshot
- **FR-4.2.2**: Restore all agent configurations (models, prompts, settings)
- **FR-4.2.3**: Restore agent memory/conversation history for context
- **FR-4.2.4**: Restore message thread with proper threading and timestamps

**Acceptance Criteria:**
- Agent settings from chat time are restored (not current settings)
- Agent memory includes conversation context leading to selected chat
- All messages display in correct chronological order
- Agent names, sprites, and configurations match chat snapshot

### 5. Error Handling and Edge Cases

#### 5.1 Network and API Errors
**Priority: Medium**

- **FR-5.1.1**: Handle auto-save failures gracefully, retry with exponential backoff
- **FR-5.1.2**: Offline mode keeps chats in local storage until connection restored
- **FR-5.1.3**: Show clear error messages for failed chat operations
- **FR-5.1.4**: Allow manual retry of failed operations

**Acceptance Criteria:**
- Auto-save failure shows toast notification with retry option
- Offline indicator appears when network unavailable
- Error messages are user-friendly, not technical
- Retry buttons work for all failed operations

#### 5.2 Data Consistency
**Priority: High**

- **FR-5.2.1**: Prevent chat title conflicts with unique naming
- **FR-5.2.2**: Handle concurrent chat modifications gracefully
- **FR-5.2.3**: Validate chat data integrity before restoration
- **FR-5.2.4**: Backup and recovery for corrupted chat data

**Acceptance Criteria:**
- Multiple chats with same generated title get numbered suffixes
- Warning if loading chat modified by another session
- Corrupted chats show error instead of breaking app
- Chat recovery option available for damaged data

## Technical Requirements

### 6. Frontend Implementation

#### 6.1 Routing Enhancement
**Priority: High**

- **TR-6.1.1**: Extend AppRun router to support `/World/:worldName/:chatId` pattern
- **TR-6.1.2**: Update World component to handle chatId parameter
- **TR-6.1.3**: Implement chat loading logic in route handler
- **TR-6.1.4**: Add route guards for invalid world/chat combinations

#### 6.2 State Management
**Priority: High**

- **TR-6.2.1**: Enhance WorldComponentState to track current chat metadata
- **TR-6.2.2**: Add chat session persistence using browser storage APIs
- **TR-6.2.3**: Implement optimistic UI updates for chat operations
- **TR-6.2.4**: Add proper TypeScript interfaces for chat routing state

#### 6.3 UI Components
**Priority: Medium**

- **TR-6.3.1**: Update WorldChatHistory component for improved chat management
- **TR-6.3.2**: Add chat loading states and error boundaries
- **TR-6.3.3**: Implement toast notifications for chat operations
- **TR-6.3.4**: Add keyboard shortcuts for common chat operations

### 7. Backend Requirements

#### 7.1 API Enhancements
**Priority: Medium**

- **TR-7.1.1**: Ensure chat snapshot includes complete world state
- **TR-7.1.2**: Add pagination for chat history lists
- **TR-7.1.3**: Implement chat search and filtering capabilities
- **TR-7.1.4**: Add batch operations for chat management

#### 7.2 Performance
**Priority: Low**

- **TR-7.2.1**: Optimize chat loading for large conversation histories
- **TR-7.2.2**: Implement caching for frequently accessed chats
- **TR-7.2.3**: Add compression for chat snapshots
- **TR-7.2.4**: Background cleanup for old/unused chats

## User Experience Requirements

### 8. Usability

#### 8.1 Chat App Familiarity
**Priority: High**

- **UX-8.1.1**: Interface should feel familiar to users of WhatsApp, Slack, Discord
- **UX-8.1.2**: Standard keyboard shortcuts (Ctrl+N for new chat, etc.)
- **UX-8.1.3**: Visual indicators for chat status (saved, unsaved, loading)
- **UX-8.1.4**: Smooth transitions between different chats

#### 8.2 Mobile Responsiveness
**Priority: Medium**

- **UX-8.2.1**: Chat history accessible on mobile devices
- **UX-8.2.2**: Touch-friendly interactions for chat selection/deletion
- **UX-8.2.3**: Responsive layout for chat URL sharing
- **UX-8.2.4**: Optimized performance on slower mobile connections

## Implementation Priority

### Phase 1: Core Chat Routing (Week 1)
1. Implement `/world/:worldName/:chatId` URL routing
2. Basic chat loading and URL state management
3. Last chat restoration on page load
4. New chat creation with memory management

### Phase 2: Auto-Save and Title Generation (Week 2)  
1. Auto-save trigger on first agent message
2. Chat title generation from conversation content
3. URL updates after successful save
4. Error handling for save operations

### Phase 3: Complete State Restoration (Week 3)
1. Full world state restoration from chat snapshots
2. Agent configuration and memory restoration
3. Message threading and chronological order
4. Data integrity validation

### Phase 4: Polish and Edge Cases (Week 4)
1. Error handling and retry mechanisms
2. Offline mode and local storage
3. Performance optimizations
4. Mobile responsiveness improvements

## Success Metrics

- **User Engagement**: 90% of users access previous conversations within a session
- **Data Integrity**: 99.9% successful chat restoration rate
- **Performance**: Chat loading completes within 2 seconds for 95% of requests
- **User Satisfaction**: Users report chat interface feels "familiar" and "intuitive"
- **Technical Reliability**: Auto-save success rate >99.5%

## Dependencies

- AppRun router enhancement for dynamic parameters
- Enhanced chat snapshot storage in backend
- Browser storage APIs for session persistence
- LLM integration for title generation
- Error handling infrastructure

## Risks and Mitigation

- **Risk**: Complex state restoration causing performance issues
  - **Mitigation**: Implement lazy loading and progressive restoration
- **Risk**: URL routing conflicts with existing navigation
  - **Mitigation**: Comprehensive testing of all route combinations
- **Risk**: Auto-save overwhelming backend with API calls
  - **Mitigation**: Debouncing and intelligent save triggers
- **Risk**: Chat data corruption affecting user experience
  - **Mitigation**: Data validation and backup strategies

---

**Document Version**: 1.0  
**Last Updated**: July 31, 2025  
**Status**: Ready for Implementation  
**Estimated Effort**: 4 weeks (1 developer)
