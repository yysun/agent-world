/**
 * Agent Sidebar Component
 * 
 * Displays agent status with:
 * - Active/inactive indicators
 * - Streaming status with spinner
 * - Last activity timestamp
 * - Real-time updates
 * 
 * Created: 2025-11-01 - Phase 2: UI Components
 */

import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { AgentStatus } from '../hooks/useWorldState.js';

interface AgentSidebarProps {
  agents: Map<string, AgentStatus>;
}

const AgentSidebar: React.FC<AgentSidebarProps> = ({ agents }) => {
  const agentList = Array.from(agents.values());

  if (agentList.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="gray" dimColor>No agents</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text color="cyan" bold>Agents ({agentList.length})</Text>
      <Box marginTop={1} flexDirection="column">
        {agentList.map((agent) => {
          const statusColor = agent.isActive ? 'green' : 'gray';
          const statusText = agent.isActive ? '●' : '○';
          const lastActivityText = agent.lastActivity
            ? agent.lastActivity.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit'
            })
            : '-';

          return (
            <Box key={agent.name} flexDirection="column" marginBottom={1}>
              <Box>
                <Text color={statusColor}>{statusText}</Text>
                <Text> </Text>
                <Text bold>{agent.name}</Text>
              </Box>

              {agent.isStreaming && (
                <Box paddingLeft={2}>
                  <Text color="blue">
                    <Spinner type="dots" />
                  </Text>
                  <Text color="blue"> Streaming...</Text>
                </Box>
              )}

              {agent.currentMessage && (
                <Box paddingLeft={2}>
                  <Text color="gray" dimColor>
                    {agent.currentMessage.substring(0, 30)}
                    {agent.currentMessage.length > 30 ? '...' : ''}
                  </Text>
                </Box>
              )}

              <Box paddingLeft={2}>
                <Text color="gray" dimColor>Last: {lastActivityText}</Text>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

export default AgentSidebar;
