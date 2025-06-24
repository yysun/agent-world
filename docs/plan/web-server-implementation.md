# Web Server Implementation Plan

## Overview
Add an Express.js web server to the agent-world project that provides REST API endpoints for world and agent management, plus Server-Sent Events (SSE) for real-time chat functionality.

## Prerequisites
- ✅ Express server dependencies already available in package.json (@types/express)
- ✅ CORS support already available
- ✅ Existing world and agent management functions in src/
- ✅ Event system with SSE capability needed for chat endpoint

## Implementation Steps

### Step 1: Install Additional Dependencies
- [x] Add express dependency to package.json
- [x] Verify CORS dependency is available for cross-origin requests
- [x] Verify zod dependency is available for input validation (already in package.json)
- [x] Add any missing SSE-related dependencies if needed

### Step 2: Create Web Server File (server.ts)
- [x] Create `server.ts` in project root
- [x] Import required dependencies (express, cors, path, fs)
- [x] Import existing world and agent management functions from src/
- [x] Set up basic Express server configuration
- [x] Configure CORS middleware
- [x] Set up static file serving from `public` directory
- [x] Configure server to listen on specified port (default: 3000, configurable via env)

### Step 3: Create Public Directory and Placeholder HTML
- [x] Create `public/` directory in project root
- [x] Create placeholder `public/index.html` with basic HTML structure
- [x] Add simple welcome message and API documentation links

### Step 4: Implement World Management Endpoints

#### GET /worlds - List all available worlds
- [x] Create route handler
- [x] Use existing world listing functions from src/world.ts
- [x] Return JSON array of world objects with basic metadata
- [x] Handle errors gracefully with proper HTTP status codes

#### GET /worlds/{worldName}/agents - List all agents in a specific world
- [x] Create parameterized route handler
- [x] Validate worldName parameter exists
- [x] Use existing agent listing functions from src/world.ts
- [x] Return JSON array of agent objects with basic metadata
- [x] Handle world not found (404) and other errors

#### GET /worlds/{worldName}/agents/{agentName} - Get details of a specific agent
- [x] Create nested parameterized route handler
- [x] Validate both worldName and agentName parameters
- [x] Use existing agent retrieval functions from src/world.ts
- [x] Return detailed agent object including configuration and status
- [x] Handle agent/world not found (404) and other errors

### Step 5: Implement Agent Management Endpoints

#### POST /worlds/{worldName}/agents - Create a new agent (placeholder)
- [x] Create route handler with TODO placeholder
- [x] Return 501 Not Implemented status
- [x] Include message "Coming soon" in response
- [x] Add proper request body validation structure for future implementation

#### PATCH /worlds/{worldName}/agents/{agentName} - Update agent
- [x] Create route handler for agent updates
- [x] Add Zod schema validation for request body
- [x] Parse request body for update operations:
  - Set agent status using specific status values (active, inactive)
  - Update the agent's configuration
  - Update the agent's system prompt
  - Clear memory operation (clearMemory: true)
- [x] Use existing agent update functions from src/agent.ts and src/world.ts
- [x] Return updated agent object
- [x] Handle validation errors (400) and not found errors (404)

### Step 6: Implement Chat Endpoint with SSE

#### POST /worlds/{worldName}/chat - Send message and stream events
- [x] Create route handler for chat functionality
- [x] Add Zod schema validation for request body (message, sender)
- [x] Set up Server-Sent Events (SSE) response headers immediately
- [x] Parse and validate request body for message content and sender information
- [x] Integrate with existing event-bus system from src/event-bus.ts
- [x] Subscribe to world events using subscribeToWorldEvents function
- [x] Send message to world using broadcastMessage function
- [x] Stream all world events to client via SSE in real-time
- [x] Implement proper SSE event formatting (data, event type, id)
- [x] Handle client disconnection and cleanup event subscriptions properly
- [x] Add error handling for malformed requests (400) and world not found (404)
- [x] Ensure SSE connection stays open for continuous streaming

### Step 7: Input Validation and Error Handling
- [x] Create Zod schemas for all endpoint request/response validation
- [x] Create validation middleware using Zod schemas
- [x] Create global error handling middleware
- [x] Add request logging middleware
- [x] Add JSON body parsing middleware
- [x] Add validation middleware for common parameter patterns
- [x] Create consistent error response format across all endpoints
- [x] Handle Zod validation errors with proper 400 responses

### Step 8: Configuration and Environment Setup
- [x] Add server configuration options (port, host, public directory path)
- [x] Create environment variable support for server settings
- [x] Add graceful shutdown handling
- [x] Add server startup logging with endpoint summary

### Step 9: CLI Integration and Launcher
- [x] Remove server startup logic from CLI (cli/index.ts)
- [x] Create new root index.ts launcher file
- [x] Implement launcher that starts both server and CLI together
- [x] Add graceful shutdown handling for both components
- [x] Update package.json scripts for individual and combined running
- [x] Ensure both server and CLI can run independently
- [x] Test both individual components and combined launcher

### Step 10: Package.json Script Updates
- [x] use `tsx` for running server.ts
- [x] Add `npm run server` script to start web server
- [x] Add `npm run dev:server` script for development with nodemon
- [x] Update existing scripts if needed for concurrent running
- [x] Add server build/check scripts if TypeScript is used for server

## Technical Implementation Notes

### Dependencies Required
```json
{
  "express": "^4.18.0",
  "cors": "^2.8.5", // already available
  "zod": "^3.25.67" // already available
}
```

### Zod Validation Schemas
```typescript
// Chat message schema
const ChatMessageSchema = z.object({
  message: z.string().min(1),
  sender: z.string().optional().default("HUMAN")
});

// Agent update schema
const AgentUpdateSchema = z.object({
  status: z.enum(["active", "inactive"]).optional(),
  config: z.object({}).optional(),
  systemPrompt: z.string().optional(),
  clearMemory: z.boolean().optional()
});
```

### CLI Integration Architecture
```typescript
// CLI should start server automatically in same process
async function startCLI() {
  const server = await startWebServerNonBlocking(); // Returns server instance
  // Continue with existing CLI functionality
  startInteractiveMode();
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    server.close();
    process.exit(0);
  });
}
```

### File Structure Changes
```
/
├── server.ts (new)
├── public/ (new)
│   └── index.html (new)
├── package.json (update scripts)
├── cli/
│   ├── index.ts (modify for server integration)
│   └── server-manager.ts (new - optional)
```

### Key Integration Points
- Use existing `src/world.ts` functions for world/agent management
- Use existing `src/event-bus.ts` for SSE event streaming
- Use existing `src/agent.ts` functions for agent operations
- Leverage existing `src/types.ts` for consistent typing

### SSE Event Format
```javascript
// SSE response headers
res.writeHead(200, {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
  'Access-Control-Allow-Origin': '*'
});

// Event format
data: {"type": "message", "payload": {...}}
data: {"type": "agent_response", "payload": {...}}
data: {"type": "error", "payload": {...}}
```

### Error Response Format
```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {...}
}
```

## Success Criteria
- [x] All API endpoints respond correctly with proper HTTP status codes
- [x] Zod validation works correctly for all endpoints with proper error responses
- [x] Static file serving works from public directory
- [x] SSE chat functionality streams events in real-time with proper headers
- [x] Integration with existing world/agent system works seamlessly
- [x] Proper error handling and logging throughout
- [x] CLI automatically starts server and continues interactive operation
- [x] PATCH endpoint correctly manages agent status (active, inactive)
- [x] Server runs in background without blocking CLI functionality
- [x] Documentation is complete and accurate
