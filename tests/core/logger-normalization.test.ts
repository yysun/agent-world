/**
 * Tests for Logger Category Name Normalization
 * 
 * This test ensures category names are consistently normalized across
 * environment variables and function calls to fix lookup mismatches.
 */

import { describe, test, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createCategoryLogger, getCategoryLogLevel, shouldLogForCategory } from '../../core/logger.js';

// We can't directly test the internal normalizeCategoryKey function since it's not exported,
// but we can test its behavior through the public API functions

describe('Logger Category Name Normalization', () => {
  describe('createCategoryLogger normalization', () => {
    it('should normalize categories with dots to dashes', () => {
      const logger1 = createCategoryLogger('my.cat.name');
      const logger2 = createCategoryLogger('my-cat-name');
      
      // Both should return the same logger instance (same normalized key)
      expect(logger1).toBe(logger2);
    });

    it('should normalize categories with underscores to dashes', () => {
      const logger1 = createCategoryLogger('my_cat_name');
      const logger2 = createCategoryLogger('my-cat-name');
      
      // Both should return the same logger instance
      expect(logger1).toBe(logger2);
    });

    it('should normalize mixed separators consistently', () => {
      const logger1 = createCategoryLogger('My.Cat_Name Space');
      const logger2 = createCategoryLogger('my-cat-name-space');
      const logger3 = createCategoryLogger('MY__CAT...NAME   SPACE');
      
      // All should return the same logger instance
      expect(logger1).toBe(logger2);
      expect(logger2).toBe(logger3);
    });

    it('should handle case-insensitive normalization', () => {
      const logger1 = createCategoryLogger('MyCategory');
      const logger2 = createCategoryLogger('mycategory');
      const logger3 = createCategoryLogger('MYCATEGORY');
      
      // All should return the same logger instance
      expect(logger1).toBe(logger2);
      expect(logger2).toBe(logger3);
    });

    it('should trim leading and trailing dashes', () => {
      const logger1 = createCategoryLogger('-my-category-');
      const logger2 = createCategoryLogger('my-category');
      
      // Should return the same logger instance
      expect(logger1).toBe(logger2);
    });

    it('should handle empty strings', () => {
      const logger = createCategoryLogger('');
      expect(logger).toBeDefined();
      expect(logger.level).toBe('error'); // default global level
    });

    it('should preserve "default" as special case', () => {
      const logger1 = createCategoryLogger('default');
      const logger2 = createCategoryLogger('DEFAULT');
      
      // These should both normalize to 'default' and be the same instance
      expect(logger1).toBe(logger2);
    });
  });

  describe('getCategoryLogLevel normalization', () => {
    it('should normalize category names before level lookup', () => {
      // These should all resolve to the same normalized category
      expect(getCategoryLogLevel('my.cat')).toBe(getCategoryLogLevel('my_cat'));
      expect(getCategoryLogLevel('my_cat')).toBe(getCategoryLogLevel('my-cat'));
      expect(getCategoryLogLevel('MY.CAT')).toBe(getCategoryLogLevel('my-cat'));
    });
  });

  describe('shouldLogForCategory normalization', () => {
    it('should normalize category names before log level check', () => {
      // These should all behave consistently
      const result1 = shouldLogForCategory('info', 'my.cat');
      const result2 = shouldLogForCategory('info', 'my_cat');
      const result3 = shouldLogForCategory('info', 'my-cat');
      const result4 = shouldLogForCategory('info', 'MY.CAT');
      
      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
      expect(result3).toBe(result4);
    });
  });

  describe('Environment variable compatibility', () => {
    it('should demonstrate expected behavior for mixed separators', () => {
      // This test documents the expected behavior:
      // If LOG_MY.CAT=debug is set in environment, then createCategoryLogger('my_cat') 
      // should find and use that configuration due to normalization

      // We can't easily test environment variable parsing in unit tests,
      // but we can test that the normalization produces expected results
      const logger1 = createCategoryLogger('my.cat');
      const logger2 = createCategoryLogger('my_cat');
      const logger3 = createCategoryLogger('my-cat');
      
      // All variations should produce the same logger instance
      expect(logger1).toBe(logger2);
      expect(logger1).toBe(logger3);
      
      // And they should have consistent log levels
      expect(getCategoryLogLevel('my.cat')).toBe(getCategoryLogLevel('my_cat'));
      expect(getCategoryLogLevel('my.cat')).toBe(getCategoryLogLevel('my-cat'));
    });
  });

  describe('Normalization edge cases', () => {
    it('should handle special characters', () => {
      const logger1 = createCategoryLogger('my@#$%category');
      const logger2 = createCategoryLogger('my-category');
      
      // Special characters should be normalized to dashes
      expect(logger1).toBe(logger2);
    });

    it('should handle multiple consecutive separators', () => {
      const logger1 = createCategoryLogger('my...___cat');
      const logger2 = createCategoryLogger('my-cat');
      
      // Multiple separators should collapse to single dash
      expect(logger1).toBe(logger2);
    });

    it('should handle numbers in category names', () => {
      const logger1 = createCategoryLogger('my.cat.v2');
      const logger2 = createCategoryLogger('my-cat-v2');
      
      // Numbers should be preserved
      expect(logger1).toBe(logger2);
    });
  });
});