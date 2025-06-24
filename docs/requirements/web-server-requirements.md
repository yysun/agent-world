# Web Server Requirements

## Overview
Add a web server (server.ts) to the agent-world project with Express.js to provide REST API endpoints and real-time communication capabilities.

## Core Requirements

### Server Setup
- Create an Express server that listens on a specified port
- Serve static files from a `public` directory
- Include only a placeholder index.html file with no other implementation

### API Endpoints

#### World Management
- **GET /worlds** - List all available worlds
- **GET /worlds/{worldName}/agents** - List all agents in a specific world
- **GET /worlds/{worldName}/agents/{agentName}** - Get details of a specific agent

#### Agent Management
- **POST /worlds/{worldName}/agents** - Create a new agent (coming soon - placeholder endpoint)
- **PATCH /worlds/{worldName}/agents/{agentName}** - Update agent with the following operations:
  - Set the agent's status (active, inactive, paused)
  - Update the agent's configuration
  - Update the agent's system prompt
  - Clear memory

#### Real-time Communication
- **POST /worlds/{worldName}/chat** - Send a message to the world and respond with SSE stream of world events

## CLI Integration Requirements
- **Automatic Server Launch** - The CLI should automatically launch the web server when started
- **Interactive Operation** - The CLI should continue to work as it currently does, handling user input interactively while the server runs in the background
- **Seamless Integration** - Server should start/stop with CLI lifecycle

## Technical Specifications
- Use Express.js framework
- Implement Server-Sent Events (SSE) for real-time chat communication streaming
- Use Zod for input validation on all endpoints
- Integrate with existing world and agent management system
- Serve static content from public directory
- Provide RESTful API design with proper HTTP methods and status codes
- Use PATCH endpoint specifically for agent status management

## Integration Points
- Connect with existing world management functions
- Integrate with current agent system
- Use existing event bus for SSE functionality
- Maintain compatibility with current CLI interface
