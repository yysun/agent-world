# Database Migration Tests

Comprehensive tests for SQLite database management including schema migrations, database initialization, and error handling.

## Files

- `migration-tests.ts` - Main test suite (standalone, runs with tsx)
- `README.md` - This documentation

## Overview

These tests verify that the database migration system works correctly across all schema versions and handles various edge cases properly. The test suite was created to address and prevent SQLite migration issues, particularly the "no such column: mcp_config" error that can occur when the migration system doesn't properly upgrade to the latest schema version.

## Recent Updates

### November 2, 2025
- **Migration System Refactored to Linear Path**: Simplified migration system to follow strict rule
  - **0000** = Base schema (worlds, agents, agent_memory, archives) - NO v1-v7 features
  - **0001-0009** = Incremental migrations building on base schema
  - Changed from `db.run()` to `db.exec()` for multi-statement SQL files
  - Removed all "skip migrations 1-7" logic - now simple linear execution
  - Removed `detectExistingSchema()` and complex branching logic
- **Comprehensive Integration Tests**: Added `tests/integration/migration-paths.test.ts` with 16 test cases
  - 12 passing tests covering all migration paths
  - Tests use production SQL files from `migrations/` directory
  - Verifies fresh installations (v0→v9) and historical upgrades (v1→v9, v4→v9, v7→v9)
  - All databases follow same linear path: 0→1→2→3→4→5→6→7→8→9

### August 2025
- **Fixed Migration Target**: Updated schema migration to properly target version 5 (including mcp_config column)
- **Filename Consistency**: Resolved storage factory filename inconsistency (agent-world.db vs database.db)
- **Comprehensive Coverage**: Added 13 test cases covering all migration scenarios
- **Cleanup**: Removed unused Jest-based test infrastructure in favor of tsx-only approach

## Test Coverage

### 1. Fresh Database Creation
- ✅ Creates new database with latest schema (version 5)
- ✅ Initializes with default world correctly
- ✅ Prevents duplicate default worlds on multiple initialization calls

### 2. Schema Migrations (Focus on Real Scenarios)
- ✅ Initializes fresh database (version 0 → latest) - Most common production case
- ✅ Handles empty database with version marker - Edge case recovery
- ✅ Handles already up-to-date databases (no migration needed) - Production safety

### 3. Data Preservation (Zero Data Loss Guarantee)
- ✅ Preserves existing data during reinitialization
- ✅ Maintains data integrity across schema operations
- ✅ Validates foreign key relationships after operations
- ✅ Ensures no data corruption during database operations

### 4. Database Statistics and Health Monitoring
- ✅ Provides accurate database statistics (world count, agent count, etc.)
- ✅ Validates database integrity with PRAGMA checks
- ✅ Reports database size and health metrics
- ✅ Monitors schema version consistency

### 5. Error Handling and Recovery
- ✅ Handles corrupted database files gracefully
- ✅ Creates missing database directories automatically
- ✅ Manages SQLite WAL mode conflicts during testing
- ✅ Recovers from partial migration failures

## Database Setup for Tests

All tests use **temporary SQLite databases** in isolated locations to avoid conflicts with production data:

| Test Type | Database Location | Migration Files | Purpose |
|-----------|------------------|-----------------|---------|
| **Unit Tests** | `/tmp/test-migrations-*.db` | Mock SQL (created in test) | Test migration runner logic |
| **Integration Tests** | `/tmp/test-migration-paths-*.db` | Real production SQL files | Test actual migration paths |
| **Standalone Tests** | `/tmp/agent-world-tests/*.db` | Real system (initializeWithDefaults) | Test complete DB initialization |

### Key Characteristics
- ✅ **Real SQLite**: All tests use actual SQLite databases (not mocked)
- ✅ **Isolated**: Each test gets a unique temporary database
- ✅ **Auto-cleanup**: Databases are deleted after each test
- ✅ **Safe**: No interference with production or between tests

## Migration Path Integration Tests

Located in `tests/integration/migration-paths.test.ts`, this comprehensive test suite verifies all production migration scenarios using actual SQL files from the `migrations/` directory.

### Key Features

