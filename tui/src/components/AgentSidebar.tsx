/**
 * Agent Sidebar Component
 * 
 * Displays agent status with:
 * - Active/inactive indicators
 * - Streaming status with spinner
 * - Agent name and status
 * - Real-time updates
 * 
 * Created: 2025-11-01 - Phase 2: UI Components
 * Updated: 2025-11-01 - Phase 3: Simplified interface to match Agent[] type
 */

import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

export interface Agent {
  id: string;
  name: string;
  status: 'active' | 'inactive';
  streaming: boolean;
}

interface AgentSidebarProps {
  agents: Agent[];
}

const AgentSidebar: React.FC<AgentSidebarProps> = ({ agents }) => {
  if (agents.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="gray" dimColor>No agents</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text color="cyan" bold>Agents ({agents.length})</Text>
      <Box marginTop={1} flexDirection="column">
        {agents.map((agent) => {
          const statusColor = agent.status === 'active' ? 'green' : 'gray';
          const statusText = agent.status === 'active' ? '●' : '○';

          return (
            <Box key={agent.id} flexDirection="column" marginBottom={1}>
              <Box>
                <Text color={statusColor}>{statusText}</Text>
                <Text> </Text>
                <Text bold>{agent.name}</Text>
              </Box>

              {agent.streaming && (
                <Box paddingLeft={2}>
                  <Text color="blue">
                    <Spinner type="dots" />
                  </Text>
                  <Text color="blue"> Streaming...</Text>
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

export default AgentSidebar;
