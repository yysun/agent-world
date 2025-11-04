/**
 * Unit tests for ApprovalCache
 * 
 * Test Coverage:
 * - Basic cache operations (set, get, has)
 * - Chat isolation (different chatIds)
 * - Clear operations (single chat and all)
 * - Edge cases (null/undefined inputs, empty cache)
 * - Statistics and debugging helpers
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
      cache.set('chat-1', 'tool-1', true);
      expect(cache.get('chat-1', 'tool-1')).toBe(true);
    });

    it('should store denial status', () => {
      cache.set('chat-1', 'tool-1', false);
      expect(cache.get('chat-1', 'tool-1')).toBe(false);
    });

    it('should return undefined for non-existent entries', () => {
      expect(cache.get('chat-1', 'tool-1')).toBeUndefined();
    });

    it('should check existence with has()', () => {
      cache.set('chat-1', 'tool-1', true);
      expect(cache.has('chat-1', 'tool-1')).toBe(true);
      expect(cache.has('chat-1', 'tool-2')).toBe(false);
    });

    it('should update existing entries', () => {
      cache.set('chat-1', 'tool-1', true);
      cache.set('chat-1', 'tool-1', false);
      expect(cache.get('chat-1', 'tool-1')).toBe(false);
    });
  });

  describe('Chat Isolation', () => {
    it('should isolate approvals by chatId', () => {
      cache.set('chat-1', 'tool-1', true);
      cache.set('chat-2', 'tool-1', false);

      expect(cache.get('chat-1', 'tool-1')).toBe(true);
      expect(cache.get('chat-2', 'tool-1')).toBe(false);
    });

    it('should not leak approvals across chats', () => {
      cache.set('chat-1', 'tool-1', true);
      expect(cache.get('chat-2', 'tool-1')).toBeUndefined();
    });

    it('should allow same tool name in different chats', () => {
      cache.set('chat-1', 'dangerous-tool', true);
      cache.set('chat-2', 'dangerous-tool', true);
      cache.set('chat-3', 'dangerous-tool', false);

      expect(cache.get('chat-1', 'dangerous-tool')).toBe(true);
      expect(cache.get('chat-2', 'dangerous-tool')).toBe(true);
      expect(cache.get('chat-3', 'dangerous-tool')).toBe(false);
    });
  });

  describe('Clear Operations', () => {
    beforeEach(() => {
      cache.set('chat-1', 'tool-1', true);
      cache.set('chat-1', 'tool-2', true);
      cache.set('chat-2', 'tool-1', true);
    });

    it('should clear single chat approvals', () => {
      cache.clear('chat-1');

      expect(cache.get('chat-1', 'tool-1')).toBeUndefined();
      expect(cache.get('chat-1', 'tool-2')).toBeUndefined();
      expect(cache.get('chat-2', 'tool-1')).toBe(true);
    });

    it('should clear all approvals', () => {
      cache.clearAll();

      expect(cache.get('chat-1', 'tool-1')).toBeUndefined();
      expect(cache.get('chat-2', 'tool-1')).toBeUndefined();
    });

    it('should handle clearing non-existent chat', () => {
      expect(() => cache.clear('chat-999')).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should throw on empty chatId', () => {
      expect(() => cache.set('', 'tool-1', true)).toThrow();
    });

    it('should throw on empty toolName', () => {
      expect(() => cache.set('chat-1', '', true)).toThrow();
    });

    it('should return undefined for empty chatId in get()', () => {
      expect(cache.get('', 'tool-1')).toBeUndefined();
    });

    it('should return undefined for empty toolName in get()', () => {
      expect(cache.get('chat-1', '')).toBeUndefined();
    });

    it('should return false for empty inputs in has()', () => {
      expect(cache.has('', 'tool-1')).toBe(false);
      expect(cache.has('chat-1', '')).toBe(false);
    });
  });

  describe('Timestamp Tracking', () => {
    it('should store timestamp with approval', () => {
      const before = new Date();
      cache.set('chat-1', 'tool-1', true);
      const after = new Date();

      const approvals = cache.getChatApprovals('chat-1');
      expect(approvals).toHaveLength(1);

      const [toolName, entry] = approvals[0];
      expect(toolName).toBe('tool-1');
      expect(entry.approved).toBe(true);
      expect(entry.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(entry.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should update timestamp on re-approval', async () => {
      cache.set('chat-1', 'tool-1', true);
      const firstApprovals = cache.getChatApprovals('chat-1');
      const firstTimestamp = firstApprovals[0][1].timestamp;

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      cache.set('chat-1', 'tool-1', true);
      const secondApprovals = cache.getChatApprovals('chat-1');
      const secondTimestamp = secondApprovals[0][1].timestamp;

      expect(secondTimestamp.getTime()).toBeGreaterThan(firstTimestamp.getTime());
    });
  });

  describe('Debugging Helpers', () => {
    it('should return chat approvals', () => {
      cache.set('chat-1', 'tool-1', true);
      cache.set('chat-1', 'tool-2', false);

      const approvals = cache.getChatApprovals('chat-1');
      expect(approvals).toHaveLength(2);

      const toolNames = approvals.map(([name]) => name).sort();
      expect(toolNames).toEqual(['tool-1', 'tool-2']);
    });

    it('should return empty array for non-existent chat', () => {
      const approvals = cache.getChatApprovals('chat-999');
      expect(approvals).toEqual([]);
    });

    it('should provide cache statistics', () => {
      cache.set('chat-1', 'tool-1', true);
      cache.set('chat-1', 'tool-2', true);
      cache.set('chat-2', 'tool-1', true);

      const stats = cache.getStats();
      expect(stats.totalChats).toBe(2);
      expect(stats.totalApprovals).toBe(3);
      expect(stats.chatsWithApprovals).toHaveLength(2);

      const chat1Stats = stats.chatsWithApprovals.find(c => c.chatId === 'chat-1');
      const chat2Stats = stats.chatsWithApprovals.find(c => c.chatId === 'chat-2');

      expect(chat1Stats?.approvalCount).toBe(2);
      expect(chat2Stats?.approvalCount).toBe(1);
    });

    it('should handle empty cache statistics', () => {
      const stats = cache.getStats();
      expect(stats.totalChats).toBe(0);
      expect(stats.totalApprovals).toBe(0);
      expect(stats.chatsWithApprovals).toEqual([]);
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle MCP tool name format', () => {
      const toolName = 'mcp__filesystem__write_file';
      cache.set('chat-1', toolName, true);
      expect(cache.get('chat-1', toolName)).toBe(true);
    });

    it('should support session approval workflow', () => {
      const chatId = 'session-abc123';
      const dangerousTool = 'mcp__shell__execute_command';

      // User approves for session
      cache.set(chatId, dangerousTool, true);

      // Subsequent calls should be auto-approved
      expect(cache.get(chatId, dangerousTool)).toBe(true);
      expect(cache.has(chatId, dangerousTool)).toBe(true);

      // Chat ends - clear approvals
      cache.clear(chatId);

      // New chat requires approval again
      expect(cache.get(chatId, dangerousTool)).toBeUndefined();
    });

    it('should handle multiple tools per chat', () => {
      const chatId = 'chat-multi-tool';
      const tools = [
        'mcp__filesystem__write_file',
        'mcp__shell__execute_command',
        'mcp__git__commit',
        'mcp__database__delete_records'
      ];

      // Approve all tools
      tools.forEach(tool => cache.set(chatId, tool, true));

      // All should be cached
      tools.forEach(tool => {
        expect(cache.get(chatId, tool)).toBe(true);
      });

      // Check count
      const approvals = cache.getChatApprovals(chatId);
      expect(approvals).toHaveLength(tools.length);
    });
  });
});
