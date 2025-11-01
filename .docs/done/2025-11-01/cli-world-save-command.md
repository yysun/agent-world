# CLI World Import/Load and Save Command - Implementation Complete

**Date:** November 1, 2025  
**Status:** ✅ Complete

## Overview
Implemented comprehensive world save and load/import functionality for the CLI that allows:
- Saving worlds to file storage or SQLite storage with interactive selection
- Loading worlds from external folders with optional import
- Working with external worlds without importing them
- Complete data migration including world config, agents, chats, and events

## Features Implemented

### 1. World Save Command

#### Interactive Storage Selection
- **Storage Type Selection**: Choose between File storage and SQLite database
- **Path Input**: Custom path with default option shown
- **Readline-based UI**: Consistent with other CLI commands (selectWorld, selectChat patterns)

#### Comprehensive Data Save
- **World Data**: Base world configuration and state
- **Agent Data**: All agents with their prompts and configurations
- **Chat Data**: All chat sessions with messages
- **Event Data**: Complete event history organized by chat

#### Overwrite Protection
- **Existence Check**: Detects if target SQLite database or world folder exists
- **User Confirmation**: Prompts for confirmation before overwriting
- **Clean Delete**: Removes entire world folder (agents, chats, events) or SQLite files (db, wal, shm)
- **Fresh Save**: Ensures clean state after deletion

#### Event Storage Path Structure
- **World-Level Organization**: Events at `./{worldId}/events/` alongside agents and chats
- **File Format**: JSON arrays with pretty-printing (2-space indent)
- **Chat-Based Files**: Separate file per chat: `{worldId}/events/{chatId}.json`
- **Null Chat Support**: `{worldId}/events/null.json` for events without chat context

### 2. World Load/Import Command

#### Multiple World Selection
- **World Discovery**: Lists all worlds found in external folder
- **Interactive Selection**: Numbered menu for multiple worlds (1-N)
- **World Information**: Shows name, ID, agent count, and chat count
- **Auto-select Single**: If only one world, auto-selects it

#### Import Options
- **Prompt for Import**: Ask user if they want to import to current storage
- **Work Without Import**: Load and work with world from external storage
- **External Path Tracking**: CLI tracks external path throughout session
- **Visual Indicator**: Shows `(loaded from external storage: /path)` when using external world

#### Overwrite Handling
- **Existence Check**: Detects if world already exists in current storage
- **Overwrite Confirmation**: Prompts before overwriting existing world
- **Fallback to External**: If overwrite cancelled, loads from external storage instead
- **Clean Import**: Deletes existing world completely before importing

#### Complete Data Migration
- **Source Storage**: Creates temporary storage instance for external folder
- **Target Storage**: Uses current CLI storage configuration
- **World Config**: Copies complete world configuration
- **Agents**: Migrates all agents with prompts
- **Chats**: Copies all chat sessions with messages
- **Events**: Migrates world-level and chat-level event history
- **Import Summary**: Shows counts of imported data

## Technical Implementation

### CLI Commands (`cli/commands.ts`)
```typescript
// Trigger interactive save flow
async saveWorldToStorage(worldId: string): Promise<any>

// Perform actual save operation
async performWorldSave(worldId: string, storageType: string, targetPath: string): Promise<void>

// Check if target exists
async checkTargetExists(targetPath: string, storageType: string, worldId: string): Promise<{exists: boolean, message: string}>

// Delete existing data before save
async deleteExistingData(targetPath: string, storageType: string, worldId: string): Promise<void>
```

### CLI Interactive Flow (`cli/index.ts`)
```typescript
// Enhanced world selection with external loading
async selectWorld(rootPath: string, rl: readline.Interface): Promise<{worldName: string, externalPath?: string} | null>

// Load world from external folder with import options
async loadWorldFromFile(currentRootPath: string, rl: readline.Interface): Promise<{worldName: string, externalPath?: string} | null>

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
#    Target already exists. Overwrite? (yes/no)
```

