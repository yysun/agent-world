/**
 * Main Ink Application Component
 *
 * Features:
 * - Interactive mode entry point for CLI with rich terminal UI
 * - Real-time world event streaming using Ink components
 * - Command input processing using shared command core
 * - World selection and management interface
 * - Event display with proper formatting and filtering
 *
 * Architecture:
 * - Uses shared command system from relocated commands/ directory
 * - Implements ClientConnection interface for Ink display routing
 * - Direct subscription to world EventEmitter instances
 * - Context preservation from command line arguments
 * - Rich terminal interface using React-like Ink components
 *
 * Integration:
 * - Command execution: Direct use of handleCommand() from events.ts
 * - World management: Direct use of core/world-manager functions  
 * - Event system: Direct subscription to existing world EventEmitter
 * - Display routing: Parse JSON responses and route to Ink components
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, Newline } from 'ink';
import CommandInput from './CommandInput.js';
import WorldSelector from './WorldSelector.js';
import { getWorld } from '../../core/world-manager.js';
import { toKebabCase } from '../../core/utils.js';

interface AppProps {
  initialRootPath: string;
  initialWorldName?: string;
}

interface CommandResult {
  success?: boolean;
  message?: string;
  data?: any;
  error?: string;
  timestamp?: string;
  refreshWorld?: boolean;
}

const App: React.FC<AppProps> = ({ initialRootPath, initialWorldName }) => {
  const [rootPath] = useState(initialRootPath);
  const [worldName, setWorldName] = useState(initialWorldName || '');
  const [world, setWorld] = useState<any>(null);
  const [status, setStatus] = useState('Starting CLI...');
  const [lastResult, setLastResult] = useState<CommandResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [needsWorldSelection, setNeedsWorldSelection] = useState(false);

  // Handle world selection from WorldSelector
  const handleWorldSelected = useCallback(async (selectedWorldName: string, selectedWorld: any) => {
    setIsLoading(true);
    setStatus(`Loading world: ${selectedWorldName}`);

    try {
      // If world object not provided, load it
      let worldToUse = selectedWorld;
      if (!worldToUse) {
        const worldId = toKebabCase(selectedWorldName);
        worldToUse = await getWorld(rootPath, worldId);
      }

      if (worldToUse) {
        setWorld(worldToUse);
        setWorldName(selectedWorldName);
        setStatus(`Connected to world: ${selectedWorldName}`);
        setNeedsWorldSelection(false);
      } else {
        setStatus(`Error: Could not load world '${selectedWorldName}'`);
      }
    } catch (error) {
      setStatus(`Error loading world: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  }, [rootPath]);

  const handleWorldSelectionError = useCallback((error: string) => {
    setStatus(`World selection error: ${error}`);
    setIsLoading(false);
  }, []);

  // Load initial world or trigger world selection
  useEffect(() => {
    const initializeWorld = async () => {
      if (initialWorldName) {
        // World specified via command line - load it directly
        setIsLoading(true);
        setStatus(`Loading world: ${initialWorldName}`);

        try {
          const worldId = toKebabCase(initialWorldName);
          const loadedWorld = await getWorld(rootPath, worldId);

          if (loadedWorld) {
            setWorld(loadedWorld);
            setWorldName(initialWorldName);
            setStatus(`Connected to world: ${initialWorldName}`);
          } else {
            setStatus(`Error: World '${initialWorldName}' not found`);
          }
        } catch (error) {
          setStatus(`Error loading world: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
          setIsLoading(false);
        }
      } else {
        // No world specified - trigger smart world selection
        setStatus('Discovering available worlds...');
        setNeedsWorldSelection(true);
      }
    };

    initializeWorld();
  }, [initialWorldName, rootPath]);

  const handleCommandResult = useCallback(async (result: CommandResult) => {
    setLastResult(result);

    // If command suggests world refresh and we have a current world, reload it
    if (result.refreshWorld && worldName) {
      try {
        const worldId = toKebabCase(worldName);
        const refreshedWorld = await getWorld(rootPath, worldId);
        if (refreshedWorld) {
          setWorld(refreshedWorld);
          setStatus(`World refreshed: ${worldName}`);
        }
      } catch (error) {
        setStatus(`Error refreshing world: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }, [worldName, rootPath]);

  const renderLastResult = () => {
    if (!lastResult) return null;

    return (
      <Box flexDirection="column" marginTop={1} marginBottom={1} paddingX={1} borderStyle="round">
        <Box marginBottom={1}>
          <Text color={lastResult.success === false ? "red" : "green"} bold>
            {lastResult.success === false ? "✗ Error" : "✓ Success"}
          </Text>
          {lastResult.timestamp && (
            <Text color="gray" dimColor> - {new Date(lastResult.timestamp).toLocaleTimeString()}</Text>
          )}
        </Box>

        {lastResult.message && (
          <Box marginBottom={1}>
            <Text>{lastResult.message}</Text>
          </Box>
        )}

        {lastResult.error && (
          <Box marginBottom={1}>
            <Text color="red">{lastResult.error}</Text>
          </Box>
        )}

        {lastResult.data && (
          <Box flexDirection="column">
            <Text color="cyan" dimColor>Data:</Text>
            <Text>{JSON.stringify(lastResult.data, null, 2)}</Text>
          </Box>
        )}
      </Box>
    );
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="blue">🌍 Agent World CLI (Interactive Mode)</Text>
      </Box>

      <Box marginBottom={1}>
        <Text>Status: </Text>
        <Text color={isLoading ? "yellow" : worldName ? "green" : "gray"}>
          {status}
        </Text>
      </Box>

      {/* Show world selector if needed */}
      {needsWorldSelection && !isLoading && (
        <WorldSelector
          rootPath={rootPath}
          onWorldSelected={handleWorldSelected}
          onError={handleWorldSelectionError}
        />
      )}

      {/* Show world info when connected */}
      {worldName && world && !needsWorldSelection && (
        <Box marginBottom={1} paddingX={1} borderStyle="single">
          <Box flexDirection="column">
            <Text color="green" bold>📡 Connected to: {worldName}</Text>
            <Text color="gray" dimColor>
              Agents: {world.agents?.length || 0} |
              Turn Limit: {world.turnLimit || 'N/A'}
            </Text>
          </Box>
        </Box>
      )}

      {/* Show command results */}
      {!needsWorldSelection && renderLastResult()}

      {/* Show command input when world is connected */}
      {worldName && world && !needsWorldSelection && (
        <CommandInput
          world={world}
          rootPath={rootPath}
          onCommandResult={handleCommandResult}
        />
      )}

      {/* Show tips */}
      {!needsWorldSelection && (
        <Box marginTop={2}>
          <Text color="gray" dimColor>
            💡 Tips:
            <Newline />
            • Type commands like: getworld, clear agent1, addagent MyAgent
            <Newline />
            • Use ↑/↓ arrows for command history
            <Newline />
            • Press Ctrl+C to exit
          </Text>
        </Box>
      )}
    </Box>
  );
};

export default App;
