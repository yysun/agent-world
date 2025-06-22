# Fix Event Interface Violations Plan

## Problem Statement
The Event interface should strictly follow this structure:
```typescript
export interface Event {
  id: string;
  type: EventType;
  timestamp: string;
  payload: any;
}
```

However, code throughout the project is adding properties like `content`, `sender`, `senderType`, `recipient`, `worldId`, `targetId`, `messageId`, `metadata`, etc. directly to the Event level instead of putting them in the `payload`.

## Violations Found

### 1. Event Bus Publisher Functions (src/event-bus.ts)
- **Location**: Lines 158-170 in `publishMessage` function
- **Issue**: `publishMessage` function accepts properties like `sender`, `senderType`, `recipient`, `content`, `timestamp` at the message object level
- **Impact**: These properties end up in the payload, but the function signature suggests they're Event-level properties

### 2. World Message Functions (src/world.ts)  
- **Location**: Lines 840-860 in `broadcastMessage` and lines 885-900 in `sendMessage` functions
- **Issue**: Creating message objects with Event-level properties like `sender`, `senderType`, `recipient`, `content`, `timestamp`, `worldId`
- **Impact**: Violates Event interface contract

### 3. World Event Filtering (src/world.ts)
- **Location**: Lines 946-947 in `subscribeToAgentMessages` function  
- **Issue**: Accessing `event.worldId`, `event.recipient`, `event.targetId` directly instead of `event.payload.worldId`, etc.
- **Impact**: Code expects properties at Event level that should be in payload

### 4. Agent Message Processing (src/agent.ts)
- **Location**: Multiple locations in processAgentMessage function
- **Issue**: Creating events with properties at wrong level and expecting them there
- **Impact**: Memory and response handling may be accessing wrong properties

### 5. Test Files
- **Location**: Multiple test files
- **Issue**: Test assertions and mock data using Event-level properties instead of payload properties
- **Impact**: Tests pass but don't validate correct Event structure

## Implementation Plan

### Phase 1: Fix Event Publishing Functions
- [x] **1.1** Update `publishMessage` in `src/event-bus.ts`
  - [x] Remove Event-level properties from function signature
  - [x] Ensure all message properties go into `payload` only
  - [x] Update JSDoc to clarify payload structure

- [x] **1.2** Update `publishSSE` in `src/event-bus.ts`
  - [x] Verify SSE properties are correctly placed in payload
  - [x] Move `agentId` from metadata to payload

- [x] **1.3** Update `publishWorld` in `src/event-bus.ts`
  - [x] Ensure world event properties are in payload only
  - [x] Remove any metadata usage

### Phase 2: Fix World Management Functions  
- [x] **2.1** Update `broadcastMessage` in `src/world.ts`
  - [x] Move `sender`, `senderType`, `content`, `timestamp`, `worldId` to payload
  - [x] Remove these properties from Event level

- [x] **2.2** Update `sendMessage` in `src/world.ts`
  - [x] Move `recipient`, `content`, `sender`, `senderType`, `timestamp`, `worldId` to payload
  - [x] Remove these properties from Event level

- [x] **2.3** Update `subscribeToAgentMessages` in `src/world.ts`
  - [x] Change `event.worldId` to `event.payload.worldId`
  - [x] Change `event.recipient` to `event.payload.recipient`
  - [x] Change `event.targetId` to `event.payload.targetId`

### Phase 3: Fix Agent Processing Logic
- [x] **3.1** Update `processAgentMessage` in `src/agent.ts`
  - [x] Ensure conversation history events have correct structure
  - [x] Move message content, sender info to payload
  - [x] Update memory storage to expect payload structure

- [x] **3.2** Update message filtering functions in `src/agent.ts`
  - [x] Ensure `shouldRespondToMessage` works with correct Event structure
  - [x] Update any Event property access to use payload

### Phase 4: Fix Provider Implementations
- [x] **4.1** Update `local-provider.ts`
  - [x] Ensure event routing uses correct property locations
  - [x] Fix agent-specific routing to check `payload.agentId` only (remove metadata usage)

- [x] **4.2** Update event filtering in `src/event-bus.ts`
  - [x] Fix `matchesFilter` function to check payload for agent information only
  - [x] Remove metadata checking logic
  - [x] Ensure filtering works with correct Event structure

### Phase 5: Update Storage and Utilities
- [x] **5.1** Update storage functions in `src/storage.ts`
  - [x] Ensure saved events follow correct structure
  - [x] Update any event property access to use payload

- [x] **5.2** Update any utility functions
  - [x] Check all event property access patterns
  - [x] Ensure consistent payload usage

### Phase 6: Fix Tests
- [x] **6.1** Update `event-bus.test.ts`
  - [x] Fix assertions to expect payload properties
  - [x] Update mock events to follow correct structure

- [x] **6.2** Update `agent-message-process.test.ts`  
  - [x] Fix MessageData and Event mock objects
  - [x] Update assertions to check payload properties

- [x] **6.3** Update `world.test.ts` and other test files
  - [x] Fix any Event-level property access
  - [x] Ensure test data follows correct Event structure

- [x] **6.4** Update all other test files
  - [x] Search for Event property violations in tests
  - [x] Fix any remaining test assertions

### Phase 7: Validation and Documentation
- [x] **7.1** Add Event structure validation
  - [x] Consider adding runtime validation in development mode
  - [x] Ensure Zod schema is enforced

- [x] **7.2** Update documentation
  - [x] Update README with correct Event usage examples
  - [x] Add JSDoc examples showing correct payload structure

- [x] **7.3** Run comprehensive tests
  - [x] Ensure all tests pass after changes
  - [x] Verify Event structure compliance across codebase

## Dependencies and Considerations

### Breaking Changes
- This is a breaking change for any external consumers
- All Event property access patterns will change
- Function signatures may need updates

### Testing Strategy
- Fix one phase at a time
- Run tests after each phase to catch regressions
- Validate Event structure compliance

### Risk Mitigation
- Create backup branch before starting
- Fix in order of dependencies (event-bus first, then consumers)
- Test thoroughly at each step

## Success Criteria
- [x] All Event objects strictly follow the defined interface
- [x] No properties added at Event level except id, type, timestamp, payload
- [x] All message/content/routing data stored in payload
- [x] All tests pass with correct Event structure
- [x] Code consistently accesses event.payload.* for content
- [x] Event filtering and routing works correctly with payload structure
