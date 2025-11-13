/**
 * Tool Call Response Box Component
 * 
 * Purpose: Display tool call approval result
 * Source: Adapted from web/src/components/tool-call-response-box.tsx
 * 
 * Features:
 * - Displays approval decision (approved/denied)
 * - Shows approval scope (once/session)
 * - Visual styling based on decision (green for approve, red for deny)
 * - Shows tool name that was approved/denied
 * 
 * Implementation:
 * - React component with conditional styling
 * - Tailwind CSS for styling
 * - Integrates with message display flow
 * 
 * Changes:
 * - 2025-11-12: Created for React frontend from web component
 */

import React from 'react';
import type { Message } from '@/types';

export interface ToolCallResponseBoxProps {
  /** Message containing tool call approval response */
  message: Message;
}

/**
 * ToolCallResponseBox - Displays tool approval result
 * 
 * @component
 * @example
 * ```tsx
 * <ToolCallResponseBox message={message} />
 * ```
 */
export const ToolCallResponseBox = React.memo<ToolCallResponseBoxProps>(
  function ToolCallResponseBox({ message }) {
    if (!message.toolCallData) {
      return null;
    }

    const { toolName, approvalDecision, approvalScope } = message.toolCallData;
    const isApproved = approvalDecision === 'approve';

    // Determine display text
    const statusIcon = isApproved ? '✓' : '✗';
    const statusText = isApproved ? 'Approved' : 'Denied';

    // Format scope text
    let scopeText = '';
    if (isApproved && approvalScope) {
      scopeText = approvalScope === 'once' ? ' (once)' : ' (session)';
    }

    // Conditional styling classes
    const containerClass = isApproved
      ? 'border-green-500 bg-green-50 dark:bg-green-950/20'
      : 'border-red-500 bg-red-50 dark:bg-red-950/20';

    const textClass = isApproved
      ? 'text-green-900 dark:text-green-100'
      : 'text-red-900 dark:text-red-100';

    return (
      <div className={`rounded-lg border-2 ${containerClass} p-4 my-2`}>
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">{statusIcon}</span>
          <span className={`font-semibold ${textClass}`}>
            {statusText}{scopeText}
          </span>
        </div>

        {/* Tool Info */}
        <div className="text-sm">
          <strong className="text-gray-700 dark:text-gray-300">Tool:</strong>{' '}
          <span className="font-mono text-gray-900 dark:text-gray-100">{toolName}</span>
        </div>
      </div>
    );
  }
);
