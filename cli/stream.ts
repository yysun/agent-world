/**
 * CLI Streaming Module - Real-time Agent Response Display
 * 
 * Manages streaming display for CLI interface with real-time chunk accumulation,
 * visual feedback, and comprehensive event processing.
 *
 * FEATURES:
 * - Real-time streaming with visual feedback and state tracking
 * - Comprehensive event processing (chunk, end, error)
 * - Tool streaming output display for shell_cmd (stdout/stderr)
 * - Color-coded streaming indicators and status messages
 * - Enhanced tool display with Unicode icons and formatted names
 * - Tool output truncation at 50K characters
 * - Modular design for reuse across CLI components
 * - Event-driven display (no timer dependencies)
 * CHANGES:
 * - 2026-02-11: Enhanced tool display with icons, formatted names, stderr prefix, 50K truncation
 * - 2026-02-08: Added tool streaming support for shell_cmd real-time output display
 * - 2025-02-06: Track last streamed message to prevent duplicate MESSAGE events after streaming output
 */

import {
  formatToolName,
  getToolIcon,
  formatElapsed,
  type StatusLineManager,
} from './display.js';

// Color helpers
const gray = (text: string) => `\x1b[90m${text}\x1b[0m`;
const boldGreen = (text: string) => `\x1b[1m\x1b[32m${text}\x1b[0m`;
const cyan = (text: string) => `\x1b[36m${text}\x1b[0m`;
const yellow = (text: string) => `\x1b[33m${text}\x1b[0m`;
const green = (text: string) => `\x1b[32m${text}\x1b[0m`;
const red = (text: string) => `\x1b[31m${text}\x1b[0m`;
const error = (text: string) => `\x1b[1m\x1b[31m✗\x1b[0m ${text}`;

// Streaming state interface
export interface StreamingState {
  isActive: boolean;
  content: string;
  sender?: string;
  messageId?: string;
  lastStreamedMessageId?: string;
  lastStreamedContent?: string;
  lastStreamedSender?: string;
  lastStreamedAt?: number;
}

export function createStreamingState(): StreamingState {
  return {
    isActive: false,
    content: '',
    sender: undefined,
    messageId: undefined,
    lastStreamedMessageId: undefined,
    lastStreamedContent: undefined,
    lastStreamedSender: undefined,
    lastStreamedAt: undefined
  };
}

// Streaming event handlers
export function handleStreamingEvents(
  eventData: any,
  streaming: StreamingState,
  statusLine?: StatusLineManager
): void {
  // Handle tool streaming events first
  if (eventData.type === 'tool-stream') {
    handleToolStreamEvents(eventData);
    return;
  }

  // Handle chunk events
  if (eventData.type === 'chunk' && eventData.content) {
    if (!streaming.isActive) {
      streaming.isActive = true;
      streaming.content = '';
      streaming.sender = eventData.agentName || eventData.sender;
      streaming.messageId = eventData.messageId; // Set new messageId for this stream

      // Stop spinner — streaming content replaces the spinner
      statusLine?.setSpinner(null);
      statusLine?.pause();

      process.stdout.write(`\n${boldGreen(`● ${streaming.sender}`)} ${gray('is responding...')}`);
    }

    if (streaming.messageId === eventData.messageId) {
      // Clear the "is responding..." line on first content
      if (streaming.content === '') {
        // Move cursor to beginning of line and clear it
        process.stdout.write('\r\x1b[K');
        process.stdout.write(`${boldGreen(`● ${streaming.sender}:`)} `);
      }

      streaming.content += eventData.content;
      process.stdout.write(eventData.content);
    }
    return;
  }

  // Handle end events - finish streaming but keep messageId to prevent duplicate display
  if (eventData.type === 'end') {
    if (streaming.isActive && streaming.messageId === eventData.messageId) {
      streaming.lastStreamedMessageId = streaming.messageId;
      streaming.lastStreamedContent = streaming.content;
      streaming.lastStreamedSender = streaming.sender;
      streaming.lastStreamedAt = Date.now();
      process.stdout.write('\n\n'); // End the streaming line with extra newline for spacing
      streaming.isActive = false;
      streaming.content = '';
      streaming.sender = undefined;
      // Keep messageId temporarily to prevent duplicate display of the final message event

      // Resume status line after streaming ends
      statusLine?.resume();
    }
    return;
  }

  // Handle error events
  if (eventData.type === 'error') {
    if (streaming.isActive && streaming.messageId === eventData.messageId) {
      const errorMsg = eventData.error || 'Unknown error';
      process.stdout.write(`\n${error(`Error: ${errorMsg}`)}\n`);
      streaming.isActive = false;
      streaming.content = '';
      streaming.sender = undefined;
      // Keep messageId temporarily to prevent duplicate display

      // Resume status line after error
      statusLine?.resume();
    }
    return;
  }

}

