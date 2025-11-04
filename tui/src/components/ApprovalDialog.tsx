/**
 * ApprovalDialog Component - Tool Approval Interface for TUI
 * 
 * Purpose: Displays tool approval requests in a modal dialog for TUI interface
 * 
 * Features:
 * - Modal overlay using Popup component
 * - Tool details display (name, message, arguments)
 * - Approval decision buttons (approve/deny)
 * - Scope selection (once/session) 
 * - Keyboard shortcuts for quick approval
 * - Styled for terminal interface visibility
 * 
 * Responsibilities:
 * - Render approval request details in terminal-friendly format
 * - Handle user approval decisions via keyboard/mouse
 * - Send approval responses via callback
 * - Use Ink components for terminal rendering
 * 
 * Created: Phase 7 - Tool approval system integration
 */

import React, { useCallback, useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import Popup from './Popup.js';
import type { ApprovalRequest, ApprovalResponse, ApprovalDecision, ApprovalScope } from '../types/index.js';

export interface ApprovalDialogProps {
  request: ApprovalRequest | null;
  isVisible: boolean;
  onApproval: (response: ApprovalResponse) => void;
  onCancel: () => void;
}

/**
 * ApprovalDialog component for tool approval in TUI
 */
export default function ApprovalDialog({ request, isVisible, onApproval, onCancel }: ApprovalDialogProps) {
  const [selectedScope, setSelectedScope] = useState<ApprovalScope>('once');

  const handleApproval = useCallback((decision: ApprovalDecision) => {
    if (!request) return;

    const response: ApprovalResponse = {
      decision,
      scope: selectedScope,
      requestId: request.requestId
    };

    onApproval(response);
  }, [request, selectedScope, onApproval]);

  // Handle keyboard input when dialog is visible
  useInput((input, key) => {
    if (!isVisible) return;

    switch (input.toLowerCase()) {
      case 'y':
        handleApproval('approve');
        break;
      case 'n':
        handleApproval('deny');
        break;
      case 'o':
        setSelectedScope('once');
        break;
      case 's':
        setSelectedScope('session');
        break;
      default:
        if (key.escape || input === 'q') {
          onCancel();
        }
        break;
    }
  }, { isActive: isVisible });

  // Reset scope when dialog opens
  useEffect(() => {
    if (isVisible) {
      setSelectedScope('once');
    }
  }, [isVisible]);

  if (!isVisible || !request) {
    return null;
  }

  return (
    <Popup title="Tool Approval Required" onClose={onCancel}>
      <Box flexDirection="column" padding={1}>
        {/* Tool Information */}
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="cyan">Tool: {request.toolName}</Text>
          <Text color="gray">{request.message}</Text>
        </Box>

        {/* Arguments */}
        {request.toolArgs && Object.keys(request.toolArgs).length > 0 && (
          <Box flexDirection="column" marginBottom={1}>
            <Text bold color="yellow">Arguments:</Text>
            {Object.entries(request.toolArgs).map(([key, value]) => (
              <Box key={key} marginLeft={2}>
                <Text color="green">{key}: </Text>
                <Text color="white">{typeof value === 'string' ? value : JSON.stringify(value, null, 2)}</Text>
              </Box>
            ))}
          </Box>
        )}

        {/* Options */}
        {request.options && request.options.length > 0 && (
          <Box flexDirection="column" marginBottom={1}>
            <Text bold color="yellow">Options:</Text>
            {request.options.map((option, index) => (
              <Box key={index} marginLeft={2}>
                <Text color="gray">• {option}</Text>
              </Box>
            ))}
          </Box>
        )}

        {/* Scope Selection */}
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="cyan">Approval Scope:</Text>
          <Box marginLeft={2} flexDirection="column">
            <Text color={selectedScope === 'once' ? 'green' : 'gray'}>
              (O) Once - Just this time
            </Text>
            <Text color={selectedScope === 'session' ? 'green' : 'gray'}>
              (S) Session - For this session
            </Text>
          </Box>
        </Box>

        {/* Action Buttons */}
        <Box flexDirection="row" justifyContent="space-between" marginTop={1}>
          <Box flexDirection="row">
            <Text color="green" bold>[Y] Approve</Text>
            <Text color="white"> | </Text>
            <Text color="red" bold>[N] Deny</Text>
          </Box>
          <Text color="gray">[Q] Cancel</Text>
        </Box>

        {/* Help Text */}
        <Box marginTop={1}>
          <Text color="gray" dimColor>
            Use Y/N to approve/deny, O/S to change scope, Q to cancel
          </Text>
        </Box>
      </Box>
    </Popup>
  );
}