/**
 * Command Input Component for Ink CLI
 *
 * Features:
 * - Interactive input with dual processing modes
 * - Commands (starting with /): Execute system commands
 * - Messages (not starting with /): Send messages to world agents
 * - Command history and auto-completion
 * - Integration with shared command core
 * - Real-time execution and result display
 * - Error handling and user feedback
 *
 * Input Processing:
 * - If input starts with '/': Process as command
 * - Else: Process as message to world
 * - Uses shared processInput() function for consistency with CLI pipeline
 * - Integrates with world context and state management
 */

import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';

interface CommandInputProps {
  world: any;
  rootPath: string;
  onCommandResult: (result: any) => void;
}

const CommandInput: React.FC<CommandInputProps> = ({ world, rootPath, onCommandResult }) => {
  const [command, setCommand] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const executeCommand = useCallback(async (commandText: string) => {
    if (!commandText.trim()) return;

    setIsExecuting(true);

    try {
      // Import processInput to handle both commands and messages
      const { processInput } = await import('../../commands/index.js');

      // Use the world object as-is - it should already have eventEmitter initialized
      // Don't load fresh world for messages, use the subscribed world from App state
      const result = await processInput(commandText.trim(), world, rootPath, 'HUMAN');
      onCommandResult(result);

      // Add to history
      setCommandHistory(prev => [...prev, commandText].slice(-50)); // Keep last 50 commands
      setHistoryIndex(-1);
      setCommand('');

    } catch (error) {
      onCommandResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    } finally {
      setIsExecuting(false);
    }
  }, [world, rootPath, onCommandResult]);

  const handleSubmit = useCallback((value: string) => {
    executeCommand(value);
  }, [executeCommand]);

  const handleKeyPress = useCallback((input: string, key: any) => {
    if (key.upArrow && commandHistory.length > 0) {
      const newIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
      setHistoryIndex(newIndex);
      setCommand(commandHistory[commandHistory.length - 1 - newIndex] || '');
    } else if (key.downArrow && historyIndex >= 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      if (newIndex < 0) {
        setCommand('');
      } else {
        setCommand(commandHistory[commandHistory.length - 1 - newIndex] || '');
      }
    }
  }, [commandHistory, historyIndex]);

  useInput(handleKeyPress);

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box marginBottom={1}>
        <Text color="cyan">Command or Message:</Text>
      </Box>

      <Box>
        <Text color="gray">$ </Text>
        <TextInput
          value={command}
          onChange={setCommand}
          onSubmit={handleSubmit}
          placeholder="Enter command (/getworld) or message (Hello agents)"
          showCursor={!isExecuting}
        />
        {isExecuting && (
          <Text color="yellow"> [Executing...]</Text>
        )}
      </Box>

      {commandHistory.length > 0 && (
        <Box marginTop={1}>
          <Text color="gray" dimColor>
            Use ↑/↓ arrows for command history ({commandHistory.length} commands)
          </Text>
        </Box>
      )}
    </Box>
  );
};

export default CommandInput;
