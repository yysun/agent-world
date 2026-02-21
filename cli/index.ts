#!/usr/bin/env node

/*
 * cli/index.ts
 * Summary: CLI entrypoint and interactive world subscription logic with event-driven prompt display.
 * Implementation: Uses subscribeWorld to obtain a managed WorldSubscription, then subscribes directly to world.eventEmitter for CLI-specific handling.
 * Architecture: Event-driven prompt display using world activity events instead of timers.
 * 
 * Features:
 * - World selection with "From file..." option for importing worlds from external folders
 * - Load and import worlds from file storage with confirmation and overwrite protection
 * - Complete data migration including world config, agents, chats, and events
 * - Support for multiple worlds in import folder with selection menu
 * - Work with loaded world without importing (uses external storage path)
 * 
 * Changes:
 * - 2026-02-20: Enforced options-only HITL handling in interactive and pipeline modes.
 * - 2026-02-14: Added interactive + pipeline HITL option response handling for generic approval requests.
 * - 2026-02-11: Fixed tool-stream timeout: extendTimeout() resets idle timeout on streaming data
 * - 2026-02-11: Pipeline mode now listens for tool-stream SSE events to extend timeout
 * - 2026-02-21: Extended timeout-refresh detection to include shell assistant-stream SSE events (`start`/`chunk`/`end` with `toolName='shell_cmd'`) in addition to legacy `tool-stream`.
 * - 2026-01-09: Added --streaming flag for explicit streaming control (overrides TTY auto-detection)
 * - 2025-02-06: Prevented duplicate MESSAGE output when streaming already rendered agent responses
 * - 2025-11-01: Added multi-world selection in loadWorldFromFile
 * - 2025-11-01: Allow working with external worlds without importing
 * - 2025-11-01: Changed selectWorld return type to support external path tracking
 * - 2025-11-01: Added loadWorldFromFile function for importing worlds from external folders
 * - 2025-11-01: Enhanced selectWorld with "(From file...)" option and async support
 */

// Load environment variables from .env file
import dotenv from 'dotenv';
dotenv.config({ quiet: true });

/**
 * Agent World CLI Entry Point - Dual-Mode Console Interface
 *
 * Provides pipeline and interactive modes with unified subscription system,
 * real-time streaming, and comprehensive world management.
 *
 * FEATURES:
 * - Pipeline Mode: Execute commands and exit with pure event-driven completion tracking
 *   - Uses world activity events (response-start, response-end, idle) for completion detection
 *   - No visible activity progress (clean output for scripting)
 *   - Extended timeout (120s) with quick exit on no activity (2s)
 *   - Silent timeout handling (no error messages for clean pipelines)
 *   - Streaming disabled by default (can be enabled with --streaming flag)
 * - Interactive Mode: Real-time console interface with streaming responses
 *   - Full activity progress display with world events, tool execution, and streaming
 *   - Event-driven prompt display using world idle events
 *   - Streaming enabled by default (can be disabled with --no-streaming flag)
 * - Unified Subscription: Both modes use subscribeWorld for consistent event handling
 * - World Management: Auto-discovery and interactive selection
 * - Real-time Streaming: Live agent responses via stream.ts module
 *   - Controlled via --streaming / --no-streaming flags
 *   - Auto-detected from TTY when flag not specified
 * - Color Helpers: Consistent styling with simplified color functions
 * - Debug Logging: Configurable log levels using core logger module
 * - Environment Variables: Automatically loads .env file for API keys and configuration
 *
 * ARCHITECTURE:
 * - Uses commander.js for argument parsing and mode detection
 * - Uses subscribeWorld for all world management in both modes
 * - Implements ClientConnection interface for console-based event handling
 * - Uses readline for interactive input with proper cleanup
 * - Delegates streaming display to stream.ts module for real-time chunk accumulation
 * - Uses core logger for structured debug logging with configurable levels
 * - Event-driven prompt display: listens to world 'idle' events instead of using timers
 * - WorldActivityMonitor tracks agent processing and signals when world becomes idle
 *
 * USAGE:
 * Pipeline: cli --root /data/worlds --world myworld --command "/clear agent1"
 * Pipeline: cli --root /data/worlds --world myworld "Hello, world!"
 * Pipeline: echo "Hello, world!" | cli --root /data/worlds --world myworld
 * Pipeline with streaming: echo "Hello" | cli --world myworld --streaming
 * Interactive: cli --root /data/worlds --world myworld
 * Interactive without streaming: cli --world myworld --no-streaming
 * Debug Mode: cli --root /data/worlds --world myworld --logLevel debug
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { program } from 'commander';
import readline from 'readline';
import {
  listWorlds,
  subscribeWorld,
  submitWorldHitlResponse,
  ClientConnection,
  createCategoryLogger,
  LLMProvider,
  enableStreaming,
  disableStreaming,
  type WorldActivityEventPayload,
  type WorldActivityEventType
} from '../core/index.js';
import { World, EventType } from '../core/types.js';
import { getDefaultRootPath } from '../core/storage/storage-factory.js';
import { processCLIInput, displayChatMessages } from './commands.js';
import {
  StreamingState,
  createStreamingState,
  handleWorldEventWithStreaming,
  handleToolEvents,
} from './stream.js';
import { configureLLMProvider } from '../core/llm-config.js';
import {
  createStatusLineManager,
  type StatusLineManager,
  formatToolName,
  getToolIcon,
  log as statusLog,
} from './display.js';
import {
  parseHitlPromptRequest,
  resolveHitlOptionSelectionInput,
  type HitlOptionRequestPayload,
} from './hitl.js';

// Create CLI category logger after logger auto-initialization
const logger = createCategoryLogger('cli');

// Event name constants - using typed EventType enum from core/types.ts

// Event payload types
interface MessageEventPayload {
  sender: string;
  content: string;
  tool_calls?: Array<{
    id: string;
    type?: string;
    function?: {
      name: string;
      arguments?: string;
    };
  }>;
  [key: string]: any;
}

interface SystemEventPayload {
  message?: string;
  content?: string;
  chatId?: string | null;
  [key: string]: any;
}

// State management for interactive mode
interface GlobalState {
  awaitingResponse: boolean;
  hitlPromptActive: boolean;
  world?: any;
}

function createGlobalState(): GlobalState {
  return {
    awaitingResponse: false,
    hitlPromptActive: false
  };
}

// Color helpers - consolidated styling API
const red = (text: string) => `\x1b[31m${text}\x1b[0m`;
const green = (text: string) => `\x1b[32m${text}\x1b[0m`;
const yellow = (text: string) => `\x1b[33m${text}\x1b[0m`;
const blue = (text: string) => `\x1b[34m${text}\x1b[0m`;
const magenta = (text: string) => `\x1b[35m${text}\x1b[0m`;
const cyan = (text: string) => `\x1b[36m${text}\x1b[0m`;
const gray = (text: string) => `\x1b[90m${text}\x1b[0m`;
const bold = (text: string) => `\x1b[1m${text}\x1b[0m`;

const boldRed = (text: string) => `\x1b[1m\x1b[31m${text}\x1b[0m`;
const boldGreen = (text: string) => `\x1b[1m\x1b[32m${text}\x1b[0m`;
const boldYellow = (text: string) => `\x1b[1m\x1b[33m${text}\x1b[0m`;
const boldBlue = (text: string) => `\x1b[1m\x1b[34m${text}\x1b[0m`;
const boldMagenta = (text: string) => `\x1b[1m\x1b[35m${text}\x1b[0m`;
const boldCyan = (text: string) => `\x1b[1m\x1b[36m${text}\x1b[0m`;

const success = (text: string) => `${boldGreen('✓')} ${text}`;
const error = (text: string) => `${boldRed('✗')} ${text}`;
const bullet = (text: string) => `${gray('•')} ${text}`;

type ActivityEventState = WorldActivityEventType;

interface ActivityEventSnapshot {
  activityId: number;
  type: ActivityEventState | null;
}

interface IdleWaiter {
  activityId: number;
  resolveCallback: () => void;
  rejectCallback: (error: Error) => void;
  seenProcessing: boolean;
  timeoutId?: ReturnType<typeof setTimeout>;
  noActivityTimeoutId?: ReturnType<typeof setTimeout>;
  timeoutMs: number;
}

class WorldActivityMonitor {
  private lastEvent: (WorldActivityEventPayload & { timestampMs: number }) | null = null;
  private waiters: Set<IdleWaiter> = new Set();

  captureSnapshot(): ActivityEventSnapshot {
    return {
      activityId: this.lastEvent?.activityId ?? 0,
      type: this.lastEvent?.type ?? null
    };
  }

  handle(event: WorldActivityEventPayload): void {
    // Check for valid event types
    if (!event || (event.type !== 'response-start' && event.type !== 'response-end' && event.type !== 'idle')) {
      return;
    }

    const timestampMsRaw = event.timestamp ? Date.parse(event.timestamp) : Date.now();
    const timestampMs = Number.isFinite(timestampMsRaw) ? timestampMsRaw : Date.now();

    this.lastEvent = {
      ...event,
      timestampMs
    };

    for (const waiter of Array.from(this.waiters)) {
      // Track when we see response-start after the target activity
      if (event.type === 'response-start' && event.activityId > waiter.activityId) {
        waiter.seenProcessing = true;
        if (waiter.noActivityTimeoutId) {
          clearTimeout(waiter.noActivityTimeoutId);
          waiter.noActivityTimeoutId = undefined;
        }
      }

      // Resolve waiter on idle event if conditions are met
      if (event.type === 'idle') {
        const shouldResolve = event.activityId > waiter.activityId ||
          (event.activityId === waiter.activityId && waiter.seenProcessing);

        if (shouldResolve) {
          this.finishWaiter(waiter, true);
        }
      }
    }
  }

  async waitForIdle(options: {
    snapshot?: ActivityEventSnapshot;
    timeoutMs?: number;
    noActivityTimeoutMs?: number;
  } = {}): Promise<void> {
    const {
      snapshot = this.captureSnapshot(),
      timeoutMs = 120_000, // Default 2 minutes for complex operations
      noActivityTimeoutMs = 2_000 // Default 2 seconds for quick exit
    } = options;

    const targetActivityId = snapshot.activityId;

    // Already idle after target activity
    if (this.lastEvent && this.lastEvent.type === 'idle' && this.lastEvent.activityId > targetActivityId) {
      return;
    }

    return new Promise<void>((resolve, reject) => {
      const waiter: IdleWaiter = {
        activityId: targetActivityId,
        resolveCallback: () => {
          cleanup();
          resolve();
        },
        rejectCallback: (error: Error) => {
          cleanup();
          reject(error);
        },
        seenProcessing: false,
        timeoutMs
      };

      const cleanup = () => {
        if (waiter.timeoutId) {
          clearTimeout(waiter.timeoutId);
          waiter.timeoutId = undefined;
        }
        if (waiter.noActivityTimeoutId) {
          clearTimeout(waiter.noActivityTimeoutId);
          waiter.noActivityTimeoutId = undefined;
        }
        this.waiters.delete(waiter);
      };

      const last = this.lastEvent;
      if (!last) {
        waiter.noActivityTimeoutId = setTimeout(() => this.finishWaiter(waiter, true), noActivityTimeoutMs);
      } else {
        // Track if we've seen response-start after target activity
        if (last.type === 'response-start' && last.activityId > targetActivityId) {
          waiter.seenProcessing = true;
        }

        // If already idle at target activity, set short timeout
        if (last.type === 'idle' && last.activityId === targetActivityId) {
          waiter.noActivityTimeoutId = setTimeout(() => this.finishWaiter(waiter, true), noActivityTimeoutMs);
        }

        // If already idle after target activity, resolve immediately
        if (last.type === 'idle' && last.activityId > targetActivityId) {
          resolve();
          return;
        }
      }

      waiter.timeoutId = setTimeout(() => {
        this.finishWaiter(waiter, false, new Error('Timed out waiting for world to become idle'));
      }, timeoutMs);

      this.waiters.add(waiter);
    });
  }

  reset(reason: string = 'World subscription reset'): void {
    const error = new Error(reason);
    for (const waiter of Array.from(this.waiters)) {
      this.finishWaiter(waiter, false, error);
    }
    this.lastEvent = null;
  }

  /**
   * Extend timeout for all active waiters.
   * Called when streaming data arrives to prevent premature timeout.
   */
  extendTimeout(): void {
    for (const waiter of this.waiters) {
      // Reset the main timeout
      if (waiter.timeoutId) {
        clearTimeout(waiter.timeoutId);
        waiter.timeoutId = setTimeout(() => {
          this.finishWaiter(waiter, false, new Error('Timed out waiting for world to become idle'));
        }, waiter.timeoutMs);
      }
      // Clear noActivity timeout since we have activity
      if (waiter.noActivityTimeoutId) {
        clearTimeout(waiter.noActivityTimeoutId);
        waiter.noActivityTimeoutId = undefined;
      }
    }
  }

  getActiveSources(): string[] {
    return this.lastEvent?.activeSources ?? [];
  }

  private finishWaiter(waiter: IdleWaiter, resolve: boolean, error?: Error): void {
    if (!this.waiters.has(waiter)) {
      return;
    }

    if (waiter.timeoutId) {
      clearTimeout(waiter.timeoutId);
      waiter.timeoutId = undefined;
    }
    if (waiter.noActivityTimeoutId) {
      clearTimeout(waiter.noActivityTimeoutId);
      waiter.noActivityTimeoutId = undefined;
    }

    this.waiters.delete(waiter);

    if (resolve) {
      waiter.resolveCallback();
    } else {
      waiter.rejectCallback(error ?? new Error('World activity waiter cancelled'));
    }
  }
}

