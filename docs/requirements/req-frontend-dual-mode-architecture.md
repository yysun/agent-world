# Frontend Dual Mode Architecture Requirements

## Overview
Implement dual operation modes for the frontend to support both single-user static deployment and multi-user server deployment while maintaining a unified user experience and shared codebase.

## Architecture Flow

### Static Mode
Frontend UI → Message Broker (.js module) → Core Bundle (ESM) → IndexedDB/Files

### Server Mode  
Frontend UI → Message Broker (.js module) → WebSocket → Server Core → Files

## Operation Modes

### 1. Static Mode (Single User)
- Serve from static HTML/JS files
- Single user operation with no server dependency
- Use Core ESM bundle directly in browser
- Auto-save to IndexedDB and optionally to files when folder access granted
- App key configuration via UI (no environment variables available)

### 2. Server Mode (Multi-User)
- Real-time multi-user collaboration via WebSocket
- Server handles Core operations
- App key configuration via environment variables

## Frontend Requirements

### UI Mode Toggle
- Add setting in frontend UI to switch between static and server modes
- Default mode: static
- Setting persists across sessions
- Mode switching affects message routing without changing UI behavior

### Message Broker Module
- Standalone .js module that abstracts communication layer
- Routes messages to local Core bundle (static mode) or WebSocket (server mode)
- Provides unified interface regardless of deployment mode
- Handles mode detection and message routing logic

### World Selection
- Auto-select or create world similar to CLI behavior
- Frontend connects to WebSocket only after world selection
- World selection happens before mode-specific operations
- Maintain world selection state across sessions

### Storage Module
- Separate storage module independent of UI and message broker
- Handle IndexedDB operations with file system fallback
- Provide unified storage interface for different persistence methods
- Auto-save workspace data with format compatibility

### Storage Strategy
- **IndexedDB**: Primary auto-save storage for all workspace data
- **File System**: When user grants folder access, also auto-save to files
- **Format Compatibility**: Read/write same .json files that Node.js server uses
- **Data Migration**: Opening .json file replaces current workspace in IndexedDB

### App Key Management
- **Static Mode**: UI-based configuration and secure storage
- **Server Mode**: Environment variable configuration
- **Persistence**: App keys stored securely in browser storage for static mode

## Core Module Requirements

### ESM Bundle Creation
- Build core as single ESM bundle containing all public APIs
- Bundle everything including dependencies for browser consumption
- Maintain compatibility with existing .json data format
- Support both static (browser) and server (Node.js) deployment scenarios

### Auto-Save Enhancement
- Add world-level autoSave flag to control agent memory persistence
- When autoSave disabled, messages accumulate in memory without disk writes
- Provide manual save capability for controlled persistence timing
- Maintain backward compatibility with existing behavior

## Server Requirements

### Stateful WebSocket Connections
- Server maintains one world instance per WebSocket connection
- Server creates world instance upon new connection establishment
- Server clears world instance when connection disconnects
- Stateful connection required for LLM streaming operations

### World Lifecycle Management
- Create world instance on WebSocket connection
- Load initial world data if available
- Handle world operations during connection lifetime
- Clean up world resources on disconnect

### WebSocket-Only Communication
- Remove REST API completely (no migration needed)
- Server responds exclusively to world messages via WebSocket
- Server operates directly on world objects
- Maintain existing WebSocket message protocol

### Auto-Save Control
- Support world.autoSave flag to disable automatic agent memory persistence
- When disabled, improves performance for high-throughput scenarios
- Messages continue accumulating in agent.memory array in memory
- Default behavior maintains backward compatibility

## Build and Deployment Requirements

### Bundle Strategy
- **Core Bundle**: ESM bundle for browser consumption with all dependencies
- **Server Bundle**: Bundle server code for production deployment
- **CLI Bundle**: Bundle CLI code for distribution
- **Package Bundle**: Bundle package code for deployment
- **Development Only**: Use tsx only for development, not production

### TypeScript Transition
- Package no longer TypeScript native in production
- Maintain TypeScript for development and building
- All production artifacts are bundled JavaScript
- Remove TypeScript runtime dependencies from production

## Data Format Requirements

### Cross-Platform Compatibility
- Maintain identical .json data structure between static and server modes
- Browser can read and write same files that Node.js server uses
- Support seamless data migration between deployment types
- Preserve existing file format for backward compatibility

## Technical Constraints

### Code Organization
- Core module changes limited to autoSave flag enhancement only
- Message broker handles all mode-specific communication logic
- Storage module separated from UI and communication layers
- Frontend UI remains mode-agnostic at application level
- Maximum code sharing between deployment modes

### Browser Capabilities
- IndexedDB for primary browser storage with auto-save
- File System Access API for optional local file persistence
- Support for .json file import/export operations
- Secure storage for app keys in static mode

### Configuration Management
- UI-based mode selection with persistent setting storage
- Static mode app key configuration via secure browser storage
- Server mode app key configuration via environment variables
- Clear separation between static and server configuration methods
