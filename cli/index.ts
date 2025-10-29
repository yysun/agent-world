#!/usr/bin/env node

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
 * - Pipeline Mode: Execute commands and exit with timer-based cleanup
 * - Interactive Mode: Real-time console interface with streaming responses
 * - Unified Subscription: Both modes use subscribeWorld for consistent event handling
 * - World Management: Auto-discovery and interactive selection
 * - Real-time Streaming: Live agent responses via stream.ts module
 * - Color Helpers: Consistent styling with simplified color functions
 * - Timer Management: Smart prompt restoration and exit handling
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
 *
 * USAGE:
 * Pipeline: cli --root /data/worlds --world myworld --command "/clear agent1"
 * Pipeline: cli --root /data/worlds --world myworld "Hello, world!"
 * Pipeline: echo "Hello, world!" | cli --root /data/worlds --world myworld
 * Interactive: cli --root /data/worlds --world myworld
 * Debug Mode: cli --root /data/worlds --world myworld --logLevel debug
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { program } from 'commander';
import readline from 'readline';
import {
  listWorlds,
  subscribeWorld,
  ClientConnection,
  createCategoryLogger,
  LLMProvider,
  enableStreaming,
  disableStreaming
} from '../core/index.js';
import { WorldSubscription } from '../core/subscription.js';
import { World } from '../core/types.js';
import { getDefaultRootPath } from '../core/storage/storage-factory.js';
import { processCLIInput } from './commands.js';
import {
  StreamingState,
  createStreamingState,
  handleWorldEventWithStreaming,
} from './stream.js';
import { configureLLMProvider } from '../core/llm-config.js';

// Create CLI category logger after logger auto-initialization
const logger = createCategoryLogger('cli');

// Timer management for prompt restoration
interface GlobalState {
  promptTimer?: ReturnType<typeof setTimeout>;
  awaitingResponse: boolean;
}

function setupPromptTimer(
  globalState: GlobalState,
  rl: readline.Interface,
  callback: () => void,
  delay: number = 2000
): void {
  clearPromptTimer(globalState);
  globalState.promptTimer = setTimeout(callback, delay);
}

function clearPromptTimer(globalState: GlobalState): void {
  if (globalState.promptTimer) {
    clearTimeout(globalState.promptTimer);
    globalState.promptTimer = undefined;
  }
}

