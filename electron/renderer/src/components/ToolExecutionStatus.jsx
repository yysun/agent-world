/**
 * ToolExecutionStatus Component - Display Active Tool Operations
 *
 * Purpose:
 * - Show tool name, icon, and progress text
 * - Display multiple concurrent tool executions
 * - Provide visual feedback during tool operations
 *
 * Key Features:
 * - Compact tool list with icons
 * - Progress text display when available
 * - Collapsible for multiple tools
 *
 * Implementation Notes:
 * - Receives activeTools array from parent
 * - Icons mapped by common tool name patterns
 *
 * Recent Changes:
 * - 2026-02-10: Initial implementation
 */

import React from 'react';

/**
 * @typedef {Object} ToolEntry
 * @property {string} toolUseId
 * @property {string} toolName
 * @property {Object} [toolInput]
 * @property {'running'|'completed'|'error'} status
 * @property {string|null} progress
 */

/**
 * Get icon for tool by name pattern
 * @param {string} toolName
 * @returns {JSX.Element}
 */
function getToolIcon(toolName) {
  const name = toolName.toLowerCase();

  if (name.includes('read') || name.includes('file')) {
    return (
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    );
  }

  if (name.includes('write') || name.includes('edit') || name.includes('create')) {
    return (
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
      </svg>
    );
  }

  if (name.includes('search') || name.includes('grep') || name.includes('find')) {
    return (
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>
    );
  }

  if (name.includes('terminal') || name.includes('run') || name.includes('exec') || name.includes('shell')) {
    return (
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 17 10 11 4 5" />
        <line x1="12" y1="19" x2="20" y2="19" />
      </svg>
    );
  }

  if (name.includes('web') || name.includes('fetch') || name.includes('http')) {
    return (
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    );
  }

  // Default tool icon
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

/**
 * Format tool name for display
 * @param {string} toolName
 * @returns {string}
 */
function formatToolName(toolName) {
  // Convert snake_case to Title Case
  return toolName
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

/**
 * @param {Object} props
 * @param {ToolEntry[]} props.tools - Active tool entries
 * @param {string} [props.className] - Additional CSS classes
 */
export default function ToolExecutionStatus({ tools, className = '' }) {
  if (!tools || tools.length === 0) {
    return null;
  }

  return (
    <div
      className={`space-y-1.5 ${className}`}
      role="status"
      aria-live="polite"
      aria-label={`${tools.length} tool${tools.length === 1 ? '' : 's'} running`}
    >
      {tools.map((tool) => (
        <div
          key={tool.toolUseId}
          className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground"
        >
          <span className="shrink-0 text-muted-foreground/70">
            {getToolIcon(tool.toolName)}
          </span>
          <span className="min-w-0 flex-1 truncate font-medium">
            {formatToolName(tool.toolName)}
          </span>
          {tool.progress ? (
            <span className="shrink-0 text-muted-foreground/60">
              {tool.progress}
            </span>
          ) : (
            <span className="shrink-0">
              <svg className="h-3 w-3 animate-spin text-muted-foreground/50" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
