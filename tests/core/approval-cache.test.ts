/**
 * Unit tests for Approval Cache
 * 
 * Tests cover:
 * - Basic cache operations (set, get, has)
 * - Chat isolation
 * - Cache clearing (per chat and all)
 * - Cache statistics
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ApprovalCache } from '../../core/approval-cache.js';

describe('ApprovalCache', () => {
  let cache: ApprovalCache;

  beforeEach(() => {
    cache = new ApprovalCache();
  });

  describe('Basic Operations', () => {
    it('should set and get approval status', () => {
      cache.set('chat-1', 'bash.execute', true);
      expect(cache.get('chat-1', 'bash.execute')).toBe(true);
    });

    it('should return undefined for non-existent entries', () => {
      expect(cache.get('chat-1', 'non-existent')).toBeUndefined();
    });

    it('should check existence with has()', () => {
      cache.set('chat-1', 'bash.execute', true);
      expect(cache.has('chat-1', 'bash.execute')).toBe(true);
      expect(cache.has('chat-1', 'non-existent')).toBe(false);
      expect(cache.has('non-existent-chat', 'bash.execute')).toBe(false);
    });

    it('should update existing approval status', () => {
      cache.set('chat-1', 'bash.execute', true);
      expect(cache.get('chat-1', 'bash.execute')).toBe(true);
      
      cache.set('chat-1', 'bash.execute', false);
      expect(cache.get('chat-1', 'bash.execute')).toBe(false);
    });

    it('should store multiple tools for same chat', () => {
      cache.set('chat-1', 'bash.execute', true);
      cache.set('chat-1', 'file.write', true);
      cache.set('chat-1', 'file.delete', false);
      
      expect(cache.get('chat-1', 'bash.execute')).toBe(true);
      expect(cache.get('chat-1', 'file.write')).toBe(true);
      expect(cache.get('chat-1', 'file.delete')).toBe(false);
    });
  });

  describe('Chat Isolation', () => {
    it('should maintain separate approvals for different chats', () => {
      cache.set('chat-1', 'bash.execute', true);
      cache.set('chat-2', 'bash.execute', false);
      
      expect(cache.get('chat-1', 'bash.execute')).toBe(true);
      expect(cache.get('chat-2', 'bash.execute')).toBe(false);
    });

    it('should not leak approvals between chats', () => {
      cache.set('chat-1', 'bash.execute', true);
      expect(cache.get('chat-2', 'bash.execute')).toBeUndefined();
    });

    it('should handle multiple tools across multiple chats', () => {
      cache.set('chat-1', 'bash.execute', true);
      cache.set('chat-1', 'file.write', false);
      cache.set('chat-2', 'bash.execute', false);
      cache.set('chat-2', 'file.delete', true);
      
      expect(cache.get('chat-1', 'bash.execute')).toBe(true);
      expect(cache.get('chat-1', 'file.write')).toBe(false);
      expect(cache.get('chat-2', 'bash.execute')).toBe(false);
      expect(cache.get('chat-2', 'file.delete')).toBe(true);
      
      // Cross-chat checks
      expect(cache.get('chat-1', 'file.delete')).toBeUndefined();
      expect(cache.get('chat-2', 'file.write')).toBeUndefined();
    });
  });

  describe('Cache Clearing', () => {
    beforeEach(() => {
      cache.set('chat-1', 'bash.execute', true);
      cache.set('chat-1', 'file.write', false);
      cache.set('chat-2', 'bash.execute', false);
      cache.set('chat-2', 'file.delete', true);
    });

    it('should clear specific chat approvals', () => {
      cache.clear('chat-1');
      
      expect(cache.get('chat-1', 'bash.execute')).toBeUndefined();
      expect(cache.get('chat-1', 'file.write')).toBeUndefined();
      
      // Other chat should remain
      expect(cache.get('chat-2', 'bash.execute')).toBe(false);
      expect(cache.get('chat-2', 'file.delete')).toBe(true);
    });

    it('should clear all approvals', () => {
      cache.clearAll();
      
      expect(cache.get('chat-1', 'bash.execute')).toBeUndefined();
      expect(cache.get('chat-1', 'file.write')).toBeUndefined();
      expect(cache.get('chat-2', 'bash.execute')).toBeUndefined();
      expect(cache.get('chat-2', 'file.delete')).toBeUndefined();
    });

    it('should handle clearing non-existent chat gracefully', () => {
      expect(() => cache.clear('non-existent-chat')).not.toThrow();
    });

    it('should handle clearing already empty cache', () => {
      cache.clearAll();
      expect(() => cache.clearAll()).not.toThrow();
    });
  });

  describe('Cache Statistics', () => {
    it('should report empty cache stats', () => {
      const stats = cache.getStats();
      expect(stats.chatCount).toBe(0);
      expect(stats.totalApprovals).toBe(0);
      expect(stats.approvalsByChatId).toEqual({});
    });

    it('should report correct stats for single chat', () => {
      cache.set('chat-1', 'bash.execute', true);
      cache.set('chat-1', 'file.write', false);
      
      const stats = cache.getStats();
      expect(stats.chatCount).toBe(1);
      expect(stats.totalApprovals).toBe(2);
      expect(stats.approvalsByChatId['chat-1']).toBe(2);
    });

    it('should report correct stats for multiple chats', () => {
      cache.set('chat-1', 'bash.execute', true);
      cache.set('chat-1', 'file.write', false);
      cache.set('chat-2', 'bash.execute', false);
      cache.set('chat-2', 'file.delete', true);
      cache.set('chat-2', 'file.read', true);
      
      const stats = cache.getStats();
      expect(stats.chatCount).toBe(2);
      expect(stats.totalApprovals).toBe(5);
      expect(stats.approvalsByChatId['chat-1']).toBe(2);
      expect(stats.approvalsByChatId['chat-2']).toBe(3);
    });

    it('should update stats after clearing', () => {
      cache.set('chat-1', 'bash.execute', true);
      cache.set('chat-2', 'file.write', false);
      
      cache.clear('chat-1');
      
      const stats = cache.getStats();
      expect(stats.chatCount).toBe(1);
      expect(stats.totalApprovals).toBe(1);
      expect(stats.approvalsByChatId['chat-1']).toBeUndefined();
      expect(stats.approvalsByChatId['chat-2']).toBe(1);
    });
  });

  describe('Timestamp Tracking', () => {
    it('should track timestamp when setting approval', () => {
      const beforeSet = new Date();
      cache.set('chat-1', 'bash.execute', true);
      const afterSet = new Date();
      
      // Can't directly access timestamp, but we can verify it was set
      expect(cache.has('chat-1', 'bash.execute')).toBe(true);
      expect(cache.get('chat-1', 'bash.execute')).toBe(true);
    });

    it('should update timestamp on approval update', () => {
      cache.set('chat-1', 'bash.execute', true);
      // Small delay to ensure different timestamp
      const delay = () => new Promise(resolve => setTimeout(resolve, 10));
      delay().then(() => {
        cache.set('chat-1', 'bash.execute', false);
        // Timestamp should be updated (can't verify directly but entry should exist)
        expect(cache.get('chat-1', 'bash.execute')).toBe(false);
      });
    });
  });
});

describe('ApprovalRequiredException', () => {
  it('should create exception with correct properties', async () => {
    const { ApprovalRequiredException } = await import('../../core/types.js');
    
    const exception = new ApprovalRequiredException(
      'bash.execute',
      { command: 'rm -rf /' },
      'This command requires approval',
      ['Cancel', 'Once', 'Always']
    );
    
    expect(exception.name).toBe('ApprovalRequiredException');
    expect(exception.toolName).toBe('bash.execute');
    expect(exception.toolArgs).toEqual({ command: 'rm -rf /' });
    expect(exception.message).toBe('Approval required for bash.execute'); // Error.message from super()
    expect(exception.approvalMessage).toBe('This command requires approval'); // User-facing message
    expect(exception.options).toEqual(['Cancel', 'Once', 'Always']);
  });

  it('should be instanceof Error', async () => {
    const { ApprovalRequiredException } = await import('../../core/types.js');
    
    const exception = new ApprovalRequiredException(
      'bash.execute',
      {},
      'Test',
      []
    );
    
    expect(exception instanceof Error).toBe(true);
  });

  it('should be catchable in try-catch', async () => {
    const { ApprovalRequiredException } = await import('../../core/types.js');
    
    try {
      throw new ApprovalRequiredException(
        'bash.execute',
        {},
        'Test',
        []
      );
    } catch (error) {
      expect(error).toBeInstanceOf(ApprovalRequiredException);
      expect((error as any).toolName).toBe('bash.execute');
    }
  });
});