function createGlobalState(): GlobalState {
  return {
    awaitingResponse: false
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


type ActivityEventState = 'processing' | 'idle';

interface ActivityEventPayload {
  state?: ActivityEventState;
  pendingOperations?: number;
  activityId?: number;
  timestamp?: string;
  source?: string;
}

interface ActivitySnapshot {
  activityId: number;
  timestampMs: number;
  state: ActivityEventState | null;
}

interface IdleWaiter {
  startedAt: number;
  snapshot: ActivitySnapshot;
  seenProcessing: boolean;
  targetActivityId: number | null;
  resolve: () => void;
  reject: (error: Error) => void;
  timeoutId?: ReturnType<typeof setTimeout>;
  noActivityTimeoutId?: ReturnType<typeof setTimeout>;
  resolved: boolean;
}

class WorldActivityMonitor {
  private lastEvent: (ActivitySnapshot & { pendingOperations: number; source?: string }) | null = null;
  private waiters: Set<IdleWaiter> = new Set();

  captureSnapshot(): ActivitySnapshot {
    const now = Date.now();

    if (!this.lastEvent) {
      return {
        activityId: 0,
        timestampMs: now,
        state: null
      };
    }

    return {
      activityId: this.lastEvent.activityId,
      timestampMs: this.lastEvent.timestampMs,
      state: this.lastEvent.state
    };
  }

  handle(eventData: ActivityEventPayload): void {
    if (!eventData || (eventData.state !== 'processing' && eventData.state !== 'idle')) {
      return;
    }

    const timestampMsRaw = eventData.timestamp ? Date.parse(eventData.timestamp) : Date.now();
    const timestampMs = Number.isFinite(timestampMsRaw) ? timestampMsRaw : Date.now();
    const activityId = typeof eventData.activityId === 'number'
      ? eventData.activityId
      : this.lastEvent?.activityId ?? 0;

    this.lastEvent = {
      activityId,
      timestampMs,
      state: eventData.state,
      pendingOperations: eventData.pendingOperations ?? (eventData.state === 'processing' ? 1 : 0),
      source: eventData.source
    };

    this.evaluateWaiters();
  }

  async waitForIdle(options: {
    snapshot?: ActivitySnapshot;
    timeoutMs?: number;
    noActivityTimeoutMs?: number;
  } = {}): Promise<void> {
    const {
      snapshot = this.captureSnapshot(),
      timeoutMs = 60_000,
      noActivityTimeoutMs = 1_000
    } = options;

    const last = this.lastEvent;
    const now = Date.now();

    if (last && last.state === 'idle') {
      const hasNewIdle = last.activityId > snapshot.activityId || last.timestampMs > snapshot.timestampMs;
      if (hasNewIdle) {
        return;
      }
    }

    return new Promise((resolve, reject) => {
      const waiter: IdleWaiter = {
        startedAt: now,
        snapshot,
        seenProcessing: false,
        targetActivityId: null,
        resolve,
        reject,
        resolved: false
      };

      const finish = (error?: Error) => {
        if (waiter.resolved) return;
        waiter.resolved = true;
        if (waiter.timeoutId) clearTimeout(waiter.timeoutId);
        if (waiter.noActivityTimeoutId) clearTimeout(waiter.noActivityTimeoutId);
        this.waiters.delete(waiter);
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };

      if (timeoutMs > 0) {
        waiter.timeoutId = setTimeout(() => {
          finish(new Error('Timed out waiting for world to become idle'));
        }, timeoutMs);
      }

      if (noActivityTimeoutMs > 0) {
        waiter.noActivityTimeoutId = setTimeout(() => {
          if (!waiter.seenProcessing) {
            finish();
          }
        }, noActivityTimeoutMs);
      }

      if (last) {
        if (last.state === 'processing') {
          const afterSnapshot =
            last.activityId > snapshot.activityId ||
            last.timestampMs >= snapshot.timestampMs ||
            snapshot.state !== 'processing';

          if (afterSnapshot) {
            waiter.seenProcessing = true;
            waiter.targetActivityId = last.activityId;
            if (waiter.noActivityTimeoutId) {
              clearTimeout(waiter.noActivityTimeoutId);
              waiter.noActivityTimeoutId = undefined;
            }
          }
        } else if (last.state === 'idle') {
          const hasNewIdle =
            last.activityId > snapshot.activityId ||
            last.timestampMs > snapshot.timestampMs;

          if (hasNewIdle) {
            finish();
            return;
          }
        }
      }

      this.waiters.add(waiter);
      this.evaluateWaiters();
    });
  }

  isIdle(): boolean {
    return this.lastEvent?.state === 'idle';
  }

  reset(): void {
    for (const waiter of Array.from(this.waiters)) {
      this.finishWaiter(waiter, new Error('Activity monitor reset'));
    }
    this.lastEvent = null;
  }

  private evaluateWaiters(): void {
    if (!this.lastEvent) return;

    for (const waiter of Array.from(this.waiters)) {
      if (!waiter.seenProcessing && this.lastEvent.state === 'processing') {
        const afterSnapshot =
          this.lastEvent.activityId > waiter.snapshot.activityId ||
          this.lastEvent.timestampMs >= waiter.snapshot.timestampMs ||
          waiter.snapshot.state !== 'processing';

        if (afterSnapshot) {
          waiter.seenProcessing = true;
          waiter.targetActivityId = this.lastEvent.activityId;
          if (waiter.noActivityTimeoutId) {
            clearTimeout(waiter.noActivityTimeoutId);
            waiter.noActivityTimeoutId = undefined;
          }
        }
      }

      if (this.lastEvent.state === 'idle') {
        const idleAfterStart = this.lastEvent.timestampMs >= waiter.startedAt;
        const activitySatisfied =
          waiter.targetActivityId === null ||
          this.lastEvent.activityId >= waiter.targetActivityId;

        if ((waiter.seenProcessing || waiter.targetActivityId === null) && idleAfterStart && activitySatisfied) {
          this.finishWaiter(waiter);
        }
      }
    }
  }

  private finishWaiter(waiter: IdleWaiter, error?: Error): void {
    if (waiter.resolved) return;
    waiter.resolved = true;
    if (waiter.timeoutId) clearTimeout(waiter.timeoutId);
    if (waiter.noActivityTimeoutId) clearTimeout(waiter.noActivityTimeoutId);
    this.waiters.delete(waiter);
    if (error) {
      waiter.reject(error);
    } else {
      waiter.resolve();
    }
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
  if (process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_RESOURCE_NAME && process.env.AZURE_DEPLOYMENT) {
    configureLLMProvider(LLMProvider.AZURE, {
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      resourceName: process.env.AZURE_RESOURCE_NAME,
      deployment: process.env.AZURE_DEPLOYMENT,
      apiVersion: process.env.AZURE_API_VERSION || '2024-10-21-preview'
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

// Pipeline mode execution with activity-aware completion
async function runPipelineMode(options: CLIOptions, messageFromArgs: string | null): Promise<void> {
  disableStreaming();

  const activityMonitor = new WorldActivityMonitor();
  let worldSubscription: WorldSubscription | null = null;
  let world: World | null = null;

  const pipelineClient: ClientConnection = {
    isOpen: true,
    onWorldEvent: (eventType: string, eventData: any) => {
      if (eventType === 'world-activity') {
        activityMonitor.handle(eventData);
        return;
      }

      if (eventData.content && eventData.content.includes('Success message sent')) return;

      if ((eventType === 'system' || eventType === 'world') && (eventData.message || eventData.content)) {
        return;
      }

      if (eventType === 'message' && eventData.sender === 'system') {
        const msg = eventData.content;
        console.log(`${boldRed('● system:')} ${msg}`);
        return;
      }

      if (eventType === 'message' && eventData.content) {
        const sender = eventData.sender || 'agent';
        if (sender.toUpperCase() === 'HUMAN' || sender.toUpperCase() === 'CLI') return;
        console.log(`${boldGreen('● ' + sender + ':')} ${eventData.content}`);
      }
    },
    onError: (error: string) => {
      console.log(red(`Error: ${error}`));
    }
  };

  const exitPipeline = async (code: number): Promise<void> => {
    if (worldSubscription) {
      try {
        await worldSubscription.unsubscribe();
      } catch (err) {
        logger.warn('Failed to clean up pipeline world subscription', {
          error: err instanceof Error ? err.message : err
        });
      }
      worldSubscription = null;
    }

    process.exit(code);
  };

  try {
    if (options.world) {
      worldSubscription = await subscribeWorld(options.world, pipelineClient);
      if (!worldSubscription) {
        console.error(boldRed(`Error: World '${options.world}' not found`));
        await exitPipeline(1);
        return;
      }
      world = worldSubscription.world as World;
    }

    if (options.command) {
      const isCommand = options.command.startsWith('/');
      if (!isCommand && !world) {
        console.error(boldRed('Error: World must be specified to send user messages'));
        await exitPipeline(1);
        return;
      }

      const snapshot = !isCommand && world ? activityMonitor.captureSnapshot() : undefined;
      const result = await processCLIInput(options.command, world, 'HUMAN');
      printCLIResult(result);

      if (!isCommand && world) {
        try {
          await activityMonitor.waitForIdle({ snapshot });
        } catch (err) {
          console.error(boldRed('Error waiting for world to become idle:'), err instanceof Error ? err.message : err);
          await exitPipeline(1);
          return;
        }
      }

      await exitPipeline(result.success ? 0 : 1);
      return;
    }

    const pendingMessages: { text: string; source: string }[] = [];

    if (messageFromArgs) {
      pendingMessages.push({ text: messageFromArgs, source: 'arguments' });
    }

    if (!process.stdin.isTTY) {
      let input = '';
      process.stdin.setEncoding('utf8');
      for await (const chunk of process.stdin) {
        input += chunk;
      }

      if (input.trim()) {
        pendingMessages.push({ text: input.trim(), source: 'stdin' });
      }
    }

    if (pendingMessages.length === 0) {
      program.help();
      return;
    }

    if (!world) {
      console.error(boldRed('Error: World must be specified to send user messages'));
      await exitPipeline(1);
      return;
    }

    for (const message of pendingMessages) {
      const snapshot = activityMonitor.captureSnapshot();
      const result = await processCLIInput(message.text, world, 'HUMAN');
      printCLIResult(result);

      if (!result.success) {
        await exitPipeline(1);
        return;
      }

      try {
        await activityMonitor.waitForIdle({ snapshot });
      } catch (err) {
        console.error(boldRed('Error waiting for world to become idle:'), err instanceof Error ? err.message : err);
        await exitPipeline(1);
        return;
      }
    }

    await exitPipeline(0);
  } catch (error) {
    console.error(boldRed('Error:'), error instanceof Error ? error.message : error);
    await exitPipeline(1);
  }
}

interface WorldState {
  subscription: WorldSubscription;
  world: World;
  activityMonitor: WorldActivityMonitor;
}

async function cleanupWorldSubscription(worldState: WorldState | null): Promise<void> {
  if (!worldState?.subscription) return;

  worldState.activityMonitor.reset();

  try {
    await worldState.subscription.unsubscribe();
  } catch (error) {
    logger.warn('Failed to clean up world subscription', {
      error: error instanceof Error ? error.message : error
    });
  }
}

// World subscription handler
async function handleSubscribe(
  rootPath: string,
  worldName: string,
  streaming: StreamingState,
  globalState: GlobalState,
  rl?: readline.Interface,
  onActivityEvent?: (eventData: any, monitor: WorldActivityMonitor) => void
): Promise<WorldState | null> {
  const activityMonitor = new WorldActivityMonitor();

  const cliClient: ClientConnection = {
    isOpen: true,
    onWorldEvent: (eventType: string, eventData: any) => {
      if (eventType === 'world-activity') {
        activityMonitor.handle(eventData);
        if (onActivityEvent) {
          onActivityEvent(eventData, activityMonitor);
        }
        return;
      }

      handleWorldEvent(eventType, eventData, streaming, globalState, rl);
    },
    onError: (error: string) => {
      console.log(red(`Error: ${error}`));
    }
  };

  const subscription = await subscribeWorld(worldName, cliClient);
  if (!subscription) throw new Error('Failed to load world');

  return { subscription, world: subscription.world as World, activityMonitor };
}

// Handle world events with streaming support
function handleWorldEvent(
  eventType: string,
  eventData: any,
  streaming: StreamingState,
  globalState: GlobalState,
  rl?: readline.Interface
): void {
  if (handleWorldEventWithStreaming(eventType, eventData, streaming)) {
    return;
  }

  if (eventData.content && eventData.content.includes('Success message sent')) return;

  if ((eventType === 'system' || eventType === 'world') && (eventData.message || eventData.content)) {
    // existing logic
  } else if (eventType === 'message' && eventData.sender === 'system') {
    const msg = eventData.content;
    console.log(`${boldRed('● system:')} ${msg}`);
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

async function selectWorld(rootPath: string, rl: readline.Interface): Promise<string | null> {
  const worlds = await getAvailableWorldNames(rootPath);

  if (worlds.length === 0) {
    console.log(boldRed(`No worlds found in ${rootPath}`));
    return null;
  }

  if (worlds.length === 1) {
    console.log(`${boldGreen('Auto-selecting the only available world:')} ${cyan(worlds[0])}`);
    return worlds[0];
  }

  console.log(`\n${boldMagenta('Available worlds:')}`);
  console.log(`  ${yellow('0.')} ${cyan('Exit')}`);
  worlds.forEach((world, index) => {
    console.log(`  ${yellow(`${index + 1}.`)} ${cyan(world)}`);
  });

  return new Promise((resolve) => {
    function askForSelection() {
      rl.question(`\n${boldMagenta('Select a world (number or name), or 0 to exit:')} `, (answer) => {
        const trimmed = answer.trim();
        const num = parseInt(trimmed);

        if (num === 0) {
          resolve(null);
          return;
        }

        if (!isNaN(num) && num >= 1 && num <= worlds.length) {
          resolve(worlds[num - 1]);
          return;
        }

        const found = worlds.find(world =>
          world.toLowerCase() === trimmed.toLowerCase() ||
          world.toLowerCase().includes(trimmed.toLowerCase())
        );

        if (found) {
          resolve(found);
          return;
        }

        console.log(boldRed('Invalid selection. Please try again.'));
        askForSelection();
      });
    }

    askForSelection();
  });
}

// Interactive mode: console-based interface
async function runInteractiveMode(options: CLIOptions): Promise<void> {
  const rootPath = options.root || DEFAULT_ROOT_PATH;

  enableStreaming();

  const globalState: GlobalState = createGlobalState();
  const streaming = createStreamingState();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> '
  });

  // Set up streaming callbacks
  streaming.wait = (delay: number) => {
    setupPromptTimer(globalState, rl, () => {
      if (streaming.isActive) {
        console.log(`\n${gray('Streaming appears stalled - waiting for user input...')}`);
        streaming.isActive = false;
        streaming.content = '';
        streaming.sender = undefined;
        streaming.messageId = undefined;
      }

      if (!globalState.awaitingResponse) {
        rl.prompt();
      }
    }, delay);
  };

  streaming.stopWait = () => {
    clearPromptTimer(globalState);
  };

  console.log(boldCyan('Agent World CLI (Interactive Mode)'));
  console.log(cyan('===================================='));

  let worldState: WorldState | null = null;
  let currentWorldName = '';
  let isExiting = false;

  const handleActivityEvent = (eventData: any, monitor: WorldActivityMonitor) => {
    if (eventData.state === 'idle') {
      if (streaming.stopWait) streaming.stopWait();
      clearPromptTimer(globalState);

      if (!globalState.awaitingResponse && !streaming.isActive && !isExiting) {
        rl.prompt();
      }
    }
  };

  try {
    // Load initial world or prompt for selection
    if (options.world) {
      logger.debug(`Loading world: ${options.world}`);
      try {
        worldState = await handleSubscribe(rootPath, options.world, streaming, globalState, rl, handleActivityEvent);
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

      logger.debug(`Loading world: ${selectedWorld}`);
      try {
        worldState = await handleSubscribe(rootPath, selectedWorld, streaming, globalState, rl, handleActivityEvent);
        currentWorldName = selectedWorld;
        console.log(success(`Connected to world: ${currentWorldName}`));

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
    console.log(`  ${bullet(gray('World commands:'))} ${cyan('/world list')}, ${cyan('/world create')}, ${cyan('/world select')}`);
    console.log(`  ${bullet(gray('Agent commands:'))} ${cyan('/agent list')}, ${cyan('/agent create Ava')}, ${cyan('/agent update Ava')}`);
    console.log(`  ${bullet(gray('Chat commands:'))} ${cyan('/chat list --active')}, ${cyan('/chat create')}, ${cyan('/chat export')}`);
    console.log(`  ${bullet(gray('Need help?'))} ${cyan('/help world')}, ${cyan('/help agent')}, ${cyan('/help chat')}`);
    console.log(`  ${bullet(gray('Type messages to talk with the world'))}`);
    console.log(`  ${bullet(gray('Exit with'))} ${cyan('/quit')} ${gray('or')} ${cyan('/exit')} ${gray('or press')} ${boldYellow('Ctrl+C')}`);
    console.log(`  ${bullet(gray('Enable debug logs via'))} ${cyan('--logLevel debug')}`);
    console.log('');

    rl.prompt();

    rl.on('line', async (input) => {
      const trimmedInput = input.trim();

      if (!trimmedInput) {
        if (!globalState.awaitingResponse) {
          rl.prompt();
        }
        return;
      }

      const isExitCommand = trimmedInput.toLowerCase() === '/exit' || trimmedInput.toLowerCase() === '/quit';
      if (isExitCommand) {
        if (isExiting) return;
        isExiting = true;
        clearPromptTimer(globalState);
        if (streaming.stopWait) streaming.stopWait();
        console.log(`\n${boldCyan('Goodbye!')}`);
        if (worldState) {
          await cleanupWorldSubscription(worldState);
          worldState = null;
        }
        rl.close();
        process.exit(0);
      }

      const isCommand = trimmedInput.startsWith('/');
      const isSelectCommand = trimmedInput.toLowerCase() === '/select';
      const monitor = worldState?.activityMonitor || null;
      const activitySnapshot = !isCommand && monitor ? monitor.captureSnapshot() : undefined;

      if (!isCommand && monitor) {
        globalState.awaitingResponse = true;
      }

      console.log(`\n${boldYellow('● you:')} ${trimmedInput}`);

      try {
        const result = await processCLIInput(trimmedInput, worldState?.world || null, 'HUMAN');

        if (result.data?.exit) {
          if (isExiting) return;
          isExiting = true;
          clearPromptTimer(globalState);
          if (streaming.stopWait) streaming.stopWait();
          console.log(`\n${boldCyan('Goodbye!')}`);
          if (worldState) {
            await cleanupWorldSubscription(worldState);
            worldState = null;
          }
          rl.close();
          process.exit(0);
        }

        if (result.data?.selectWorld) {
          console.log(`\n${boldBlue('Discovering available worlds...')}`);
          const selectedWorld = await selectWorld(rootPath, rl);

          if (!selectedWorld) {
            console.log(error('No world selected.'));
            globalState.awaitingResponse = false;
            rl.prompt();
            return;
          }

          logger.debug(`Loading world: ${selectedWorld}`);
          try {
            if (worldState) {
              logger.debug('Cleaning up previous world subscription...');
              await cleanupWorldSubscription(worldState);
              worldState = null;
              await new Promise(resolve => setTimeout(resolve, 100));
            }

            worldState = await handleSubscribe(rootPath, selectedWorld, streaming, globalState, rl, handleActivityEvent);
            currentWorldName = selectedWorld;
            console.log(success(`Connected to world: ${currentWorldName}`));

            if (worldState?.world) {
              console.log(`${gray('Agents:')} ${yellow(String(worldState.world.agents?.size || 0))} ${gray('| Turn Limit:')} ${yellow(String(worldState.world.turnLimit || 'N/A'))}`);
            }
          } catch (err) {
            console.error(error(`Error loading world: ${err instanceof Error ? err.message : 'Unknown error'}`));
          }

          globalState.awaitingResponse = false;
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

        if (result.refreshWorld && currentWorldName && worldState) {
          try {
            console.log(boldBlue('Refreshing world state...'));

            worldState.activityMonitor.reset();

            const refreshedWorld = await worldState.subscription.refresh();
            worldState.world = refreshedWorld;

            console.log(success('World state refreshed'));
          } catch (err) {
            console.error(error(`Error refreshing world: ${err instanceof Error ? err.message : 'Unknown error'}`));
          }
        }

        if (!isCommand && monitor) {
          try {
            await monitor.waitForIdle({ snapshot: activitySnapshot });
          } catch (err) {
            console.error(error(`Error waiting for world activity: ${err instanceof Error ? err.message : 'Unknown error'}`));
          }
        }
      } catch (err) {
        console.error(error(`Command error: ${err instanceof Error ? err.message : 'Unknown error'}`));
      } finally {
        if (!isCommand) {
          globalState.awaitingResponse = false;
        }
      }

      if (isSelectCommand) {
        return;
      }

      if (isCommand) {
        rl.prompt();
      } else {
        if (streaming.stopWait) streaming.stopWait();
        rl.prompt();
      }
    });

    rl.on('close', () => {
      if (isExiting) return; // Prevent duplicate cleanup
      isExiting = true;
      clearPromptTimer(globalState);
      if (streaming.stopWait) streaming.stopWait();
      console.log(`\n${boldCyan('Goodbye!')}`);
      if (worldState) {
        void cleanupWorldSubscription(worldState);
        worldState = null;
      }
      process.exit(0);
    });

    rl.on('SIGINT', () => {
      if (isExiting) return; // Prevent duplicate cleanup
      isExiting = true;
      console.log(`\n${boldCyan('Shutting down...')}`);
      clearPromptTimer(globalState);
      if (streaming.stopWait) streaming.stopWait();
      console.log(`\n${boldCyan('Goodbye!')}`);
      if (worldState) {
        void cleanupWorldSubscription(worldState);
        worldState = null;
      }
      rl.close();
      process.exit(0);
    });

  } catch (err) {
    console.error(boldRed('Error starting interactive mode:'), err instanceof Error ? err.message : err);
    rl.close();
    process.exit(1);
  }
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

  const isPipelineMode = !!(
    options.command ||
    messageFromArgs ||
    !process.stdin.isTTY
  );

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
