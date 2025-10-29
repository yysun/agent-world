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
  disableStreaming,
  type WorldActivityEventPayload,
  type WorldActivityEventState
} from '../core/index.js';
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


type ActivityEventState = WorldActivityEventState;

interface ActivityEventSnapshot {
  activityId: number;
  state: ActivityEventState | null;
}

interface IdleWaiter {
  activityId: number;
  resolveCallback: () => void;
  rejectCallback: (error: Error) => void;
  seenProcessing: boolean;
  timeoutId?: ReturnType<typeof setTimeout>;
  noActivityTimeoutId?: ReturnType<typeof setTimeout>;
}

class WorldActivityMonitor {
  private lastEvent: (WorldActivityEventPayload & { timestampMs: number }) | null = null;
  private waiters: Set<IdleWaiter> = new Set();

  captureSnapshot(): ActivityEventSnapshot {
    return {
      activityId: this.lastEvent?.activityId ?? 0,
      state: this.lastEvent?.state ?? null
    };
  }

  handle(event: WorldActivityEventPayload): void {
    if (!event || (event.state !== 'processing' && event.state !== 'idle')) {
      return;
    }

    const timestampMsRaw = event.timestamp ? Date.parse(event.timestamp) : Date.now();
    const timestampMs = Number.isFinite(timestampMsRaw) ? timestampMsRaw : Date.now();

    this.lastEvent = {
      ...event,
      timestampMs
    };

    for (const waiter of Array.from(this.waiters)) {
      if (event.state === 'processing' && event.activityId > waiter.activityId) {
        waiter.seenProcessing = true;
        if (waiter.noActivityTimeoutId) {
          clearTimeout(waiter.noActivityTimeoutId);
          waiter.noActivityTimeoutId = undefined;
        }
      }

      if (event.state === 'idle') {
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
      timeoutMs = 60_000,
      noActivityTimeoutMs = 1_000
    } = options;

    const targetActivityId = snapshot.activityId;

    if (this.lastEvent && this.lastEvent.state === 'idle' && this.lastEvent.activityId > targetActivityId) {
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
        seenProcessing: false
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
        if (last.state === 'processing' && last.activityId > targetActivityId) {
          waiter.seenProcessing = true;
        }

        if (last.state === 'idle' && last.activityId === targetActivityId) {
          waiter.noActivityTimeoutId = setTimeout(() => this.finishWaiter(waiter, true), noActivityTimeoutMs);
        }

        if (last.state === 'idle' && last.activityId > targetActivityId) {
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

class ActivityProgressRenderer {
  private activeAgents = new Set<string>();

  handle(event: WorldActivityEventPayload): void {
    if (!event) return;

    if (event.state === 'idle') {
      this.reset();
      return;
    }

    const details = parseActivitySource(event.source);
    if (!details || details.type !== 'agent') {
      return;
    }

    if (event.change === 'start' && !this.activeAgents.has(details.name)) {
      this.activeAgents.add(details.name);
      console.log(`${boldGreen(details.name)} ${gray('thinking ...')}`);
    }

    if (event.change === 'end' && this.activeAgents.has(details.name)) {
      this.activeAgents.delete(details.name);
    }
  }

  reset(): void {
    if (this.activeAgents.size > 0) {
      this.activeAgents.clear();
      console.log(gray('All agents finished.'));
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

// Pipeline mode execution with timer-based cleanup
async function runPipelineMode(options: CLIOptions, messageFromArgs: string | null): Promise<void> {
  disableStreaming();

  try {
    let world: World | null = null;
    let worldSubscription: any = null;
    const activityMonitor = new WorldActivityMonitor();
    const progressRenderer = new ActivityProgressRenderer();

    const pipelineClient: ClientConnection = {
      isOpen: true,
      onWorldEvent: (eventType: string, eventData: any) => {
        if (eventType === 'world-activity') {
          activityMonitor.handle(eventData as WorldActivityEventPayload);
          progressRenderer.handle(eventData as WorldActivityEventPayload);
          return;
        }

        if (eventData.content && eventData.content.includes('Success message sent')) return;

        if ((eventType === 'system' || eventType === 'world') && (eventData.message || eventData.content)) {
          // existing logic
        } else if (eventType === 'message' && eventData.sender === 'system') {
          const msg = eventData.content;
          console.log(`${boldRed('● system:')} ${msg}`);
        }
        if (eventType === 'message' && eventData.content) {
          console.log(`${boldGreen('● ' + (eventData.sender || 'agent') + ':')} ${eventData.content}`);
        }
      },
      onError: (error: string) => {
        console.log(red(`Error: ${error}`));
      }
    };

    if (options.world) {
      worldSubscription = await subscribeWorld(options.world, pipelineClient);
      if (!worldSubscription) {
        console.error(boldRed(`Error: World '${options.world}' not found`));
        process.exit(1);
      }
      world = worldSubscription.world;
    }

    // Execute command from --command option
    if (options.command) {
      if (!options.command.startsWith('/') && !world) {
        console.error(boldRed('Error: World must be specified to send user messages'));
        process.exit(1);
      }
      const snapshot = activityMonitor.captureSnapshot();
      const result = await processCLIInput(options.command, world, 'HUMAN');
      printCLIResult(result);

      if (!options.command.startsWith('/') && world) {
        try {
          await activityMonitor.waitForIdle({ snapshot });
        } catch (error) {
          console.error(red(`Timed out waiting for responses: ${(error as Error).message}`));
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
      const result = await processCLIInput(messageFromArgs, world, 'HUMAN');
      printCLIResult(result);

      try {
        await activityMonitor.waitForIdle({ snapshot });
      } catch (error) {
        console.error(red(`Timed out waiting for responses: ${(error as Error).message}`));
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
          await activityMonitor.waitForIdle({ snapshot });
        } catch (error) {
          console.error(red(`Timed out waiting for responses: ${(error as Error).message}`));
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
      await worldSubscription.unsubscribe();
    }
    process.exit(0);
  } catch (error) {
    console.error(boldRed('Error:'), error instanceof Error ? error.message : error);
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

// World subscription handler
async function handleSubscribe(
  rootPath: string,
  worldName: string,
  streaming: StreamingState,
  globalState: GlobalState,
  activityMonitor: WorldActivityMonitor,
  progressRenderer: ActivityProgressRenderer,
  rl?: readline.Interface
): Promise<WorldState | null> {
  const cliClient: ClientConnection = {
    isOpen: true,
    onWorldEvent: (eventType: string, eventData: any) => {
      handleWorldEvent(eventType, eventData, streaming, globalState, activityMonitor, progressRenderer, rl);
    },
    onError: (error: string) => {
      console.log(red(`Error: ${error}`));
    }
  };

  const subscription = await subscribeWorld(worldName, cliClient);
  if (!subscription) throw new Error('Failed to load world');

  return { subscription, world: subscription.world as World };
}

// Handle world events with streaming support
function handleWorldEvent(
  eventType: string,
  eventData: any,
  streaming: StreamingState,
  globalState: GlobalState,
  activityMonitor: WorldActivityMonitor,
  progressRenderer: ActivityProgressRenderer,
  rl?: readline.Interface
): void {
  if (eventType === 'world-activity') {
    const payload = eventData as WorldActivityEventPayload;
    activityMonitor.handle(payload);
    progressRenderer.handle(payload);

    if (payload.state === 'idle' && rl && globalState.awaitingResponse) {
      globalState.awaitingResponse = false;
      rl.prompt();
    }
    return;
  }

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
  const activityMonitor = new WorldActivityMonitor();
  const progressRenderer = new ActivityProgressRenderer();

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
        rl.prompt();
      } else {
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

  try {
    // Load initial world or prompt for selection
    if (options.world) {
      logger.debug(`Loading world: ${options.world}`);
      try {
        activityMonitor.reset();
        progressRenderer.reset();
        worldState = await handleSubscribe(rootPath, options.world, streaming, globalState, activityMonitor, progressRenderer, rl);
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
        activityMonitor.reset();
        progressRenderer.reset();
        worldState = await handleSubscribe(rootPath, selectedWorld, streaming, globalState, activityMonitor, progressRenderer, rl);
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
        rl.prompt();
        return;
      }

      // Check for exit commands before anything else
      const isExitCommand = trimmedInput.toLowerCase() === '/exit' || trimmedInput.toLowerCase() === '/quit';
      if (isExitCommand) {
        if (isExiting) return;
        isExiting = true;
        // Clear any existing timers immediately
        clearPromptTimer(globalState);
        if (streaming.stopWait) streaming.stopWait();
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
          clearPromptTimer(globalState);
          if (streaming.stopWait) streaming.stopWait();
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
            rl.prompt();
            return;
          }

          logger.debug(`Loading world: ${selectedWorld}`);
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
            logger.debug(`Subscribing to world: ${selectedWorld}...`);
            activityMonitor.reset();
            progressRenderer.reset();
            worldState = await handleSubscribe(rootPath, selectedWorld, streaming, globalState, activityMonitor, progressRenderer, rl);
            currentWorldName = selectedWorld;
            console.log(success(`Connected to world: ${currentWorldName}`));

            if (worldState?.world) {
              console.log(`${gray('Agents:')} ${yellow(String(worldState.world.agents?.size || 0))} ${gray('| Turn Limit:')} ${yellow(String(worldState.world.turnLimit || 'N/A'))}`);
            }
          } catch (err) {
            console.error(error(`Error loading world: ${err instanceof Error ? err.message : 'Unknown error'}`));
          }

          // Show prompt immediately after world selection
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

        // if (result.data && !(result.data.sender === 'HUMAN')) {
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
            console.log(boldBlue('Refreshing world state...'));

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
              rl.prompt();
            }
          }
          continue;
        }

        // Set timer based on input type: commands get short delay, messages get longer delay
        const isSelectCommand = trimmedInput.toLowerCase() === '/select';

        if (isSelectCommand) {
          // For select command, prompt is already shown in the handler
          return;
      } else if (isCommand) {
        // For other commands, show prompt immediately
        rl.prompt();
      } else if (streaming.wait) {
        // For messages, wait for potential agent responses
        streaming.wait(5000);
      }
    });

    rl.on('close', () => {
      if (isExiting) return; // Prevent duplicate cleanup
      isExiting = true;
      clearPromptTimer(globalState);
      if (streaming.stopWait) streaming.stopWait();
      console.log(`\n${boldCyan('Goodbye!')}`);
      if (worldState) cleanupWorldSubscription(worldState);
      process.exit(0);
    });

    rl.on('SIGINT', () => {
      if (isExiting) return; // Prevent duplicate cleanup
      isExiting = true;
      console.log(`\n${boldCyan('Shutting down...')}`);
      clearPromptTimer(globalState);
      if (streaming.stopWait) streaming.stopWait();
      console.log(`\n${boldCyan('Goodbye!')}`);
      if (worldState) cleanupWorldSubscription(worldState);
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