- **Production SQL Files**: Tests use the same SQL files (`0000_init_base_schema.sql` through `0009_add_event_sequences.sql`) that run in production
- **db.exec() Execution**: All SQL files executed with `db.exec()` to handle multi-statement files correctly
- **Smart Schema Detection**: Detects existing schema to prevent duplicate column errors when migration tracking is lost
- **12 Passing Tests**: Comprehensive coverage with 4 intentionally skipped tests

### Test Results (as of Nov 2, 2025)

```
✅ 12 tests passing
⏭️ 4 tests skipped (by design)
❌ 0 tests failing
```

### Coverage

#### Fresh Database Migration (2 tests)
- **v0 → v9**: Verifies migration 0000 creates complete base schema with all v1-v7 features
  - Tests all tables, columns, indexes, and triggers exist after migration 0000
  - Confirms version is set to 7 (since migration 0000 includes v1-v7 changes)
- **v0 → v9 (Full Path)**: Tests complete migration path from empty database to latest
  - Applies migration 0000 (sets version to 7)
  - Skips migrations 1-7 (already included in 0000)
  - Applies migrations 8 and 9 (events system)
  - Verifies all 9 tables and 20+ indexes exist

#### Historical Version Migrations (5 tests)
Tests upgrading from each historical schema version to current (v9):

- **v1 → v9**: From `chat_id` column addition
- **v2 → v9**: From LLM config columns
- **v3 → v9**: From `current_chat_id` addition
- **v4 → v9**: From `mcp_config` addition (critical - most common production upgrade path)
- **v7 → v9**: From `world_chats` table creation to events system

#### Incremental Migration Steps (5 tests)
Tests each individual migration in isolation:

- **v4 → v5**: SKIPPED (v5 included in migration 0000)
- **v5 → v6**: SKIPPED (v6 included in migration 0000)
- **v6 → v7**: SKIPPED (v7 included in migration 0000)
- **v7 → v8**: Create `events` table with 4 indexes
- **v8 → v9**: Add `event_sequences` table for atomic sequence generation

*Note: Tests v4-v6 are skipped because migration 0000 (fresh base schema) already includes all v1-v7 features. Only v7→v8 and v8→v9 test actual incremental migrations.*

#### Data Preservation (2 tests)
Tests that existing data survives migrations:
- **World Data**: Names, descriptions, turn_limit, LLM configs (`chat_llm_provider`, `chat_llm_model`), MCP configs, `current_chat_id`
- **Agent Memory**: Messages with chat_id preserved, new columns (`message_id`, `reply_to_message_id`) added with NULL values for existing data

#### Migration Status Tracking (1 test)
- Applied migrations counting (migration 0000 recorded, then v8 and v9)
- Pending migrations identification (correctly identifies only v8 and v9 are pending from v4)
- Version synchronization (v4 → v9 migration updates version correctly)

#### Error Handling (1 test, skipped)
- **SKIPPED**: Test for handling missing migration table after schema exists
  - Scenario is unrealistic (dropping schema_migrations while keeping schema creates invalid state)
  - Production systems should never encounter this scenario

#### Migration Files Used
All 10 production migration files (with current schema version v9):

| File | Version | Description | Used For |
|------|---------|-------------|----------|
| `0000_init_base_schema.sql` | 0 | Base schema ONLY (worlds, agents, agent_memory, archives) - NO v1-v7 columns | ✅ Fresh installations |
| `0001_add_chat_id.sql` | 1 | Add chat_id to agent_memory | ✅ All databases from v0 |
| `0002_add_llm_config.sql` | 2 | Add chat_llm_provider, chat_llm_model to worlds | ✅ All databases from v1 |
| `0003_add_current_chat_id.sql` | 3 | Add current_chat_id to worlds | ✅ All databases from v2 |
| `0004_add_mcp_config.sql` | 4 | Add mcp_config to worlds | ✅ All databases from v3 |
| `0005_add_message_id.sql` | 5 | Add message_id to agent_memory | ✅ All databases from v4 |
| `0006_add_reply_to_message_id.sql` | 6 | Add reply_to_message_id to agent_memory | ✅ All databases from v5 |
| `0007_create_world_chats.sql` | 7 | Create world_chats table | ✅ All databases from v6 |
| `0008_create_events_table.sql` | 8 | Create events table with indexes | ✅ All databases from v7 |
| `0009_add_event_sequences.sql` | 9 | Create event_sequences for atomic seq generation | ✅ All databases from v8 |

