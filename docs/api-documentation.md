# Web Server API Documentation

## Overview

The Agent World Web Server provides REST API endpoints for managing worlds, agents, and real-time communication. All endpoints return JSON responses and support CORS for cross-origin requests.

**Base URL**: `http://localhost:3000`

## Authentication

Currently, no authentication is required. This is intended for development and local use.

## Error Handling

All endpoints return consistent error responses:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {...}
}
```

Common HTTP status codes:
- `200` - Success
- `400` - Bad Request (validation errors)
- `404` - Not Found (world/agent not found)
- `500` - Internal Server Error
- `501` - Not Implemented

## Endpoints

### World Management

#### List All Worlds
```http
GET /worlds
```

**Response:**
```json
[
  {
    "name": "default-world"
  },
  {
    "name": "test-world"
  }
]
```

#### List Agents in World
```http
GET /worlds/{worldName}/agents
```

**Parameters:**
- `worldName` (string, path) - Name of the world

**Response:**
```json
[
  {
    "name": "agent1",
    "type": "AIAgent",
    "status": "active",
    "config": {
      "provider": "openai",
      "model": "gpt-4",
      "systemPrompt": "You are a helpful assistant."
    },
    "createdAt": "2025-01-01T00:00:00.000Z",
    "lastActive": "2025-01-01T12:00:00.000Z"
  }
]
```

**Error Responses:**
- `404` - World not found

#### Get Agent Details
```http
GET /worlds/{worldName}/agents/{agentName}
```

**Parameters:**
- `worldName` (string, path) - Name of the world
- `agentName` (string, path) - Name of the agent

**Response:**
```json
{
  "name": "agent1",
  "type": "AIAgent",
  "status": "active",
  "config": {
    "name": "agent1",
    "type": "AIAgent",
    "provider": "openai",
    "model": "gpt-4",
    "systemPrompt": "You are a helpful assistant.",
    "temperature": 0.7,
    "maxTokens": 1000
  },
  "createdAt": "2025-01-01T00:00:00.000Z",
  "lastActive": "2025-01-01T12:00:00.000Z",
  "metadata": {}
}
```

**Error Responses:**
- `404` - World or agent not found

### Agent Management

#### Create Agent (Coming Soon)
```http
POST /worlds/{worldName}/agents
```

**Response:**
```json
{
  "error": "Coming soon",
  "code": "NOT_IMPLEMENTED"
}
```

#### Update Agent
```http
PATCH /worlds/{worldName}/agents/{agentName}
```

**Parameters:**
- `worldName` (string, path) - Name of the world
- `agentName` (string, path) - Name of the agent

**Request Body:**
```json
{
  "status": "active|inactive",
  "config": {
    "temperature": 0.8,
    "maxTokens": 1500
  },
  "systemPrompt": "New system prompt text",
  "clearMemory": true
}
```

All fields are optional. You can update one or multiple fields in a single request.

**Response:**
```json
{
  "name": "agent1",
  "type": "AIAgent",
  "status": "inactive",
  "config": {
    "name": "agent1",
    "type": "AIAgent",
    "provider": "openai",
    "model": "gpt-4",
    "systemPrompt": "New system prompt text",
    "temperature": 0.8,
    "maxTokens": 1500
  },
  "createdAt": "2025-01-01T00:00:00.000Z",
  "lastActive": "2025-01-01T12:00:00.000Z",
  "metadata": {}
}
```

**Error Responses:**
- `400` - Invalid request body or validation errors
- `404` - World or agent not found
- `500` - Failed to update agent or clear memory

### Real-time Communication

#### Chat with SSE Streaming
```http
POST /worlds/{worldName}/chat
```

**Parameters:**
- `worldName` (string, path) - Name of the world

**Request Body:**
```json
{
  "message": "Hello, agents!",
  "sender": "HUMAN"
}
```

**Response:** Server-Sent Events (SSE) stream

**Headers:**
- `Content-Type: text/event-stream`
- `Cache-Control: no-cache`
- `Connection: keep-alive`

**Event Format:**
```
data: {"type": "connected", "payload": {"worldName": "default-world", "timestamp": "2025-01-01T12:00:00.000Z"}}

data: {"type": "message", "payload": {"type": "MESSAGE", "worldId": "default-world", "sender": "HUMAN", "content": "Hello, agents!"}}

data: {"type": "agent_response", "payload": {"type": "SSE", "agentName": "agent1", "content": "Hello! How can I help you?"}}
```

**Event Types:**
- `connected` - Initial connection confirmation
- `message` - User message broadcast
- `agent_response` - Agent response (may include streaming chunks)
- `error` - Error during processing

**Error Responses:**
- `400` - Invalid request body
- `404` - World not found

## Rate Limiting

Currently, no rate limiting is implemented. This may be added in future versions.

## CORS Support

The server supports Cross-Origin Resource Sharing (CORS) for all origins. In production, this should be configured more restrictively.

## Examples

### JavaScript/Browser

```javascript
// List worlds
fetch('http://localhost:3000/worlds')
  .then(response => response.json())
  .then(worlds => console.log(worlds));

// Update agent status
fetch('http://localhost:3000/worlds/default-world/agents/agent1', {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    status: 'inactive'
  })
})
.then(response => response.json())
.then(agent => console.log(agent));

// Chat with SSE
const eventSource = new EventSource('http://localhost:3000/worlds/default-world/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    message: 'Hello!',
    sender: 'WEB_USER'
  })
});

eventSource.onmessage = function(event) {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
};
```

### cURL

```bash
# List worlds
curl http://localhost:3000/worlds

# Get agents
curl http://localhost:3000/worlds/default-world/agents

# Update agent
curl -X PATCH http://localhost:3000/worlds/default-world/agents/agent1 \
  -H "Content-Type: application/json" \
  -d '{"status": "inactive", "clearMemory": true}'

# Chat with streaming
curl -X POST http://localhost:3000/worlds/default-world/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello world!", "sender": "API_USER"}' \
  --no-buffer
```

### Python

```python
import requests
import json

# List worlds
response = requests.get('http://localhost:3000/worlds')
worlds = response.json()
print(worlds)

# Update agent
update_data = {
    "status": "inactive",
    "config": {
        "temperature": 0.9
    }
}
response = requests.patch(
    'http://localhost:3000/worlds/default-world/agents/agent1',
    json=update_data
)
agent = response.json()
print(agent)

# Chat with SSE (requires sseclient-py: pip install sseclient-py)
import sseclient

response = requests.post(
    'http://localhost:3000/worlds/default-world/chat',
    json={"message": "Hello!", "sender": "PYTHON_USER"},
    stream=True
)

client = sseclient.SSEClient(response)
for event in client.events():
    data = json.loads(event.data)
    print(f"Event: {data}")
```

## Static Files

The server also serves static files from the `public/` directory. Visit `http://localhost:3000` in your browser to see the API documentation page.
