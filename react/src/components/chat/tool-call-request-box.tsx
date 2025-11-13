/**
 * Tool Call Request Box Component
 * 
 * Purpose: Display tool call approval request with action buttons
 * Source: Adapted from web/src/components/tool-call-request-box.tsx
 * 
 * Features:
 * - Displays tool name and arguments in formatted JSON
 * - Shows approval message/warning
 * - Renders approval option buttons (Cancel, Once, Always)
 * - Emits approval decision callback on button click
 * - Supports both backend format (deny/approve_once/approve_session) and frontend format (Cancel/Once/Always)
 * 
 * Implementation:
 * - React component with callback props
 * - JSON formatting for tool arguments
 * - Button styling with Tailwind CSS
 * - Integrates with approval flow
 * 
 * Changes:
 * - 2025-11-12: Created for React frontend from web component
 */

import React from 'react';
import type { Message } from '@/types';

export interface ToolCallRequestBoxProps {
  /** Message containing tool call approval request */
  message: Message;

  /** Callback when approval decision is made */
  onApprovalDecision?: (data: {
    toolCallId: string;
    decision: 'approve' | 'deny';
    scope: 'once' | 'session' | 'none';
  }) => void;
}

/**
 * ToolCallRequestBox - Displays tool approval request with action buttons
 * 
 * @component
 * @example
 * ```tsx
 * <ToolCallRequestBox
 *   message={message}
 *   onApprovalDecision={({ toolCallId, decision, scope }) => {
 *     handleApproval(toolCallId, decision, scope);
 *   }}
 * />
 * ```
 */
export const ToolCallRequestBox = React.memo<ToolCallRequestBoxProps>(
  function ToolCallRequestBox({ message, onApprovalDecision }) {
    if (!message.toolCallData) {
      return null;
    }

    const { toolCallId, toolName, toolArgs, approvalMessage, approvalOptions } = message.toolCallData;
    const options = approvalOptions || ['deny', 'approve_once', 'approve_session'];

    // Check if deny option is available (deny or Cancel)
    const hasDeny = options.some(opt => opt === 'deny' || opt === 'Cancel');
    // Check if approve once option is available (approve_once or Once)
    const hasOnce = options.some(opt => opt === 'approve_once' || opt === 'Once');
    // Check if approve session option is available (approve_session or Always)
    const hasSession = options.some(opt => opt === 'approve_session' || opt === 'Always');

    // Format tool arguments for display
    const formattedArgs = JSON.stringify(toolArgs, null, 2);

    const handleDecision = (decision: 'approve' | 'deny', scope: 'once' | 'session' | 'none') => {
      if (onApprovalDecision) {
        onApprovalDecision({ toolCallId, decision, scope });
      }
    };

    return (
      <div className="rounded-lg border-2 border-amber-500 bg-amber-50 dark:bg-amber-950/20 p-4 my-2">
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-2xl">⚠️</span>
          <span className="font-semibold text-amber-900 dark:text-amber-100">
            Tool Approval Required
          </span>
        </div>

        {/* Tool Info */}
        <div className="space-y-2 mb-4">
          <div className="text-sm">
            <strong className="text-gray-700 dark:text-gray-300">Tool:</strong>{' '}
            <span className="font-mono text-gray-900 dark:text-gray-100">{toolName}</span>
          </div>

          {approvalMessage && (
            <div className="text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 rounded p-2 border border-amber-300 dark:border-amber-700">
              {approvalMessage}
            </div>
          )}

          <details className="text-sm">
            <summary className="cursor-pointer text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 font-medium">
              Arguments
            </summary>
            <pre className="mt-2 p-3 bg-gray-100 dark:bg-gray-900 rounded text-xs overflow-x-auto border border-gray-300 dark:border-gray-700">
              {formattedArgs}
            </pre>
          </details>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 flex-wrap">
          {hasDeny && (
            <button
              className="px-4 py-2 rounded bg-red-600 hover:bg-red-700 text-white font-medium text-sm transition-colors"
              onClick={() => handleDecision('deny', 'none')}
              title="Deny this tool execution"
            >
              Cancel
            </button>
          )}
          {hasOnce && (
            <button
              className="px-4 py-2 rounded bg-gray-600 hover:bg-gray-700 text-white font-medium text-sm transition-colors"
              onClick={() => handleDecision('approve', 'once')}
              title="Approve this tool execution once"
            >
              Once
            </button>
          )}
          {hasSession && (
            <button
              className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors"
              onClick={() => handleDecision('approve', 'session')}
              title="Approve this tool for the entire session"
            >
              Always
            </button>
          )}
        </div>
      </div>
    );
  }
);
