/**
 * AgentManager Popup
 * 
 * CRUD operations for agents:
 * - List agents in current world
 * - Create new agent
 * - Edit agent configuration
 * - Delete agent
 * 
 * Created: 2025-11-02 - Phase 3: CRUD Popups
 */

import React from 'react';
import { Box, Text } from 'ink';
import Popup from './Popup.js';
import type { AgentActivityStatus } from '../../ws/types.js';

interface AgentManagerProps {
  agents: AgentActivityStatus[];
  onClose: () => void;
  onCreateAgent?: (name: string, prompt: string) => void;
  onEditAgent?: (agentId: string, updates: any) => void;
  onDeleteAgent?: (agentId: string) => void;
}

const AgentManager: React.FC<AgentManagerProps> = ({
  agents,
  onClose
}) => {
  return (
    <Popup title="Agent Manager" width="60%" height="60%" onClose={onClose}>
      <Box flexDirection="column">
        <Text color="cyan" bold>Agents ({agents.length})</Text>

        <Box marginTop={1} flexDirection="column">
          {agents.length === 0 ? (
            <Text color="gray" dimColor>No agents in this world</Text>
          ) : (
            agents.map(agent => (
              <Box key={agent.agentId} marginBottom={1}>
                <Text color="green">● </Text>
                <Text>{agent.agentId}</Text>
                <Text color="gray" dimColor> - {agent.phase}</Text>
              </Box>
            ))
          )}
        </Box>

        <Box marginTop={2}>
          <Text color="gray" dimColor>
            Agent CRUD operations coming soon...
          </Text>
        </Box>

        <Box marginTop={1}>
          <Text color="yellow">
            Use /agent:create, /agent:edit, /agent:delete commands for now
          </Text>
        </Box>
      </Box>
    </Popup>
  );
};

export default AgentManager;
