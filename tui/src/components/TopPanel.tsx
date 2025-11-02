/**
 * TopPanel Component
 * 
 * Top bar containing:
 * - Horizontal agent status bar
 * - Chat/World title
 * - Connection status
 * 
 * Fixed height (~3 lines) at top of screen.
 * 
 * Created: 2025-11-02 - Phase 1: Layout Redesign
 */

import React from 'react';
import { Box, Text } from 'ink';
import AgentBar from './AgentBar.js';
import ConnectionStatus from './ConnectionStatus.js';
import type { AgentActivityStatus } from '../../../ws/types.js';

interface TopPanelProps {
  worldId: string;
  chatId: string | null;
  agents: AgentActivityStatus[];
  connected: boolean;
  connecting: boolean;
  reconnecting: boolean;
  error: string | null;
}

const TopPanel: React.FC<TopPanelProps> = ({
  worldId,
  chatId,
  agents,
  connected,
  connecting,
  reconnecting,
  error
}) => {
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="cyan">
      {/* Line 1: Agent Bar */}
      <Box paddingX={1}>
        <Text color="gray" dimColor>Agents: </Text>
        <AgentBar agents={agents} maxWidth={70} />
      </Box>

      {/* Line 2: World + Chat Title */}
      <Box paddingX={1}>
        <Text color="cyan" bold>Agent World</Text>
        <Text color="gray"> › </Text>
        <Text color="yellow">{worldId}</Text>
        {chatId && (
          <>
            <Text color="gray"> › </Text>
            <Text>{chatId}</Text>
          </>
        )}
        <Text>  </Text>
        <ConnectionStatus
          connected={connected}
          connecting={connecting}
          reconnecting={reconnecting}
          error={error}
        />
      </Box>
    </Box>
  );
};

export default TopPanel;