function parseActivitySource(source?: string): { type: 'agent' | 'message'; name: string } | null {
  if (!source) return null;
  if (source.startsWith('agent:')) {
    return { type: 'agent', name: source.slice('agent:'.length) };
  }
  if (source.startsWith('message:')) {
    return { type: 'message', name: source.slice('message:'.length) };
  }
  return null;
}

async function promptHitlOptionSelection(
  request: HitlOptionRequestPayload,
  statusLine: StatusLineManager,
  rl: readline.Interface
): Promise<string> {
  const fallbackOptionId = request.defaultOptionId;
  statusLine.pause();
  try {
    while (true) {
      console.log(`\n${boldMagenta('Approval Required')}`);
      console.log(`${boldCyan(request.title)}`);
      if (request.message) {
        console.log(gray(request.message));
      }
      console.log(gray('Select an option:'));
      request.options.forEach((option, index) => {
        const isDefault = option.id === fallbackOptionId;
        const defaultSuffix = isDefault ? gray(' (default)') : '';
        console.log(`  ${yellow(String(index + 1) + '.')} ${option.label}${defaultSuffix}`);
        if (option.description) {
          console.log(`     ${gray(option.description)}`);
        }
      });

      const answer = await new Promise<string>((resolve) => {
        rl.question(`${boldMagenta('Choice (number or option id):')} `, (input) => resolve(input.trim()));
      });

      const resolvedOptionId = resolveHitlOptionSelectionInput(
        request.options,
        answer,
        fallbackOptionId
      );
      if (resolvedOptionId) {
        return resolvedOptionId;
      }

      console.log(boldRed('Invalid selection. Please choose a listed option.'));
    }
  } finally {
    statusLine.resume();
  }
}

// LLM Provider configuration from environment variables
function configureLLMProvidersFromEnv(): void {
  // OpenAI
  if (process.env.OPENAI_API_KEY) {
    configureLLMProvider(LLMProvider.OPENAI, {
      apiKey: process.env.OPENAI_API_KEY
    });
    logger.debug('Configured OpenAI provider from environment');
  }

  // Anthropic
  if (process.env.ANTHROPIC_API_KEY) {
    configureLLMProvider(LLMProvider.ANTHROPIC, {
      apiKey: process.env.ANTHROPIC_API_KEY
    });
    logger.debug('Configured Anthropic provider from environment');
  }

  // Google
  if (process.env.GOOGLE_API_KEY) {
    configureLLMProvider(LLMProvider.GOOGLE, {
      apiKey: process.env.GOOGLE_API_KEY
    });
    logger.debug('Configured Google provider from environment');
  }

  // Azure
  if (process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_RESOURCE_NAME && process.env.AZURE_OPENAI_DEPLOYMENT_NAME) {
    configureLLMProvider(LLMProvider.AZURE, {
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      resourceName: process.env.AZURE_OPENAI_RESOURCE_NAME,
      deployment: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-10-21-preview'
    });
    logger.debug('Configured Azure provider from environment');
  }

  // XAI
  if (process.env.XAI_API_KEY) {
    configureLLMProvider(LLMProvider.XAI, {
      apiKey: process.env.XAI_API_KEY
    });
    logger.debug('Configured XAI provider from environment');
  }

  // OpenAI Compatible
  if (process.env.OPENAI_COMPATIBLE_API_KEY && process.env.OPENAI_COMPATIBLE_BASE_URL) {
    configureLLMProvider(LLMProvider.OPENAI_COMPATIBLE, {
      apiKey: process.env.OPENAI_COMPATIBLE_API_KEY,
      baseUrl: process.env.OPENAI_COMPATIBLE_BASE_URL
    });
    logger.debug('Configured OpenAI-Compatible provider from environment');
  }

  // Ollama (OpenAI-compatible endpoint)
  if (process.env.OLLAMA_BASE_URL) {
    configureLLMProvider(LLMProvider.OLLAMA, {
      baseUrl: process.env.OLLAMA_BASE_URL
    });
    logger.debug('Configured Ollama provider (OpenAI-compatible) from environment');
  } else {
    // Configure Ollama with default OpenAI-compatible URL if not specified
    configureLLMProvider(LLMProvider.OLLAMA, {
      baseUrl: 'http://localhost:11434/v1'
    });
    logger.debug('Configured Ollama provider (OpenAI-compatible) with default URL');
  }
}