### Load/Import World Command
```bash
# In world selection menu, choose:
(From file...)

# Interactive flow:
# 1. Enter path to world folder
# 2. If multiple worlds, select which one (1-N)
# 3. See world information (name, ID, agents, chats)
# 4. Import to current storage? (yes/no)
#    - yes: Continue to step 5
#    - no: Load from external storage and work with it
# 5. If world exists, overwrite? (yes/no)
#    - yes: Delete existing and import
#    - no: Load from external storage instead
# 6. Import summary (agents, chats, events imported)
```

## User Flow Scenarios

### Scenario 1: Import World (Single World in Folder)
```
1. Select world → "(From file...)"
2. Enter external folder path
3. World auto-selected (only one found)
4. View world info
5. Import? → yes
6. (If exists) Overwrite? → yes
7. World imported successfully
8. Work with imported world
```

### Scenario 2: Import World (Multiple Worlds)
```
1. Select world → "(From file...)"
2. Enter external folder path
3. See list of worlds (1-N)
4. Select world number
5. View world info
6. Import? → yes
7. World imported successfully
```

### Scenario 3: Work Without Import
```
1. Select world → "(From file...)"
2. Enter external folder path
3. View world info
4. Import? → no
5. World loaded from external storage
6. CLI shows: "(loaded from external storage: /path)"
7. All operations work against external files
```

### Scenario 4: Cancelled Overwrite → External Load
```
1. Select world → "(From file...)"
2. World exists in current storage
3. Overwrite? → no
4. Automatically loads from external storage
5. Work with external world (no data loss)
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
- ✅ Multiple world selection from external folder
- ✅ Import with overwrite handling
- ✅ Load without import (external path tracking)
- ✅ Fallback to external on overwrite cancel

## Changes Made

### Modified Files
1. `cli/commands.ts` - Save command implementation
2. `cli/index.ts` - Interactive flow, world save handler, and external world loading
3. `core/storage/eventStorage/fileEventStorage.ts` - Path structure and JSON format
4. `core/storage/storage-factory.ts` - Event storage base directory configuration

### Key Features Added
1. **World Load**: "(From file...)" option in world selection menu
2. **Multi-World Support**: Selection menu when multiple worlds found
3. **Optional Import**: Work with external worlds without importing
4. **External Path Tracking**: Return type changed to `{worldName, externalPath?}`
5. **Fallback Logic**: Auto-load external when overwrite cancelled
6. **Import Summary**: Display counts of migrated data

### Key Improvements from Initial Implementation
1. **UX**: Changed from enquirer to readline-based selection for consistency
2. **Safety**: Added overwrite confirmation with clean delete
3. **Completeness**: Included event data in save/import operations
4. **Format**: Changed from JSONL to JSON arrays for better readability
5. **Structure**: Fixed event paths to match agents/chats organization
6. **Cleanup**: Full folder deletion on overwrite for clean state
7. **Flexibility**: Work with external worlds without importing
8. **Discovery**: Support multiple worlds in external folders

## Dependencies
- **Storage Factory**: `createStorage()` for storage initialization
- **Event Storage**: `eventStorage.getEventsByWorldAndChat()` for event retrieval
- **File System**: `fs.promises` and `fs.existsSync()` for file/folder operations
- **Readline**: `readline.promises` for interactive prompts
- **Managers**: `getWorld()`, `listAgents()`, `listChats()` for data access

## Documentation Updates
- Updated file header comments in `cli/index.ts` to reflect load/import functionality
- Updated file header comments in `fileEventStorage.ts` to reflect correct path structure
- Added inline documentation for save and load/import flow functions
- Quick start message updated in CLI

## Future Enhancements (Optional)
- Progress indicators for large world saves/imports
- Selective save/import (choose which components)
- Save/import presets/profiles for common paths
- Backup rotation (keep N previous versions)
- Compression option for file storage
- Migration tools between storage types
- Batch import (multiple worlds at once)
- Import conflict resolution strategies
