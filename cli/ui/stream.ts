/**
 * Streaming Display Module - Agent Response Streaming Management
 * 
 * Features:
 * - Real-time streaming display with token counting and visual indicators
 * - Enhanced streaming indicators: ● a1: sss... (↑110 ↓55 tokens)
 * - Multi-agent streaming coordination
 * - Streaming state management and cleanup
 * - Token usage tracking and display
 * - Error handling for streaming failures
 * 
 * Implementation:
 * - Consolidated streaming API with enhanced token count display format
 * - Visual indicators with animated dots and content preview
 * - Terminal positioning and line management for live updates
 * - Automatic cleanup and finalization when streaming completes
 * - Input/output token tracking with arrow indicators
 * 
 * Changes:
 * - Extracted from display.ts for better separation of concerns
 * - Maintained all streaming functionality with improved organization
 * - Added proper TypeScript interfaces and type safety
 * - Enhanced error handling and state management
 */

import { colors } from './colors';
import { logStreamingDebug, logError } from './logger';

// Streaming agent state interface
interface StreamingAgent {
  content: string;
  isActive: boolean;
  startTime: number;
  estimatedTokens: number;
  outputTokens: number;
}

// Streaming API interface
export interface StreamingAPI {
  activeAgents: Map<string, StreamingAgent>;
  isActive: boolean;
  displayLines: Map<string, string>;
  updateInterval: NodeJS.Timeout | null;
  addStreamingAgent: (agentName: string, estimatedInputTokens: number) => void;
  updateStreamingContent: (agentName: string, content: string) => void;
  showStreamingIndicator: (agentName: string, hasContent?: boolean) => void;
  startUpdateLoop: () => void;
  stopUpdateLoop: () => void;
  completeStreaming: (agentName: string, finalContent?: string, usage?: any) => void;
  getStreamingAgents: () => string[];
  getStreamingLine: (agentName: string) => { content: string } | null;
  endStreamingDisplay: () => Promise<{ agentName: string; content: string }[]>;
  resetStreamingState: () => void;
  isStreamingActive: () => boolean;
  errorStreaming: (agentName: string) => void;
  setOnStreamingStartCallback: (callback: (() => void) | null) => void;
}

// Global state for piped input detection (passed from display module)
let isPipedInputGlobal = false;

export function setIsPipedInput(isPiped: boolean): void {
  isPipedInputGlobal = isPiped;
}