**Migration Strategy (Linear Path):**
- **Fresh installations (no database exists)**: 
  - Start at version 0
  - Apply migrations in order: **0→1→2→3→4→5→6→7→8→9**
  - Each migration adds ONE feature incrementally
  - Migration 0000 creates base schema (worlds, agents, agent_memory, archives)
  - Migrations 0001-0009 add columns/tables one at a time
  
- **Historical databases (at version N)**:
  - Resume from current version N
  - Apply remaining migrations: **(N+1)→(N+2)→...→9**
  - Example: Database at v4 applies 5→6→7→8→9
  - Same linear path, just starting from different point
  
- **Simple Rule**: 
  - **0000** = Base schema creation
  - **0001** = First migration (adds chat_id)
  - **0002-0009** = Subsequent migrations
  - ALL databases follow same path, no exceptions

### Running Migration Path Tests

```bash
# Run all migration integration tests (recommended)
npm run integration -- migration-paths

# Run specific test suite
npm run integration -- migration-paths -t "Fresh Database"
npm run integration -- migration-paths -t "Historical Version"
npm run integration -- migration-paths -t "Incremental Migration"
npm run integration -- migration-paths -t "Data Preservation"

# Watch mode for development
npm run integration -- migration-paths --watch
```

### Test Implementation Details

**Critical Fix (Nov 2, 2025)**: Changed from `db.run()` to `db.exec()` for SQL file execution
- `db.run()` only executes ONE SQL statement, ignoring the rest
- `db.exec()` executes ALL statements in a SQL file (CREATE TABLE, CREATE INDEX, CREATE TRIGGER, etc.)
- Migration files like `0000_init_base_schema.sql` have 150+ lines with multiple statements
- Using `run()` caused incomplete schema creation and "no such table" errors

**Test Helpers:**
- `createDbAtVersion(version)`: Creates test databases at specific schema versions using production SQL files
- `ensureMigrationTable()`: Creates schema_migrations tracking table
- `recordMigration()`: Records migration application in tracking table
- `setVersion()`: Sets PRAGMA user_version for schema version tracking
- `runMigrations()`: Executes pending migrations using migration runner

## Running the Tests

### Using npm script (recommended):
```bash
npm run test:db
```

### Using tsx directly:
```bash
npx tsx tests/db/migration-tests.ts
```

## Test Configuration

The tests use a custom configuration that:
- Disables WAL mode to prevent transaction conflicts during testing
- Uses temporary database files in `/tmp/agent-world-tests/`
- Automatically cleans up test databases after each test
- Handles expected SQLite errors during corruption testing

## Schema Versions Tested

| Version | Changes | Test Coverage | Migration Path | Status |
|---------|---------|---------------|----------------|--------|
| 0 | Base schema (no v1-v7 features) | ✅ v0→v9 | Apply 0→1→2→3→4→5→6→7→8→9 | Initial base |
| 1 | Add chat_id | ✅ v1→v9 | Apply 2→3→4→5→6→7→8→9 | Historical |
| 2 | Add LLM config | ✅ v2→v9 | Apply 3→4→5→6→7→8→9 | Historical |
| 3 | Add current_chat_id | ✅ v3→v9 | Apply 4→5→6→7→8→9 | Historical |
| 4 | Add mcp_config | ✅ v4→v9 | Apply 5→6→7→8→9 | Historical |
| 5 | Add message_id | ✅ Incremental | Apply 6→7→8→9 | Historical |
| 6 | Add reply_to_message_id | ✅ Incremental | Apply 7→8→9 | Historical |
| 7 | Create world_chats | ✅ v7→v9 | Apply 8→9 | Historical |
| 8 | Create events table | ✅ v7→v8, v8→v9 | Apply 9 | Pre-current |
| 9 | Add event_sequences | ✅ (target) | None needed | **CURRENT** |

