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
 * Architecture Alignment with WebSocket Server (ws.ts):
 * - Uses shared command system from relocated commands/ directory
 * - Implements identical world loading: getWorld() from core/world-manager
 * - Uses same event subscription pattern: setupWorldEventListeners()
 * - Follows same cleanup pattern: cleanupWorldSubscription()
 * - Implements same refresh pattern: refreshWorldSubscription()
 * - Uses same event filtering: skip user message echoes
 * - Connection-specific world state management with proper cleanup
 * - Routes events to Ink components instead of WebSocket client transport
 *
 * Event System:
 * - Direct subscription to world EventEmitter instances (same as WebSocket)
 * - Handles all event types: system, world, message, sse (same as WebSocket)
 * - Event filtering prevents user message echo (same as WebSocket)
 * - Routes filtered events to Ink UI components for rich display
 * - State tracking with proper cleanup on disconnect/unmount
 *
 * Integration:
 * - Command execution: Direct use of processInput() from commands/index.ts
 * - World management: Direct use of core/world-manager functions  
 * - Event system: Direct subscription to existing world EventEmitter
 * - Display routing: Route events to Ink components instead of JSON responses
 * - Consistent behavior: Identical architecture to WebSocket server transport
 *
 * Changes (Architectural Alignment):
 * - Replaced custom loadAndSubscribeToWorld() with WebSocket-style functions
 * - Added setupWorldEventListeners() function (same pattern as WebSocket)
 * - Added cleanupWorldSubscription() for proper event listener cleanup
 * - Added refreshWorldSubscription() for world state refresh after commands
 * - Implemented connection-specific world state tracking (WorldState interface)
 * - Added event display in Ink UI with real-time event streaming
 * - Added proper cleanup on component unmount to prevent memory leaks
 * - Added SSE streaming display with real-time chunk accumulation and inline display
 * - Enhanced event routing to handle SSE chunks, end events, and errors specially
 * - Streaming content displays prominently during generation with visual indicators
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, Newline } from 'ink';
import CommandInput from './CommandInput.js';
import WorldSelector from './WorldSelector.js';
import { processInput } from '../../commands/index.js';
import { getWorld } from '../../core/world-manager.js';
import { toKebabCase } from '../../core/utils.js';
import { World } from '../../core/types.js';

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

interface EventData {
  sender?: string;
  content?: string;
  message?: string;
  type?: string;
  eventType?: string;
}

interface StreamingState {
  isActive: boolean;
  content: string;
  sender?: string;
  streamId?: string;
}

interface WorldState {
  world: World;
  worldEventListeners: Map<string, (...args: any[]) => void>;
}

// Clean up world subscription and event listeners (same as WebSocket)
function cleanupWorldSubscription(worldState: WorldState | null): void {
  if (worldState?.world && worldState?.worldEventListeners) {
    console.debug('Cleaning up world subscription', {
      world: worldState.world.name,
      listenerCount: worldState.worldEventListeners.size
    });

    // Remove all event listeners
    for (const [eventName, listener] of worldState.worldEventListeners) {
      worldState.world.eventEmitter.off(eventName, listener);
    }
    worldState.worldEventListeners.clear();

    console.debug('World subscription cleanup completed', { world: worldState.world.name });
  }
}