// Consolidated streaming API with enhanced token display
export const streamingAPI: StreamingAPI = {
  activeAgents: new Map<string, StreamingAgent>(),
  isActive: false,
  displayLines: new Map<string, string>(),
  updateInterval: null as NodeJS.Timeout | null,

  addStreamingAgent: (agentName: string, estimatedInputTokens: number) => {
    streamingAPI.activeAgents.set(agentName, {
      content: '',
      isActive: true,
      startTime: Date.now(),
      estimatedTokens: estimatedInputTokens,
      outputTokens: 0
    });
    streamingAPI.isActive = true;
    streamingAPI.showStreamingIndicator(agentName);
    streamingAPI.startUpdateLoop();
  },

  updateStreamingContent: (agentName: string, content: string) => {
    const agent = streamingAPI.activeAgents.get(agentName);
    if (agent) {
      agent.content += content;
      // Rough token estimation: ~4 characters per token
      agent.outputTokens = Math.ceil(agent.content.length / 4);
      
      // Debug log for content accumulation
      logStreamingDebug('📝 CONTENT_CHUNK_ADDED', {
        agentName,
        chunkLength: content.length,
        totalLength: agent.content.length,
        chunkPreview: content.substring(0, 50),
        totalPreview: agent.content.substring(0, 100),
        chunkText: JSON.stringify(content.substring(0, 50))
      });
      
      streamingAPI.showStreamingIndicator(agentName, true);
    }
  },

  showStreamingIndicator: (agentName: string, hasContent = false) => {
    const agent = streamingAPI.activeAgents.get(agentName);
    if (!agent) return;

    const dots = ['●', '○', '◐', '◑'];
    const dotIndex = Math.floor(Date.now() / 500) % dots.length;
    const indicator = dots[dotIndex];

    const contentPreview = hasContent && agent.content.length > 0
      ? agent.content.substring(0, 20).replace(/\n/g, ' ') + '...'
      : 'responding...';

    // Show both input and output tokens
    const inputTokens = agent.estimatedTokens;
    const outputTokens = agent.outputTokens;
    const tokenDisplay = inputTokens > 0 || outputTokens > 0
      ? ` (↑${outputTokens} ↓${inputTokens} tokens)`
      : '';

    const line = `${colors.cyan(indicator)} ${agentName}: ${contentPreview}${colors.gray(tokenDisplay)}`;
    streamingAPI.displayLines.set(agentName, line);
  },

  startUpdateLoop: () => {
    if (streamingAPI.updateInterval) return;

    streamingAPI.updateInterval = setInterval(() => {
      if (streamingAPI.activeAgents.size === 0) {
        streamingAPI.stopUpdateLoop();
        return;
      }

      // Update streaming indicators
      for (const [agentName, agent] of streamingAPI.activeAgents) {
        if (agent.isActive) {
          streamingAPI.showStreamingIndicator(agentName, agent.content.length > 0);
        }
      }

      // Re-render streaming lines
      if (streamingAPI.displayLines.size > 0 && !isPipedInputGlobal) {
        process.stdout.write('\x1b[s'); // Save cursor position

        // Move up to overwrite streaming lines
        if (streamingAPI.displayLines.size > 0) {
          process.stdout.write(`\x1b[${streamingAPI.displayLines.size}A`);
        }

        // Clear and redraw each line
        for (const line of streamingAPI.displayLines.values()) {
          process.stdout.write('\x1b[2K'); // Clear line
          process.stdout.write(line + '\n');
        }

        process.stdout.write('\x1b[u'); // Restore cursor position
      }
    }, 500);
  },

  stopUpdateLoop: () => {
    if (streamingAPI.updateInterval) {
      clearInterval(streamingAPI.updateInterval);
      streamingAPI.updateInterval = null;
    }
  },

  completeStreaming: (agentName: string, finalContent?: string, usage?: any) => {
    const agent = streamingAPI.activeAgents.get(agentName);
    if (agent) {
      const beforeContent = agent.content;
      agent.isActive = false;
      if (finalContent) agent.content = finalContent;
      if (usage && usage.outputTokens) agent.outputTokens = usage.outputTokens;
      
      // Debug log for streaming completion
      logStreamingDebug('🏁 COMPLETE_STREAMING', {
        agentName,
        beforeContentLength: beforeContent.length,
        afterContentLength: agent.content.length,
        finalContentProvided: !!finalContent,
        usageProvided: !!usage,
        beforePreview: beforeContent.substring(0, 100),
        afterPreview: agent.content.substring(0, 100),
        finalContentPreview: finalContent?.substring(0, 100) || 'none'
      });
    }
    streamingAPI.displayLines.delete(agentName);

    // Check if all agents are done
    const hasActiveAgents = Array.from(streamingAPI.activeAgents.values()).some(a => a.isActive);
    
    // Debug log for all agents completion check
    logStreamingDebug('🔍 CHECK_ALL_AGENTS_DONE', {
      agentName,
      hasActiveAgents,
      totalAgents: streamingAPI.activeAgents.size,
      activeAgentsList: Array.from(streamingAPI.activeAgents.entries())
        .filter(([_, agent]) => agent.isActive)
        .map(([name, _]) => name)
    });
    
    if (!hasActiveAgents) {
      streamingAPI.isActive = false;
      streamingAPI.stopUpdateLoop();

      logStreamingDebug('🎯 ALL_STREAMING_COMPLETE', {
        totalAgents: streamingAPI.activeAgents.size,
        linesToClear: streamingAPI.displayLines.size,
        agentContents: Array.from(streamingAPI.activeAgents.entries()).map(([name, agent]) => ({
          name,
          contentLength: agent.content.length,
          contentPreview: agent.content.substring(0, 100)
        }))
      });

      // Clear any remaining streaming lines more thoroughly
      if (!isPipedInputGlobal) {
        const linesToClear = streamingAPI.displayLines.size;
        if (linesToClear > 0) {
          // Move cursor up to the beginning of streaming lines
          process.stdout.write(`\x1b[${linesToClear}A`);
          // Clear each line
          for (let i = 0; i < linesToClear; i++) {
            process.stdout.write('\x1b[2K'); // Clear entire line
            if (i < linesToClear - 1) process.stdout.write('\n'); // Move to next line except for the last one
          }
          // Position cursor at the beginning of the cleared area
          process.stdout.write('\r');
        }
      }
      streamingAPI.displayLines.clear();
    }
  },

  getStreamingAgents: () => Array.from(streamingAPI.activeAgents.keys()),

  getStreamingLine: (agentName: string) => {
    const agent = streamingAPI.activeAgents.get(agentName);
    return agent ? { content: agent.content } : null;
  },

  endStreamingDisplay: async () => {
    const results = Array.from(streamingAPI.activeAgents.entries()).map(([name, agent]) => ({
      agentName: name,
      content: agent.content
    }));
    
    // Debug log for end streaming display
    logStreamingDebug('📤 END_STREAMING_DISPLAY', {
      resultsCount: results.length,
      results: results.map(r => ({
        agentName: r.agentName,
        contentLength: r.content.length,
        contentPreview: r.content.substring(0, 100),
        isEmpty: r.content.trim() === ''
      }))
    });
    
    streamingAPI.activeAgents.clear();
    streamingAPI.isActive = false;
    return results;
  },

  resetStreamingState: () => {
    streamingAPI.stopUpdateLoop();
    streamingAPI.activeAgents.clear();
    streamingAPI.displayLines.clear();
    streamingAPI.isActive = false;
  },

  isStreamingActive: () => streamingAPI.isActive,

  errorStreaming: (agentName: string) => {
    const agent = streamingAPI.activeAgents.get(agentName);
    if (agent) {
      agent.isActive = false;
    }
    streamingAPI.displayLines.delete(agentName);
  },

  setOnStreamingStartCallback: (callback: (() => void) | null) => {
    // Implementation handled by existing state.streaming callbacks
  }
};