// Get default root path from storage-factory (no local defaults)
const DEFAULT_ROOT_PATH = getDefaultRootPath();

interface CLIOptions {
  root?: string;
  world?: string;
  command?: string;
  logLevel?: string;
}

// Helper to print CLI results in a user-friendly way
function printCLIResult(result: any) {
  if (result.success) {
    if (result.message) console.log(success(result.message));
    if (result.data && typeof result.data === 'string') console.log(result.data);
  } else {
    if (result.message) console.log(error(result.message));
    if (result.error && result.error !== result.message) console.log(error(result.error));
  }
}

/**
 * Attach CLI event listeners to world EventEmitter
 * 
 * @param world - World instance to attach listeners to
 * @param streaming - Streaming state for interactive mode (null for pipeline mode)
 * @param globalState - Global state for interactive mode (null for pipeline mode)
 * @param activityMonitor - Activity monitor for tracking world events
 * @param statusLine - Status line manager for interactive display (null for pipeline mode)
 * @param rl - Readline interface for interactive mode (undefined for pipeline mode)
 * @returns Map of event types to listener functions for cleanup
 */
function attachCLIListeners(
  world: World,
  streaming: StreamingState | null,
  globalState: GlobalState | null,
  activityMonitor: WorldActivityMonitor,
  statusLine: StatusLineManager | null,
  rl?: readline.Interface
): Map<string, (...args: any[]) => void> {
  const listeners = new Map<string, (...args: any[]) => void>();
  let hitlPromptChain: Promise<void> = Promise.resolve();

  // World activity events
  const worldListener = (eventData: WorldActivityEventPayload) => {
    activityMonitor.handle(eventData);
    // Only render activity progress in interactive mode
    if (streaming && globalState && rl && statusLine) {
      handleWorldEvent(EventType.WORLD, eventData, streaming, globalState, activityMonitor, statusLine, rl)
        .catch(err => console.error('Error handling world event:', err));
    }
    // Pipeline mode: silently track events for completion detection
  };
  world.eventEmitter.on(EventType.WORLD, worldListener);
  listeners.set(EventType.WORLD, worldListener);

  // Message events
  const messageListener = (eventData: MessageEventPayload) => {
    if (eventData.content &&
      typeof eventData.content === 'string' &&
      eventData.content.includes('Success message sent')) return;

    if (streaming && globalState && rl && statusLine) {
      handleWorldEvent(EventType.MESSAGE, eventData, streaming, globalState, activityMonitor, statusLine, rl)
        .catch(err => console.error('Error handling message event:', err));
    } else {
      // Pipeline mode: simple console output
      if (eventData.sender === 'system') {
        console.log(`${boldRed('● system:')} ${eventData.content}`);
      }
      if (eventData.content) {
        console.log(`${boldGreen('● ' + (eventData.sender || 'agent') + ':')} ${eventData.content}`);
      }
    }
  };
  world.eventEmitter.on(EventType.MESSAGE, messageListener);
  listeners.set(EventType.MESSAGE, messageListener);

  // SSE events (interactive mode only - pipeline mode uses non-streaming LLM calls)
  if (streaming && globalState && rl && statusLine) {
    const sseListener = (eventData: any) => {
      // Extend timeout when long-running shell stream activity arrives.
      const isLegacyToolStream = eventData.type === 'tool-stream';
      const isShellAssistantStream = eventData.toolName === 'shell_cmd' &&
        (eventData.type === 'start' || eventData.type === 'chunk' || eventData.type === 'end');
      if (isLegacyToolStream || isShellAssistantStream) {
        activityMonitor.extendTimeout();
      }
      handleWorldEvent(EventType.SSE, eventData, streaming, globalState, activityMonitor, statusLine, rl)
        .catch(err => console.error('Error handling SSE event:', err));
    };
    world.eventEmitter.on(EventType.SSE, sseListener);
    listeners.set(EventType.SSE, sseListener);
  } else {
    // Pipeline mode: listen for shell stream events to extend timeout on long-running commands.
    const sseTimeoutListener = (eventData: any) => {
      const isLegacyToolStream = eventData.type === 'tool-stream';
      const isShellAssistantStream = eventData.toolName === 'shell_cmd' &&
        (eventData.type === 'start' || eventData.type === 'chunk' || eventData.type === 'end');
      if (isLegacyToolStream || isShellAssistantStream) {
        activityMonitor.extendTimeout();
      }
    };
    world.eventEmitter.on(EventType.SSE, sseTimeoutListener);
    listeners.set(EventType.SSE, sseTimeoutListener);
  }

  // System events
  const systemListener = (eventData: SystemEventPayload) => {
    const hitlRequest = parseHitlPromptRequest(eventData);
    if (hitlRequest) {
      hitlPromptChain = hitlPromptChain
        .then(async () => {
          if (streaming && globalState && rl && statusLine) {
            globalState.hitlPromptActive = true;
            try {
              const result = submitWorldHitlResponse({
                worldId: world.id,
                requestId: hitlRequest.requestId,
                optionId: await promptHitlOptionSelection(hitlRequest, statusLine, rl),
                chatId: hitlRequest.chatId,
              });
              if (!result.accepted) {
                statusLine.pause();
                console.log(boldRed(`Failed to submit approval response: ${result.reason || 'unknown error'}`));
                statusLine.resume();
                return;
              }
              statusLine.pause();
              console.log(green('Submitted HITL option response.'));
              statusLine.resume();
              return;
            } finally {
              globalState.hitlPromptActive = false;
            }
          }

          // Pipeline/non-interactive mode: auto-respond with default option to avoid blocking.
          const result = submitWorldHitlResponse({
            worldId: world.id,
            requestId: hitlRequest.requestId,
            optionId: hitlRequest.defaultOptionId,
            chatId: hitlRequest.chatId,
          });
          if (!result.accepted) {
            console.error(boldRed(`Failed to auto-respond HITL request: ${result.reason || 'unknown error'}`));
            return;
          }
          console.log(`${gray('● system:')} Auto-selected HITL option "${hitlRequest.defaultOptionId}"`);
        })
        .catch((error) => {
          console.error(boldRed(`Error handling HITL request: ${error instanceof Error ? error.message : String(error)}`));
        });
      return;
    }

    if (eventData.content &&
      typeof eventData.content === 'string' &&
      eventData.content.includes('Success message sent')) return;
    if (streaming && globalState && rl && statusLine) {
      handleWorldEvent(EventType.SYSTEM, eventData, streaming, globalState, activityMonitor, statusLine, rl)
        .catch(err => console.error('Error handling system event:', err));
    } else if (eventData.message || eventData.content) {
      // Pipeline mode: system messages are handled by message listener
    }
  };
  world.eventEmitter.on(EventType.SYSTEM, systemListener);
  listeners.set(EventType.SYSTEM, systemListener);

  return listeners;
}

/**
 * Cleanup CLI event listeners from world EventEmitter
 * 
 * @param world - World instance to remove listeners from
 * @param listeners - Map of event types to listener functions
 */
function detachCLIListeners(
  world: World,
  listeners: Map<string, (...args: any[]) => void>
): void {
  for (const [eventType, listener] of listeners.entries()) {
    world.eventEmitter.removeListener(eventType, listener);
  }
  listeners.clear();
}

