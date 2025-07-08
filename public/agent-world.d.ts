declare module "core/logger" {
    /**
     * Simple Logger Module - Zero-Dependency Cross-Platform Logging
     *
     * Features:
     * - Pure console-based logging (Node.js/browser compatible)
     * - Category-specific loggers with independent levels
     * - Configuration-driven setup with level filtering
     * - Zero external dependencies
     *
     * Categories: ws, cli, core, storage, llm, events, api, server
     * Usage: initializeLogger(config) → createCategoryLogger(category)
     * Implementation: Console methods with structured output formatting
     */
    export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';
    export interface Logger {
        trace: (msg: any, ...args: any[]) => void;
        debug: (msg: any, ...args: any[]) => void;
        info: (msg: any, ...args: any[]) => void;
        warn: (msg: any, ...args: any[]) => void;
        error: (msg: any, ...args: any[]) => void;
        level: LogLevel;
    }
    export interface LoggerConfig {
        globalLevel?: LogLevel;
        categoryLevels?: Record<string, LogLevel>;
    }
    export function initializeLogger(config?: LoggerConfig): void;
    export function createCategoryLogger(category: string): Logger;
    export function getCategoryLogLevel(category: string): LogLevel;
    export function shouldLogForCategory(messageLevel: LogLevel, category: string): boolean;
    export const logger: Logger;
    export default logger;
}
declare module "core/types" {
    /**
     * Core type definitions for the Agent World system.
     *
     * Features:
     * - Agent configuration and state management with comprehensive LLM provider support (flattened structure)
     * - Event system with strict payload typing and union types for type safety (MESSAGE, WORLD, SSE, SYSTEM)
     * - AI SDK compatible chat messages with utility functions for seamless LLM integration
     * - Storage provider interfaces and file management with world-specific operations
     * - World EventEmitter event data structures for isolated event handling
     * - Zod schemas for runtime validation and type safety (where applicable)
     * - Comprehensive LLM provider enumeration supporting all major services
     *
     * Core Types:
     * - ChatMessage: AI SDK compatible interface with Date objects and optional sender field
     * - AgentMessage: Extended ChatMessage with custom fields for agent-specific data
     * - Agent: Flattened interface with all LLM provider configurations and memory management
     * - World: Complete world interface with agent operations and configuration management
     * - Event System: Union types for type-safe payload handling across different event types
     * - LLM Provider Support: Comprehensive enumeration covering OpenAI, Anthropic, Azure, Google, XAI, Ollama
     *
     * Implementation Details:
     * - Event system using union types for type-safe payloads preventing runtime errors
     * - Agent memory structure with message history and activity tracking for conversation context
     * - Utility functions to strip custom fields before LLM calls ensuring AI SDK compatibility
     * - Comprehensive LLM provider support covering all major commercial and open-source options
     * - World event structures for World.eventEmitter integration with proper typing
     * - Flattened Agent interface for simplified property access and configuration management
     * - Storage interfaces supporting world-specific file operations and data persistence
     *
     * AI SDK Integration:
     * - ChatMessage interface fully compatible with AI SDK requirements
     * - stripCustomFields utility removes agent-specific fields before LLM calls
     * - Date objects preserved for timestamp tracking and conversation history
     * - Message role system supporting system, user, and assistant roles
     *
     * Recent Changes:
     * - Enhanced comment documentation with comprehensive feature descriptions
     * - Added detailed implementation notes about AI SDK compatibility and type safety
     * - Improved type descriptions with usage examples and integration details
     */
    import { EventEmitter } from 'events';
    export interface ChatMessage {
        role: 'system' | 'user' | 'assistant';
        content: string;
        createdAt?: Date;
    }
    export interface AgentMessage extends ChatMessage {
        sender?: string;
    }
    export interface Agent {
        id: string;
        name: string;
        type: string;
        status?: 'active' | 'inactive' | 'error';
        provider: LLMProvider;
        model: string;
        systemPrompt?: string;
        temperature?: number;
        maxTokens?: number;
        createdAt?: Date;
        lastActive?: Date;
        llmCallCount: number;
        lastLLMCall?: Date;
        memory: AgentMessage[];
        world?: World;
        generateResponse(messages: AgentMessage[]): Promise<string>;
        streamResponse(messages: AgentMessage[]): Promise<string>;
        addToMemory(message: AgentMessage): Promise<void>;
        getMemorySize(): number;
        archiveMemory(): Promise<void>;
        getMemorySlice(start: number, end: number): AgentMessage[];
        searchMemory(query: string): AgentMessage[];
        shouldRespond(messageEvent: WorldMessageEvent): Promise<boolean>;
        processMessage(messageEvent: WorldMessageEvent): Promise<void>;
        extractMentions(content: string): string[];
        isMentioned(content: string): boolean;
    }
    export interface MessageData {
        name: string;
        payload: any;
        id: string;
        sender?: string;
        content?: string;
        agentName?: string;
    }
    export interface MessageEventPayload {
        content: string;
        sender: string;
    }
    export interface SystemEventPayload {
        action: string;
        agentName?: string;
        worldName?: string;
        content?: string;
        timestamp?: string;
    }
    export interface SSEEventPayload {
        agentName: string;
        type: 'start' | 'chunk' | 'end' | 'error';
        content?: string;
        error?: string;
        messageId?: string;
        usage?: {
            inputTokens: number;
            outputTokens: number;
            totalTokens: number;
        };
    }
    export interface WorldEventPayload {
        action: string;
        worldId?: string;
        agentId?: string;
        data?: any;
    }
    /**
     * Event payload mapping for type-safe event handling
     * Maps each EventType to its corresponding payload type
     */
    export type EventPayloadMap = {
        [EventType.MESSAGE]: MessageEventPayload;
        [EventType.SYSTEM]: SystemEventPayload;
        [EventType.SSE]: SSEEventPayload;
        [EventType.WORLD]: WorldEventPayload;
    };
    /**
     * Type-safe event structure using conditional types
     * Ensures payload type matches the event type
     */
    export type TypedEvent<T extends EventType> = {
        id: string;
        type: T;
        timestamp: string;
        sender: string;
        senderType: SenderType;
        payload: EventPayloadMap[T];
    };
    export interface Event {
        id: string;
        type: EventType;
        timestamp: string;
        sender: string;
        senderType: SenderType;
        payload: MessageEventPayload | SystemEventPayload | SSEEventPayload | WorldEventPayload;
    }
    export enum EventType {
        MESSAGE = "message",
        WORLD = "world",
        SSE = "sse",
        SYSTEM = "system"
    }
    export enum SenderType {
        SYSTEM = "system",
        WORLD = "world",
        AGENT = "agent",
        HUMAN = "human"
    }
    /**
     * Base agent parameters - single source of truth for agent properties
     */
    export interface BaseAgentParams {
        name: string;
        type: string;
        provider: LLMProvider;
        model: string;
        systemPrompt?: string;
        temperature?: number;
        maxTokens?: number;
    }
    /**
     * Agent creation parameters - extends base with optional ID
     */
    export interface CreateAgentParams extends BaseAgentParams {
        id?: string;
    }
    /**
     * Agent update parameters - partial base with additional status field
     */
    export interface UpdateAgentParams extends Partial<BaseAgentParams> {
        status?: 'active' | 'inactive' | 'error';
    }
    /**
     * Agent information type - derived from Agent interface for consistency
     * Uses Pick utility type to ensure automatic synchronization with Agent changes
     */
    export type AgentInfo = Pick<Agent, 'id' | 'name' | 'type' | 'model' | 'status' | 'createdAt' | 'lastActive' | 'llmCallCount'> & {
        memorySize: number;
    };
    /**
     * Storage-safe agent type - excludes runtime methods for persistence
     * Uses Omit utility type to remove all methods, keeping only data properties
     */
    export type AgentStorage = Omit<Agent, 'generateResponse' | 'streamResponse' | 'addToMemory' | 'getMemorySize' | 'archiveMemory' | 'getMemorySlice' | 'searchMemory' | 'shouldRespond' | 'processMessage' | 'extractMentions' | 'isMentioned' | 'world'>;
    /**
     * Base world parameters - single source of truth for world properties
     */
    export interface BaseWorldParams {
        name: string;
        description?: string;
        turnLimit?: number;
    }
    /**
     * World creation parameters - identical to base for now
     */
    export interface CreateWorldParams extends BaseWorldParams {
    }
    /**
     * World update parameters - partial base for flexible updates
     */
    export interface UpdateWorldParams extends Partial<BaseWorldParams> {
    }
    /**
     * Enhanced World interface with flattened configuration
     */
    export interface World {
        id: string;
        rootPath: string;
        name: string;
        description?: string;
        turnLimit: number;
        eventEmitter: EventEmitter;
        agents: Map<string, Agent>;
        storage: StorageManager;
        messageProcessor: MessageProcessor;
        createAgent(params: CreateAgentParams): Promise<Agent>;
        getAgent(agentName: string): Promise<Agent | null>;
        updateAgent(agentName: string, updates: UpdateAgentParams): Promise<Agent | null>;
        deleteAgent(agentName: string): Promise<boolean>;
        clearAgentMemory(agentName: string): Promise<Agent | null>;
        listAgents(): Promise<AgentInfo[]>;
        updateAgentMemory(agentName: string, messages: AgentMessage[]): Promise<Agent | null>;
        saveAgentConfig(agentName: string): Promise<void>;
        save(): Promise<void>;
        delete(): Promise<boolean>;
        reload(): Promise<void>;
        getTurnLimit(): number;
        getCurrentTurnCount(): number;
        hasReachedTurnLimit(): boolean;
        resetTurnCount(): void;
        publishMessage(content: string, sender: string): void;
        subscribeToMessages(handler: (event: WorldMessageEvent) => void): () => void;
        broadcastMessage(message: string, sender?: string): void;
        publishSSE(data: Partial<WorldSSEEvent>): void;
        subscribeToSSE(handler: (event: WorldSSEEvent) => void): () => void;
        subscribeAgent(agent: Agent): () => void;
        unsubscribeAgent(agentId: string): void;
        getSubscribedAgents(): string[];
        isAgentSubscribed(agentId: string): boolean;
    }
    /**
     * Storage-safe world data type - excludes runtime objects for persistence
     */
    export type WorldStorage = Pick<World, 'id' | 'name' | 'description' | 'turnLimit'>;
    export interface WorldData {
        id: string;
        name: string;
        description?: string;
        turnLimit: number;
    }
    export interface StorageManager {
        saveWorld(worldData: WorldData): Promise<void>;
        loadWorld(worldId: string): Promise<WorldData | null>;
        deleteWorld(worldId: string): Promise<boolean>;
        listWorlds(): Promise<WorldData[]>;
        saveAgent(worldId: string, agent: Agent): Promise<void>;
        loadAgent(worldId: string, agentId: string): Promise<Agent | null>;
        deleteAgent(worldId: string, agentId: string): Promise<boolean>;
        listAgents(worldId: string): Promise<Agent[]>;
        saveAgentsBatch(worldId: string, agents: Agent[]): Promise<void>;
        loadAgentsBatch(worldId: string, agentIds: string[]): Promise<Agent[]>;
        validateIntegrity(worldId: string, agentId?: string): Promise<boolean>;
        repairData(worldId: string, agentId?: string): Promise<boolean>;
    }
    export interface MessageProcessor {
        extractMentions(content: string): string[];
        extractParagraphBeginningMentions(content: string): string[];
        determineSenderType(sender: string | undefined): SenderType;
        shouldAutoMention(response: string, sender: string, agentId: string): boolean;
        addAutoMention(response: string, sender: string): string;
        removeSelfMentions(response: string, agentId: string): string;
    }
    /**
     * @deprecated Use World interface directly
     * WorldConfig is deprecated in favor of flattened World structure
     */
    export interface WorldConfig {
        name: string;
        description?: string;
        turnLimit?: number;
    }
    export interface FileStorageOptions {
        dataPath?: string;
        enableLogging?: boolean;
    }
    export interface StoragePaths {
        agents: string;
        messages: string;
        events: string;
    }
    export enum LLMProvider {
        OPENAI = "openai",
        ANTHROPIC = "anthropic",
        AZURE = "azure",
        GOOGLE = "google",
        XAI = "xai",
        OPENAI_COMPATIBLE = "openai-compatible",
        OLLAMA = "ollama"
    }
    export function stripCustomFields(message: AgentMessage): ChatMessage;
    export function stripCustomFieldsFromMessages(messages: AgentMessage[]): ChatMessage[];
    /**
     * World message event data structure for World.eventEmitter
     */
    export interface WorldMessageEvent {
        content: string;
        sender: string;
        timestamp: Date;
        messageId: string;
    }
    /**
     * World SSE event data structure for World.eventEmitter
     */
    export interface WorldSSEEvent {
        agentName: string;
        type: 'start' | 'chunk' | 'end' | 'error';
        content?: string;
        error?: string;
        messageId: string;
        usage?: {
            inputTokens: number;
            outputTokens: number;
            totalTokens: number;
        };
    }
}
declare module "core/utils" {
    /**
     * Manager Utilities - Helper functions for managers and agent processing
     *
     * Features:
     * - Unique ID generation for events and messages using crypto.randomUUID()
     * - Manager-specific utility functions for string manipulation and processing
     * - String manipulation utilities (kebab-case conversion for IDs and names)
     * - Agent and message processing utilities with world-aware operations
     * - LLM message preparation with conversation history and system prompts
     * - Mention extraction with first-mention-only logic and case-insensitive matching
     * - Sender type detection for humans, agents, and system messages
     *
     * Core Utilities:
     * - generateId: Crypto-based unique ID generation for messages and events
     * - toKebabCase: String conversion for consistent naming conventions
     * - getWorldTurnLimit: World-specific turn limit retrieval with fallback defaults
     * - extractMentions: Case-insensitive mention extraction with first-mention-only logic
     * - determineSenderType: Sender classification for message filtering and processing
     * - prepareMessagesForLLM: Message formatting for LLM calls with history and system prompts
     *
     * Implementation Details:
     * - Uses native crypto.randomUUID() for ID generation ensuring uniqueness
     * - Self-contained utility functions with no external dependencies
     * - Ready for manager module integration with consistent interfaces
     * - All types imported from types.ts for better organization and reusability
     * - World-aware functions that respect world-specific configurations
     * - Message processing utilities that handle AI SDK compatibility
     *
     * Recent Changes:
     * - Enhanced comment documentation with detailed feature descriptions
     * - Improved function descriptions with implementation details
     * - Added details about world-aware operations and LLM integration
     */
    /**
     * Generate unique ID for messages and events
     */
    export function generateId(): string;
    /**
     * Simple runtime environment detection
     * Returns true for Node.js, false for browser
     */
    export function isNodeEnvironment(): boolean;
    /**
     * Convert a string to kebab-case
     * @param str - The string to convert
     * @returns The kebab-case version of the string
     */
    export function toKebabCase(str: string): string;
    import { World, Agent, SenderType, MessageData, AgentMessage } from "core/types";
    /**
     * Get world-specific turn limit or default value
     */
    export function getWorldTurnLimit(world: World): number;
    /**
     * Extract @mentions from message content - returns only first valid mention
     * Implements first-mention-only logic to prevent multiple agent responses
     */
    export function extractMentions(content: string): string[];
    /**
     * Extract @mentions that appear at the beginning of paragraphs
     * Implements paragraph-beginning-only logic for agent response triggering
     *
     * @param content - The message content to search for mentions
     * @returns Array of mention names (lowercase) that appear at paragraph beginnings
     */
    export function extractParagraphBeginningMentions(content: string): string[];
    /**
     * Determine sender type based on sender name (matches src/agent.ts logic)
     */
    export function determineSenderType(sender: string | undefined): SenderType;
    /**
     * Convert MessageData to AgentMessage for memory storage
     */
    export function messageDataToAgentMessage(messageData: MessageData): AgentMessage;
    /**
     * Prepare messages array for LLM using standard chat message format
     */
    export function prepareMessagesForLLM(agent: Agent, messageData: MessageData, conversationHistory?: AgentMessage[]): AgentMessage[];
}
declare module "core/world-storage" {
    /**
     * Serializable world data for storage (flat structure, no EventEmitter, no agents Map)
     */
    export interface WorldData {
        id: string;
        name: string;
        description?: string;
        turnLimit: number;
    }
    /**
     * Get world directory path using kebab-case world name
     */
    export function getWorldDir(rootPath: string, worldId: string): string;
    /**
     * Ensure world directory structure exists
     */
    export function ensureWorldDirectory(root: string, worldId: string): Promise<void>;
    /**
     * Check if world directory exists on disk
     */
    export function worldExistsOnDisk(root: string, worldId: string): Promise<boolean>;
    /**
     * Save world configuration to disk (excludes eventEmitter and agents)
     */
    export function saveWorldToDisk(root: string, worldData: WorldData): Promise<void>;
    /**
     * Load world configuration from disk
     */
    export function loadWorldFromDisk(root: string, worldId: string): Promise<WorldData | null>;
    /**
     * Delete world directory and all contents
     */
    export function deleteWorldFromDisk(root: string, worldId: string): Promise<boolean>;
    /**
     * Load all worlds from root directory
     */
    export function loadAllWorldsFromDisk(root: string): Promise<WorldData[]>;
}
declare module "core/agent-storage" {
    import { Agent, AgentMessage } from "core/types";
    /**
     * Agent loading options for enhanced control
     */
    export interface AgentLoadOptions {
        includeMemory?: boolean;
        retryCount?: number;
        retryDelay?: number;
        allowPartialLoad?: boolean;
        validateIntegrity?: boolean;
    }
    /**
     * Agent integrity check result
     */
    export interface AgentIntegrityResult {
        isValid: boolean;
        hasConfig: boolean;
        hasSystemPrompt: boolean;
        hasMemory: boolean;
        errors: string[];
        warnings: string[];
    }
    /**
     * Batch loading result with success and failure tracking
     */
    export interface BatchLoadResult {
        successful: Agent[];
        failed: Array<{
            agentId: string;
            error: string;
        }>;
        totalCount: number;
        successCount: number;
        failureCount: number;
    }
    /**
     * Get agent directory path using kebab-case agent name
     */
    export function getAgentDir(rootPath: string, worldId: string, agentId: string): string;
    /**
     * Ensure agent directory structure exists
     */
    export function ensureAgentDirectory(rootPath: string, worldId: string, agentId: string): Promise<void>;
    /**
     * Check if agent directory exists on disk
     */
    export function agentExistsOnDisk(rootPath: string, worldId: string, agentId: string): Promise<boolean>;
    /**
     * Validate agent data integrity
     */
    export function validateAgentIntegrity(rootPath: string, worldId: string, agentId: string): Promise<AgentIntegrityResult>;
    /**
     * Attempt to repair corrupted agent data
     */
    export function repairAgentData(rootPath: string, worldId: string, agentId: string): Promise<boolean>;
    /**
     * Save agent to disk with three-file structure
     */
    export function saveAgentToDisk(rootPath: string, worldId: string, agent: Agent): Promise<void>;
    /**
     * Save agent configuration and system prompt to disk without memory
     * This is useful for saving agent metadata changes without including chat history
     */
    export function saveAgentConfigToDisk(rootPath: string, worldId: string, agent: Agent): Promise<void>;
    /**
     * Save only agent memory to disk (performance optimized)
     */
    export function saveAgentMemoryToDisk(rootPath: string, worldId: string, agentId: string, memory: AgentMessage[]): Promise<void>;
    /**
     * Archive agent memory to timestamped file before clearing
     */
    export function archiveAgentMemory(rootPath: string, worldId: string, agentId: string, memory: AgentMessage[]): Promise<void>;
    /**
     * Enhanced agent loading with retry mechanism and partial recovery
     */
    export function loadAgentFromDiskWithRetry(rootPath: string, worldId: string, agentId: string, options?: AgentLoadOptions): Promise<Agent | null>;
    /**
     * Load agent from disk with complete data reconstruction (original method)
     */
    export function loadAgentFromDisk(rootPath: string, worldId: string, agentId: string): Promise<Agent | null>;
    /**
     * Optimized batch loading with parallel processing
     */
    export function loadAllAgentsFromDiskBatch(rootPath: string, worldId: string, options?: AgentLoadOptions): Promise<BatchLoadResult>;
    /**
     * Load all agents from world directory (original method)
     */
    export function loadAllAgentsFromDisk(rootPath: string, worldId: string): Promise<Agent[]>;
    /**
     * Delete agent directory and all files
     */
    export function deleteAgentFromDisk(rootPath: string, worldId: string, agentId: string): Promise<boolean>;
}
declare module "core/llm-config" {
    /**
     * LLM Configuration Module - Browser-Safe Provider Configuration Management
     *
     * Features:
     * - Browser-safe configuration storage for all LLM providers
     * - Type-safe configuration interfaces for each provider
     * - Configuration injection and validation functions
     * - Clear error messages for missing configuration
     * - Zero Node.js dependencies for browser compatibility
     *
     * Provider Configuration Support:
     * - OpenAI: API key configuration
     * - Anthropic: API key configuration
     * - Google: API key configuration
     * - Azure: API key, endpoint, and deployment configuration
     * - XAI: API key configuration
     * - OpenAI-Compatible: API key and base URL configuration
     * - Ollama: Base URL configuration
     *
     * Usage:
     * - configureLLMProvider: Set configuration for a specific provider
     * - getLLMProviderConfig: Get configuration for a specific provider
     * - validateProviderConfig: Validate that required configuration is present
     * - clearAllConfiguration: Clear all provider configurations (for testing)
     *
     * Implementation Details:
     * - Global configuration store with provider-specific sections
     * - Type-safe interfaces prevent configuration errors
     * - Validation functions ensure required settings are present
     * - No external dependencies for maximum browser compatibility
     * - Clear error messages guide users to correct configuration issues
     *
     * Recent Changes:
     * - Initial implementation with all provider configuration interfaces
     * - Added configuration injection and validation functions
     * - Implemented browser-safe global configuration store
     * - Added comprehensive error handling and validation
     */
    import { LLMProvider } from "core/types";
    /**
     * Provider-specific configuration interfaces - Enhanced with TypeScript Utility Types
     */
    /**
     * Base configuration interface for all providers
     */
    export interface BaseLLMConfig {
        apiKey?: string;
        baseUrl?: string;
        endpoint?: string;
        deployment?: string;
        apiVersion?: string;
    }
    /**
     * OpenAI configuration - requires only API key
     */
    export type OpenAIConfig = Required<Pick<BaseLLMConfig, 'apiKey'>>;
    /**
     * Anthropic configuration - requires only API key
     */
    export type AnthropicConfig = Required<Pick<BaseLLMConfig, 'apiKey'>>;
    /**
     * Google configuration - requires only API key
     */
    export type GoogleConfig = Required<Pick<BaseLLMConfig, 'apiKey'>>;
    /**
     * Azure configuration - requires API key, endpoint, and deployment
     */
    export type AzureConfig = Required<Pick<BaseLLMConfig, 'apiKey' | 'endpoint' | 'deployment'>> & Partial<Pick<BaseLLMConfig, 'apiVersion'>>;
    /**
     * XAI configuration - requires only API key
     */
    export type XAIConfig = Required<Pick<BaseLLMConfig, 'apiKey'>>;
    /**
     * OpenAI-Compatible configuration - requires API key and base URL
     */
    export type OpenAICompatibleConfig = Required<Pick<BaseLLMConfig, 'apiKey' | 'baseUrl'>>;
    /**
     * Ollama configuration - requires only base URL
     */
    export type OllamaConfig = Required<Pick<BaseLLMConfig, 'baseUrl'>>;
    /**
     * Provider configuration mapping for type-safe access
     */
    export type ProviderConfigMap = {
        [LLMProvider.OPENAI]: OpenAIConfig;
        [LLMProvider.ANTHROPIC]: AnthropicConfig;
        [LLMProvider.GOOGLE]: GoogleConfig;
        [LLMProvider.AZURE]: AzureConfig;
        [LLMProvider.XAI]: XAIConfig;
        [LLMProvider.OPENAI_COMPATIBLE]: OpenAICompatibleConfig;
        [LLMProvider.OLLAMA]: OllamaConfig;
    };
    /**
     * Union type for all provider configurations
     */
    export type ProviderConfig = ProviderConfigMap[keyof ProviderConfigMap];
    /**
     * Configure a specific LLM provider with type-safe configuration
     */
    export function configureLLMProvider<T extends LLMProvider>(provider: T, config: ProviderConfigMap[T]): void;
    /**
     * Get configuration for a specific provider
     */
    export function getLLMProviderConfig<T extends LLMProvider>(provider: T): ProviderConfigMap[T];
    /**
     * Validate provider configuration
     */
    export function validateProviderConfig(provider: LLMProvider, config: any): void;
    /**
     * Check if a provider is configured
     */
    export function isProviderConfigured(provider: LLMProvider): boolean;
    /**
     * Get list of all configured providers
     */
    export function getConfiguredProviders(): LLMProvider[];
    /**
     * Clear all provider configurations (useful for testing)
     */
    export function clearAllConfiguration(): void;
    /**
     * Get configuration status for debugging
     */
    export function getConfigurationStatus(): Record<LLMProvider, boolean>;
}
declare module "core/llm-manager" {
    import { World, Agent, AgentMessage, LLMProvider } from "core/types";
    /**
     * LLM configuration interface
     */
    export interface LLMConfig {
        provider: LLMProvider;
        model: string;
        apiKey?: string;
        baseUrl?: string;
        temperature?: number;
        maxTokens?: number;
        ollamaBaseUrl?: string;
        azureEndpoint?: string;
        azureApiVersion?: string;
        azureDeployment?: string;
    }
    /**
     * Streaming agent response with SSE events via world's eventEmitter (queued)
     */
    export function streamAgentResponse(world: World, agent: Agent, messages: AgentMessage[]): Promise<string>;
    /**
     * Non-streaming LLM call (queued)
     */
    export function generateAgentResponse(world: World, agent: Agent, messages: AgentMessage[]): Promise<string>;
    /**
     * Get current LLM queue status for monitoring and debugging
     */
    export function getLLMQueueStatus(): {
        queueLength: number;
        processing: boolean;
        nextAgent?: string;
        nextWorld?: string;
        maxQueueSize: number;
    };
    /**
     * Emergency function to clear the LLM queue (for debugging/admin use)
     * Returns the number of items that were cleared
     */
    export function clearLLMQueue(): number;
}
declare module "core/events" {
    /**
     * Unified Events Module - World and Agent Event Functions
     *
     * Features:
     * - Direct World.eventEmitter event publishing and subscription with type safety
     * - Agent subscription and message processing logic with world context
     * - Natural event isolation per World instance ensuring no cross-world interference
     * - Zero dependencies on existing event systems or complex abstractions
     * - Type-safe event handling with proper interfaces and validation
     * - High-level message broadcasting with sender attribution and timestamping
     * - Fixed auto-mention functionality with proper self-mention removal order
     * - Preserved newline handling in LLM streaming responses for proper formatting
     *
     * Core Functions:
     * World Events:
     * - publishMessage: Emit message events to World.eventEmitter with automatic ID generation
     * - subscribeToMessages: Subscribe to World.eventEmitter message events with cleanup
     * - publishSSE: Emit SSE events for streaming responses with structured data
     * - subscribeToSSE: Subscribe to SSE streaming events with proper typing
     * - broadcastToWorld: High-level message broadcasting with default sender handling
     *
     * Agent Events:
     * - subscribeAgentToMessages: Auto-subscribe agent to world messages with filtering and reset logic
     * - resetLLMCallCountIfNeeded: Reset LLM call count for human/system messages with agent state persistence
     * - processAgentMessage: Handle agent message processing with world context and memory persistence
     * - shouldAgentRespond: Message filtering logic with world-specific turn limits and mention detection
     * - saveIncomingMessageToMemory: Passive memory storage independent of LLM processing
     * - shouldAutoMention: Determine if agent should auto-mention sender (fixed bug for all sender types)
     * - getValidMentions: Get all paragraph beginning mentions excluding self-mentions
     * - isSenderMentionedAtBeginning: Check if specific sender is mentioned at paragraph beginning
     *
     * Auto-Mention Logic (Enhanced to Prevent Loops):
     * - Step 1: Remove self-mentions from response beginning (prevents agent self-mention)
     * - Step 2: Add auto-mention for sender only if NO valid mentions exist at paragraph beginnings
     * - Fixed bug: Auto-mention all valid senders (human or agent), not just agents
     * - Fixed bug: Only skip auto-mention if ANY valid mentions exist at paragraph beginnings (excluding self)
     * - Uses extractParagraphBeginningMentions for consistent mention detection
     * - Prevents agent loops (e.g., @gm->@pro->@gm) by checking for ANY mention at beginning
     * - Allows redirections (e.g., @gm->@con) by preserving explicit mentions
     * - Handles case-insensitive matching while preserving original case
     * - Ensures published message matches stored memory content
     * - Preserves original formatting including newlines and whitespace structure
     *
     * Event Structure:
     * - Message Events: WorldMessageEvent with content, sender, timestamp, and messageId
     * - SSE Events: WorldSSEEvent with agentName, type, content, error, and usage data
     * - Automatic timestamp generation and unique ID assignment for all events
     * - Structured event data ensuring consistency across all event consumers
     *
     * Implementation Details:
     * - Uses World.eventEmitter.emit() and .on() directly for maximum performance
     * - No abstraction layers or complex providers reducing complexity and overhead
     * - Events are naturally scoped to World instance preventing event leakage
     * - Ready for agent subscription and LLM integration with consistent interfaces
     * - Subscription functions return cleanup callbacks for proper memory management
     * - All events include timestamps and unique IDs for debugging and tracing
     * - Newline preservation in LLM responses maintains proper text formatting
     * - LLM call count reset happens before shouldAgentRespond for accurate turn limit checking
     * - Agent state persistence ensures turn count resets are saved to disk immediately
     * - LLM call count is saved to disk after every LLM call and memory save operation
     */
    import { World, Agent, WorldMessageEvent, WorldSSEEvent } from "core/types";
    /**
     * Message publishing using World.eventEmitter
     */
    export function publishMessage(world: World, content: string, sender: string): void;
    /**
     * Message subscription using World.eventEmitter
     */
    export function subscribeToMessages(world: World, handler: (event: WorldMessageEvent) => void): () => void;
    /**
     * SSE events using World.eventEmitter
     */
    export function publishSSE(world: World, data: Partial<WorldSSEEvent>): void;
    /**
     * SSE subscription using World.eventEmitter
     */
    export function subscribeToSSE(world: World, handler: (event: WorldSSEEvent) => void): () => void;
    /**
     * Broadcast message to all agents in world
     */
    export function broadcastToWorld(world: World, message: string, sender?: string): void;
    /**
     * Auto-mention utility functions for processAgentMessage
     */
    /**
     * Check if response already has ANY mention at the beginning using extractParagraphBeginningMentions logic
     * This prevents auto-mention loops by detecting any existing mention, not just the sender's
     */
    export function hasAnyMentionAtBeginning(response: string): boolean;
    /**
     * Add auto-mention at the beginning of response, preserving case if found elsewhere
     * Modified to check for ANY mention at beginning to prevent loops
     */
    export function addAutoMention(response: string, sender: string): string;
    /**
     * Get all valid mentions at the beginning of every paragraph, excluding self-mentions
     * This is used to determine if auto-mention should be added
     */
    export function getValidMentions(response: string, agentId: string): string[];
    /**
     * Check if the specific sender is mentioned at the beginning of the response
     * This is more specific than hasAnyMentionAtBeginning - only checks for the sender
     */
    export function isSenderMentionedAtBeginning(response: string, sender: string): boolean;
    /**
     * Determine if agent should auto-mention the sender based on message context
     * Fixed bug: Should auto-mention sender regardless of sender type (human or agent)
     * Fixed bug: Only add auto-mention if NO valid mentions exist at paragraph beginnings
     */
    export function shouldAutoMention(response: string, sender: string, agentId: string): boolean;
    /**
     * Remove all consecutive self-mentions from response beginning (case-insensitive)
     */
    export function removeSelfMentions(response: string, agentId: string): string;
    /**
     * Agent subscription with automatic processing
     */
    export function subscribeAgentToMessages(world: World, agent: Agent): () => void;
    /**
     * Save incoming message to agent memory (independent of LLM processing)
     */
    export function saveIncomingMessageToMemory(world: World, agent: Agent, messageEvent: WorldMessageEvent): Promise<void>;
    /**
     * Agent message processing logic (enhanced from src/agent.ts)
     */
    export function processAgentMessage(world: World, agent: Agent, messageEvent: WorldMessageEvent): Promise<void>;
    /**
     * Reset LLM call count for human and system messages with agent state persistence
     * This should be called before shouldAgentRespond to ensure proper turn limit checking
     */
    export function resetLLMCallCountIfNeeded(world: World, agent: Agent, messageEvent: WorldMessageEvent): Promise<void>;
    /**
     * Enhanced message filtering logic (matches src/agent.ts shouldRespondToMessage)
     */
    export function shouldAgentRespond(world: World, agent: Agent, messageEvent: WorldMessageEvent): Promise<boolean>;
}
declare module "core/managers" {
    import type { World, CreateWorldParams, UpdateWorldParams, Agent, CreateAgentParams, UpdateAgentParams, AgentInfo, AgentMessage, WorldData } from "core/types";
    /**
     * World listing information
     */
    export interface WorldInfo {
        id: string;
        name: string;
        description?: string;
        turnLimit: number;
        agentCount: number;
    }
    /**
     * Create new world with configuration
     */
    export function createWorld(rootPath: string, params: CreateWorldParams): Promise<World>;
    /**
     * Load world configuration only (lightweight operation)
     * Automatically converts worldId to kebab-case for consistent lookup
     * Note: For full world with agents and events, use subscription layer
     * @deprecated Use getWorldConfig for explicit lightweight access or subscribeWorld for full world
     */
    export function getWorld(rootPath: string, worldId: string): Promise<World | null>;
    /**
     * Load full world by ID with EventEmitter reconstruction and agent loading
     * This is the function used by the subscription layer for complete world setup
     * Automatically converts worldId to kebab-case for consistent lookup
     */
    export function getFullWorld(rootPath: string, worldId: string): Promise<World | null>;
    /**
     * Update world configuration
     * Automatically converts worldId to kebab-case for consistent lookup
     */
    export function updateWorld(rootPath: string, worldId: string, updates: UpdateWorldParams): Promise<World | null>;
    /**
     * Delete world and all associated data
     * Automatically converts worldId to kebab-case for consistent lookup
     */
    export function deleteWorld(rootPath: string, worldId: string): Promise<boolean>;
    /**
     * Get all world IDs and basic information
     */
    export function listWorlds(rootPath: string): Promise<WorldInfo[]>;
    /**
     * Get world configuration without runtime objects (lightweight operation)
     * Automatically converts worldId to kebab-case for consistent lookup
     */
    export function getWorldConfig(rootPath: string, worldId: string): Promise<WorldData | null>;
    /**
     * Batch agent creation parameters
     */
    export interface BatchCreateParams {
        agents: CreateAgentParams[];
        failOnError?: boolean;
        maxConcurrency?: number;
    }
    /**
     * Batch creation result
     */
    export interface BatchCreateResult {
        successful: Agent[];
        failed: Array<{
            params: CreateAgentParams;
            error: string;
        }>;
        totalCount: number;
        successCount: number;
        failureCount: number;
    }
    /**
     * Agent runtime registration options
     */
    export interface RuntimeRegistrationOptions {
        updateWorldMap?: boolean;
        validateAgent?: boolean;
    }
    /**
     * World synchronization result
     */
    export interface WorldSyncResult {
        loadedCount: number;
        errorCount: number;
        repairedCount: number;
        errors: Array<{
            agentId: string;
            error: string;
        }>;
    }
    /**
     * Register agent in world runtime without persistence
     */
    export function registerAgentRuntime(rootPath: string, worldId: string, agent: Agent, options?: RuntimeRegistrationOptions): Promise<boolean>;
    /**
     * Load all agents from disk into world runtime
     */
    export function loadAgentsIntoWorld(rootPath: string, worldId: string, options?: any): Promise<WorldSyncResult>;
    /**
     * Synchronize world agents Map with disk state
     */
    export function syncWorldAgents(rootPath: string, worldId: string): Promise<WorldSyncResult>;
    /**
     * Create multiple agents atomically
     */
    export function createAgentsBatch(rootPath: string, worldId: string, params: BatchCreateParams): Promise<BatchCreateResult>;
    /**
     * Create new agent with configuration and system prompt
     */
    export function createAgent(rootPath: string, worldId: string, params: CreateAgentParams): Promise<Agent>;
    /**
     * Load agent by ID with full configuration and memory
     */
    export function getAgent(rootPath: string, worldId: string, agentId: string): Promise<Agent | null>;
    /**
     * Update agent configuration and/or memory
     */
    export function updateAgent(rootPath: string, worldId: string, agentId: string, updates: UpdateAgentParams): Promise<Agent | null>;
    /**
     * Delete agent and all associated data
     */
    export function deleteAgent(rootPath: string, worldId: string, agentId: string): Promise<boolean>;
    /**
     * Get all agent IDs and basic information
     */
    export function listAgents(rootPath: string, worldId: string): Promise<AgentInfo[]>;
    /**
     * Add messages to agent memory
     */
    export function updateAgentMemory(rootPath: string, worldId: string, agentId: string, messages: AgentMessage[]): Promise<Agent | null>;
    /**
     * Clear agent memory (archive current memory then reset to empty state)
     * Also resets the LLM call count to 0
     */
    export function clearAgentMemory(rootPath: string, worldId: string, agentId: string): Promise<Agent | null>;
    /**
     * Get agent configuration without memory (lightweight operation)
     */
    export function getAgentConfig(rootPath: string, worldId: string, agentId: string): Promise<Omit<Agent, 'memory'> | null>;
}
declare module "core/subscription" {
    /**
     * World Subscription Management Module
     *
     * Features:
     * - Centralized world subscription and event handling
     * - Transport-agnostic client connection interface
     * - Event listener setup and cleanup management
     * - Memory leak prevention and proper resource cleanup
     * - World instance isolation and complete destruction during refresh
     * - EventEmitter recreation and agent map repopulation
     *
     * Purpose:
     * - Preserve essential world subscription functionality
     * - Maintain transport abstraction for CLI and WebSocket
     * - Provide code reuse for event handling across transports
     * - Ensure proper world lifecycle management across refresh operations
     * - WebSocket command processing moved to server/ws.ts for better separation
     *
     * World Refresh Architecture:
     * - Each subscription maintains reference to current world instance
     * - Refresh completely destroys old world (EventEmitter, agents map, listeners)
     * - Creates fresh world instance with new EventEmitter and repopulated agents
     * - Prevents event crosstalk between old and new world instances
     * - Maintains subscription continuity for client connections
     */
    import { World } from "core/types";
    export interface ClientConnection {
        isOpen: boolean;
        onWorldEvent?: (eventType: string, eventData: any) => void;
        onError?: (error: string) => void;
    }
    export interface WorldSubscription {
        world: World;
        unsubscribe: () => Promise<void>;
        refresh: (rootPath: string) => Promise<World>;
        destroy: () => Promise<void>;
    }
    export function startWorld(world: World, client: ClientConnection): Promise<WorldSubscription>;
    export function subscribeWorld(worldIdentifier: string, rootPath: string, client: ClientConnection): Promise<WorldSubscription | null>;
    export function setupWorldEventListeners(world: World, client: ClientConnection): Map<string, (...args: any[]) => void>;
    export function cleanupWorldSubscription(world: World, worldEventListeners: Map<string, (...args: any[]) => void>): Promise<void>;
    export function getWorld(worldIdentifier: string, rootPath: string): Promise<World | null>;
    export function handleMessagePublish(world: World, eventMessage: string, sender?: string): void;
}
declare module "core/index" {
    /**
     * Core Module - Unified Public API
     *
     * Features:
     * - Cross-platform world/agent/message management (Node.js: full, Browser: types only)
     * - Event-driven messaging with subscription support
     * - Category-based logging system
     * - Utility functions and type definitions
     *
     * Architecture: Conditional compilation for environment-specific functionality.
     * Version: 3.0.0
     */
    export { createWorld, getWorld, getFullWorld, updateWorld, deleteWorld, listWorlds, getWorldConfig, createAgent, getAgent, updateAgent, deleteAgent, listAgents, updateAgentMemory, clearAgentMemory, loadAgentsIntoWorld, syncWorldAgents, createAgentsBatch, registerAgentRuntime, getAgentConfig, } from "core/managers";
    export { publishMessage, subscribeToMessages, subscribeToSSE, publishSSE, subscribeAgentToMessages, processAgentMessage, shouldAgentRespond } from "core/events";
    export type { World, Agent, AgentMessage, BaseAgentParams, CreateAgentParams, UpdateAgentParams, BaseWorldParams, CreateWorldParams, UpdateWorldParams, AgentInfo, AgentStorage, WorldStorage, EventPayloadMap, TypedEvent, WorldEventPayload } from "core/types";
    export type { WorldInfo } from "core/managers";
    export type { WorldData } from "core/world-storage";
    export type { LoggerConfig, LogLevel } from "core/logger";
    export { LLMProvider } from "core/types";
    export { logger, createCategoryLogger, getCategoryLogLevel, initializeLogger } from "core/logger";
    export { generateId, toKebabCase } from "core/utils";
    export * from "core/subscription";
    export const VERSION = "3.0.0";
}
declare module "index" {
    /**
     * Agent World - Main Package Entry Point
     *
     * Features:
     * - World-centric agent management system
     * - LLM provider abstraction layer
     * - Event-driven architecture
     * - TypeScript-native execution
     * - Command-line and server interfaces
     *
     * This module re-exports the core functionality of Agent World for npm package usage.
     */
    export * from "core/index";
    export const PACKAGE_INFO: {
        readonly name: "agent-world";
        readonly version: "3.0.0";
        readonly description: "A TypeScript-native agent management system with world-centric access patterns";
    };
}