// Set up event listeners for world events (same as WebSocket setupWorldEventListeners)
function setupWorldEventListeners(
  world: World,
  setEvents: (event: EventData) => void,
  setStreaming: React.Dispatch<React.SetStateAction<StreamingState>>
): Map<string, (...args: any[]) => void> {
  const worldEventListeners = new Map<string, (...args: any[]) => void>();

  console.debug('Setting up world event listeners', { world: world.name });

  // Generic handler that forwards events to Ink components with filtering
  const handler = (eventType: string) => (eventData: any) => {
    // Skip echoing user messages back to client (same as WebSocket)
    if (eventData.sender && (eventData.sender === 'HUMAN' || eventData.sender === 'CLI' || eventData.sender.startsWith('user'))) {
      console.debug('Skipping echo of user message', { eventType, sender: eventData.sender });
      return;
    }

    const eventPayload = {
      ...eventData,
      eventType
    };

    console.debug({
      eventType,
      sender: eventData.sender,
      world: world.name,
      payload: eventPayload
    }, 'Forwarding world event to CLI display');

    // Handle SSE events specially for streaming display
    if (eventType === 'sse') {
      if (eventData.type === 'chunk' && eventData.content) {
        // Accumulate streaming content
        setStreaming(prev => ({
          isActive: true,
          content: prev.content + eventData.content,
          sender: eventData.sender || prev.sender,
          streamId: eventData.streamId || prev.streamId
        }));
        return; // Don't add chunks to regular events
      } else if (eventData.type === 'end') {
        // End streaming and move to events
        setStreaming(prev => {
          if (prev.isActive && prev.content) {
            // Add completed stream to events
            setEvents({
              sender: prev.sender,
              content: prev.content,
              message: prev.content,
              eventType: 'message',
              type: 'stream-complete'
            });
          }
          // Clear streaming state
          return { isActive: false, content: '', sender: undefined, streamId: undefined };
        });
        return; // Don't add end events to regular events
      } else if (eventData.type === 'error') {
        // Handle streaming errors
        setStreaming(prev => {
          setEvents({
            sender: eventData.sender || prev.sender,
            content: `Stream error: ${eventData.error || eventData.message}`,
            message: `Stream error: ${eventData.error || eventData.message}`,
            eventType: 'system',
            type: 'stream-error'
          });
          // Clear streaming state
          return { isActive: false, content: '', sender: undefined, streamId: undefined };
        });
        return;
      }
    }

    // Route regular events to Ink components
    setEvents(eventPayload);
  };

  // List of event types to forward (same as WebSocket)
  const eventTypes = ['system', 'world', 'message', 'sse'];

  // Set up listeners for all event types
  for (const eventType of eventTypes) {
    const eventHandler = handler(eventType);
    world.eventEmitter.on(eventType, eventHandler);
    worldEventListeners.set(eventType, eventHandler);
  }

  console.info('World event listeners setup completed', {
    world: world.name,
    eventTypeCount: eventTypes.length
  });

  return worldEventListeners;
}

// Handle subscribe event (same as WebSocket handleSubscribe)
async function handleSubscribe(
  rootPath: string,
  worldName: string,
  setEvents: (event: EventData) => void,
  setStreaming: React.Dispatch<React.SetStateAction<StreamingState>>
): Promise<WorldState | null> {
  console.debug('Handling world subscription', { worldName });

  // Load and attach world to client (same as WebSocket)
  const worldId = toKebabCase(worldName);
  const world = await getWorld(rootPath, worldId);
  if (!world) {
    console.warn('Failed to load world for subscription', { worldName, worldId });
    throw new Error('Failed to load world');
  }

  // Set up event listeners
  const worldEventListeners = setupWorldEventListeners(world, setEvents, setStreaming);

  console.info('World subscription successful', { worldName, worldId });

  return { world, worldEventListeners };
}

// Refresh world subscription after command execution (same as WebSocket refreshWorldSubscription)
async function refreshWorldSubscription(
  rootPath: string,
  worldName: string,
  currentWorldState: WorldState | null,
  setEvents: (event: EventData) => void,
  setStreaming: React.Dispatch<React.SetStateAction<StreamingState>>
): Promise<WorldState | null> {
  try {
    console.debug('Refreshing world subscription', { worldName });

    // Clean up existing world subscription
    cleanupWorldSubscription(currentWorldState);

    // Re-subscribe to refreshed world
    const newWorldState = await handleSubscribe(rootPath, worldName, setEvents, setStreaming);

    console.info('World subscription refreshed successfully', { worldName });
    return newWorldState;
  } catch (error) {
    console.error('Failed to refresh world subscription', {
      worldName,
      error: error instanceof Error ? error.message : error
    });
    return currentWorldState;
  }
}