// Pipeline mode execution with event-driven completion tracking
async function runPipelineMode(options: CLIOptions, messageFromArgs: string | null): Promise<void> {
  let world: World | null = null;
  let worldSubscription: any = null;
  let cliListeners: Map<string, (...args: any[]) => void> | null = null;
  const activityMonitor = new WorldActivityMonitor();

  try {

    if (options.world) {
      // Subscribe to world lifecycle but do not request forwarding callbacks
      worldSubscription = await subscribeWorld(options.world, { isOpen: true });
      if (!worldSubscription) {
        console.error(boldRed(`Error: World '${options.world}' not found`));
        process.exit(1);
      }
      world = worldSubscription.world as World;

      // Attach direct listeners to the world.eventEmitter for pipeline handling
      // Note: Pipeline mode uses non-streaming LLM calls, so SSE events are not needed
      cliListeners = attachCLIListeners(world, null, null, activityMonitor, null);
    }

    // Execute command from --command option
    if (options.command) {
      if (!options.command.startsWith('/') && !world) {
        console.error(boldRed('Error: World must be specified to send user messages'));
        process.exit(1);
      }
      const snapshot = activityMonitor.captureSnapshot();
      const result = await processCLIInput(options.command, world, 'human');
      printCLIResult(result);

      if (!options.command.startsWith('/') && world) {
        try {
          // Event-driven completion: wait for world idle state
          await activityMonitor.waitForIdle({
            snapshot,
            timeoutMs: 120_000, // Extended timeout for complex operations
            noActivityTimeoutMs: 2_000 // Quick exit if no activity detected
          });
        } catch (error) {
          // Silent exit on timeout - events may have completed
          logger.debug('Pipeline mode completion timeout', { error: (error as Error).message });
        }
      } else {
        if (worldSubscription) worldSubscription.unsubscribe();
        process.exit(result.success ? 0 : 1);
      }

      if (!result.success) {
        setTimeout(() => process.exit(1), 100);
        return;
      }
    }

    // Execute message from args
    if (messageFromArgs) {
      if (!world) {
        console.error(boldRed('Error: World must be specified to send user messages'));
        process.exit(1);
      }
      const snapshot = activityMonitor.captureSnapshot();
      const result = await processCLIInput(messageFromArgs, world, 'human');
      printCLIResult(result);

      try {
        // Event-driven completion: wait for world idle state
        await activityMonitor.waitForIdle({
          snapshot,
          timeoutMs: 120_000,
          noActivityTimeoutMs: 2_000
        });
      } catch (error) {
        // Silent exit on timeout - events may have completed
        logger.debug('Pipeline mode completion timeout', { error: (error as Error).message });
      }

      if (!result.success) {
        setTimeout(() => process.exit(1), 100);
        return;
      }
    }

    // Handle stdin input
    if (!process.stdin.isTTY) {
      let input = '';
      process.stdin.setEncoding('utf8');
      for await (const chunk of process.stdin) input += chunk;

      if (input.trim()) {
        if (!world) {
          console.error(boldRed('Error: World must be specified to send user messages'));
          process.exit(1);
        }
        const snapshot = activityMonitor.captureSnapshot();
        const result = await processCLIInput(input.trim(), world, 'HUMAN');
        printCLIResult(result);

        try {
          // Event-driven completion: wait for world idle state
          await activityMonitor.waitForIdle({
            snapshot,
            timeoutMs: 120_000,
            noActivityTimeoutMs: 2_000
          });
        } catch (error) {
          // Silent exit on timeout - events may have completed
          logger.debug('Pipeline mode completion timeout', { error: (error as Error).message });
        }

        if (!result.success) {
          setTimeout(() => process.exit(1), 100);
          return;
        }
        return;
      }
    }

    if (!options.command && !messageFromArgs) {
      program.help();
    }

    if (worldSubscription) {
      if (cliListeners && world) {
        detachCLIListeners(world, cliListeners);
      }
      await worldSubscription.unsubscribe();
    }
    process.exit(0);
  } catch (error) {
    console.error(boldRed('Error:'), error instanceof Error ? error.message : error);
    if (worldSubscription) {
      if (cliListeners && world) {
        detachCLIListeners(world, cliListeners);
      }
      await worldSubscription.unsubscribe();
    }
    process.exit(1);
  }
}

interface WorldState {
  subscription: any;
  world: World;
}

function cleanupWorldSubscription(worldState: WorldState | null): void {
  if (worldState?.subscription) {
    worldState.subscription.unsubscribe();
  }
}

/**
 * Subscribe to world and attach CLI event listeners for interactive mode
 * 
 * @param rootPath - Root path for world storage (unused, kept for compatibility)
 * @param worldName - Name of the world to subscribe to
 * @param streaming - Streaming state for real-time response display
 * @param globalState - Global state for timer management
 * @param activityMonitor - Activity monitor for tracking world events
 * @param statusLine - Status line manager for interactive display
 * @param rl - Readline interface for interactive input
 * @returns WorldState with subscription and world instance
 */
async function handleSubscribe(
  rootPath: string,
  worldName: string,
  streaming: StreamingState,
  globalState: GlobalState,
  activityMonitor: WorldActivityMonitor,
  statusLine: StatusLineManager,
  rl?: readline.Interface
): Promise<WorldState | null> {
  // Subscribe to world lifecycle but do not request forwarding callbacks
  const subscription = await subscribeWorld(worldName, { isOpen: true });
  if (!subscription) throw new Error('Failed to load world');

  const world = subscription.world as World;

  // Store world in globalState for access in interactive event handlers.
  if (globalState) {
    globalState.world = world;
  }

  // Attach direct listeners to the world.eventEmitter for CLI handling
  // Interactive mode needs all event types including SSE for streaming responses
  attachCLIListeners(world, streaming, globalState, activityMonitor, statusLine, rl);

  return { subscription, world };
}

// Handle world events with streaming support
async function handleWorldEvent(
  eventType: string,
  eventData: any,
  streaming: StreamingState,
  globalState: GlobalState,
  activityMonitor: WorldActivityMonitor,
  statusLine: StatusLineManager,
  rl?: readline.Interface
): Promise<void> {
  if (eventType === 'world') {
    const payload = eventData as any;
    // Handle activity events (new format: type = 'response-start' | 'response-end' | 'idle')
    if (payload.type === 'response-start' || payload.type === 'response-end' || payload.type === 'idle') {
      activityMonitor.handle(payload as WorldActivityEventPayload);

      // Update status line based on activity events
      const details = parseActivitySource(payload.source);
      const agentName = details?.type === 'agent' ? details.name : payload.source || '';

      if (payload.type === 'response-start' && agentName) {
        statusLine.setSpinner(`${agentName} is thinking...`);
        statusLine.startElapsedTimer();
        // Update agent list from activeSources
        if (payload.activeSources) {
          const agentEntries = payload.activeSources
            .map((s: string) => parseActivitySource(s))
            .filter((d: any) => d?.type === 'agent')
            .map((d: any) => ({ name: d.name, active: true }));
          statusLine.setAgents(agentEntries);
        }
      }

      if (payload.type === 'response-end') {
        // Update agent list — remove finished agent
        if (payload.activeSources) {
          const agentEntries = payload.activeSources
            .map((s: string) => parseActivitySource(s))
            .filter((d: any) => d?.type === 'agent')
            .map((d: any) => ({ name: d.name, active: true }));
          statusLine.setAgents(agentEntries);
          // Update spinner label to next active agent if any
          if (agentEntries.length > 0) {
            statusLine.setSpinner(`${agentEntries[0].name} is thinking...`);
          } else {
            statusLine.setSpinner(null);
            statusLine.stopElapsedTimer();
          }
        }
      }

      if (payload.type === 'idle') {
        statusLine.reset();
        if (rl && globalState.awaitingResponse) {
          globalState.awaitingResponse = false;
          statusLine.clear();
          console.log(); // Empty line before prompt
          rl.prompt();
        }
      }
    }
    // Handle informational world messages.
    else if (payload.type === 'info' && payload.message) {
      statusLog(statusLine, `${gray('[World]')} ${payload.message}`);
    }
    // Handle tool events (migrated from sse channel)
    else if (payload.type === 'tool-start' || payload.type === 'tool-result' || payload.type === 'tool-error' || payload.type === 'tool-progress') {
      // Update status line with tool info
      if (payload.type === 'tool-start' && payload.toolExecution) {
        statusLine.addTool(payload.toolExecution.toolName);
      } else if (payload.type === 'tool-result' && payload.toolExecution) {
        statusLine.removeTool(payload.toolExecution.toolName, 'done');
      } else if (payload.type === 'tool-error' && payload.toolExecution) {
        statusLine.removeTool(payload.toolExecution.toolName, 'error');
      }

      // Print permanent tool event output
      statusLine.pause();
      handleToolEvents(payload);
      // Only resume status line if not actively streaming
      // (streaming code manages its own pause/resume lifecycle)
      if (!streaming.isActive) {
        statusLine.resume();
      }
    }
    return;
  }

  if (handleWorldEventWithStreaming(eventType, eventData, streaming, statusLine)) {
    return;
  }

  if (eventData.content &&
    typeof eventData.content === 'string' &&
    eventData.content.includes('Success message sent')) return;

  // Handle regular message events from agents (non-streaming or after streaming ends)
  if (eventType === 'message' && eventData.sender && (eventData.content || eventData.tool_calls)) {
    // Skip user messages to prevent echo
    if (eventData.sender === 'human' || eventData.sender.startsWith('user')) {
      return;
    }

    // Skip if this message was already displayed via streaming (id or recent content match)
    const duplicateByActiveId = streaming.messageId && streaming.messageId === eventData.messageId;
    const duplicateByLastId = streaming.lastStreamedMessageId && streaming.lastStreamedMessageId === eventData.messageId;
    const recentWindowMs = 5000;
    const streamedContent = streaming.lastStreamedContent ? streaming.lastStreamedContent.trim() : undefined;
    const eventContent = typeof eventData.content === 'string' ? eventData.content.trim() : undefined;
    const duplicateByContent =
      streaming.lastStreamedAt !== undefined &&
      Date.now() - streaming.lastStreamedAt < recentWindowMs &&
      streaming.lastStreamedSender === eventData.sender &&
      streamedContent !== undefined &&
      eventContent !== undefined &&
      streamedContent === eventContent;

    if (duplicateByActiveId || duplicateByLastId || duplicateByContent) {
      return;
    }

    // Display system messages
    if (eventData.sender === 'system') {
      statusLog(statusLine, `${boldRed('● system:')} ${eventData.content}`);
      return;
    }

    // Display agent messages (fallback for non-streaming or missed messages)
    if (eventData.content) {
      statusLog(statusLine, `\n${boldGreen(`● ${eventData.sender}:`)} ${eventData.content}\n`);
    }
    return;
  }

  if ((eventType === 'system' || eventType === 'world') && (eventData.message || eventData.content)) {
    // existing logic
  }
}

