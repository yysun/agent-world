/**
 * World Selector Component for Ink CLI
 *
 * Features:
 * - Interactive world selection menu when multiple worlds available
 * - Automatic world discovery and selection logic
 * - Auto-create 'default-world' when no worlds exist
 * - Auto-load single world when exactly one found
 * - User-friendly world selection interface
 * - Enhanced display with agent names and message counts
 *
 * Architecture:
 * - Uses getWorlds command for discovery with full agent details
 * - Implements smart selection logic based on availability
 * - Creates new worlds using existing command system
 * - Provides clean interface for world selection workflow
 * - Displays detailed agent information for better world selection
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import { processInput } from '../../commands/index.js';

interface WorldSelectorProps {
  rootPath: string; // Required, passed from CLI index
  onWorldSelected: (worldName: string, world: any) => void;
  onError: (error: string) => void;
}

interface WorldOption {
  label: string;
  value: string;
}

const WorldSelector: React.FC<WorldSelectorProps> = ({ rootPath, onWorldSelected, onError }) => {
  const [worlds, setWorlds] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showSelector, setShowSelector] = useState(false);
  const [status, setStatus] = useState('Discovering worlds...');

  // Smart world discovery and selection logic
  useEffect(() => {
    const discoverAndSelectWorld = async () => {
      try {
        setStatus('Scanning for available worlds...');

        // Get all available worlds with agent details using command system
        const result = await processInput(`/getWorlds`, null, rootPath, 'CLI');

        // Check if we have data (success) or error
        if (result.error || !result.data) {
          throw new Error(result.error || 'Failed to get worlds');
        }

        const availableWorlds = result.data;
        setWorlds(availableWorlds);

        if (availableWorlds.length === 0) {
          // No worlds found - create default world
          setStatus('No worlds found. Creating default world...');

          // Create default world using command system
          const createResult = await processInput(`/addWorld default-world "Default World"`, null, rootPath, 'CLI');

          if (!createResult.error && createResult.data) {
            setStatus('Default world created successfully');
            onWorldSelected('default-world', null); // Let parent load the world
          } else {
            onError('Failed to create default world: ' + (createResult.error || createResult.message || 'Unknown error'));
          }
        } else if (availableWorlds.length === 1) {
          // Exactly one world found - auto-load it
          const singleWorld = availableWorlds[0];
          setStatus(`Auto-loading world: ${singleWorld.name}`);
          onWorldSelected(singleWorld.name, singleWorld);
        } else {
          // Multiple worlds found - show selection menu
          setStatus('Multiple worlds found. Please select one:');
          setShowSelector(true);
        }
      } catch (error) {
        onError(`Error discovering worlds: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setIsLoading(false);
      }
    };

    discoverAndSelectWorld();
  }, [rootPath, onWorldSelected, onError]);

  const handleWorldSelection = useCallback((item: WorldOption) => {
    const selectedWorld = worlds.find(w => w.name === item.value);
    onWorldSelected(item.value, selectedWorld);
  }, [worlds, onWorldSelected]);

  const worldOptions: WorldOption[] = worlds.map(world => {
    const agentCount = world.agentCount || 0;
    const agents = world.agents || [];

    // Create agent summary for display
    let agentSummary = '';
    if (agentCount === 0) {
      agentSummary = 'no agents';
    } else if (agentCount === 1) {
      const agent = agents[0];
      const messageCount = agent?.messageCount || 0;
      agentSummary = `1 agent: ${agent?.name || 'Unknown'} (${messageCount} messages)`;
    } else {
      // Multiple agents - show names and total message count
      const totalMessages = agents.reduce((sum: number, agent: any) => sum + (agent?.messageCount || 0), 0);
      const agentNames = agents.map((agent: any) => agent?.name || 'Unknown').join(', ');
      agentSummary = `${agentCount} agents: ${agentNames} (${totalMessages} total messages)`;
    }

    return {
      label: `${world.name} - ${agentSummary}`,
      value: world.name
    };
  });

  if (isLoading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="yellow">🔍 {status}</Text>
      </Box>
    );
  }

  if (showSelector && worldOptions.length > 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text color="cyan" bold>Select a world to connect to:</Text>
        </Box>

        <SelectInput
          items={worldOptions}
          onSelect={handleWorldSelection}
        />

        <Box marginTop={1}>
          <Text color="gray" dimColor>
            Use ↑/↓ arrows to navigate, Enter to select
          </Text>
        </Box>
      </Box>
    );
  }

  // This should not normally be reached, but provides fallback
  return (
    <Box padding={1}>
      <Text color="red">World selection complete</Text>
    </Box>
  );
};

export default WorldSelector;
