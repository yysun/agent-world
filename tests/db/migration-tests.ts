#!/usr/bin/env tsx

/**
 * Database Migration Tests - Standalone Runner
 * 
 * Comprehensive tests for SQLite database management that can be run directly with tsx.
 * Tests cover fresh database creation, schema migrations, and data preservation.
 * 
 * Features:
 * - Safe cleanup utilities that check file/directory existence before removal
 * - Uses modern fs.rm instead of deprecated fs.rmdir
 * - Non-blocking test runner that doesn't prematurely terminate the process
 * - Robust error handling for cleanup operations
 * 
 * Changes:
 * - Added pathExists() helper utility for safe file/directory existence checks
 * - Added safeRemoveFile() and safeRemoveDir() for graceful cleanup
 * - Replaced deprecated fs.rmdir with fs.rm using force option
 * - Modified TestRunner.summary() to avoid premature process.exit(1)
 * - Enhanced cleanup to handle non-existent files/directories gracefully
 * 
 * Usage: npx tsx tests/db/migration-tests.ts
 */

import { promises as fs } from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
const { Database } = sqlite3;
import {
  createSQLiteSchemaContext,
  initializeSchema,
  needsMigration,
  migrate,
  getSchemaVersion,
  setSchemaVersion,
  validateIntegrity,
  getDatabaseStats,
  closeSchema,
  SQLiteConfig,
  SQLiteSchemaContext
} from '../../core/storage/sqlite-schema.js';
import {
  createSQLiteStorageContext,
  initializeWithDefaults,
  saveWorld,
  loadWorld,
  listWorlds,
  saveAgent,
  loadAgent,
  listAgents,
  SQLiteStorageContext
} from '../../core/storage/sqlite-storage.js';
import { LLMProvider } from '../../core/types.js';

// Test utilities
const TEST_DB_DIR = '/tmp/agent-world-tests';
const createTestDbPath = (name: string) => path.join(TEST_DB_DIR, `${name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.db`);

// Test configuration with WAL disabled for testing
const createTestConfig = (dbPath: string): SQLiteConfig => ({
  database: dbPath,
  enableWAL: false,  // Disable WAL for testing to avoid transaction conflicts
  busyTimeout: 1000,
  enableForeignKeys: true
});

async function ensureTestDir(): Promise<void> {
  try {
    await fs.mkdir(TEST_DB_DIR, { recursive: true });
  } catch (error) {
    // Directory might already exist
  }
}

// Helper utility for safe cleanup
async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function safeRemoveFile(filePath: string): Promise<void> {
  if (await pathExists(filePath)) {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      // Ignore errors during cleanup
    }
  }
}

async function safeRemoveDir(dirPath: string): Promise<void> {
  if (await pathExists(dirPath)) {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
    } catch (error) {
      // Ignore errors during cleanup
    }
  }
}

async function cleanupTestDb(dbPath: string): Promise<void> {
  await safeRemoveFile(dbPath);
}

