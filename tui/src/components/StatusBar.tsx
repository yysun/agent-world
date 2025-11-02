/**
 * StatusBar Component
 * 
 * Bottom status bar showing:
 * - Keyboard shortcuts
 * - Message/agent counts
 * 
 * Fixed height (1 line) at bottom of screen.
 * 
 * Created: 2025-11-02 - Phase 1: Layout Redesign
 */

import React from 'react';
import { Box, Text } from 'ink';

interface StatusBarProps {
  messageCount: number;
  agentCount: number;
  showCrudShortcuts?: boolean;
}

const StatusBar: React.FC<StatusBarProps> = ({
  messageCount,
  agentCount,
  showCrudShortcuts = false
}) => {
  return (
    <Box paddingX={1}>
      <Text color="gray" dimColor>
        Ctrl+C: Exit
        {showCrudShortcuts && (
          <>
            {' | '}
            Ctrl+W: Worlds
            {' | '}
            Ctrl+A: Agents
            {' | '}
            Ctrl+H: Chats
          </>
        )}
        {' | '}
        Messages: {messageCount}
        {' | '}
        Agents: {agentCount}
      </Text>
    </Box>
  );
};

export default StatusBar;
