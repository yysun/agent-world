/**
 * Approval Cache for Tool Execution
 *
 * Purpose: Manages approval decisions for tool executions with chat-scoped caching.
 * 
 * Features:
 * - Chat-scoped approval storage (chatId → toolName → approved)
 * - Automatic cache isolation between different chats
 * - Simple cache management (set, get, has, clear)
 * - Memory-efficient storage with timestamp tracking
 * 
 * Implementation:
 * - Uses Map for O(1) lookup performance
 * - Each chat has its own Map of tool approvals
 * - Singleton instance for global access
 * 
 * Recent Changes:
 * - Initial implementation (2025-11-03)
 */

/**
 * Cache entry structure
 */
interface ApprovalCacheEntry {
  approved: boolean;
  timestamp: Date;
}

/**
 * Approval cache class for managing tool execution approvals
 */
export class ApprovalCache {
  // chatId -> (toolName -> entry)
  private cache = new Map<string, Map<string, ApprovalCacheEntry>>();

  /**
   * Set approval status for a tool in a specific chat
   */
  set(chatId: string, toolName: string, approved: boolean): void {
    if (!this.cache.has(chatId)) {
      this.cache.set(chatId, new Map());
    }
    
    const chatCache = this.cache.get(chatId)!;
    chatCache.set(toolName, {
      approved,
      timestamp: new Date()
    });
  }

  /**
   * Get approval status for a tool in a specific chat
   * Returns undefined if not found
   */
  get(chatId: string, toolName: string): boolean | undefined {
    const chatCache = this.cache.get(chatId);
    if (!chatCache) {
      return undefined;
    }
    
    const entry = chatCache.get(toolName);
    return entry?.approved;
  }

  /**
   * Check if a tool has an approval entry in a specific chat
   */
  has(chatId: string, toolName: string): boolean {
    const chatCache = this.cache.get(chatId);
    return chatCache?.has(toolName) ?? false;
  }

  /**
   * Clear all approvals for a specific chat
   */
  clear(chatId: string): void {
    this.cache.delete(chatId);
  }

  /**
   * Clear all approvals across all chats
   */
  clearAll(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics (for debugging/monitoring)
   */
  getStats(): {
    chatCount: number;
    totalApprovals: number;
    approvalsByChatId: Record<string, number>;
  } {
    const approvalsByChatId: Record<string, number> = {};
    let totalApprovals = 0;

    for (const [chatId, chatCache] of this.cache.entries()) {
      const count = chatCache.size;
      approvalsByChatId[chatId] = count;
      totalApprovals += count;
    }

    return {
      chatCount: this.cache.size,
      totalApprovals,
      approvalsByChatId
    };
  }
}

/**
 * Singleton instance for global access
 */
export const approvalCache = new ApprovalCache();
