/**
 * AgentBar Component
 * 
 * Horizontal inline agent status display for top panel.
 * Shows agents with colored status indicators and streaming state.
 * 
 * Format: ● Agent1  ○ Agent2  ⊙ Agent3 (streaming)...
 * Colors: Green (active), Gray (inactive), Blue (streaming)
 * 
 * Created: 2025-11-02 - Phase 1: Layout Redesign
 */

import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { AgentActivityStatus } from '../../ws/types.js';

interface AgentBarProps {
  agents: AgentActivityStatus[];
  maxWidth?: number;
}

const AgentBar: React.FC<AgentBarProps> = ({ agents, maxWidth = 80 }) => {
  if (agents.length === 0) {
    return (
      <Box>
        <Text color="gray" dimColor>No agents</Text>
      </Box>
    );
  }

  // Determine which agents to show based on maxWidth
  const agentElements: JSX.Element[] = [];
  let estimatedWidth = 0;
  let truncatedCount = 0;

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    const isStreaming = agent.phase === 'streaming' || agent.phase === 'responding';
    const isActive = agent.phase !== 'idle';

    // Estimate: "● AgentName " = ~15 chars average
    const agentWidth = agent.agentId.length + 4;

    if (estimatedWidth + agentWidth > maxWidth - 10 && i < agents.length - 1) {
      truncatedCount = agents.length - i;
      break;
    }

    const statusColor = isActive ? 'green' : 'gray';
    const statusSymbol = isActive ? '●' : '○';

    agentElements.push(
      <Box key={agent.agentId}>
        <Text color={statusColor}>{statusSymbol}</Text>
        <Text> {agent.agentId}</Text>
        {isStreaming && (
          <>
            <Text> </Text>
            <Text color="blue">
              <Spinner type="dots" />
            </Text>
          </>
        )}
        <Text>  </Text>
      </Box>
    );

    estimatedWidth += agentWidth;
  }

  return (
    <Box>
      {agentElements}
      {truncatedCount > 0 && (
        <Text color="gray" dimColor>... +{truncatedCount} more</Text>
      )}
    </Box>
  );
};

export default AgentBar;