// Export the streaming API as the default streaming interface
export const streaming = streamingAPI;

// Convenience functions for external use
export function startStreaming(agentName: string, displayName: string, estimatedInputTokens?: number): void {
  logStreamingDebug('🚀 START_STREAMING', {
    agentName,
    displayName,
    estimatedInputTokens: estimatedInputTokens || 0
  });
  streaming.addStreamingAgent(agentName, estimatedInputTokens || 0);
}

export function addStreamingContent(agentName: string, content: string): void {
  streaming.updateStreamingContent(agentName, content);
}

export function endStreaming(agentName: string): void {
  logStreamingDebug('🛑 END_STREAMING', { agentName });
  streaming.completeStreaming(agentName);
}

export function markStreamingError(agentName: string): void {
  streaming.errorStreaming(agentName);
}

export function setStreamingUsage(agentName: string, usage: { inputTokens: number; outputTokens: number; totalTokens: number }): void {
  const line = streaming.getStreamingLine(agentName);
  logStreamingDebug('📊 SET_STREAMING_USAGE', {
    agentName,
    usage,
    lineExists: !!line,
    lineContent: line ? `${line.content.length} chars` : 'none',
    linePreview: line?.content.substring(0, 100) || 'none'
  });
  if (line) {
    streaming.completeStreaming(agentName, line.content, usage);
  }
}

export function isStreamingActive(): boolean {
  return streaming.isStreamingActive();
}

export function resetStreamingState(): void {
  streaming.resetStreamingState();
}

export function getStreamingAgents(): string[] {
  return streaming.getStreamingAgents();
}

export function getStreamingLine(agentName: string): { content: string } | null {
  return streaming.getStreamingLine(agentName);
}

export async function endStreamingDisplay(): Promise<{ agentName: string; content: string }[]> {
  return streaming.endStreamingDisplay();
}