// World discovery and selection
async function getAvailableWorldNames(rootPath: string): Promise<string[]> {
  try {
    const worldInfos = await listWorlds();
    return worldInfos.map(info => info.id);
  } catch (error) {
    console.error('Error listing worlds:', error);
    return [];
  }
}

async function selectWorld(rootPath: string, rl: readline.Interface): Promise<{ worldName: string; externalPath?: string } | null> {
  const worlds = await getAvailableWorldNames(rootPath);

  if (worlds.length === 0) {
    console.log(boldRed(`No worlds found in ${rootPath}`));
    return null;
  }

  if (worlds.length === 1) {
    console.log(`${boldGreen('Auto-selecting the only available world:')} ${cyan(worlds[0])}`);
    return { worldName: worlds[0] };
  }

  console.log(`\n${boldMagenta('Available worlds:')}`);
  console.log(`  ${yellow('0.')} ${cyan('Exit')}`);
  worlds.forEach((world, index) => {
    console.log(`  ${yellow(`${index + 1}.`)} ${cyan(world)}`);
  });
  console.log(`  ${yellow(`${worlds.length + 1}.`)} ${cyan('(From file...)')}`);

  return new Promise((resolve) => {
    async function askForSelection() {
      rl.question(`\n${boldMagenta('Select a world (number or name), or 0 to exit:')} `, async (answer) => {
        const trimmed = answer.trim();
        const num = parseInt(trimmed);

        if (num === 0) {
          resolve(null);
          return;
        }

        // Check if user selected "From file..."
        if (num === worlds.length + 1) {
          const result = await loadWorldFromFile(rootPath, rl);
          resolve(result);
          return;
        }

        if (!isNaN(num) && num >= 1 && num <= worlds.length) {
          resolve({ worldName: worlds[num - 1] });
          return;
        }

        const found = worlds.find(world =>
          world.toLowerCase() === trimmed.toLowerCase() ||
          world.toLowerCase().includes(trimmed.toLowerCase())
        );

        if (found) {
          resolve({ worldName: found });
          return;
        }

        console.log(boldRed('Invalid selection. Please try again.'));
        askForSelection();
      });
    }

    askForSelection();
  });
}

// Load world from external file folder
async function loadWorldFromFile(currentRootPath: string, rl: readline.Interface): Promise<{ worldName: string; externalPath?: string } | null> {
  const fs = await import('fs');

  // Get world folder path
  const folderPath = await new Promise<string | null>((resolve) => {
    rl.question(`\n${boldMagenta('Enter path to world folder:')} `, (answer) => {
      const trimmed = answer.trim();
      if (trimmed === '') {
        resolve(null);
      } else {
        resolve(trimmed);
      }
    });
  });

  if (!folderPath) {
    console.log(boldRed('Load cancelled.'));
    return null;
  }

  // Validate folder exists
  if (!fs.existsSync(folderPath)) {
    console.log(boldRed(`Folder does not exist: ${folderPath}`));
    return null;
  }

  try {
    // Import necessary functions
    const { createStorage } = await import('../core/storage/storage-factory.js');
    const { checkTargetExists, deleteExistingData } = await import('./commands.js');

    // Create storage instance for source folder
    const sourceStorage = await createStorage({
      type: 'file' as const,
      rootPath: folderPath
    });

    // List worlds in the source folder
    const worldsInFolder = await sourceStorage.listWorlds();
    if (worldsInFolder.length === 0) {
      console.log(boldRed(`No worlds found in: ${folderPath}`));
      return null;
    }

    // Select world if multiple
    let worldData;
    if (worldsInFolder.length === 1) {
      worldData = worldsInFolder[0];
    } else {
      console.log(`\n${boldMagenta('Multiple worlds found in folder:')}`);
      console.log(`  ${yellow('0.')} ${cyan('Cancel')}`);
      worldsInFolder.forEach((world, index) => {
        console.log(`  ${yellow(`${index + 1}.`)} ${cyan(world.name)} ${gray(`(${world.id})`)}`);
      });

      const selectedIndex = await new Promise<number>((resolve) => {
        function askForSelection() {
          rl.question(`\n${boldMagenta('Select a world (1-' + worldsInFolder.length + '), or 0 to cancel:')} `, (answer) => {
            const trimmed = answer.trim();
            const num = parseInt(trimmed);

            if (num === 0) {
              resolve(-1);
              return;
            }

            if (!isNaN(num) && num >= 1 && num <= worldsInFolder.length) {
              resolve(num - 1);
              return;
            }

            console.log(boldRed('Invalid selection. Please try again.'));
            askForSelection();
          });
        }
        askForSelection();
      });

      if (selectedIndex === -1) {
        console.log(yellow('Load cancelled.'));
        return null;
      }

      worldData = worldsInFolder[selectedIndex];
    }

    console.log(`\n${boldGreen('Found world:')} ${cyan(worldData.name)}`);
    console.log(`  ${yellow('ID:')} ${worldData.id}`);

    // Load agents
    const agents = await sourceStorage.listAgents(worldData.id);
    console.log(`  ${yellow('Agents:')} ${agents.length}`);

    // Load chats
    const chats = await sourceStorage.listChats(worldData.id);
    console.log(`  ${yellow('Chats:')} ${chats.length}`);

    // Ask if user wants to import
    const shouldImport = await new Promise<boolean>((resolve) => {
      rl.question(`\n${boldMagenta('Import this world to current storage?')} ${boldMagenta('(yes/no):')} `, (answer) => {
        const trimmed = answer.trim().toLowerCase();
        resolve(trimmed === 'yes' || trimmed === 'y');
      });
    });

    if (!shouldImport) {
      console.log(yellow('World loaded from external storage (not imported).'));
      // Return world name with external path to use that storage
      return { worldName: worldData.name, externalPath: folderPath };
    }

    // Check if world already exists in current storage
    const checkResult = await checkTargetExists(currentRootPath, 'file', worldData.id);

    if (checkResult.exists) {
      // Confirm overwrite
      const shouldOverwrite = await new Promise<boolean>((resolve) => {
        rl.question(`\n${boldYellow(`World '${worldData.name}' already exists. Overwrite?`)} ${boldMagenta('(yes/no):')} `, (answer) => {
          const trimmed = answer.trim().toLowerCase();
          resolve(trimmed === 'yes' || trimmed === 'y');
        });
      });

      if (!shouldOverwrite) {
        console.log(yellow('Import cancelled. Loading from external storage instead.'));
        // Return world name with external path to use that storage
        return { worldName: worldData.name, externalPath: folderPath };
      }

      // Delete existing world
      await deleteExistingData(currentRootPath, 'file', worldData.id);
      console.log(green(`Deleted existing world '${worldData.name}'`));
    }

    // Create storage instance for target
    const targetStorage = await createStorage({
      type: 'file' as const,
      rootPath: currentRootPath
    });

    // Save world
    await targetStorage.saveWorld(worldData);

    // Save all agents
    for (const agent of agents) {
      await targetStorage.saveAgent(worldData.id, agent);
    }

    // Save all chats
    for (const chat of chats) {
      await targetStorage.saveChatData(worldData.id, chat);
    }

    // Copy events if both storages have eventStorage
    let eventCount = 0;
    if ((sourceStorage as any).eventStorage && (targetStorage as any).eventStorage) {
      const sourceEvents = (sourceStorage as any).eventStorage;
      const targetEvents = (targetStorage as any).eventStorage;

      try {
        // Copy world-level events (chatId = null)
        const worldEvents = await sourceEvents.getEventsByWorldAndChat(worldData.id, null);
        if (worldEvents && worldEvents.length > 0) {
          await targetEvents.saveEvents(worldEvents);
          eventCount += worldEvents.length;
        }

        // Copy events for each chat
        for (const chat of chats) {
          const chatEvents = await sourceEvents.getEventsByWorldAndChat(worldData.id, chat.id);
          if (chatEvents && chatEvents.length > 0) {
            await targetEvents.saveEvents(chatEvents);
            eventCount += chatEvents.length;
          }
        }
      } catch (error) {
        console.log(boldYellow(`Warning: Could not copy all events: ${error instanceof Error ? error.message : String(error)}`));
      }
    }

    console.log(boldGreen(`\n✓ World '${worldData.name}' imported successfully!`));
    console.log(`  ${yellow('Agents:')} ${agents.length}`);
    console.log(`  ${yellow('Chats:')} ${chats.length}`);
    console.log(`  ${yellow('Events:')} ${eventCount}`);

    return { worldName: worldData.name };

  } catch (error) {
    console.log(boldRed(`Error loading world: ${error instanceof Error ? error.message : String(error)}`));
    return null;
  }
}

