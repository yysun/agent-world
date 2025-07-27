# SQLite Database Support for Agent World

This document describes the SQLite database support added to the agent-world system, providing an alternative to file-based storage with enhanced features for memory archiving and analytics.

## Overview

The SQLite storage backend provides:
- **Enhanced archive management** with rich metadata and search capabilities
- **Better performance** for large datasets and frequent queries
- **Data integrity** with foreign key constraints and ACID transactions
- **Advanced querying** for conversation history and analytics
- **Backward compatibility** with existing file-based storage

## Configuration

### Environment Variables

Set the storage type using environment variables:

```bash
# Use SQLite storage
export AGENT_WORLD_STORAGE_TYPE=sqlite
export AGENT_WORLD_SQLITE_DATABASE=/path/to/database.db

# Use file storage (default)
export AGENT_WORLD_STORAGE_TYPE=file
```

### Configuration File

Create a `storage-config.json` file in your data directory:

```json
{
  "type": "sqlite",
  "sqlite": {
    "database": "/path/to/agent-world.db",
    "enableWAL": true,
    "busyTimeout": 30000,
    "cacheSize": -64000,
    "enableForeignKeys": true
  }
}
```

### Programmatic Configuration

```typescript
import { setStorageConfiguration } from './core/managers.js';

await setStorageConfiguration({
  type: 'sqlite',
  rootPath: '/path/to/data',
  sqlite: {
    database: '/path/to/agent-world.db'
  }
});
```

## Features

### Enhanced Archive Management

SQLite storage provides rich metadata for archived conversations:

```typescript
// Archive with metadata
const archiveId = await sqliteStorage.archiveAgentMemory(
  worldId, 
  agentId, 
  messages,
  {
    sessionName: "Strategy Discussion",
    archiveReason: "Session completed",
    tags: ["strategy", "planning"],
    summary: "Discussion about Q4 planning strategies"
  }
);
```

### Search and Analytics

```typescript
// Search archives
const results = await sqliteStorage.searchArchives({
  worldId: "my-world",
  searchContent: "strategy",
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-12-31'),
  limit: 20
});

// Get statistics
const stats = await sqliteStorage.getArchiveStatistics("my-world");
console.log(`Total archives: ${stats.totalArchives}`);
console.log(`Average session length: ${stats.averageSessionLength}`);
```

### Export Capabilities

```typescript
// Export archive in different formats
const jsonExport = await sqliteStorage.exportArchive(archiveId, {
  format: 'json',
  includeMetadata: true,
  includeMessages: true
});

const csvExport = await sqliteStorage.exportArchive(archiveId, {
  format: 'csv',
  includeMessages: true
});
```

## Migration

### From File Storage to SQLite

```typescript
import { migrateFileToSQLite } from './core/migration-tools.js';

const result = await migrateFileToSQLite(
  '/path/to/current/data',  // Source path
  '/path/to/database.db',   // Target database
  {
    createBackup: true,
    validateIntegrity: true,
    archiveMetadata: {
      defaultReason: 'Migrated from file storage',
      addMigrationTags: true
    }
  }
);

console.log(`Migrated ${result.migratedWorlds} worlds and ${result.migratedAgents} agents`);
```

### Migration Status Check

```typescript
import { checkMigrationStatus } from './core/migration-tools.js';

const status = await checkMigrationStatus(
  { type: 'file', rootPath: '/old/data' },
  { type: 'sqlite', rootPath: '/new/data', sqlite: { database: '/new/db.sqlite' } }
);

console.log(status.recommendation);
```

## Database Schema

The SQLite implementation uses the following tables:

- **worlds**: Core world configuration and metadata
- **agents**: Agent configuration with LLM settings
- **agent_memory**: Current active conversation memory
- **memory_archives**: Archive session metadata with rich information
- **archived_messages**: Historical conversation content
- **archive_statistics**: Usage analytics and trends

## Performance Considerations

### Recommended Settings

For optimal performance:

```json
{
  "sqlite": {
    "enableWAL": true,        // Better concurrency
    "busyTimeout": 30000,     // Handle lock contention
    "cacheSize": -64000,      // 64MB cache
    "enableForeignKeys": true // Data integrity
  }
}
```

### When to Use SQLite

Choose SQLite storage when you have:
- More than 10 agents
- More than 100 archived conversations
- Need for content search across conversations
- Requirements for analytics and reporting
- Performance-critical applications

### When to Use File Storage

Stick with file storage for:
- Small deployments (< 5 agents)
- Simple use cases without search requirements
- Browser environments (SQLite not supported)
- Scenarios where simplicity is preferred

## API Usage

### Storage Information

```typescript
import { getStorageInfo } from './core/managers.js';

const info = await getStorageInfo();
console.log(`Storage type: ${info.type}`);
console.log(`Features: ${info.supportedFeatures.join(', ')}`);
```

### Storage Management

```typescript
// Check current storage type
const info = await getStorageInfo();

if (info.type === 'sqlite') {
  // SQLite-specific operations
  const sqliteStorage = /* get storage instance */;
  const stats = await sqliteStorage.getDatabaseStats();
  console.log(`Database size: ${stats.databaseSize} bytes`);
}
```

## Error Handling

The SQLite storage implementation includes robust error handling:

```typescript
try {
  await sqliteStorage.saveAgent(worldId, agent);
} catch (error) {
  if (error.message.includes('SQLITE_BUSY')) {
    // Handle database busy error
    console.log('Database busy, retrying...');
  } else {
    console.error('Storage error:', error);
  }
}
```

## Backup and Recovery

### Regular Backups

```bash
# Backup SQLite database
cp /path/to/agent-world.db /path/to/backup/agent-world-$(date +%Y%m%d).db

# Or use SQLite's backup command
sqlite3 /path/to/agent-world.db ".backup /path/to/backup.db"
```

### Integrity Checks

```typescript
const isValid = await sqliteStorage.validateIntegrity(worldId);
if (!isValid) {
  console.warn('Database integrity issues detected');
}
```

## Troubleshooting

### Common Issues

1. **SQLite module not found**
   ```bash
   npm install sqlite3
   ```

2. **Database locked errors**
   - Increase `busyTimeout` in configuration
   - Ensure proper connection cleanup

3. **Performance issues**
   - Enable WAL mode
   - Increase cache size
   - Consider database optimization

### Debug Mode

Enable debug logging:

```bash
export AGENT_WORLD_LOG_LEVEL=debug
```

## Limitations

- SQLite storage is only available in Node.js environments
- Large binary data (if any) may impact performance
- Concurrent write operations are limited by SQLite's locking model
- Browser environments automatically fall back to file storage

## Future Enhancements

Planned improvements include:
- Real-time archive search with full-text indexing
- Advanced analytics and reporting dashboards
- Automatic archive cleanup policies
- Integration with external databases (PostgreSQL, MySQL)
- Distributed storage support for clustering