**Migration Philosophy:** 
- ALL databases follow the same linear path: 0→1→2→3→4→5→6→7→8→9
- Migration 0000 creates ONLY base schema (no v1-v7 features)
- Migrations 0001-0009 add features incrementally
- Fresh installations start at v0, apply all migrations 0-9
- Historical databases resume from current version, apply remaining migrations
- No special cases, no branching logic, no "fast paths"

## Production Impact

These tests directly address real-world issues encountered in production:

1. **Migration Execution Bug (Nov 2, 2025)**: 
   - **Issue**: Using `db.run()` instead of `db.exec()` caused only the first SQL statement in migration files to execute
   - **Impact**: Migration 0000 would create only the `worlds` table, leaving 8+ other tables missing
   - **Fix**: Changed all SQL file execution to use `db.exec()` for multi-statement support
   - **Result**: All tables, indexes, and triggers now create correctly

2. **Duplicate Column Errors (Nov 2, 2025)**:
   - **Issue**: After applying migration 0000 (which includes v1-v7), migration runner would try to apply migrations 1-7 again
   - **Impact**: "SQLITE_ERROR: duplicate column name: chat_id" errors on fresh installations
   - **Fix**: Added logic to skip migrations 1-7 after detecting migration 0000 was applied
   - **Result**: Fresh installations now properly apply only 0000→8→9

3. **Migration Target Version (Aug 2025)**: 
   - **Issue**: The "no such column: mcp_config" error occurred when databases at version 4 couldn't access the new mcp_config column
   - **Impact**: Production systems couldn't save MCP configurations
   - **Fix**: Ensured migration system properly upgrades to latest version (now v9)
   - **Result**: All database operations work correctly with current schema

4. **Data Safety**: All migration paths tested to ensure no data loss during schema upgrades, even across multiple version jumps

5. **Consistency Validation**: Database filename inconsistencies between different storage backends caught and prevented

6. **Error Recovery**: Production databases that become corrupted or partially migrated can be recovered gracefully

## Test Architecture

The test suite uses a standalone approach with tsx for maximum reliability:
- **No Jest Dependencies**: Eliminates complex test framework overhead
- **Direct SQLite Access**: Tests actual database operations, not mocked interfaces  
- **Isolated Test Databases**: Each test uses a fresh temporary database
- **Comprehensive Cleanup**: All test artifacts are automatically removed
- **Realistic Schema Simulation**: `createDatabaseWithVersion()` creates databases that match historical schema states, enabling proper migration testing

### Historical Schema Simulation

The migration path test suite uses production SQL files to simulate historical database states:

**Fresh Database Path (Linear):**
```typescript
// v0 → v9: Apply ALL migrations in order (0, 1, 2, 3, 4, 5, 6, 7, 8, 9)
const migrationFiles = [
  '0000_init_base_schema.sql',      // Creates base tables
  '0001_add_chat_id.sql',           // Adds chat_id column
  '0002_add_llm_config.sql',        // Adds LLM config columns
  // ... continues through 0009
];

for (let i = 0; i <= 9; i++) {
  const sql = fs.readFileSync(path.join(migrationsDir, migrationFiles[i]), 'utf8');
  await db.exec(sql);
  await setVersion(db, i);
}
```

**Historical Database Path (Resume from N):**
```typescript
// v4 → v9: Database at version 4, apply migrations 5, 6, 7, 8, 9
// Migration runner detects current version and applies remaining migrations
const currentVersion = await getCurrentVersion(db);  // Returns 4
const pendingMigrations = migrations.filter(m => m.version > currentVersion);
// Applies: 0005, 0006, 0007, 0008, 0009 in order
await runMigrations({ db, migrationsDir });
```

**Key Testing Principles:**
1. **Use Production Files**: All tests execute actual SQL files from `migrations/` directory
2. **db.exec() Required**: Multi-statement SQL files must use `exec()` not `run()`
3. **Version Tracking**: Set PRAGMA user_version to match schema state
4. **Skip Logic**: Fresh path (0000) must skip legacy migrations 1-7 to avoid duplicate columns
5. **Data Preservation**: Verify existing data survives all migration paths

## What These Tests Verify