// PHASE 2.2 ENHANCEMENT: Handle tool execution events (from world channel)
export function handleToolEvents(eventData: any): void {
  if (eventData.type === 'tool-start' && eventData.toolExecution) {
    // Tool start events are now implicit — status line handles the indicator
    resetToolStreamTracking();
    return;
  }

  if (eventData.type === 'tool-progress' && eventData.toolExecution) {
    const toolName = eventData.toolExecution.toolName;
    const icon = getToolIcon(toolName);
    const displayName = formatToolName(toolName);
    const agentName = eventData.agentName || eventData.sender || 'agent';
    console.log(`${cyan(agentName)} ${gray('continuing tool')} ${icon} ${yellow(displayName)} ${gray('...')}`);
    return;
  }

  if (eventData.type === 'tool-result' && eventData.toolExecution) {
    const { toolName, duration, resultSize } = eventData.toolExecution;
    const icon = getToolIcon(toolName);
    const displayName = formatToolName(toolName);
    const durationText = duration ? formatElapsed(duration) : 'done';
    const sizeText = resultSize ? `, ${resultSize} chars` : '';
    const agentName = eventData.agentName || eventData.sender || 'agent';
    console.log(`${cyan(agentName)} ${green('\u2713')} ${icon} ${yellow(displayName)} ${gray(`(${durationText}${sizeText})`)}`);
    return;
  }

  if (eventData.type === 'tool-error' && eventData.toolExecution) {
    const { toolName, error: toolError } = eventData.toolExecution;
    const icon = getToolIcon(toolName);
    const displayName = formatToolName(toolName);
    const agentName = eventData.agentName || eventData.sender || 'agent';
    console.log(`${error(`${agentName} ${icon} ${displayName} failed: ${toolError}`)}`);
    return;
  }
}

// Handle tool streaming events (real-time stdout/stderr from shell_cmd)
// Note: Module-level counters track a single tool execution at a time.
// resetToolStreamTracking() is called on each tool-start, so overlapping
// concurrent tool streams share (and potentially reset) the same counter.
const TOOL_STREAM_MAX_CHARS = 50_000;
let toolStreamCharCount = 0;
let toolStreamTruncated = false;

export function handleToolStreamEvents(eventData: any): void {
  if (eventData.type === 'tool-stream' && eventData.toolName === 'shell_cmd') {
    const stream = eventData.stream === 'stderr' ? 'stderr' : 'stdout';
    const prefix = stream === 'stderr' ? red('[stderr] ') : gray('[stdout] ');
    const content = eventData.content as string;

    // Track cumulative output and truncate if over limit
    if (toolStreamTruncated) return;

    toolStreamCharCount += content.length;
    if (toolStreamCharCount > TOOL_STREAM_MAX_CHARS) {
      toolStreamTruncated = true;
      process.stdout.write(`\n${yellow('[output truncated at 50K characters]')}\n`);
      return;
    }

    process.stdout.write(`${prefix}${content}`);
    return;
  }
}

/** Reset tool stream tracking (call on tool-start or new tool execution). */
export function resetToolStreamTracking(): void {
  toolStreamCharCount = 0;
  toolStreamTruncated = false;
}

// Handle world activity events (processing/idle states)
// Note: In interactive mode with status line, these are largely replaced by
// the status line manager. This function is kept for pipeline/debug scenarios.
export function handleActivityEvents(eventData: any): void {
  // Check for valid event types
  if (!eventData || (eventData.type !== 'response-start' && eventData.type !== 'response-end' && eventData.type !== 'idle')) {
    return;
  }

  const source = eventData.source || '';
  const pending = eventData.pendingOperations || 0;
  const activityId = eventData.activityId || 0;
  const activeSources = eventData.activeSources || [];
  const sourceName = source.startsWith('agent:') ? source.slice('agent:'.length) : source;

  // Debug-level activity logging — only outputs in debug/verbose scenarios.
  // In interactive mode, the status line manager handles all visual feedback.
  if (eventData.type === 'response-start') {
    const message = sourceName ? `${sourceName} started` : 'started';
    // Use stderr to avoid corrupting piped output in pipeline mode
    process.stderr.write(`${gray('[World]')} ${message} ${gray(`| pending: ${pending} | id: ${activityId}`)}\n`);
  } else if (eventData.type === 'idle' && pending === 0) {
    process.stderr.write(`${gray('[World]')} All complete ${gray(`| id: ${activityId}`)}\n`);
  } else if (eventData.type === 'response-end' && pending > 0 && activeSources.length > 0) {
    const activeList = activeSources.map((s: string) => s.startsWith('agent:') ? s.slice('agent:'.length) : s).join(', ');
    process.stderr.write(`${gray('[World]')} Active: ${activeList} ${gray(`(${pending} pending)`)}\n`);
  }
}

export function handleWorldEventWithStreaming(
  eventType: string,
  eventData: any,
  streaming: StreamingState,
  statusLine?: StatusLineManager
): boolean {
  // Skip user messages to prevent echo
  if (eventData.sender && (eventData.sender === 'human' || eventData.sender.startsWith('user'))) {
    return false;
  }

  // Handle streaming events
  if (eventType === 'sse') {
    handleStreamingEvents(eventData, streaming, statusLine);
    return true;
  }

  return false;
}

// Utility functions
export function resetStreamingState(streaming: StreamingState): void {
  streaming.isActive = false;
  streaming.content = '';
  streaming.sender = undefined;
  streaming.messageId = undefined;
  streaming.lastStreamedMessageId = undefined;
  streaming.lastStreamedContent = undefined;
  streaming.lastStreamedSender = undefined;
  streaming.lastStreamedAt = undefined;
}

export function isStreamingActive(streaming: StreamingState): boolean {
  return streaming.isActive;
}

