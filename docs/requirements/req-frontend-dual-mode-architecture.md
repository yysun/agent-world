# Frontend Dual Mode Architecture Requirements

## Overview
Implement dual operation modes for the frontend to support both single-user static deployment and multi-user server deployment while maintaining a unified user experience and shared codebase.

## Operation Modes

### 1. Static Mode (Single User)
- Serve from static HTML/JS using Web File API and IndexedDB
- Single user operation
- Frontend creates objects directly from core modules
- Messages sent to local objects
- Auto-save to IndexedDB with localStorage fallback, memory-only as final fallback
- Manual file operations (Open/Save) using .json format
- No server communication required

### 2. Server Mode (Multiple Users)
- Serve from backend with node:fs and WebSockets
- Multiple users support
- Objects created on server within WebSocket connections
- Messages sent via WebSocket communication
- Real-time multi-user collaboration

## Frontend Requirements

### Unified Message Interface
- Create a unified send message interface that abstracts the communication layer
- Interface decides whether to send messages to local objects or WebSockets based on current mode
- Frontend UX remains identical across both modes
- Maximum code sharing between static and server modes
- Include setting/configuration to switch between static and server modes

### Mode-Specific Implementation
- **Static Mode**: Instantiate core objects directly in frontend, handle messaging locally, auto-save to IndexedDB
- **Server Mode**: Communicate with server-side objects via WebSocket protocol
- Seamless mode switching without changing core application logic

### Static Mode Storage Strategy
- **Primary**: IndexedDB for auto-save of complete workspace (all worlds and agents)
- **Fallback 1**: localStorage with JSON serialization if IndexedDB fails
- **Fallback 2**: Memory-only mode with frequent export prompts if both storage methods fail
- **File Operations**: Manual Open/Save using .json format via Web File API
- **File Behavior**: Opening .json file completely replaces current workspace in IndexedDB

## Core Module Requirements

### Unified Storage Interface
- World and agent storage must support both static and server modes
- Create abstracted storage interface that handles both deployment scenarios
- Storage operations should be transparent to the application logic

### World Module Updates
- Add static mode flag to modify storage behavior in static deployments
- Root path configuration should support both static (browser) and server (Node.js) environments
- Static mode uses IndexedDB auto-save instead of file system auto-save

### Storage Abstraction
- Implement unified storage interface that can handle:
  - Browser-based storage (IndexedDB primary, localStorage fallback) for static mode
  - Node.js file system operations for server mode
- Maintain consistent API regardless of underlying storage mechanism
- Support .json format compatibility between both modes

## Server Requirements

### WebSocket Integration
- Deprecate existing REST API in favor of WebSocket communication
- Support `world` message protocol via WebSocket for world and agent operations
- Handle object lifecycle within WebSocket connections
- Manage per-user world and agent instances

### Message Protocol
- Define WebSocket message format for world and agent operations
- Support all existing world and agent functionality through WebSocket interface
- Maintain message compatibility with local object interface for frontend abstraction

## Technical Constraints

### Code Organization
- Maintain separation between core logic and communication layer
- Frontend code should be mode-agnostic at the application level
- Storage interface should abstract away implementation details
- WebSocket protocol should mirror local object interface for consistency

### Browser Compatibility
- IndexedDB wrapper for simplified API and error handling
- Graceful degradation through storage fallback chain
- Support for .json file format in both modes

### Configuration Management
- Mode selection should be configurable (environment variable, config file, or runtime setting)
- Support dynamic mode switching where feasible
- Clear documentation for deployment in each mode

### Data Format Requirements
- Use .json file extension for import/export operations
- Maintain identical data structure between static and server modes
- Support version compatibility for data migration
