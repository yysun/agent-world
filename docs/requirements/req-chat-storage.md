# Requirements: Chat Operations for File and SQLite Storage

## Overview

Add comprehensive chat-related operations to both file-based and SQLite-based storage modules in the `core` package, ensuring consistent APIs across storage backends.

## Requirements

### R1: Chat Operations for File Storage (`core/world-storage.ts`)
- Add file-based chat persistence functions to complement existing world operations
- Store chats as JSON files in world directories using structure: `<worldId>/chats/<chatId>.json`
- Operations: `saveChat`, `loadChat`, `deleteChat`, `listChats`, `updateChat`
- Maintain consistency with existing file storage patterns (kebab-case naming, JSON serialization)

### R2: Chat Operations for SQLite Storage (`core/sqlite-storage.ts`)
- Add chat operations to existing SQLite storage implementation
- Leverage existing chat schema and context from `sqlite-schema.ts`
- Operations: `saveChat`, `loadChat`, `deleteChat`, `listChats`, `updateChat`
- Ensure proper foreign key relationships with worlds table

### R3: Snapshot Operations for Both Storages
- Add snapshot storage for world state preservation
- File storage: Store snapshots as `<worldId>/chats/<chatId>-snapshot.json`
- SQLite storage: Use existing snapshot tables and relationships
- Operations: `saveSnapshot`, `loadSnapshot`, `restoreFromSnapshot`

### R4: Enhanced StorageManager Interface
- Update `storage-factory.ts` to properly delegate chat operations to storage backends
- Ensure file storage gracefully handles chat operations (current limitation)
- Maintain backward compatibility with existing StorageAPI interface

### R5: Comprehensive Unit Tests
- Create test files for both storage implementations:
  - `tests/core/storage/file-chat-storage.test.ts`
  - `tests/core/storage/sqlite-chat-storage.test.ts`
- Test all CRUD operations for chats and snapshots
- Follow existing test patterns with proper mocking
- Include edge cases: missing chats, invalid data, storage errors
- Test integration with existing world and agent operations

## Technical Constraints

### File Storage Limitations
- Current file storage adapter throws errors for chat operations
- Must implement actual file-based chat persistence
- Should follow same patterns as world and agent storage modules

### SQLite Storage Integration
- SQLite already has chat schema and partial implementation
- Must complete missing operations and ensure consistency
- Should leverage existing transaction and context patterns

### API Consistency
- Both storage backends must implement identical chat operation signatures
- Error handling should be consistent across implementations
- Return types must match interface definitions in `types.ts`

## Data Structures

All operations must work with existing type definitions:
- `WorldChat`: Main chat entity with metadata
- `ChatInfo`: Lightweight chat listing information  
- `CreateChatParams`: Chat creation parameters
- `UpdateChatParams`: Chat update parameters
- `WorldSnapshot`: Complete world state capture

## Out of Scope

- Frontend integration or UI changes
- CLI command updates
- API endpoint modifications
- Migration scripts between storage types
- Performance optimizations beyond basic implementation
- Advanced chat features (search, analytics)

## Success Criteria

1. Both file and SQLite storage support full chat CRUD operations
2. All operations pass comprehensive unit tests
3. StorageAPI interface works consistently across backends
4. Existing functionality remains unaffected
5. Test coverage matches existing storage module standards