const App: React.FC<AppProps> = ({ initialRootPath, initialWorldName }) => {
  const [rootPath] = useState(initialRootPath);
  const [worldName, setWorldName] = useState(initialWorldName || '');
  const [worldState, setWorldState] = useState<WorldState | null>(null);
  const [status, setStatus] = useState('Starting CLI...');
  const [lastResult, setLastResult] = useState<CommandResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [needsWorldSelection, setNeedsWorldSelection] = useState(false);
  const [events, setEvents] = useState<EventData[]>([]);
  const [streaming, setStreaming] = useState<StreamingState>({ isActive: false, content: '' });

  // Event handler for displaying events in Ink UI
  const addEvent = useCallback((eventData: EventData) => {
    setEvents(prev => [...prev.slice(-19), eventData]); // Keep last 20 events
  }, []);

  // Handle world selection from WorldSelector
  const handleWorldSelected = useCallback(async (selectedWorldName: string, selectedWorld: any) => {
    setIsLoading(true);
    setStatus(`Loading world: ${selectedWorldName}`);

    try {
      // If world object not provided, load it via core (same as WebSocket)
      let newWorldState: WorldState | null = null;
      if (selectedWorld && selectedWorld.eventEmitter) {
        // Set up event listeners for existing world
        const worldEventListeners = setupWorldEventListeners(selectedWorld, addEvent, setStreaming);
        newWorldState = { world: selectedWorld, worldEventListeners };
      } else {
        // Load world and subscribe
        newWorldState = await handleSubscribe(rootPath, selectedWorldName, addEvent, setStreaming);
      }

      if (newWorldState) {
        setWorldState(newWorldState);
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
  }, [rootPath, addEvent]);

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
          const newWorldState = await handleSubscribe(rootPath, initialWorldName, addEvent, setStreaming);

          setWorldState(newWorldState);
          setWorldName(initialWorldName);
          setStatus(`Connected to world: ${initialWorldName}`);
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
  }, [initialWorldName, rootPath, addEvent]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (worldState) {
        cleanupWorldSubscription(worldState);
      }
    };
  }, [worldState]);

  const handleCommandResult = useCallback(async (result: CommandResult) => {
    setLastResult(result);

    // If command suggests world refresh and we have a current world, reload it
    if (result.refreshWorld && worldName && worldState) {
      try {
        const refreshedWorldState = await refreshWorldSubscription(rootPath, worldName, worldState, addEvent, setStreaming);
        setWorldState(refreshedWorldState);
        setStatus(`World refreshed: ${worldName}`);
      } catch (error) {
        setStatus(`Error refreshing world: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }, [worldName, rootPath, worldState, addEvent]);

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
      {worldName && worldState && !needsWorldSelection && (
        <Box marginBottom={1} paddingX={1} borderStyle="single">
          <Box flexDirection="column">
            <Text color="green" bold>📡 Connected to: {worldName}</Text>
            <Text color="gray" dimColor>
              Agents: {worldState.world.agents?.size || 0} |
              Turn Limit: {worldState.world.turnLimit || 'N/A'}
            </Text>
          </Box>
        </Box>
      )}

      {/* Show streaming content */}
      {worldName && worldState && !needsWorldSelection && streaming.isActive && (
        <Box marginBottom={1} paddingX={1} borderStyle="round" borderColor="yellow">
          <Box flexDirection="column">
            <Text color="yellow" bold>⚡ Streaming: {streaming.sender}</Text>
            <Box marginLeft={1} marginTop={1}>
              <Text>{streaming.content}<Text color="yellow">▊</Text></Text>
            </Box>
          </Box>
        </Box>
      )}

      {/* Show recent events */}
      {worldName && worldState && !needsWorldSelection && events.length > 0 && (
        <Box marginBottom={1} paddingX={1} borderStyle="round">
          <Box flexDirection="column">
            <Text color="cyan" bold>📡 Recent Events:</Text>
            {events.slice(-5).map((event, index) => (
              <Box key={index} marginLeft={1}>
                <Text color="gray" dimColor>[{event.eventType}]</Text>
                <Text> {event.sender}: {event.content || event.message || JSON.stringify(event)}</Text>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* Show command results */}
      {!needsWorldSelection && renderLastResult()}

      {/* Show command input when world is connected */}
      {worldName && worldState && !needsWorldSelection && (
        <CommandInput
          world={worldState.world}
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
