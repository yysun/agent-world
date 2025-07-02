/**
 * CLI Client Connection Implementation - Console Display Version
 * 
 * FILE COMMENT BLOCK:
 * This file implements the ClientConnection interface for console-based CLI modes,
 * replacing the previous Ink-specific message handling with structured console
 * output formatting for both pipeline and interactive modes.
 *
 * FEATURES:
 * - Implements ClientConnection interface for both pipeline and interactive modes
 * - Pipeline mode: Direct stdout output, no JSON parsing needed
 * - Interactive mode: Console-based output with structured formatting
 * - Mode-specific display formatting for optimal user experience
 * - Error handling appropriate for each mode context
 * - World refresh handling for state-modifying commands
 * - Emoji-enhanced output for better readability
 * - Structured data display with proper formatting
 *
 * IMPLEMENTATION:
 * - Removed Ink-specific message routing
 * - Added structured console output with status indicators
 * - Enhanced error and success message formatting
 * - Maintained callback system for world refresh notifications
 * - Supports both JSON structured output and plain text display
 *
 * CHANGES FROM INK VERSION:
 * - Replaced Ink component routing with console.log formatting
 * - Added emoji indicators for different message types
 * - Enhanced readability with structured output
 * - Simplified message handling while maintaining functionality
 *
 * Architecture:
 * - Shared interface with WebSocket client for command system compatibility
 * - Mode detection determines output format and behavior
 * - Pipeline mode optimized for scripting and automation
 * - Interactive mode optimized for console-based terminal UI experience
 * - Callback system for world refresh notifications
 *
 * Usage:
 * - Pipeline: new CLIClientConnection(false) - direct output
 * - Interactive: new CLIClientConnection(true, refreshCallback) - formatted console output
 */

import { ClientConnection } from '../../commands/events.js';

export class CLIClientConnection implements ClientConnection {
  private isInteractiveMode: boolean;
  private onWorldRefresh?: (refreshNeeded: boolean) => void;
  public isOpen: boolean = true;

  constructor(isInteractiveMode: boolean = true, onWorldRefresh?: (refreshNeeded: boolean) => void) {
    this.isInteractiveMode = isInteractiveMode;
    this.onWorldRefresh = onWorldRefresh;
  }

  send(data: string): void {
    if (!this.isOpen) {
      return;
    }

    if (this.isInteractiveMode) {
      // Interactive mode: parse JSON and route to Ink components
      try {
        const parsed = JSON.parse(data);
        this.handleInteractiveMessage(parsed);
      } catch (error) {
        // Fallback to raw output if JSON parsing fails
        console.log(data);
      }
    } else {
      // Pipeline mode: direct output for scripting
      this.handlePipelineMessage(data);
    }
  }

  private handleInteractiveMessage(message: any): void {
    // Check for world refresh requirement
    if (message.refreshWorld && this.onWorldRefresh) {
      this.onWorldRefresh(true);
    }

    // Format output for console display
    if (message.type === 'success') {
      console.log(`✅ ${message.message || 'Success'}`);
      if (message.data) {
        console.log('📄 Data:', JSON.stringify(message.data, null, 2));
      }
    } else if (message.type === 'error') {
      console.log(`❌ Error: ${message.error || message.message}`);
    } else if (message.type === 'command_result') {
      if (message.success) {
        console.log(`✅ ${message.message || 'Command completed'}`);
        if (message.data) {
          console.log('📄 Data:', JSON.stringify(message.data, null, 2));
        }
      } else {
        console.log(`❌ Command failed: ${message.error || message.message}`);
      }
    } else {
      // Unknown message type, output formatted
      console.log('📋 Response:', JSON.stringify(message, null, 2));
    }
  }

  private handlePipelineMessage(data: string): void {
    // Pipeline mode: clean, parseable output
    try {
      const parsed = JSON.parse(data);

      if (parsed.type === 'success') {
        console.log(parsed.message || 'Success');
        if (parsed.data) {
          console.log(JSON.stringify(parsed.data, null, 2));
        }
      } else if (parsed.type === 'error') {
        console.error('Error:', parsed.error || parsed.message);
      } else if (parsed.type === 'command_result') {
        if (parsed.success) {
          console.log(parsed.message || 'Command completed');
          if (parsed.data) {
            console.log(JSON.stringify(parsed.data, null, 2));
          }
        } else {
          console.error('Command failed:', parsed.error || parsed.message);
        }
      } else {
        // Unknown message type, output raw
        console.log(data);
      }

      // Check for world refresh requirement in pipeline mode
      if (parsed.refreshWorld && this.onWorldRefresh) {
        this.onWorldRefresh(true);
      }
    } catch (error) {
      // Not JSON, output as-is
      console.log(data);
    }
  }

  close(): void {
    this.isOpen = false;
  }
}

export default CLIClientConnection;
