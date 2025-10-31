/**
 * Tests for Hierarchical Logger Instances
 * 
 * Ensures child loggers properly inherit configuration from parent loggers
 * while maintaining independent log levels when explicitly set.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { createCategoryLogger, getCategoryLogLevel, initializeLogger } from '../../core/logger.js';

describe('Logger Hierarchical Category Resolution', () => {
  // Save original env vars
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
    // Reset logger to default state
    initializeLogger({ globalLevel: 'error', categoryLevels: {} });
  });

  describe('getEffectiveLevelForCategory hierarchical resolution', () => {
    it('should use most-specific category level when available', () => {
      // Set up hierarchy: LOG_CORE=info, LOG_CORE_DB=debug
      initializeLogger({
        globalLevel: 'error',
        categoryLevels: {
          'core': 'info',
          'core.db': 'debug'
        }
      });

      // Most specific should win
      expect(getCategoryLogLevel('core.db')).toBe('debug');
      expect(getCategoryLogLevel('core.db.connection')).toBe('debug'); // Inherits from parent
      expect(getCategoryLogLevel('core')).toBe('info');
      expect(getCategoryLogLevel('core.other')).toBe('info'); // Inherits from core
      expect(getCategoryLogLevel('api')).toBe('error'); // Falls back to global
    });

    it('should walk up the hierarchy to find parent level', () => {
      initializeLogger({
        globalLevel: 'error',
        categoryLevels: {
          'api': 'warn',
          'api.handler': 'info'
        }
      });

      // api.handler.users should inherit from api.handler
      expect(getCategoryLogLevel('api.handler.users')).toBe('info');
      expect(getCategoryLogLevel('api.handler.users.create')).toBe('info');

      // api.other should inherit from api
      expect(getCategoryLogLevel('api.other')).toBe('warn');

      // Unrelated category falls back to global
      expect(getCategoryLogLevel('storage')).toBe('error');
    });

    it('should fall back to global level when no parent matches', () => {
      initializeLogger({
        globalLevel: 'warn',
        categoryLevels: {
          'core': 'debug'
        }
      });

      expect(getCategoryLogLevel('api')).toBe('warn');
      expect(getCategoryLogLevel('llm')).toBe('warn');
      expect(getCategoryLogLevel('storage.db')).toBe('warn');
    });

    it('should handle deep hierarchy correctly', () => {
      initializeLogger({
        globalLevel: 'error',
        categoryLevels: {
          'a': 'trace',
          'a.b': 'debug',
          'a.b.c': 'info',
          'a.b.c.d': 'warn'
        }
      });

      expect(getCategoryLogLevel('a.b.c.d.e.f')).toBe('warn'); // Inherits from a.b.c.d
      expect(getCategoryLogLevel('a.b.c.d')).toBe('warn');
      expect(getCategoryLogLevel('a.b.c.x')).toBe('info'); // Inherits from a.b.c
      expect(getCategoryLogLevel('a.b.x')).toBe('debug'); // Inherits from a.b
      expect(getCategoryLogLevel('a.x')).toBe('trace'); // Inherits from a
      expect(getCategoryLogLevel('x')).toBe('error'); // Falls back to global
    });
  });

  describe('Normalization with hierarchical categories', () => {
    it('should preserve dots for hierarchy', () => {
      const logger1 = createCategoryLogger('core.db');
      const logger2 = createCategoryLogger('core.db');

      // Same normalized category should return same instance
      expect(logger1).toBe(logger2);
    });

    it('should convert other separators to dots', () => {
      const logger1 = createCategoryLogger('core-db');
      const logger2 = createCategoryLogger('core_db');
      const logger3 = createCategoryLogger('core.db');

      // All should normalize to 'core.db' and return same instance
      expect(logger1).toBe(logger2);
      expect(logger2).toBe(logger3);
    });

    it('should handle mixed separators in hierarchy', () => {
      const logger1 = createCategoryLogger('api-handler_users');
      const logger2 = createCategoryLogger('api.handler.users');

      // Should normalize to same hierarchical category
      expect(logger1).toBe(logger2);
      expect(getCategoryLogLevel('api-handler_users')).toBe(getCategoryLogLevel('api.handler.users'));
    });
  });

  describe('createCategoryLogger with hierarchical inheritance', () => {
    it('should create logger with inherited log level', () => {
      initializeLogger({
        globalLevel: 'error',
        categoryLevels: {
          'api': 'info'
        }
      });

      const apiLogger = createCategoryLogger('api');
      const apiHandlerLogger = createCategoryLogger('api.handler');
      const apiHandlerUsersLogger = createCategoryLogger('api.handler.users');

      expect(apiLogger.level).toBe('info');
      expect(apiHandlerLogger.level).toBe('info'); // Inherits from parent
      expect(apiHandlerUsersLogger.level).toBe('info'); // Inherits from parent
    });

    it('should override parent level with more specific level', () => {
      initializeLogger({
        globalLevel: 'error',
        categoryLevels: {
          'api': 'info',
          'api.handler': 'debug'
        }
      });

      const apiLogger = createCategoryLogger('api');
      const apiHandlerLogger = createCategoryLogger('api.handler');
      const apiHandlerUsersLogger = createCategoryLogger('api.handler.users');

      expect(apiLogger.level).toBe('info');
      expect(apiHandlerLogger.level).toBe('debug');
      expect(apiHandlerUsersLogger.level).toBe('debug'); // Inherits from api.handler
    });
  });

  describe('child() method', () => {
    it('should create child logger with additional bindings', () => {
      const parentLogger = createCategoryLogger('api');
      const childLogger = parentLogger.child({ requestId: '123' });

      // Child should have the same level as parent
      expect(childLogger.level).toBe(parentLogger.level);

      // Child should be a different instance
      expect(childLogger).not.toBe(parentLogger);
    });

    it('should allow nested child creation', () => {
      const logger = createCategoryLogger('api');
      const child1 = logger.child({ requestId: '123' });
      const child2 = child1.child({ userId: 'user1' });

      // All should have the same level
      expect(logger.level).toBe(child1.level);
      expect(child1.level).toBe(child2.level);
    });
  });

  describe('Environment variable resolution with hierarchy', () => {
    it('should support hierarchical env vars with underscores', () => {
      // Simulate environment variables: LOG_CORE_DB=debug, LOG_CORE=info
      initializeLogger({
        globalLevel: 'error',
        categoryLevels: {
          'core': 'info',
          'core.db': 'debug'
        }
      });

      // Should resolve hierarchically
      expect(getCategoryLogLevel('core')).toBe('info');
      expect(getCategoryLogLevel('core.db')).toBe('debug');
      expect(getCategoryLogLevel('core.db.connection')).toBe('debug');
      expect(getCategoryLogLevel('core.other')).toBe('info');
    });
  });

  describe('Pre-made category loggers', () => {
    it('should have access to common pre-made loggers', async () => {
      // Dynamic import to get fresh loggers object
      const { loggers } = await import('../../core/logger.js');

      // Storage loggers
      expect(loggers.storage).toBeDefined();
      expect(loggers['storage.migration']).toBeDefined();
      expect(loggers['storage.query']).toBeDefined();

      // MCP loggers
      expect(loggers.mcp).toBeDefined();
      expect(loggers['mcp.lifecycle']).toBeDefined();

      // LLM loggers
      expect(loggers.llm).toBeDefined();
      expect(loggers['llm.openai']).toBeDefined();

      // Infrastructure loggers
      expect(loggers.api).toBeDefined();
      expect(loggers.events).toBeDefined();
      expect(loggers.ws).toBeDefined();
      expect(loggers.server).toBeDefined();
      expect(loggers.cli).toBeDefined();
    });

    it('should cache logger instances correctly', async () => {
      const { createCategoryLogger } = await import('../../core/logger.js');

      // Creating the same logger twice should return the same instance
      const logger1 = createCategoryLogger('test.category');
      const logger2 = createCategoryLogger('test.category');
      expect(logger1).toBe(logger2);

      // Creating with bindings should return a new instance
      const logger3 = createCategoryLogger('test.category', { foo: 'bar' });
      expect(logger3).not.toBe(logger1);
    });
  });
});
