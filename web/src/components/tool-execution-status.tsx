/**
 * Tool Execution Status Component - Visual feedback for active tool execution
 * 
 * Features:
 * - Display list of currently running tools
 * - Map tool names to appropriate icons (file, terminal, search, web, etc.)
 * - Format tool names from snake_case to Title Case
 * - Show spinner animation for running tools
 * - Display progress text when available
 * 
 * Phase 4: Tool Execution Status
 * Created: 2026-02-11
 */

import { app } from 'apprun';
import type { ToolEntry } from '../types';

// ========================================
// HELPER: Map tool name to icon
// ========================================

/**
 * Get icon for tool based on name patterns
 */
function getToolIcon(toolName: string): string {
  const name = toolName.toLowerCase();

  // File operations
  if (name.includes('file') || name.includes('read') || name.includes('write') || name.includes('edit')) {
    return '📄';
  }

  // Terminal/shell commands
  if (name.includes('terminal') || name.includes('shell') || name.includes('cmd') || name.includes('run')) {
    return '💻';
  }

  // Search operations
  if (name.includes('search') || name.includes('grep') || name.includes('find')) {
    return '🔍';
  }

  // Web/network operations
  if (name.includes('web') || name.includes('fetch') || name.includes('http') || name.includes('url')) {
    return '🌐';
  }

  // Code operations
  if (name.includes('code') || name.includes('lint') || name.includes('format') || name.includes('compile')) {
    return '⚙️';
  }

  // Database operations
  if (name.includes('db') || name.includes('database') || name.includes('sql') || name.includes('query')) {
    return '🗄️';
  }

  // List/directory operations
  if (name.includes('list') || name.includes('dir') || name.includes('ls')) {
    return '📋';
  }

  // Default tool icon
  return '🔧';
}

// ========================================
// HELPER: Format tool name
// ========================================

/**
 * Convert snake_case to Title Case
 * Example: "run_terminal_command" → "Run Terminal Command"
 */
function formatToolName(toolName: string): string {
  return toolName
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// ========================================
// COMPONENT: Tool Execution Status
// ========================================

export interface ToolExecutionStatusProps {
  activeTools: ToolEntry[];
}

export function ToolExecutionStatus({ activeTools }: ToolExecutionStatusProps) {
  // Only show if there are active tools
  if (!activeTools || activeTools.length === 0) {
    return null;
  }

  return (
    <div className="tool-execution-status" role="status" aria-live="polite">
      {activeTools.map(tool => (
        <div key={tool.toolUseId} className="tool-entry">
          <span className="tool-icon">{getToolIcon(tool.toolName)}</span>
          <span className="tool-spinner">⏳</span>
          <span className="tool-name">{formatToolName(tool.toolName)}</span>
          {tool.progress && <span className="tool-progress">{tool.progress}</span>}
        </div>
      ))}
    </div>
  );
}
