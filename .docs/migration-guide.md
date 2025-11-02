# Database Migration Guide

## Overview

Agent World uses a SQL file-based migration system for database schema management. This guide explains how migrations work and how to create new ones.

## Architecture

### SQL File-Based System
- **SQL Files**: All migrations stored in `migrations/` directory
- **Version Tracking**: `schema_migrations` table tracks complete migration history
- **Automatic**: Migrations run automatically on server start
- **Safe**: Concurrent migration protection with locks
- **Incremental**: Migrations 0000-0007 build schema incrementally

## Migration Files

### Naming Convention
```
{version}_{description}.sql

Examples:
0000_init_base_schema.sql         ← Base schema (all tables)
0001_add_chat_id.sql              ← Add chat_id to agent_memory
0002_add_llm_config.sql           ← Add LLM configuration
0003_add_current_chat_id.sql      ← Add current chat tracking
0004_add_mcp_config.sql           ← Add MCP configuration
0005_add_message_id.sql           ← Add message identification
0006_add_reply_to_message_id.sql  ← Add message threading
0007_create_world_chats.sql       ← Create chats table
0008_create_events_table.sql      ← Add events system
0009_add_event_sequences.sql      ← Add event sequences
0010_add_new_feature.sql          ← Future migrations
```

### Migration Strategy

All migrations are proper SQL files that build incrementally:

1. **Fresh Database (no tables)**
   - Applies all migrations (0 → N) in order
   - Each migration adds specific features

2. **Existing Database**
   - Applies only pending migrations (current+1 → N)
   - Safe incremental updates

### File Structure
```sql
-- Migration: Brief description
-- Version: 8
-- Date: 2025-11-02
--
-- Detailed explanation of what this migration does
-- and why it's needed

-- Create tables
CREATE TABLE IF NOT EXISTS example (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_example_name ON example(name);

-- Migrate existing data (if needed)
UPDATE existing_table SET new_column = 'default' WHERE new_column IS NULL;
```

## Creating a New Migration

### 1. Create SQL File
```bash
touch migrations/0009_add_user_preferences.sql
```

### 2. Write Migration SQL
```sql
-- Migration: Add user preferences table
-- Version: 9
-- Date: 2025-11-03

CREATE TABLE IF NOT EXISTS user_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  preferences TEXT NOT NULL,  -- JSON
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id 
  ON user_preferences(user_id);
```

### 3. Test Migration
```bash
# Run tests to verify migration
npm test -- migration-runner.test.ts

# Or manually test
npm run server  # Migration runs automatically
```

### 4. Commit
```bash
git add migrations/0009_add_user_preferences.sql
git commit -m "feat: Add user preferences table"
```

## Best Practices

### ✅ DO:
- **Use IF NOT EXISTS** - Makes migrations idempotent
- **Add Comments** - Explain what and why
- **Include Indexes** - Create necessary indexes
- **Test Thoroughly** - Test on fresh and existing databases
- **Migrate Data** - Include data migration if needed
- **Sequential Versions** - Use next available version number
- **Atomic Operations** - Each migration should be self-contained

### ❌ DON'T:
- **Modify Existing Migrations** - Never change applied migrations
- **Skip Version Numbers** - Keep sequence continuous (gaps are okay but not recommended)
- **Add Application Logic** - Keep SQL pure
- **Forget Foreign Keys** - Maintain referential integrity
- **Ignore Performance** - Consider query performance
- **Break Compatibility** - Ensure backward compatibility when possible

## Migration Workflow

### For Developers

```typescript
// migrations/ directory structure
migrations/
├── 0001_create_events_table.sql
├── 0002_add_event_sequences.sql
├── 0008_init_base_schema.sql
└── 0009_add_new_feature.sql  ← Your new migration
```

### Automatic Execution

Migrations run automatically when:
1. Server starts
2. Fresh database → Applies all migrations (0000-N) in order
3. Existing database → Applies only pending migrations (current+1 to N)

### Manual Control (Advanced)

```typescript
import { 
  runMigrations, 
  getMigrationStatus, 
  needsMigration 
} from '@agent-world/core';

// Check if migration needed
const db = // ... your database
if (await needsMigration(db, './migrations')) {
  console.log('Migrations pending');
  
  // Get detailed status
  const status = await getMigrationStatus({
    db,
    migrationsDir: './migrations'
  });
  
  console.log(`Current version: ${status.currentVersion}`);
  console.log(`Pending migrations:`, status.pendingMigrations);
  
  // Run migrations
  await runMigrations({ db, migrationsDir: './migrations' });
}
```

