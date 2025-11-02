/**
 * Input Box Component
 * 
 * Provides text input with:
 * - Command detection (starts with /)
 * - Send on Enter
 * - Disabled state support
 * 
 * Created: 2025-11-01 - Phase 2: UI Components
 */

import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

interface InputBoxProps {
  onSubmit: (value: string, isCommand: boolean) => void;
  disabled?: boolean;
  placeholder?: string;
}

const InputBox: React.FC<InputBoxProps> = ({
  onSubmit,
  disabled = false,
  placeholder = 'Type a message or /command...'
}) => {
  const [value, setValue] = useState('');

  const handleSubmit = (submittedValue: string) => {
    const trimmed = submittedValue.trim();
    if (!trimmed) return;

    const isCommand = trimmed.startsWith('/');
    onSubmit(trimmed, isCommand);
    setValue('');
  };

  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1}>
      <Text color={disabled ? 'gray' : 'white'}>{'> '}</Text>
      <TextInput
        value={value}
        onChange={setValue}
        onSubmit={handleSubmit}
        placeholder={placeholder}
        showCursor={!disabled}
      />
    </Box>
  );
};

export default InputBox;
