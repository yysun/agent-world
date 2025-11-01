# CLI World Save Command - Implementation Complete

**Date:** November 1, 2025  
**Status:** ✅ Complete

## Overview
Implemented comprehensive world save command for the CLI that allows saving worlds to file storage or SQLite storage with interactive selection, overwrite protection, and event data inclusion.

## Features Implemented

### 1. Interactive Storage Selection
- **Storage Type Selection**: Choose between File storage and SQLite database
- **Path Input**: Custom path with default option shown
- **Readline-based UI**: Consistent with other CLI commands (selectWorld, selectChat patterns)

### 2. Comprehensive Data Save
- **World Data**: Base world configuration and state
- **Agent Data**: All agents with their prompts and configurations
- **Chat Data**: All chat sessions with messages
- **Event Data**: Complete event history organized by chat

### 3. Overwrite Protection
- **Existence Check**: Detects if target SQLite database or world folder exists
- **User Confirmation**: Prompts for confirmation before overwriting
- **Clean Delete**: Removes entire world folder (agents, chats, events) or SQLite files (db, wal, shm)
- **Fresh Save**: Ensures clean state after deletion

### 4. Event Storage Path Structure
- **World-Level Organization**: Events at `./{worldId}/events/` alongside agents and chats
- **File Format**: JSON arrays with pretty-printing (2-space indent)
- **Chat-Based Files**: Separate file per chat: `{worldId}/events/{chatId}.json`
- **Null Chat Support**: `{worldId}/events/null.json` for events without chat context

## Technical Implementation

### CLI Commands (`cli/commands.ts`)
```typescript
// Trigger interactive save flow
async saveWorldToStorage(worldId: string): Promise<any>

// Perform actual save operation
async performWorldSave(worldId: string, storageType: string, targetPath: string): Promise<void>

// Check if target exists
async checkTargetExists(storageType: string, targetPath: string, worldId: string): Promise<boolean>

// Delete existing data before save
async deleteExistingData(storageType: string, targetPath: string, worldId: string): Promise<void>
```

### CLI Interactive Flow (`cli/index.ts`)
```typescript
// Storage type selection (1. file, 2. sqlite)
selectStorageType(): Promise<string>

// Path input with default suggestion
getStoragePath(storageType: string): Promise<string>

// Overwrite confirmation
confirmOverwrite(): Promise<boolean>
```

### Event Storage Configuration (`core/storage/storage-factory.ts`)
- **Base Directory**: Uses `config.rootPath` directly (not nested under `./events/`)
- **File Event Storage**: Creates events at world level
- **Consistent Structure**: Matches agents and chats folder organization

### Event Storage Implementation (`core/storage/eventStorage/fileEventStorage.ts`)
- **Path Functions**:
  - `getEventFilePath(baseDir, worldId, chatId)`: Returns `{baseDir}/events/{chatId}.json`
  - `getWorldEventsDir(baseDir)`: Returns `{baseDir}/events/`
- **World-Scoped Operations**: All operations use `worldDir = path.join(baseDir, worldId)`
- **JSON Format**: Full array read/write with pretty-printing

## File Structure

### File Storage Structure
```
{rootPath}/
  {worldId}/
    world.json          # World configuration
    agents/
      {agentId}.json    # Agent data
    chats/
      {chatId}.json     # Chat data
    events/
      {chatId}.json     # Event history per chat
      null.json         # Events without chat
```

### SQLite Storage Structure
```
{rootPath}/
  {databaseName}.db     # SQLite database file
  {databaseName}.db-wal # Write-ahead log
  {databaseName}.db-shm # Shared memory
```

## Usage

### Save World Command
```bash
# In CLI, type:
world save

# Interactive prompts:
# 1. Select storage type (1-2):
#    1. file
#    2. sqlite
# 2. Enter storage path:
#    [default: ./data]
# 3. If exists, confirm overwrite:
#    Target already exists. Overwrite? (y/n)
```

## Testing Coverage
- ✅ Interactive storage type selection
- ✅ Custom path input with defaults
- ✅ Overwrite detection and confirmation
- ✅ World folder deletion (file storage)
- ✅ SQLite file deletion (db, wal, shm)
- ✅ Complete data save (world, agents, chats, events)
- ✅ Event path structure at world level
- ✅ JSON format with pretty-printing

## Changes Made

### Modified Files
1. `cli/commands.ts` - Save command implementation
2. `cli/index.ts` - Interactive flow and world save handler
3. `core/storage/eventStorage/fileEventStorage.ts` - Path structure and JSON format
4. `core/storage/storage-factory.ts` - Event storage base directory configuration

### Key Improvements from Initial Implementation
1. **UX**: Changed from enquirer to readline-based selection for consistency
2. **Safety**: Added overwrite confirmation with clean delete
3. **Completeness**: Included event data in save operation
4. **Format**: Changed from JSONL to JSON arrays for better readability
5. **Structure**: Fixed event paths to match agents/chats organization
6. **Cleanup**: Full folder deletion on overwrite for clean state

## Dependencies
- **Storage Factory**: `createStorage()` for target storage initialization
- **Event Storage**: `eventStorage.getEventsByWorldAndChat()` for event retrieval
- **File System**: `fs.promises` for file/folder operations
- **Readline**: `readline.promises` for interactive prompts

## Documentation Updates
- Updated file header comments in `fileEventStorage.ts` to reflect correct path structure
- Added inline documentation for save flow functions
- Quick start message updated in CLI

## Future Enhancements (Optional)
- Progress indicators for large world saves
- Selective save (choose which components to save)
- Save presets/profiles for common paths
- Backup rotation (keep N previous versions)
- Compression option for file storage
- Migration tools between storage types
