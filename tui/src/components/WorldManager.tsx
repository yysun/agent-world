/**
 * WorldManager Popup
 * 
 * CRUD operations for worlds:
 * - List all worlds
 * - Switch world
 * - Create new world
 * - Delete world
 * 
 * Created: 2025-11-02 - Phase 3: CRUD Popups
 */

import React from 'react';
import { Box, Text } from 'ink';
import Popup from './Popup.js';

interface WorldManagerProps {
  currentWorldId: string;
  onClose: () => void;
  onSwitchWorld?: (worldId: string) => void;
  onCreateWorld?: (name: string) => void;
  onDeleteWorld?: (worldId: string) => void;
}

const WorldManager: React.FC<WorldManagerProps> = ({
  currentWorldId,
  onClose
}) => {
  return (
    <Popup title="World Manager" width="60%" height="50%" onClose={onClose}>
      <Box flexDirection="column">
        <Text color="cyan" bold>Current World: {currentWorldId}</Text>
        <Box marginTop={1}>
          <Text color="gray" dimColor>
            World CRUD operations coming soon...
          </Text>
        </Box>
        <Box marginTop={2}>
          <Text color="yellow">
            Use /world:list, /world:create, /world:switch commands for now
          </Text>
        </Box>
      </Box>
    </Popup>
  );
};

export default WorldManager;
