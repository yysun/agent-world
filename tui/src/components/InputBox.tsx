/**
 * Input Box Component
 * 
 * Provides text input with:
 * - Command detection (starts with /)
 * - Send on Enter
 * - Disabled state support
 * - Approval mode for tool approval prompts
 * 
 * Created: 2025-11-01 - Phase 2: UI Components
 * Updated: 2025-11-05 - Added inline approval mode
 */

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import type { ApprovalRequest, ApprovalResponse } from '../types/index.js';

interface InputBoxProps {
  onSubmit: (value: string, isCommand: boolean) => void;
  disabled?: boolean;
  placeholder?: string;
  approvalRequest?: ApprovalRequest | null;
  onApproval?: (response: ApprovalResponse) => void;
  onApprovalCancel?: () => void;
}

const InputBox: React.FC<InputBoxProps> = ({
  onSubmit,
  disabled = false,
  placeholder = 'Type a message or /command...',
  approvalRequest = null,
  onApproval,
  onApprovalCancel
}) => {
  const [value, setValue] = useState('');

  // Clear input when entering/exiting approval mode
  useEffect(() => {
    if (approvalRequest) {
      setValue('');
    }
  }, [approvalRequest]);

  const handleSubmit = (submittedValue: string) => {
    const trimmed = submittedValue.trim();
    if (!trimmed) return;

    // Handle approval mode
    if (approvalRequest && onApproval) {
      const input = trimmed.toLowerCase();
      const num = parseInt(trimmed);

      // Map number choices to decisions
      if (num === 1) {
        // Deny
        onApproval({
          decision: 'deny',
          scope: 'once',
          requestId: approvalRequest.requestId
        });
        setValue('');
        return;
      } else if (num === 2) {
        // Approve Once
        onApproval({
          decision: 'approve',
          scope: 'once',
          requestId: approvalRequest.requestId
        });
        setValue('');
        return;
      } else if (num === 3) {
        // Approve for Session
        onApproval({
          decision: 'approve',
          scope: 'session',
          requestId: approvalRequest.requestId
        });
        setValue('');
        return;
      } else if (input === 'q' || input === 'cancel') {
        // Cancel approval
        onApprovalCancel?.();
        setValue('');
        return;
      }

      // Invalid input - don't clear, let user try again
      return;
    }

    // Normal message mode
    const isCommand = trimmed.startsWith('/');
    onSubmit(trimmed, isCommand);
    setValue('');
  };

  // Determine prompt and placeholder based on mode
  const isApprovalMode = !!approvalRequest;
  const prompt = isApprovalMode ? '🔒 ' : '> ';
  const effectivePlaceholder = isApprovalMode
    ? 'Select an option (number)...'
    : placeholder;
  const isDisabled = disabled && !isApprovalMode;

  return (
    <Box borderStyle="single" borderColor={isApprovalMode ? 'yellow' : 'gray'} paddingX={1}>
      <Text color={isDisabled ? 'gray' : isApprovalMode ? 'yellow' : 'white'}>{prompt}</Text>
      <TextInput
        value={value}
        onChange={setValue}
        onSubmit={handleSubmit}
        placeholder={effectivePlaceholder}
        showCursor={!isDisabled}
      />
    </Box>
  );
};

export default InputBox;