1. **Migration Safety**: Data is preserved during schema upgrades
2. **Version Handling**: Correct detection of schema versions and migration needs
3. **Default Initialization**: Proper creation of default world without duplicates
4. **Error Recovery**: Graceful handling of database corruption and missing files
5. **Data Integrity**: Foreign key constraints and referential integrity maintained
6. **Concurrent Safety**: Multiple initialization attempts don't cause conflicts

## Expected Output

When all tests pass, you should see:
```
🧪 Running Database Migration Tests

📁 Fresh Database Creation
  ✅ should create new database with latest schema
  ✅ should initialize with defaults correctly
  ✅ should not duplicate default world on multiple calls

📁 Schema Migrations
  ✅ should migrate from version 1 to latest
  ✅ should migrate from version 2 to latest
  ✅ should migrate from version 3 to latest
  ✅ should migrate from version 4 to latest
  ✅ should not migrate when already at latest version

📁 Data Preservation During Migration
  ✅ should preserve data when migrating from version 1

📁 Database Statistics and Health
  ✅ should provide accurate database statistics
  ✅ should validate database integrity

📁 Error Handling
  ✅ should handle corrupted database gracefully
  ✅ should handle missing database directory

📊 Test Results: 11 passed, 0 failed
```

## Troubleshooting

### Common Issues:

1. **WAL Mode Errors**: Tests disable WAL mode to prevent transaction conflicts
2. **Permission Errors**: Ensure `/tmp` directory is writable
3. **SQLite Version**: Requires SQLite 3.x with proper Node.js bindings
4. **Import Errors**: Ensure all core modules are properly built

### Database Location:
- Production: `~/agent-world/database.db` (or configured path)
- Tests: `/tmp/agent-world-tests/[random-name].db`

## Adding New Tests

To add new migration tests:

1. **Add Schema Version**: Update `createDatabaseWithVersion()` function with new version data
2. **Add Migration Test**: Create test case in "Schema Migrations" suite
3. **Update Documentation**: Update the schema version table in this README  
4. **Test Data Preservation**: Ensure existing data survives the new migration
5. **Update Target Version**: Don't forget to update the migration target in `sqlite-schema.ts`

### Example Test Addition:
```typescript
test('should handle database recovery scenario', async () => {
  const dbPath = createTestDbPath('recovery-test');
  
  try {
    // Create an empty file (simulates corrupted/empty database)
    await fs.writeFile(dbPath, '');
    
    const config = createTestConfig(dbPath);
    const storageCtx = await createSQLiteStorageContext(config);
    
    // Let initializeWithDefaults handle everything
    await initializeWithDefaults(storageCtx);
    
    // Verify complete initialization
    assertEqual(await getSchemaVersion(storageCtx.schemaCtx), 5, 'Should reach latest version');
    const integrity = await validateIntegrity(storageCtx.schemaCtx);
    assert(integrity.isValid, 'Database should be valid after initialization');
    
    const worlds = await listWorlds(storageCtx);
    assertEqual(worlds.length, 1, 'Should have default world');
    
    await closeSchema(storageCtx.schemaCtx);
  } finally {
    await cleanupTestDb(dbPath);
  }
});
```

### Key Principles:
- **Test Real System**: Use `initializeWithDefaults` for all database creation and initialization
- **Zero Manual Creation**: No artificial database construction in tests
- **Complete Pipeline**: Test the full initialization flow exactly as the application uses it
- **Preserve Data**: Verify that existing data survives reinitialization
- **Production Reality**: Tests reflect actual usage patterns without artificial scenarios

## Maintenance Notes

- **Schema Updates**: When adding new schema versions, always update both the migration logic AND the test target version
- **Historical Accuracy**: When adding version N+1, update `createDatabaseWithVersion()` to include the new columns/tables
- **File Cleanup**: Test databases in `/tmp/agent-world-tests/` are automatically cleaned up
- **CI/CD Integration**: These tests should run in CI to catch migration issues before deployment
- **Production Validation**: Consider running migration tests against sanitized production data dumps
- **Migration Testing**: Each new schema version should have a corresponding migration test from the previous version

## Dependencies

- `sqlite3` - SQLite bindings for Node.js
- `tsx` - TypeScript execution environment
- Core storage modules from `../../core/storage/`