// Chat discovery and selection
async function selectChat(world: World, chats: any[], currentChatId: string | null, rl: readline.Interface): Promise<string | null> {
  if (chats.length === 0) {
    console.log(boldRed(`No chats found in world '${world.name}'`));
    return null;
  }

  if (chats.length === 1) {
    console.log(`${boldGreen('Auto-selecting the only available chat:')} ${cyan(chats[0].name)}`);
    return chats[0].id;
  }

  console.log(`\n${boldMagenta('Available chats:')}`);
  console.log(`  ${yellow('0.')} ${cyan('Cancel')}`);
  chats.forEach((chat, index) => {
    const isCurrent = currentChatId && chat.id === currentChatId;
    const currentIndicator = isCurrent ? ' (current)' : '';
    const msgCount = chat.messageCount || 0;
    console.log(`  ${yellow(`${index + 1}.`)} ${cyan(`${chat.name}${currentIndicator} - (${msgCount}`)}`);
  });

  return new Promise((resolve) => {
    function askForSelection() {
      rl.question(`\n${boldMagenta('Select a chat (number or name), or 0 to cancel:')} `, (answer) => {
        const trimmed = answer.trim();
        const num = parseInt(trimmed);

        if (num === 0) {
          resolve(null);
          return;
        }

        if (!isNaN(num) && num >= 1 && num <= chats.length) {
          resolve(chats[num - 1].id);
          return;
        }

        const found = chats.find(chat =>
          chat.name.toLowerCase() === trimmed.toLowerCase() ||
          chat.name.toLowerCase().includes(trimmed.toLowerCase()) ||
          chat.id === trimmed
        );

        if (found) {
          resolve(found.id);
          return;
        }

        console.log(boldRed('Invalid selection. Please try again.'));
        askForSelection();
      });
    }

    askForSelection();
  });
}

// Storage type selection
async function selectStorageType(rl: readline.Interface): Promise<'file' | 'sqlite' | null> {
  const storageTypes = ['file', 'sqlite'];

  console.log(`\n${boldMagenta('Select storage type:')}`);
  console.log(`  ${yellow('0.')} ${cyan('Cancel')}`);
  storageTypes.forEach((type, index) => {
    console.log(`  ${yellow(`${index + 1}.`)} ${cyan(type)}`);
  });

  return new Promise((resolve) => {
    function askForSelection() {
      rl.question(`\n${boldMagenta('Select storage type (number or name), or 0 to cancel:')} `, (answer) => {
        const trimmed = answer.trim().toLowerCase();
        const num = parseInt(trimmed);

        if (num === 0) {
          resolve(null);
          return;
        }

        if (!isNaN(num) && num >= 1 && num <= storageTypes.length) {
          resolve(storageTypes[num - 1] as 'file' | 'sqlite');
          return;
        }

        if (trimmed === 'file' || trimmed === 'sqlite') {
          resolve(trimmed as 'file' | 'sqlite');
          return;
        }

        console.log(boldRed('Invalid selection. Please try again.'));
        askForSelection();
      });
    }

    askForSelection();
  });
}

// Storage path input
async function getStoragePath(defaultPath: string, rl: readline.Interface): Promise<string | null> {
  return new Promise((resolve) => {
    rl.question(`\n${boldMagenta(`Enter storage folder path or press Enter for default (${defaultPath}):`)} `, (answer) => {
      const trimmed = answer.trim();
      if (trimmed === '') {
        resolve(defaultPath);
      } else {
        resolve(trimmed);
      }
    });
  });
}

// Confirm overwrite
async function confirmOverwrite(message: string, rl: readline.Interface): Promise<boolean> {
  return new Promise((resolve) => {
    rl.question(`\n${boldYellow(message)} ${boldMagenta('(yes/no):')} `, (answer) => {
      const trimmed = answer.trim().toLowerCase();
      resolve(trimmed === 'yes' || trimmed === 'y');
    });
  });
}

// Interactive mode: console-based interface
async function runInteractiveMode(options: CLIOptions): Promise<void> {
  const rootPath = options.root || DEFAULT_ROOT_PATH;

  const globalState: GlobalState = createGlobalState();
  const streaming = createStreamingState();
  const activityMonitor = new WorldActivityMonitor();
  const statusLine = createStatusLineManager();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> '
  });

  console.log(boldCyan('Agent World CLI (Interactive Mode)'));
  console.log(cyan('===================================='));

  let worldState: WorldState | null = null;
  let currentWorldName = '';
  let isExiting = false;

  try {
    // Load initial world or prompt for selection
    if (options.world) {
      logger.debug(`Loading world: ${options.world}`);
      try {
        activityMonitor.reset();
        statusLine.reset();
        worldState = await handleSubscribe(rootPath, options.world, streaming, globalState, activityMonitor, statusLine, rl);
        currentWorldName = options.world;
        console.log(success(`Connected to world: ${currentWorldName}`));

        if (worldState?.world) {
          console.log(`${gray('Agents:')} ${yellow(String(worldState.world.agents?.size || 0))} ${gray('| Turn Limit:')} ${yellow(String(worldState.world.turnLimit || 'N/A'))}`);
        }
      } catch (err) {
        console.error(error(`Error loading world: ${err instanceof Error ? err.message : 'Unknown error'}`));
        process.exit(1);
      }
    } else {
      console.log(`\n${boldBlue('Discovering available worlds...')}`);
      const selectedWorld = await selectWorld(rootPath, rl);

      if (!selectedWorld) {
        console.log(error('No world selected. Exiting.'));
        rl.close();
        return;
      }

      // Use external path if loading from external storage
      const effectiveRootPath = selectedWorld.externalPath || rootPath;
      logger.debug(`Loading world: ${selectedWorld.worldName} from ${effectiveRootPath}`);
      try {
        activityMonitor.reset();
        statusLine.reset();
        worldState = await handleSubscribe(effectiveRootPath, selectedWorld.worldName, streaming, globalState, activityMonitor, statusLine, rl);
        currentWorldName = selectedWorld.worldName;
        console.log(success(`Connected to world: ${currentWorldName}`));
        if (selectedWorld.externalPath) {
          console.log(gray(`  (loaded from external storage: ${selectedWorld.externalPath})`));
        }

        if (worldState?.world) {
          console.log(`${gray('Agents:')} ${yellow(String(worldState.world.agents?.size || 0))} ${gray('| Turn Limit:')} ${yellow(String(worldState.world.turnLimit || 'N/A'))}`);
        }
      } catch (err) {
        console.error(error(`Error loading world: ${err instanceof Error ? err.message : 'Unknown error'}`));
        rl.close();
        return;
      }
    }

    // Show usage tips
    console.log(`\n${gray('Quick Start:')}`);
    console.log(`  ${bullet(gray('World commands:'))} ${cyan('/world list')}, ${cyan('/world create')}, ${cyan('/world select')}, ${cyan('/world save')}`);
    console.log(`  ${bullet(gray('Agent commands:'))} ${cyan('/agent list')}, ${cyan('/agent create Ava')}, ${cyan('/agent update Ava')}`);
    console.log(`  ${bullet(gray('Chat commands:'))} ${cyan('/chat list')}, ${cyan('/chat select')}, ${cyan('/chat create')}, ${cyan('/chat export')}`);
    console.log(`  ${bullet(gray('Need help?'))} ${cyan('/help world')}, ${cyan('/help agent')}, ${cyan('/help chat')}`);
    console.log(`  ${bullet(gray('Type messages to talk with the world'))}`);
    console.log(`  ${bullet(gray('Exit with'))} ${cyan('/quit')} ${gray('or')} ${cyan('/exit')} ${gray('or press')} ${boldYellow('Ctrl+C')}`);
    console.log(`  ${bullet(gray('Enable debug logs via'))} ${cyan('--logLevel debug')}`);
    console.log('');

    // Display current chat messages after Quick Start tips
    if (worldState?.world) {
      await displayChatMessages(worldState.world.id, worldState.world.currentChatId);
    }

    console.log(); // Empty line before prompt
    rl.prompt();

    rl.on('line', async (input) => {
      if (globalState.hitlPromptActive) {
        return;
      }

      const trimmedInput = input.trim();

      if (!trimmedInput) {
        console.log(); // Empty line before prompt
        rl.prompt();
        return;
      }

      // Check for exit commands before anything else
      const isExitCommand = trimmedInput.toLowerCase() === '/exit' || trimmedInput.toLowerCase() === '/quit';
      if (isExitCommand) {
        if (isExiting) return;
        isExiting = true;
        console.log(`\n${boldCyan('Goodbye!')}`);
        if (worldState) cleanupWorldSubscription(worldState);
        rl.close();
        process.exit(0);
      }

      console.log(`\n${boldYellow('● you:')} ${trimmedInput}`);

      const isCommand = trimmedInput.startsWith('/');
      let snapshot: ActivityEventSnapshot | null = null;

      if (!isCommand) {
        globalState.awaitingResponse = true;
        snapshot = activityMonitor.captureSnapshot();
      }

      try {
        const result = await processCLIInput(trimmedInput, worldState?.world || null, 'HUMAN');

        // Handle exit commands from result (redundant, but keep for safety)
        if (result.data?.exit) {
          if (isExiting) return; // Prevent duplicate exit handling
          isExiting = true;
          console.log(`\n${boldCyan('Goodbye!')}`);
          if (worldState) cleanupWorldSubscription(worldState);
          rl.close();
          process.exit(0);
        }

        // Handle world selection command
        if (result.data?.selectWorld) {
          console.log(`\n${boldBlue('Discovering available worlds...')}`);
          const selectedWorld = await selectWorld(rootPath, rl);

          if (!selectedWorld) {
            console.log(error('No world selected.'));
            console.log(); // Empty line before prompt
            rl.prompt();
            return;
          }

          // Use external path if loading from external storage
          const effectiveRootPath = selectedWorld.externalPath || rootPath;
          logger.debug(`Loading world: ${selectedWorld.worldName} from ${effectiveRootPath}`);
          try {
            // Clean up existing world subscription first
            if (worldState) {
              logger.debug('Cleaning up previous world subscription...');
              cleanupWorldSubscription(worldState);
              worldState = null;
              // Small delay to ensure cleanup is complete
              await new Promise(resolve => setTimeout(resolve, 100));
            }

            // Subscribe to the new world
            logger.debug(`Subscribing to world: ${selectedWorld.worldName}...`);
            activityMonitor.reset();
            statusLine.reset();
            worldState = await handleSubscribe(effectiveRootPath, selectedWorld.worldName, streaming, globalState, activityMonitor, statusLine, rl);
            currentWorldName = selectedWorld.worldName;
            console.log(success(`Connected to world: ${currentWorldName}`));
            if (selectedWorld.externalPath) {
              console.log(gray(`  (loaded from external storage: ${selectedWorld.externalPath})`));
            }

            if (worldState?.world) {
              console.log(`${gray('Agents:')} ${yellow(String(worldState.world.agents?.size || 0))} ${gray('| Turn Limit:')} ${yellow(String(worldState.world.turnLimit || 'N/A'))}`);

              // Display current chat messages
              await displayChatMessages(worldState.world.id, worldState.world.currentChatId);
            }
          } catch (err) {
            console.error(error(`Error loading world: ${err instanceof Error ? err.message : 'Unknown error'}`));
          }

          // Show prompt immediately after world selection
          console.log(); // Empty line before prompt
          rl.prompt();
          return;
        }

        // Handle chat selection command
        if (result.data?.selectChat && worldState?.world) {
          const { chats, currentChatId } = result.data;
          const selectedChatId = await selectChat(worldState.world, chats, currentChatId, rl);

          if (!selectedChatId) {
            console.log(error('No chat selected.'));
            console.log(); // Empty line before prompt
            rl.prompt();
            return;
          }

          try {
            // Restore the selected chat
            const { restoreChat } = await import('../core/index.js');
            const restored = await restoreChat(worldState.world.id, selectedChatId);

            if (!restored) {
              console.log(error(`Failed to restore chat '${selectedChatId}'`));
            } else {
              const selectedChat = chats.find((c: any) => c.id === selectedChatId);
              const chatName = selectedChat?.name || selectedChatId;
              console.log(success(`Chat '${chatName}' selected and loaded`));

              // Display chat messages
              await displayChatMessages(worldState.world.id, selectedChatId);

              // Refresh world state
              // console.log(boldBlue('Refreshing world state...'));
              const refreshedWorld = await worldState.subscription.refresh(rootPath);
              worldState.world = refreshedWorld;
              console.log(success('World state refreshed'));
            }
          } catch (err) {
            console.error(error(`Error loading chat: ${err instanceof Error ? err.message : 'Unknown error'}`));
          }

          // Show prompt immediately after chat selection
          console.log(); // Empty line before prompt
          rl.prompt();
          return;
        }

        // Handle world save command
        if (result.data?.saveWorld && worldState?.world) {
          try {
            // Select storage type
            const storageType = await selectStorageType(rl);
            if (!storageType) {
              console.log(error('World save cancelled.'));
              console.log(); // Empty line before prompt
              rl.prompt();
              return;
            }

            // Get default path and ask for custom path
            const { getDefaultRootPath } = await import('../core/storage/storage-factory.js');
            const defaultPath = getDefaultRootPath();
            const targetPath = await getStoragePath(defaultPath, rl);

            if (!targetPath) {
              console.log(error('World save cancelled.'));
              console.log(); // Empty line before prompt
              rl.prompt();
              return;
            }

            // Check if target exists and confirm overwrite
            const { checkTargetExists } = await import('./commands.js');
            const existsInfo = await checkTargetExists(targetPath, storageType, worldState.world.id);

            if (existsInfo.exists) {
              console.log(yellow(`\n⚠ Warning: ${existsInfo.message}`));
              const confirmed = await confirmOverwrite('Do you want to overwrite the existing data?', rl);

              if (!confirmed) {
                console.log(error('World save cancelled.'));
                console.log(); // Empty line before prompt
                rl.prompt();
                return;
              }

              // Delete existing data before saving
              const { deleteExistingData } = await import('./commands.js');
              const deleteResult = await deleteExistingData(targetPath, storageType, worldState.world.id);
              if (!deleteResult.success) {
                console.log(error(`Failed to delete existing data: ${deleteResult.error}`));
                console.log(); // Empty line before prompt
                rl.prompt();
                return;
              }
              console.log(gray('Existing data deleted.'));
            }

            // Perform the actual save
            const { performWorldSave } = await import('./commands.js');
            const saveResult = await performWorldSave(worldState.world, storageType, targetPath);

            if (saveResult.success) {
              console.log(success(saveResult.message));
              if (saveResult.data) {
                console.log(`${gray('Storage Type:')} ${yellow(saveResult.data.storageType)}`);
                console.log(`${gray('Path:')} ${yellow(saveResult.data.path)}`);
                console.log(`${gray('Agents:')} ${yellow(saveResult.data.agentCount)} ${gray('| Chats:')} ${yellow(saveResult.data.chatCount)} ${gray('| Events:')} ${yellow(saveResult.data.eventCount || 0)}`);
              }
            } else {
              console.log(error(saveResult.message));
              if (saveResult.error) {
                console.log(error(saveResult.error));
              }
            }
          } catch (err) {
            console.error(error(`Error saving world: ${err instanceof Error ? err.message : 'Unknown error'}`));
          }

          // Show prompt immediately after save operation
          console.log(); // Empty line before prompt
          rl.prompt();
          return;
        }

        if (result.success === false) {
          console.log(error(`Error: ${result.error || result.message || 'Command failed'}`));
        } else if (result.message &&
          !result.message.includes('Success message sent') &&
          !result.message.includes('Message sent to world')) {
          console.log(success(result.message));
        }

        // if (result.data && !(result.data.sender === 'human')) {
        //   // Print a concise summary of result.data if present and not already in message
        //   if (result.data) {
        //     if (typeof result.data === 'string') {
        //       console.log(`${boldMagenta('Data:')} ${result.data}`);
        //     } else if (result.data.name) {
        //       // If it's an agent or world object
        //       console.log(`${boldMagenta('Data:')} ${result.data.name}`);
        //     } else if (Array.isArray(result.data)) {
        //       console.log(`${boldMagenta('Data:')} ${result.data.length} items`);
        //     } else {
        //       // Fallback: print keys
        //       console.log(`${boldMagenta('Data:')} ${Object.keys(result.data).join(', ')}`);
        //     }
        //   }
        // }

        // Refresh world if needed
        if (result.refreshWorld && currentWorldName && worldState) {
          try {
            // console.log(boldBlue('Refreshing world state...'));

            // Use the subscription's refresh method to properly destroy old world and create new
            const refreshedWorld = await worldState.subscription.refresh(rootPath);
            worldState.world = refreshedWorld;

            console.log(success('World state refreshed'));
          } catch (err) {
            console.error(error(`Error refreshing world: ${err instanceof Error ? err.message : 'Unknown error'}`));
          }
        }

      } catch (err) {
        console.error(error(`Command error: ${err instanceof Error ? err.message : 'Unknown error'}`));
        if (!isCommand && globalState.awaitingResponse) {
          globalState.awaitingResponse = false;
          rl.prompt();
        }
        snapshot = null;
      }

      if (!isCommand && snapshot) {
        try {
          await activityMonitor.waitForIdle({ snapshot });
        } catch (error) {
          console.error(red(`Timed out waiting for responses: ${(error as Error).message}`));
        } finally {
          if (globalState.awaitingResponse) {
            globalState.awaitingResponse = false;
            console.log(); // Empty line before prompt
            rl.prompt();
          }
        }
        return;
      }

      // For commands, show prompt immediately. For messages, world events will trigger the prompt
      const isSelectCommand = trimmedInput.toLowerCase() === '/select' ||
        trimmedInput.toLowerCase() === '/world select';

      if (isSelectCommand) {
        // For world select command, prompt is already shown in the handler
        return;
      } else if (isCommand) {
        // For other commands, show prompt immediately
        console.log(); // Empty line before prompt
        rl.prompt();
      }
      // For messages, waitForIdle() above will handle prompt display via world 'idle' event
    });

    rl.on('close', () => {
      if (isExiting) return; // Prevent duplicate cleanup
      isExiting = true;
      statusLine.cleanup();
      console.log(`\n${boldCyan('Goodbye!')}`);
      if (worldState) cleanupWorldSubscription(worldState);
      process.exit(0);
    });

    rl.on('SIGINT', () => {
      if (isExiting) return; // Prevent duplicate cleanup
      isExiting = true;
      statusLine.cleanup();
      console.log(`\n${boldCyan('Shutting down...')}`);
      console.log(`\n${boldCyan('Goodbye!')}`);
      if (worldState) cleanupWorldSubscription(worldState);
      rl.close();
      process.exit(0);
    });

  } catch (err) {
    console.error(boldRed('Error starting interactive mode:'), err instanceof Error ? err.message : err);
    statusLine.cleanup();
    rl.close();
    process.exit(1);
  }
}

