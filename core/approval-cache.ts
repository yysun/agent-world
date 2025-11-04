/**
 * Tool Approval Cache Module
 * 
 * Features:
 * - Session-scoped approval caching for tool execution
 * - Isolated cache per chatId to prevent cross-chat approval leakage
 * - Timestamp tracking for audit and expiration capabilities
 * - Singleton pattern for global cache access
 * 
 * Implementation:
 * - Two-level Map structure: chatId -> (toolName -> entry)
 * - Thread-safe operations (no async needed for in-memory cache)
 * - Automatic cleanup on chat deletion (external trigger)
 * 
 * Changes:
 * - 2025-11-03: Initial implementation for tool approval system
 */

export interface ApprovalCacheEntry {
  approved: boolean;
  timestamp: Date;
}

/**
 * Approval cache for storing session-scoped tool approvals.
 * 
 * Architecture:
 * - chatId isolation: Each chat has its own approval cache
 * - Session lifecycle: Cleared when chat ends or deleted
 * - No persistence: In-memory only (cleared on server restart)
 * 
 * Usage:
 * ```typescript
 * // Grant session approval
 * approvalCache.set('chat-123', 'mcp__filesystem__write_file', true);
 * 
 * // Check approval
 * if (approvalCache.get('chat-123', 'mcp__filesystem__write_file')) {
 *   await executeTool();
 * }
 * 
 * // Clear on chat end
 * approvalCache.clear('chat-123');
 * ```
 */
export class ApprovalCache {
  // chatId -> (toolName -> entry)
  private cache = new Map<string, Map<string, ApprovalCacheEntry>>();

  /**
   * Set approval status for a tool in a specific chat session
   * 
   * @param chatId - Chat session identifier
   * @param toolName - Full tool name (e.g., 'mcp__server__toolName')
   * @param approved - Whether tool is approved
   */
  set(chatId: string, toolName: string, approved: boolean): void {
    if (!chatId || !toolName) {
      throw new Error('chatId and toolName are required');
    }

    let chatCache = this.cache.get(chatId);
    if (!chatCache) {
      chatCache = new Map();
      this.cache.set(chatId, chatCache);
    }

    chatCache.set(toolName, {
      approved,
      timestamp: new Date()
    });
  }

  /**
   * Get approval status for a tool in a specific chat session
   * 
   * @param chatId - Chat session identifier
   * @param toolName - Full tool name
   * @returns true if approved, false if denied, undefined if not cached
   */
  get(chatId: string, toolName: string): boolean | undefined {
    if (!chatId || !toolName) {
      return undefined;
    }

    const chatCache = this.cache.get(chatId);
    if (!chatCache) {
      return undefined;
    }

    const entry = chatCache.get(toolName);
    return entry?.approved;
  }

  /**
   * Check if approval exists for a tool in a specific chat session
   * 
   * @param chatId - Chat session identifier
   * @param toolName - Full tool name
   * @returns true if approval decision exists (approved or denied)
   */
  has(chatId: string, toolName: string): boolean {
    if (!chatId || !toolName) {
      return false;
    }

    const chatCache = this.cache.get(chatId);
    return chatCache?.has(toolName) ?? false;
  }

  /**
   * Clear all approvals for a specific chat session
   * Called when chat ends or is deleted
   * 
   * @param chatId - Chat session identifier
   */
  clear(chatId: string): void {
    if (!chatId) {
      return;
    }

    this.cache.delete(chatId);
  }

  /**
   * Clear all approvals across all chats
   * Primarily for testing and server restart scenarios
   */
  clearAll(): void {
    this.cache.clear();
  }

  /**
   * Get all cached tools for a specific chat (for debugging/UI)
   * 
   * @param chatId - Chat session identifier
   * @returns Array of [toolName, entry] pairs
   */
  getChatApprovals(chatId: string): Array<[string, ApprovalCacheEntry]> {
    if (!chatId) {
      return [];
    }

    const chatCache = this.cache.get(chatId);
    if (!chatCache) {
      return [];
    }

    return Array.from(chatCache.entries());
  }

  /**
   * Get statistics about cache usage (for monitoring)
   */
  getStats(): {
    totalChats: number;
    totalApprovals: number;
    chatsWithApprovals: Array<{ chatId: string; approvalCount: number }>;
  } {
    const chatsWithApprovals = Array.from(this.cache.entries()).map(([chatId, chatCache]) => ({
      chatId,
      approvalCount: chatCache.size
    }));

    const totalApprovals = chatsWithApprovals.reduce((sum, chat) => sum + chat.approvalCount, 0);

    return {
      totalChats: this.cache.size,
      totalApprovals,
      chatsWithApprovals
    };
  }
}

/**
 * Global singleton approval cache instance
 */
export const approvalCache = new ApprovalCache();