## Migration States

### Fresh Database
```
1. Server starts
2. No tables exist
3. Applies all migrations in order (0 → 1 → 2 → ... → N)
4. Database ready
```

### Existing Database
```
1. Server starts
2. Checks current version
3. Applies pending migrations (current+1 → N)
4. Database ready
```

## Migration Tracking

### schema_migrations Table
```sql
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Example data:
```
version | name                        | applied_at
--------|-----------------------------|-----------
1       | create_events_table         | 2025-11-01 10:00:00
2       | add_event_sequences         | 2025-11-01 10:00:01
8       | init_base_schema            | 2025-11-02 09:30:00
9       | add_user_preferences        | 2025-11-03 14:15:00
```

### Version Tracking
- **PRAGMA user_version**: Current schema version (integer)
- **schema_migrations**: Detailed migration history (table)

Both are kept in sync for compatibility.

## Rollback (Future)

Currently, migrations are one-way. Rollback support planned for future:

```sql
-- migrations/0009_add_feature_up.sql
CREATE TABLE new_feature (...);

-- migrations/0009_add_feature_down.sql
DROP TABLE new_feature;
```

## Troubleshooting

### Migration Failed

```bash
# Check logs
LOG_STORAGE_MIGRATION=info npm run server

# Manually inspect database
sqlite3 data/default-world/database.db
sqlite> SELECT * FROM schema_migrations;
sqlite> PRAGMA user_version;
```

### Duplicate Migration

If you accidentally create duplicate version:
```bash
# Rename with next available version
mv migrations/0009_feature.sql migrations/0010_feature.sql

# Update version number in file
sed -i '' 's/Version: 9/Version: 10/' migrations/0010_feature.sql
```

### Schema Drift

If database schema doesn't match migrations:
1. Export data
2. Delete database
3. Restart server (rebuilds from migrations)
4. Import data

## Testing Migrations

### Unit Tests
```typescript
import { describe, it, expect } from 'vitest';
import { executeMigration } from '../core/storage/migration-runner.js';

describe('Migration 0009', () => {
  it('should create user_preferences table', async () => {
    const db = await createTestDB();
    
    await executeMigration(db, {
      version: 9,
      name: 'add_user_preferences',
      filePath: './migrations/0009_add_user_preferences.sql'
    });
    
    // Verify table exists
    const tables = await db.all(
      "SELECT name FROM sqlite_master WHERE type='table'"
    );
    expect(tables.map(t => t.name)).toContain('user_preferences');
  });
});
```

### Integration Tests
```bash
# Test full migration chain
npm run test:integration

# Test with real database
npm run server  # Check for errors
```

## Performance Considerations

### Large Migrations
```sql
-- For large data migrations, use batches
BEGIN TRANSACTION;

UPDATE large_table 
SET new_column = compute_value(old_column)
WHERE id IN (
  SELECT id FROM large_table 
  WHERE new_column IS NULL 
  LIMIT 1000
);

COMMIT;

-- Run multiple times until all rows migrated
```

### Indexes
```sql
-- Add indexes AFTER data migration
-- Faster to insert data first, then create index

-- 1. Migrate data
UPDATE table SET new_column = value;

-- 2. Create index
CREATE INDEX idx_table_new_column ON table(new_column);
```

### Analyze
```sql
-- Update query planner statistics after large changes
ANALYZE;
```

## Examples

### Add Column
```sql
-- Migration: Add email to users
-- Version: 10

ALTER TABLE users ADD COLUMN email TEXT;
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
```

### Add Table
```sql
-- Migration: Add notifications system
-- Version: 11

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
```

### Migrate Data
```sql
-- Migration: Split name into first/last
-- Version: 12

-- Add new columns
ALTER TABLE users ADD COLUMN first_name TEXT;
ALTER TABLE users ADD COLUMN last_name TEXT;

-- Migrate existing data
UPDATE users 
SET 
  first_name = substr(name, 1, instr(name || ' ', ' ') - 1),
  last_name = substr(name, instr(name || ' ', ' ') + 1)
WHERE name IS NOT NULL AND name != '';

-- Optional: Remove old column (be careful!)
-- ALTER TABLE users DROP COLUMN name;
```

## Summary

- **SQL Files**: One migration per file in `migrations/`
- **Automatic**: Runs on server start
- **Safe**: Concurrent protection, idempotent operations
- **Tracked**: Full history in `schema_migrations` table
- **Tested**: Comprehensive test coverage required
- **Documented**: Comments explain what and why

The SQL file-based system is simpler, safer, and more maintainable than code-based migrations! 🚀
