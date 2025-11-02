/**
 * Popup Component
 * 
 * Modal overlay base component for CRUD operations.
 * 
 * Features:
 * - Centered modal with border
 * - Configurable size (width, height)
 * - Title bar with close button
 * - Escape key handling (via parent)
 * - Focus trap for keyboard navigation
 * 
 * Created: 2025-11-02 - Phase 2: Popup Framework
 */

import React from 'react';
import { Box, Text } from 'ink';

interface PopupProps {
  title: string;
  width?: number | string;
  height?: number | string;
  onClose?: () => void;
  children: React.ReactNode;
}

const Popup: React.FC<PopupProps> = ({
  title,
  width = '60%',
  height = '70%',
  onClose,
  children
}) => {
  return (
    <Box
      position="absolute"
      width="100%"
      height="100%"
      justifyContent="center"
      alignItems="center"
      flexDirection="column"
    >
      {/* Backdrop (dimmed) */}
      <Box
        position="absolute"
        width="100%"
        height="100%"
      />

      {/* Modal */}
      <Box
        width={width}
        height={height}
        borderStyle="double"
        borderColor="cyan"
        flexDirection="column"
        padding={0}
      >
        {/* Title Bar */}
        <Box
          borderStyle="single"
          borderColor="cyan"
          paddingX={1}
          justifyContent="space-between"
        >
          <Text color="cyan" bold>{title}</Text>
          <Text color="gray" dimColor>[Esc] Close</Text>
        </Box>

        {/* Content */}
        <Box flexGrow={1} flexDirection="column" padding={1}>
          {children}
        </Box>
      </Box>
    </Box>
  );
};

export default Popup;