/**
 * Determine whether streaming should be enabled based on flag and TTY detection
 * 
 * @param streamingFlag - Explicit streaming flag from CLI options (undefined = auto-detect)
 * @param isTTY - Whether stdin is a TTY (interactive terminal)
 * @returns true to enable streaming, false to disable
 */
function determineStreamingMode(streamingFlag: boolean | undefined, isTTY: boolean): boolean {
  // Explicit flag overrides auto-detection
  if (streamingFlag !== undefined) {
    return streamingFlag;
  }

  // Auto-detect: enable streaming for interactive (TTY), disable for pipeline
  return isTTY;
}

// Main CLI entry point
async function main(): Promise<void> {
  // Configure LLM providers from environment variables at startup
  configureLLMProvidersFromEnv();

  // Import help generator from commands.ts
  // (import at top: import { generateHelpMessage } from './commands.js';)
  const { generateHelpMessage } = await import('./commands.js');

  program
    .name('cli')
    .description('Agent World CLI')
    .version('1.0.0')
    .option('-r, --root <path>', 'Root path for worlds data', DEFAULT_ROOT_PATH)
    .option('-w, --world <name>', 'World name to connect to')
    .option('-c, --command <cmd>', 'Command to execute in pipeline mode')
    .option('-l, --logLevel <level>', 'Set log level (trace, debug, info, warn, error)', 'error')
    .option('--streaming', 'Enable streaming responses (default: auto-detected from TTY)')
    .option('-s, --server', 'Launch the server before running CLI')
    .allowUnknownOption()
    .allowExcessArguments()
    .helpOption('-h, --help', 'Display help for command')
    .addHelpText('beforeAll', () => generateHelpMessage())
    .parse();

  const options = program.opts();

  // If --server is specified, launch the server first
  if (options.server) {
    const { spawnSync } = await import('child_process');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const serverPath = path.resolve(__dirname, '../server/index.js');
    const serverProcess = spawnSync('node', [serverPath], {
      stdio: 'inherit',
      cwd: path.dirname(serverPath),
      env: process.env
    });
    if (serverProcess.error) {
      console.error(boldRed('Failed to launch server:'), serverProcess.error);
      process.exit(1);
    }
    // If server exits, exit CLI as well
    process.exit(serverProcess.status || 0);
  }

  const args = program.args;
  const messageFromArgs = args.length > 0 ? args.join(' ') : null;

  // Determine mode and streaming configuration
  const isTTY = process.stdin.isTTY;
  const isPipelineMode = !isTTY;

  // Determine streaming configuration from flag or auto-detect
  const shouldStream = determineStreamingMode(options.streaming, isTTY);

  // Apply streaming configuration globally
  if (shouldStream) {
    enableStreaming();
  } else {
    disableStreaming();
  }

  // Run appropriate mode (streaming is already configured)
  if (isPipelineMode) {
    await runPipelineMode(options, messageFromArgs);
  } else {
    await runInteractiveMode(options);
  }
}

// Global error handling
function setupErrorHandlers() {
  process.on('unhandledRejection', (error) => {
    console.error(boldRed('Unhandled rejection:'), error);
    process.exit(1);
  });

  process.on('uncaughtException', (error) => {
    console.error(boldRed('Uncaught exception:'), error);
    process.exit(1);
  });
}

setupErrorHandlers();
main().catch((error) => {
  console.error(boldRed('CLI error:'), error);
  process.exit(1);
});