// Simple assertion functions
function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message || `Expected ${expected}, got ${actual}`}`);
  }
}

function assertGreaterThan(actual: number, expected: number, message?: string): void {
  if (actual <= expected) {
    throw new Error(`Assertion failed: ${message || `Expected ${actual} to be greater than ${expected}`}`);
  }
}

async function assertRejects(promise: Promise<any>, message?: string): Promise<void> {
  try {
    await promise;
    throw new Error(`Assertion failed: ${message || 'Expected promise to reject'}`);
  } catch (error) {
    // Expected to reject - check if it's the assertion error or expected rejection
    if (error instanceof Error && error.message.startsWith('Assertion failed:')) {
      throw error; // Re-throw assertion failures
    }
    // Otherwise it's an expected rejection, which is good
  }
}

// Test runner
class TestRunner {
  private passed = 0;
  private failed = 0;
  private currentSuite = '';

  get failedCount(): number {
    return this.failed;
  }

  get passedCount(): number {
    return this.passed;
  }

  async suite(name: string, fn: () => Promise<void>): Promise<void> {
    this.currentSuite = name;
    console.log(`\n📁 ${name}`);
    try {
      await fn();
    } catch (error) {
      console.log(`  ❌ Suite failed: ${error instanceof Error ? error.message : error}`);
      this.failed++;
    }
  }

  async test(name: string, fn: () => Promise<void>): Promise<void> {
    try {
      await ensureTestDir(); // Setup before each test
      await fn();
      console.log(`  ✅ ${name}`);
      this.passed++;
    } catch (error) {
      console.log(`  ❌ ${name}`);
      console.log(`     Error: ${error instanceof Error ? error.message : error}`);
      this.failed++;
    }
  }

  summary(): void {
    console.log(`\n📊 Test Results: ${this.passed} passed, ${this.failed} failed`);
    // Don't call process.exit(1) here as it prevents proper test runner reporting
    // Let the calling code decide how to handle test failures
  }
}

// Create test runner instance
const runner = new TestRunner();

// Run all tests
async function runAllTests(): Promise<void> {
  console.log('🧪 Running Database Migration Tests\n');

  // Handle expected SQLite errors during testing
  const originalListeners = process.listeners('uncaughtException');
  process.removeAllListeners('uncaughtException');
  process.on('uncaughtException', (error) => {
    // Ignore expected SQLite errors during testing
    if (error.message?.includes('SQLITE_NOTADB') || error.message?.includes('file is not a database')) {
      return; // Ignore these expected errors
    }
    // Re-throw unexpected errors
    throw error;
  });

  // Test 1: Fresh Database Creation
  await runner.suite('Fresh Database Creation', async () => {
    await runner.test('should create new database with latest schema', async () => {
      const dbPath = createTestDbPath('fresh');
      const config = createTestConfig(dbPath);

      try {
        const schemaCtx = await createSQLiteSchemaContext(config);

        assert(await needsMigration(schemaCtx), 'Fresh database should need migration');

        await migrate(schemaCtx);

        const version = await getSchemaVersion(schemaCtx);
        assertEqual(version, 5, 'Should be at latest version 5');

        const integrity = await validateIntegrity(schemaCtx);
        assert(integrity.isValid, 'Database should be valid');

        await closeSchema(schemaCtx);
      } finally {
        await cleanupTestDb(dbPath);
      }
    });

    await runner.test('should initialize with defaults correctly', async () => {
      const dbPath = createTestDbPath('defaults');
      const config = createTestConfig(dbPath);

      try {
        const storageCtx = await createSQLiteStorageContext(config);

        await initializeWithDefaults(storageCtx);

        const worlds = await listWorlds(storageCtx);
        assertEqual(worlds.length, 1, 'Should have one default world');
        assertEqual(worlds[0].id, 'default-world', 'Should have default world ID');
        assertEqual(worlds[0].name, 'Default World', 'Should have default world name');

        await closeSchema(storageCtx.schemaCtx);
      } finally {
        await cleanupTestDb(dbPath);
      }
    });

    await runner.test('should not duplicate default world on multiple calls', async () => {
      const dbPath = createTestDbPath('no-duplicate');
      const config = createTestConfig(dbPath);

      try {
        const storageCtx = await createSQLiteStorageContext(config);

        await initializeWithDefaults(storageCtx);
        await initializeWithDefaults(storageCtx);

        const worlds = await listWorlds(storageCtx);
        assertEqual(worlds.length, 1, 'Should still have only one world');
        assertEqual(worlds[0].id, 'default-world', 'Should be default world');

        await closeSchema(storageCtx.schemaCtx);
      } finally {
        await cleanupTestDb(dbPath);
      }
    });
  });

  // Test 2: Schema Migrations
  await runner.suite('Schema Migrations', async () => {
    await runner.test('should initialize fresh database (version 0 to latest)', async () => {
      const dbPath = createTestDbPath('fresh-init');

      try {
        const config = createTestConfig(dbPath);
        const storageCtx = await createSQLiteStorageContext(config);

        // Fresh database should be at version 0
        assertEqual(await getSchemaVersion(storageCtx.schemaCtx), 0, 'Fresh database should be at version 0');
        assert(await needsMigration(storageCtx.schemaCtx), 'Fresh database should need migration');

        // This should create schema and initialize with defaults
        await initializeWithDefaults(storageCtx);

        const version = await getSchemaVersion(storageCtx.schemaCtx);
        assertEqual(version, 5, 'Should be at latest version 5');

        const integrity = await validateIntegrity(storageCtx.schemaCtx);
        assert(integrity.isValid, 'Database should be valid');

        const worlds = await listWorlds(storageCtx);
        assertEqual(worlds.length, 1, 'Should have one default world');
        assertEqual(worlds[0].id, 'default-world', 'Should have default world');

        await closeSchema(storageCtx.schemaCtx);
      } finally {
        await cleanupTestDb(dbPath);
      }
    });

    await runner.test('should handle empty database with version marker', async () => {
      const dbPath = createTestDbPath('empty-versioned');

      try {
        // Create an empty file - let initializeWithDefaults handle everything
        await fs.writeFile(dbPath, '');

        const config = createTestConfig(dbPath);
        const storageCtx = await createSQLiteStorageContext(config);

        // Should start at version 0 for empty/new database
        assertEqual(await getSchemaVersion(storageCtx.schemaCtx), 0, 'Empty database should be at version 0');
        assert(await needsMigration(storageCtx.schemaCtx), 'Should need migration');

        // Initialize should handle everything
        await initializeWithDefaults(storageCtx);

        assertEqual(await getSchemaVersion(storageCtx.schemaCtx), 5, 'Should be at version 5');
        const integrity = await validateIntegrity(storageCtx.schemaCtx);
        assert(integrity.isValid, 'Database should be valid after initialization');

        // Should also have default world
        const worlds = await listWorlds(storageCtx);
        assertEqual(worlds.length, 1, 'Should have one default world');

        await closeSchema(storageCtx.schemaCtx);
      } finally {
        await cleanupTestDb(dbPath);
      }
    });

    await runner.test('should not migrate when already at latest version', async () => {
      const dbPath = createTestDbPath('no-migrate');

      try {
        // Create a fresh database and initialize it first
        const config = createTestConfig(dbPath);
        const storageCtx = await createSQLiteStorageContext(config);
        
        // Initialize it to latest version
        await initializeWithDefaults(storageCtx);
        
        assertEqual(await getSchemaVersion(storageCtx.schemaCtx), 5, 'Should be at version 5');
        assert(!(await needsMigration(storageCtx.schemaCtx)), 'Should not need migration');

        // Running migration again should be safe
        await migrate(storageCtx.schemaCtx);

        assertEqual(await getSchemaVersion(storageCtx.schemaCtx), 5, 'Should still be at version 5');

        await closeSchema(storageCtx.schemaCtx);
      } finally {
        await cleanupTestDb(dbPath);
      }
    });
  });

  // Test 3: Data Preservation
  await runner.suite('Data Preservation During Migration', async () => {
    await runner.test('should preserve data during initialization', async () => {
      const dbPath = createTestDbPath('preserve-data');

      try {
        const config = createTestConfig(dbPath);
        const storageCtx = await createSQLiteStorageContext(config);

        // First initialize the database
        await initializeWithDefaults(storageCtx);

        // Add some test data
        const testWorld = {
          id: 'test-world',
          name: 'Test World',
          description: 'Test Description',
          turnLimit: 15,
          createdAt: new Date(),
          lastUpdated: new Date(),
          totalAgents: 0,
          totalMessages: 0,
          eventEmitter: null,
          agents: new Map(),
          chats: new Map()
        };

        await saveWorld(storageCtx, testWorld as any);

        const testAgent = {
          id: 'test-agent',
          name: 'Test Agent',
          type: 'assistant',
          provider: LLMProvider.OPENAI,
          model: 'gpt-3.5-turbo',
          systemPrompt: 'Test prompt',
          temperature: 0.7,
          maxTokens: 1000,
          memory: [{
            role: 'system' as const,
            content: 'Test message',
            sender: 'system',
            createdAt: new Date()
          }],
          createdAt: new Date(),
          lastActive: new Date(),
          llmCallCount: 0
        };

        await saveAgent(storageCtx, 'test-world', testAgent as any);

        // Now close and reopen to test data persistence
        await closeSchema(storageCtx.schemaCtx);

        // Reopen and initialize again (should preserve data)
        const newStorageCtx = await createSQLiteStorageContext(config);
        await initializeWithDefaults(newStorageCtx);

        // Verify data preservation
        const worlds = await listWorlds(newStorageCtx);
        assert(worlds.length >= 2, 'Should have at least 2 worlds (default + test)');
        
        const testWorldAfter = worlds.find(w => w.id === 'test-world');
        assert(testWorldAfter !== undefined, 'Test world should be preserved');
        if (testWorldAfter) {
          assertEqual(testWorldAfter.name, 'Test World', 'World name should be preserved');
          assertEqual(testWorldAfter.turnLimit, 15, 'Turn limit should be preserved');
        }

        const agents = await listAgents(newStorageCtx, 'test-world');
        assertEqual(agents.length, 1, 'Should have one agent');
        assertEqual(agents[0].id, 'test-agent', 'Agent ID should be preserved');
        assertEqual(agents[0].name, 'Test Agent', 'Agent name should be preserved');

        assertEqual(await getSchemaVersion(newStorageCtx.schemaCtx), 5, 'Should be at latest version');

        await closeSchema(newStorageCtx.schemaCtx);
      } finally {
        await cleanupTestDb(dbPath);
      }
    });
  });

  // Test 4: Database Statistics and Health
  await runner.suite('Database Statistics and Health', async () => {
    await runner.test('should provide accurate database statistics', async () => {
      const dbPath = createTestDbPath('stats');

      try {
        const config = createTestConfig(dbPath);
        const storageCtx = await createSQLiteStorageContext(config);

        await initializeWithDefaults(storageCtx);

        // Add test data
        const testWorld = {
          id: 'test-world',
          name: 'Test World',
          description: 'Test',
          turnLimit: 10,
          createdAt: new Date(),
          lastUpdated: new Date(),
          totalAgents: 0,
          totalMessages: 0,
          eventEmitter: null,
          agents: new Map(),
          chats: new Map()
        };

        await saveWorld(storageCtx, testWorld as any);

        const testAgent = {
          id: 'test-agent',
          name: 'Test Agent',
          type: 'assistant',
          provider: LLMProvider.OPENAI,
          model: 'gpt-3.5-turbo',
          systemPrompt: 'Test',
          temperature: 0.7,
          maxTokens: 1000,
          memory: [{
            role: 'system' as const,
            content: 'Test message',
            sender: 'system',
            createdAt: new Date()
          }],
          createdAt: new Date(),
          lastActive: new Date(),
          llmCallCount: 0
        };

        await saveAgent(storageCtx, 'test-world', testAgent as any);

        const stats = await getDatabaseStats(storageCtx.schemaCtx);

        assertEqual(stats.worldCount, 2, 'Should have 2 worlds (default + test)');
        assertEqual(stats.agentCount, 1, 'Should have 1 agent');
        assertEqual(stats.activeMemoryCount, 1, 'Should have 1 memory entry');
        assertGreaterThan(stats.databaseSize, 0, 'Database size should be > 0');

        await closeSchema(storageCtx.schemaCtx);
      } finally {
        await cleanupTestDb(dbPath);
      }
    });

    await runner.test('should validate database integrity', async () => {
      const dbPath = createTestDbPath('integrity');

      try {
        const config = createTestConfig(dbPath);
        const storageCtx = await createSQLiteStorageContext(config);

        await initializeWithDefaults(storageCtx);

        const integrity = await validateIntegrity(storageCtx.schemaCtx);
        assert(integrity.isValid, 'Database should be valid');
        assertEqual(integrity.errors.length, 0, 'Should have no errors');

        await closeSchema(storageCtx.schemaCtx);
      } finally {
        await cleanupTestDb(dbPath);
      }
    });
  });

  // Test 5: Error Handling
  await runner.suite('Error Handling', async () => {
    await runner.test('should handle corrupted database gracefully', async () => {
      const dbPath = createTestDbPath('corrupted');

      try {
        await fs.writeFile(dbPath, 'This is not a valid SQLite database');

        const config = createTestConfig(dbPath);

        // Try to create context and perform operations that would trigger the error
        let errorCaught = false;
        try {
          const ctx = await createSQLiteStorageContext(config);
          // Try to perform an operation that would trigger the corrupted database error
          await listWorlds(ctx);
        } catch (error) {
          errorCaught = true;
          assert(
            error instanceof Error && (
              error.message.includes('SQLITE_NOTADB') ||
              error.message.includes('file is not a database') ||
              error.message.includes('SQLITE_CORRUPT')
            ),
            'Should throw SQLite database error'
          );
        }

        assert(errorCaught, 'Should have caught a database error');
      } finally {
        await cleanupTestDb(dbPath);
      }
    });

    await runner.test('should handle missing database directory', async () => {
      const dbPath = '/tmp/nonexistent/directory/test.db';
      const config = createTestConfig(dbPath);

      try {
        const schemaCtx = await createSQLiteSchemaContext(config);
        await migrate(schemaCtx);

        assertEqual(await getSchemaVersion(schemaCtx), 5, 'Should create and migrate successfully');

        await closeSchema(schemaCtx);

        // Safe cleanup of test directories
        await safeRemoveFile(dbPath);
        await safeRemoveDir('/tmp/nonexistent/directory');
        await safeRemoveDir('/tmp/nonexistent');
      } finally {
        // Additional cleanup if needed
        await safeRemoveFile(dbPath);
      }
    });
  });

  runner.summary();

  // Return appropriate exit code based on test results instead of calling process.exit
  const hasFailures = runner.failedCount > 0;

  // Restore original error handlers
  process.removeAllListeners('uncaughtException');
  originalListeners.forEach(listener => process.on('uncaughtException', listener));

  // If running standalone, exit with appropriate code
  if (hasFailures && import.meta.url === `file://${process.argv[1]}`) {
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
}