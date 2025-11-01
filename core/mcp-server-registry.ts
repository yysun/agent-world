/**
 * MCP Server Registry and Tools Integration - Clean Implementation with Runtime AI SDK Patch
 *
 * Logger Categories: mcp.lifecycle, mcp.connection, mcp.tools, mcp.execution
 * Purpose: MCP server management and tool execution
 * 
 * Enable with: 
 * - LOG_MCP_LIFECYCLE=info - Server start/stop/ready events
 * - LOG_MCP_CONNECTION=debug - Connection establishment details
 * - LOG_MCP_TOOLS=debug - Tool discovery and caching
 * - LOG_MCP_EXECUTION=debug - Tool execution and results
 * - LOG_MCP=debug - Enable all MCP logs
 * 
 * What you'll see:
 * - Server lifecycle: start, stop, ready, shutdown
 * - Connection: transport creation, connection attempts
 * - Tools: discovery, caching, schema validation
 * - Execution: tool calls, results, performance metrics
 *
 * Comprehensive MCP (Model Context Protocol) management system providing:
 * - Server lifecycle management with reference counting and connection pooling
 * - Configuration-based server identification and sharing across worlds
 * - Flexible configuration: Supports both 'servers' and 'mcpServers' field names
 * - AI-compatible tool conversion with schema validation
 * - Transport support for stdio, SSE, and streamable HTTP connections
 * - Health monitoring, error handling, and graceful shutdown
 * - Thread-safe registry operations with world-server mapping
 * - Consolidated logging under LOG_LLM_MCP for unified debugging
 * - Enhanced debug logging for MCP communication data flows
 *
 * Key Features:
 * - Azure OpenAI compatibility: Uses runtime AI SDK patch (core/ai-sdk-patch.ts) for schema corruption fix
 * - Function names use underscores, clean schema structures for tool definitions
 * - Smart server sharing: Multiple worlds can share the same server configuration
 * - Automatic cleanup: Servers shut down when no longer referenced (30s delay)
 * - Error resilience: Comprehensive error handling with fallback mechanisms
 * - Schema validation: Creates well-formed, Azure-compatible schemas for all MCP tools
 * - Performance tracking: Tool execution duration and result analysis
 * - Sequence tracking: Tool call dependencies and execution relationships
 * - Data flow debugging: Complete request/response payload logging
 *
 * Connection Resilience & Lifecycle Management (November 2025):
 * - Automatic reconnection: Detects connection-level errors and attempts reconnection
 * - Retry strategy: Up to 2 attempts for transient network failures
 * - Connection error patterns: ECONNRESET, EPIPE, socket hang up, transport errors
 * - Race condition protection: Prevents concurrent reconnection attempts via reconnecting flag
 * - Client lifecycle management: ClientRef pattern for tracking active connections
 * - Proper resource cleanup: Ensures clients are closed on cache eviction and shutdown
 * - Memory leak prevention: Cache entries deleted even if disposal fails
 * - MCP error response detection: Handles both isError and type: 'error' formats
 *
 * Reconnection Logic:
 * - Triggered automatically on connection-level errors during tool execution
 * - First attempt: Try to reconnect and retry the operation
 * - Second attempt: Fail and propagate error if reconnection unsuccessful
 * - Concurrent calls: Wait for in-progress reconnection instead of creating new ones
 * - Cache refresh: Update cache timestamp after successful reconnection
 * - Logging: Detailed tracking of reconnection attempts and outcomes
 *
 * MCP Communication Debug Logging (LOG_LLM_MCP=debug):
 * - Server connection attempts with transport and configuration details
 * - Tool list requests and responses with full payload data
 * - Tool execution requests with complete argument structures
 * - Tool execution responses with full result content and metadata
 * - Request/response data size and structure analysis
 * - Raw JSON payloads for deep debugging of MCP communication
 * - Connection establishment and transport creation logging
 * - Server registration configuration details
 * - Reconnection attempts and retry logic execution
 *
 * MCP Tool Execution Logging (LOG_LLM_MCP=debug):
 * - Tool execution performance metrics with millisecond precision
 * - Tool result content analysis including size and type identification
 * - Tool call sequence tracking with unique sequence IDs
 * - Success/failure status with detailed error information
 * - Parent-child tool call relationship tracking
 * - Argument validation and presence checking
 * - Result preview for debugging without exposing full content
 * - Complete request/response payload logging for troubleshooting
 * - Retry attempt tracking with attempt number and max attempts
 *
 * Schema Approach:
 * - Uses simplified property types (string, number, boolean, array with string items)
 * - Includes additionalProperties: false to prevent schema expansion
 * - Maintains required fields but simplifies complex nested structures
 * - Works with runtime AI SDK patch to prevent schema corruption in Azure OpenAI calls
 *
 * LLM Argument Type Correction:
 * - Automatically fixes common LLM type errors in tool arguments
 * - String to array conversion: "value" -> ["value"]
 * - String to number conversion: "5" -> 5
 * - Empty/invalid enum omission: "" -> (omitted, uses schema default)
 * - Case-insensitive enum matching: "RELEVANCE" -> "relevance"
 * - Null/undefined omission for optional params: null -> (omitted when not required)
 * - Applied transparently during tool execution to prevent MCP validation errors
 * - Logs all corrections for debugging and monitoring
 * - Schema preservation: bulletproofSchema preserves enum, items, min/max, required for validation
 *
 * Architecture: Function-based design with module-level state management
 * Consolidated from: mcp-server-registry.ts + mcp-tools.ts (August 2025)
 * Runtime patch integration: Works with ai-sdk-patch.ts for Azure compatibility (August 2025)
 * Enhanced debug logging: Complete MCP data flow visibility (August 2025)
 * Scenario-based logging: Split into lifecycle, connection, tools, execution (October 2025)
 * Lifecycle management: Connection resilience and automatic reconnection (November 2025)
 */

import { createHash } from 'crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getWorld } from './managers.js';
import { createCategoryLogger } from './logger.js';

// Scenario-based loggers for different MCP operations
const lifecycleLogger = createCategoryLogger('mcp.lifecycle');
const connectionLogger = createCategoryLogger('mcp.connection');
const toolsLogger = createCategoryLogger('mcp.tools');
const executionLogger = createCategoryLogger('mcp.execution');

// Legacy logger for backward compatibility and general debug logs
const logger = createCategoryLogger('llm.mcp');


/**
 * OLLAMA BUG FIX: Translate "$" parameter to proper parameter names
 * 
 * Problem: Ollama (Llama 3.2) has a bug where it sends {"$": "value"} 
 * instead of proper parameter names like {"query": "value"}
 * 
 * Solution: Detect single "$" argument and map it to the first required parameter
 * 
 * Reference: https://github.com/ollama/ollama/issues/7860
 */
function translateOllamaArguments(args: any, toolSchema: any): any {
  // If args is not an object or doesn't have the "$" bug, return as-is
  if (!args || typeof args !== 'object' || !args.hasOwnProperty('$')) {
    return args;
  }

  // If there are multiple parameters, don't translate (ambiguous)
  const argKeys = Object.keys(args);
  if (argKeys.length !== 1 || argKeys[0] !== '$') {
    return args;
  }

  // Get the schema's required parameters
  const required = toolSchema?.required;
  if (!Array.isArray(required) || required.length === 0) {
    // No required parameters defined, try first property
    const properties = toolSchema?.properties;
    if (properties && typeof properties === 'object') {
      const firstProp = Object.keys(properties)[0];
      if (firstProp) {
        return { [firstProp]: args['$'] };
      }
    }
    return args;
  }

  // Map "$" to the first required parameter
  const firstRequired = required[0];
  return { [firstRequired]: args['$'] };
}

/**
 * Validate and correct tool argument types to match schema requirements
 * 
 * Problem: LLMs often generate incorrect types for tool arguments:
 * - Strings instead of arrays: "Cantonese" instead of ["Cantonese"]
 * - Strings instead of numbers: "5" instead of 5
 * - Invalid enum values or empty strings
 * 
 * Solution: Automatically correct common type mismatches based on schema
 */
function validateAndCorrectToolArgs(args: any, toolSchema: any): any {
  if (!args || typeof args !== 'object' || !toolSchema?.properties) {
    logger.debug(`Skipping type correction - invalid input`, {
      hasArgs: !!args,
      argsType: typeof args,
      hasSchema: !!toolSchema,
      hasProperties: !!toolSchema?.properties,
      schemaKeys: toolSchema ? Object.keys(toolSchema) : []
    });
    return args;
  }

  const corrected: any = {};
  const corrections: string[] = [];

  logger.debug(`Starting type correction`, {
    argKeys: Object.keys(args),
    schemaProps: Object.keys(toolSchema.properties),
    schemaPropsDetail: JSON.stringify(toolSchema.properties, null, 2)
  });

  const requiredParams = toolSchema.required || [];

  for (const [key, value] of Object.entries(args)) {
    const propSchema = toolSchema.properties[key];
    if (!propSchema) {
      // Property not in schema - pass through as-is
      corrected[key] = value;
      continue;
    }

    // CRITICAL: Omit null/undefined values for optional parameters
    // MCP servers often reject null for optional params, expecting them to be omitted
    if ((value === null || value === undefined) && !requiredParams.includes(key)) {
      corrections.push(`${key}: null/undefined omitted (optional parameter)`);
      continue;
    }

    // Type correction: string to array
    if (propSchema.type === 'array' && typeof value === 'string' && value !== '') {
      corrected[key] = [value];
      corrections.push(`${key}: string -> array`);
      continue;
    }

    // Type correction: string to number
    if (propSchema.type === 'number' && typeof value === 'string') {
      const numValue = parseFloat(value);
      if (!isNaN(numValue)) {
        corrected[key] = numValue;
        corrections.push(`${key}: "${value}" -> ${numValue}`);
        continue;
      }
    }

    // Type correction: invalid or empty enum value
    if (propSchema.enum && Array.isArray(propSchema.enum)) {
      if (value === '' || value === null || value === undefined) {
        // Omit empty/null/undefined enum values - let schema defaults apply
        corrections.push(`${key}: empty value omitted (will use default)`);
        continue;
      }
      if (!propSchema.enum.includes(value)) {
        // Invalid enum value - try case-insensitive match first
        const lowerValue = typeof value === 'string' ? value.toLowerCase() : value;
        const match = propSchema.enum.find((e: any) =>
          typeof e === 'string' && e.toLowerCase() === lowerValue
        );
        if (match) {
          corrected[key] = match;
          corrections.push(`${key}: "${value}" -> "${match}" (case correction)`);
        } else {
          // No match - omit invalid value to use schema default
          corrections.push(`${key}: invalid "${value}" omitted (expected: ${propSchema.enum.join('|')})`);
        }
        continue;
      }
    }

    // No correction needed - pass through
    corrected[key] = value;
  }

  if (corrections.length > 0) {
    logger.debug(`Tool argument type corrections applied`, {
      corrections,
      originalArgs: JSON.stringify(args),
      correctedArgs: JSON.stringify(corrected)
    });
  }

  return corrected;
}

// === TYPE DEFINITIONS ===

type MCPServerDefinition = {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  transport?: 'stdio';
} | {
  url: string;
  headers?: Record<string, string>;
  transport: 'sse' | 'streamable-http' | 'http';  // 'http' is treated as streamable-http
} | {
  type: 'http' | 'sse' | 'streamable-http'; // Legacy 'type' field support
  url: string;
  headers?: Record<string, string>;
};

export type MCPConfig = {
  servers?: Record<string, MCPServerDefinition>;
  mcpServers?: Record<string, MCPServerDefinition>;
};

export type MCPServerConfig = {
  name: string;
  transport: 'stdio' | 'sse' | 'streamable-http' | 'http';  // 'http' is treated as streamable-http
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
};

type ClientRef = {
  current: Client | null;
  reconnecting: Promise<void> | null;
};
type ReconnectClient = (reason: string) => Promise<void>;

export interface MCPServerInstance {
  id: string; // Hash of configuration for sharing
  config: MCPServerConfig;
  client: Client | null; // Null during startup/shutdown
  status: 'starting' | 'running' | 'stopping' | 'error';
  referenceCount: number;
  startedAt: Date;
  lastHealthCheck: Date;
  error?: Error;
  associatedWorlds: Set<string>; // Track which worlds use this server
}

/**
 * Tool cache entry for registry-level caching
 * Caches tools at server level to avoid repeated fetching during ephemeral connections
 */
export interface ToolCacheEntry {
  tools: Record<string, any>;      // AI-compatible tools from mcpToolsToAiTools()
  cachedAt: Date;                  // When tools were cached
  serverConfigHash: string;        // Hash of server config to detect changes
  serverName: string;              // Server name for debugging
  ttl?: number;                    // Optional TTL in milliseconds
  clientRef: ClientRef;            // Reference to active MCP client used by cached executors
  reconnectClient: ReconnectClient;// Reconnect handler for dropped transports
  serverConfig: MCPServerConfig;   // Original server configuration for refresh logic
}

// === UTILITY FUNCTIONS ===

// Azure OpenAI requires function names: ^[a-zA-Z0-9_\.-]+$
const sanitize = (s: string) => s.replace(/[^\w\-\.]/g, '_');
const nsName = (server: string, tool: string) => `${sanitize(server)}_${sanitize(tool)}`;

function isMCPErrorResponse(response: any): Error | null {
  if (!response || typeof response !== 'object') {
    return null;
  }

  if ('isError' in response && response.isError) {
    const err = (response as any).error;
    const message = typeof err === 'string'
      ? err
      : err?.message ?? 'Unknown MCP tool error';
    const code = typeof err === 'object' && err?.code ? ` (code: ${err.code})` : '';
    return new Error(`MCP tool error${code}: ${message}`);
  }

  if ('type' in response && response.type === 'error') {
    const err = (response as any).error;
    const message = typeof err === 'string'
      ? err
      : err?.message ?? 'Unknown MCP tool error';
    return new Error(`MCP tool error: ${message}`);
  }

  return null;
}

function isConnectionLevelError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  const errorCode = (error as any)?.code ? String((error as any).code).toLowerCase() : '';

  const CONNECTION_KEYWORDS = [
    'connection closed',
    'connection reset',
    'socket hang up',
    'broken pipe',
    'transport error',
    'cannot call write after a stream was destroyed',
    'econnreset',
    'econnrefused',
    'network connection lost',
    'read epipe'
  ];

  return CONNECTION_KEYWORDS.some(keyword => lower.includes(keyword) || errorCode.includes(keyword));
}

async function safelyCloseClient(client: Client | null, context: { serverName: string; reason: string }): Promise<void> {
  if (!client) {
    return;
  }

  try {
    await client.close();
    logger.debug(`Closed MCP client`, {
      serverName: context.serverName,
      reason: context.reason
    });
  } catch (error) {
    logger.warn(`Failed to close MCP client for ${context.serverName}`, {
      reason: context.reason,
      error: error instanceof Error ? error.message : error
    });
  }
}

async function disposeToolCacheEntry(entry: ToolCacheEntry, reason: string): Promise<void> {
  await safelyCloseClient(entry.clientRef.current, {
    serverName: entry.serverName,
    reason
  });
  entry.clientRef.current = null;
}

async function disposeAllToolCacheEntries(reason: string): Promise<number> {
  let disposed = 0;
  for (const [key, entry] of Array.from(toolsCache.entries())) {
    try {
      await disposeToolCacheEntry(entry, reason);
    } catch (error) {
      logger.error(`Failed to dispose cache entry for ${entry.serverName}`, {
        serverName: entry.serverName,
        reason,
        error: error instanceof Error ? error.message : error
      });
    } finally {
      // Always delete from cache to prevent memory leaks
      toolsCache.delete(key);
      disposed++;
    }
  }
  return disposed;
}

// === TOOL CACHE KEY FUNCTIONS ===

/**
 * Generate cache key for server-level tool caching
 * Uses server name as the primary cache key
 */
function getToolCacheKey(serverName: string): string {
  return sanitize(serverName);
}

/**
 * Generate cache key for individual tool (if needed in future)
 * Format: serverName:toolName
 */
function getIndividualToolKey(serverName: string, toolName: string): string {
  return `${sanitize(serverName)}:${sanitize(toolName)}`;
}

// === TOOL CACHE VALIDATION ===

/**
 * Check if cached tools are still valid
 * Validates against config changes and TTL expiration
 */
function isCacheValid(cached: ToolCacheEntry, currentConfig: MCPServerConfig): boolean {
  // Check if server config changed
  const currentHash = generateServerId(currentConfig);
  if (cached.serverConfigHash !== currentHash) {
    logger.debug(`Tools cache invalid: config changed for ${cached.serverName}`, {
      serverName: cached.serverName,
      cachedHash: cached.serverConfigHash.slice(0, 8),
      currentHash: currentHash.slice(0, 8)
    });
    return false;
  }

  // Check TTL expiration
  const ttl = cached.ttl || DEFAULT_TTL;
  if (ttl > 0 && Date.now() - cached.cachedAt.getTime() > ttl) {
    logger.debug(`Tools cache invalid: TTL expired for ${cached.serverName}`, {
      serverName: cached.serverName,
      cachedAt: cached.cachedAt.toISOString(),
      ttl: ttl,
      age: Date.now() - cached.cachedAt.getTime()
    });
    return false;
  }

  return true;
}

/**
 * Evict oldest cache entries when cache size exceeds limit
 */
async function evictOldestCacheEntries(): Promise<void> {
  if (toolsCache.size <= MAX_CACHE_ENTRIES) return;

  const entries = Array.from(toolsCache.entries())
    .sort(([, a], [, b]) => a.cachedAt.getTime() - b.cachedAt.getTime());

  const toEvict = entries.slice(0, entries.length - MAX_CACHE_ENTRIES);
  for (const [key, entry] of toEvict) {
    await disposeToolCacheEntry(entry, 'cache-eviction');
    toolsCache.delete(key);
    logger.debug(`Evicted old tools cache entry: ${entry.serverName}`, {
      serverName: entry.serverName,
      cachedAt: entry.cachedAt.toISOString(),
      age: Date.now() - entry.cachedAt.getTime()
    });
  }
}

// === AZURE OPENAI COMPATIBILITY ===

/**
 * Create simplified schema for Azure OpenAI compatibility
 * Works with bulletproof schema normalization to ensure clean schema structure
 */
function createSimpleSchema(originalSchema: any): any {
  // Always return a fresh, clean object
  const baseSchema = {
    type: 'object',
    properties: {},
    additionalProperties: false
  };

  // For tools with no parameters or empty parameters, use minimal schema
  if (!originalSchema ||
    !originalSchema.properties ||
    typeof originalSchema.properties !== 'object' ||
    Object.keys(originalSchema.properties).length === 0) {
    return baseSchema;
  }

  // For tools with parameters, create simplified property definitions
  const simpleProperties: any = {};

  for (const [propName, propDef] of Object.entries(originalSchema.properties)) {
    const prop = propDef as any;

    // Simplify property types for better compatibility
    if (prop.type === 'string') {
      simpleProperties[propName] = { type: 'string' };
    } else if (prop.type === 'number' || prop.type === 'integer') {
      simpleProperties[propName] = { type: 'number' };
    } else if (prop.type === 'boolean') {
      simpleProperties[propName] = { type: 'boolean' };
    } else if (prop.type === 'array') {
      simpleProperties[propName] = {
        type: 'array',
        items: { type: 'string' } // Simplify array items to string
      };
    } else {
      // Default everything else to string for schema simplicity
      simpleProperties[propName] = { type: 'string' };
    }

    // Add description if available
    if (prop.description && typeof prop.description === 'string') {
      simpleProperties[propName].description = prop.description;
    }
  }

  return {
    ...baseSchema,
    properties: simpleProperties,
    ...(originalSchema.required && Array.isArray(originalSchema.required) ?
      { required: [...originalSchema.required] } : {})
  };
}/**
 * Validate and bulletproof JSON schema for Azure OpenAI compatibility
 * Uses double normalization: bulletproof + simplification for maximum protection
 */
export function validateToolSchema(schema: any): any {
  return createSimpleSchema(schema);
}

// === CONFIGURATION PARSING ===

/**
 * Convert MCP config JSON format to normalized server configs
 * Supports both 'servers' and 'mcpServers' field names
 */
export function parseServersFromConfig(config: MCPConfig): MCPServerConfig[] {
  const servers: MCPServerConfig[] = [];

  // Support both 'servers' and 'mcpServers' fields
  const serverDefs = config.servers || config.mcpServers;

  if (!serverDefs) {
    return servers;
  }

  for (const [name, serverDef] of Object.entries(serverDefs)) {
    if ('command' in serverDef) {
      // Stdio transport (default)
      servers.push({
        name,
        transport: serverDef.transport || 'stdio',
        command: serverDef.command,
        args: serverDef.args,
        env: serverDef.env
      });
    } else if ('url' in serverDef) {
      // HTTP/SSE transport - handle both 'transport' and legacy 'type' fields
      const transportType = ('transport' in serverDef)
        ? serverDef.transport
        : ('type' in serverDef)
          ? (serverDef.type === 'http' ? 'streamable-http' : serverDef.type)
          : 'streamable-http';

      servers.push({
        name,
        transport: transportType,
        url: serverDef.url,
        headers: serverDef.headers
      });
    }
  }

  return servers;
}

// === CLIENT CONNECTION ===

/**
 * Connect to an MCP server using the specified configuration
 */
export async function connectMCPServer(serverConfig: MCPServerConfig): Promise<Client> {
  // Debug log: Connection details being used
  logger.debug(`MCP server connection attempt`, {
    serverName: serverConfig.name,
    transport: serverConfig.transport,
    connectionConfig: serverConfig.transport === 'stdio' ? {
      command: serverConfig.command,
      args: serverConfig.args,
      env: serverConfig.env ? Object.keys(serverConfig.env) : []
    } : {
      url: serverConfig.url,
      headers: serverConfig.headers ? Object.keys(serverConfig.headers) : []
    }
  });

  // Handle traditional MCP SDK transports (stdio, sse, streamable-http)
  const transportType = serverConfig.transport || 'stdio';
  const transport = transportType === 'stdio'
    ? new StdioClientTransport({
      command: serverConfig.command!,
      args: serverConfig.args ?? [],
      env: serverConfig.env
    })
    : transportType === 'sse'
      ? new SSEClientTransport(new URL(serverConfig.url!), {
        requestInit: { headers: serverConfig.headers }
      })
      : new StreamableHTTPClientTransport(new URL(serverConfig.url!), {
        requestInit: { headers: serverConfig.headers }
      });

  const client = new Client({ name: 'my-app', version: '1.0.0' }, { capabilities: {} });

  logger.debug(`MCP server transport created, initiating connection`, {
    serverName: serverConfig.name,
    transport: serverConfig.transport
  });

  await client.connect(transport);

  logger.debug(`MCP server connection established successfully`, {
    serverName: serverConfig.name,
    transport: serverConfig.transport
  });

  return client;
}

// === TOOL CONVERSION ===

/**
 * Bulletproof schema normalization to prevent AI SDK corruption
 * This is our surgical fix - normalize schemas right before they go to AI SDK
 */
function bulletproofSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') {
    return {
      type: 'object',
      properties: {},
      additionalProperties: false
    };
  }

  // Create a completely fresh object to avoid any corruption
  const normalized: any = {
    type: 'object',
    properties: {},
    additionalProperties: false
  };

  // Copy properties safely - preserve critical schema information for validation
  if (schema.properties && typeof schema.properties === 'object') {
    for (const [key, value] of Object.entries(schema.properties)) {
      const prop = value as any;
      normalized.properties[key] = {
        type: prop?.type || 'string',
        ...(prop?.description && { description: prop.description }),
        // Preserve enum values for validation
        ...(prop?.enum && Array.isArray(prop.enum) && { enum: prop.enum }),
        // Preserve array item schema
        ...(prop?.items && { items: prop.items }),
        // Preserve numeric constraints
        ...(prop?.minimum !== undefined && { minimum: prop.minimum }),
        ...(prop?.maximum !== undefined && { maximum: prop.maximum })
      };
    }
  }

  // Copy required array safely
  if (schema.required && Array.isArray(schema.required)) {
    normalized.required = [...schema.required];
  }

  return normalized;
}

// === TOOL CACHE OPERATIONS ===

/**
 * Fetch tools from MCP server using ephemeral connection and cache results
 * Handles connection lifecycle and error recovery
 */
async function fetchAndCacheTools(serverConfig: MCPServerConfig): Promise<Record<string, any>> {
  const startTime = performance.now();
  const cacheKey = getToolCacheKey(serverConfig.name);

  logger.debug(`Fetching and caching tools for server: ${serverConfig.name}`, {
    serverName: serverConfig.name,
    cacheKey,
    transport: serverConfig.transport
  });

  const clientRef: ClientRef = { current: null, reconnecting: null };
  let cacheEntry: ToolCacheEntry | null = null;

  try {
    // Create ephemeral connection
    clientRef.current = await connectMCPServer(serverConfig);

    const reconnectClient: ReconnectClient = async (reason: string) => {
      // Prevent concurrent reconnection attempts
      if (clientRef.reconnecting) {
        logger.debug(`Reconnection already in progress, waiting...`, {
          serverName: serverConfig.name,
          reason
        });
        await clientRef.reconnecting;
        return;
      }

      clientRef.reconnecting = (async () => {
        logger.warn(`Reconnecting MCP client after failure`, {
          serverName: serverConfig.name,
          reason
        });

        const previousClient = clientRef.current;
        clientRef.current = null;
        await safelyCloseClient(previousClient, {
          serverName: serverConfig.name,
          reason: `${reason}-reconnect`
        });

        try {
          const newClient = await connectMCPServer(serverConfig);
          clientRef.current = newClient;

          if (cacheEntry) {
            cacheEntry.cachedAt = new Date();
          }
        } catch (reconnectError) {
          logger.error(`Failed to reconnect MCP client`, {
            serverName: serverConfig.name,
            reason,
            error: reconnectError instanceof Error ? reconnectError.message : reconnectError
          });
          throw reconnectError;
        }
      })();

      try {
        await clientRef.reconnecting;
      } finally {
        clientRef.reconnecting = null;
      }
    };

    // Fetch and convert tools
    const tools = await mcpToolsToAiTools(clientRef, serverConfig, reconnectClient);

    // Cache the results
    cacheEntry = {
      tools,
      cachedAt: new Date(),
      serverConfigHash: generateServerId(serverConfig),
      serverName: serverConfig.name,
      ttl: DEFAULT_TTL,
      clientRef,
      reconnectClient,
      serverConfig
    };

    const existingEntry = toolsCache.get(cacheKey);
    if (existingEntry) {
      await disposeToolCacheEntry(existingEntry, 'cache-refresh');
      toolsCache.delete(cacheKey);
    }

    toolsCache.set(cacheKey, cacheEntry);

    // Evict old entries if needed
    await evictOldestCacheEntries();

    const duration = performance.now() - startTime;
    const toolCount = Object.keys(tools).length;

    logger.debug(`Successfully cached tools for server: ${serverConfig.name}`, {
      serverName: serverConfig.name,
      toolCount,
      duration: Math.round(duration * 100) / 100,
      cacheSize: toolsCache.size
    });

    return tools;
  } catch (error) {
    const duration = performance.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    await safelyCloseClient(clientRef.current, {
      serverName: serverConfig.name,
      reason: 'fetch-failed'
    });
    clientRef.current = null;

    logger.warn(`Failed to fetch and cache tools for server: ${serverConfig.name}`, {
      serverName: serverConfig.name,
      error: errorMessage,
      duration: Math.round(duration * 100) / 100
    });

    // Return empty tools object on failure - don't break entire tool fetch
    return {};
  }
}

/**
 * Convert MCP tools to AI-compatible tool format with bulletproof schema protection
 */
export async function mcpToolsToAiTools(
  clientRef: ClientRef,
  serverConfig: MCPServerConfig,
  reconnectClient: ReconnectClient
) {
  const serverName = serverConfig.name;
  const transport = serverConfig.transport || 'stdio';

  const ensureClient = (): Client => {
    if (!clientRef.current) {
      throw new Error(`MCP client not connected for server: ${serverName}`);
    }
    return clientRef.current;
  };

  logger.debug(`MCP tools list request starting`, {
    serverName,
    operation: 'listTools',
    transport
  });

  let toolsResponse: { tools: Tool[] };

  // Use MCP SDK client with timeout
  const listToolsPromise = ensureClient().listTools();
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Timeout waiting for tools list')), 5000);
  });

  toolsResponse = await Promise.race([listToolsPromise, timeoutPromise]);

  const { tools } = toolsResponse;

  // Debug log: Tools data received from MCP server
  logger.debug(`MCP server tools list response`, {
    serverName,
    operation: 'listTools',
    toolsCount: tools.length,
    toolNames: tools.map((t: Tool) => t.name),
    toolsPayload: JSON.stringify(tools, null, 2)
  });

  const aiTools: Record<string, any> = {};

  for (const t of tools as Tool[]) {
    const key = nsName(serverName, t.name);

    // Debug: Log original tool definition from MCP server
    logger.debug(`MCP original tool definition from server: ${serverName}`, {
      toolName: t.name,
      originalDescription: t.description,
      inputSchema: JSON.stringify(t.inputSchema, null, 2)
    });

    // Apply bulletproof schema normalization - this is our surgical fix
    const bulletproofedSchema = bulletproofSchema(t.inputSchema);

    // Validate and simplify further for Azure compatibility
    const finalSchema = validateToolSchema(bulletproofedSchema);

    // Enhance tool description with explicit usage guidance for execute_command
    let enhancedDescription = t.description ?? '';
    if (t.name === 'execute_command') {
      const originalDesc = t.description ?? '';
      enhancedDescription = 'Execute a shell command ONLY when explicitly requested by keywords like: "run", "execute", "list files", "check directory", "show files", "ls", "cat file". DO NOT use for: greetings (hi, hello), questions (how are you, what is), or general conversation. User must explicitly indicate they want to run a shell command.';

      logger.debug(`Enhanced tool description for execute_command`, {
        toolName: t.name,
        originalDescription: originalDesc,
        enhancedDescription: enhancedDescription,
        descriptionChanged: originalDesc !== enhancedDescription
      });
    }

    aiTools[key] = {
      description: enhancedDescription,
      parameters: finalSchema,
      execute: async (args: any, sequenceId?: string, parentToolCall?: string) => {
        const startTime = performance.now();
        const executionId = `${serverName}-${t.name}-${Date.now()}`;

        logger.debug(`MCP tool execution starting via AI conversion`, {
          executionId,
          serverName,
          toolName: t.name,
          toolKey: key,
          sequenceId,
          parentToolCall,
          argsPresent: !!args,
          argsKeys: args ? Object.keys(args) : [],
          transport
        });

        // Debug log: Request data being sent to MCP server
        // OLLAMA BUG FIX: Translate "$" arguments to proper parameter names
        let translatedArgs = translateOllamaArguments(args ?? {}, t.inputSchema);
        // TYPE CORRECTION: Validate and fix argument types to match schema
        translatedArgs = validateAndCorrectToolArgs(translatedArgs, t.inputSchema);
        const requestPayload = { name: t.name, arguments: translatedArgs };
        logger.debug(`MCP server request payload`, {
          executionId,
          serverName,
          toolName: t.name,
          requestPayload: JSON.stringify(requestPayload, null, 2)
        });

        const maxAttempts = 2;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          try {
            const res = await ensureClient().callTool(requestPayload);

            const mcpError = isMCPErrorResponse(res);
            if (mcpError) {
              logger.error(`MCP tool execution returned error payload`, {
                executionId,
                serverName,
                toolName: t.name,
                toolKey: key,
                error: mcpError.message,
                transport
              });
              throw mcpError;
            }

            // Debug log: Raw response data received from MCP server
            logger.debug(`MCP server response payload`, {
              executionId,
              serverName,
              toolName: t.name,
              responsePayload: JSON.stringify(res, null, 2),
              responseType: typeof res,
              hasContent: !!(res?.content),
              contentLength: Array.isArray(res?.content) ? res.content.length : 0
            });

            const duration = performance.now() - startTime;

            // Handle result content - prefer text > json > fallback
            let processedResult: any;
            let resultType = 'unknown';

            if (res?.content && Array.isArray(res.content)) {
              const textPart = res.content.find((p: any) => p?.type === 'text');
              if (textPart?.text) {
                processedResult = textPart.text;
                resultType = 'text';
              } else {
                const jsonPart = res.content.find((p: any) => p?.type === 'json');
                if (jsonPart?.json) {
                  processedResult = jsonPart.json;
                  resultType = 'json';
                }
              }
            }

            if (!processedResult) {
              processedResult = JSON.stringify(res);
              resultType = 'serialized';
            }

            const resultSize = typeof processedResult === 'string' ? processedResult.length : JSON.stringify(processedResult).length;

            logger.debug(`MCP tool execution completed via AI conversion`, {
              executionId,
              serverName,
              toolName: t.name,
              toolKey: key,
              sequenceId,
              parentToolCall,
              status: 'success',
              duration: Math.round(duration * 100) / 100,
              resultType,
              resultSize,
              resultPreview: typeof processedResult === 'string'
                ? processedResult.slice(0, 200) + (resultSize > 200 ? '...' : '')
                : JSON.stringify(processedResult).slice(0, 200) + '...',
              transport
            });

            return processedResult;
          } catch (error) {
            const duration = performance.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);
            const isLastAttempt = attempt === maxAttempts - 1;
            const shouldRetry = !isLastAttempt && isConnectionLevelError(error);

            if (shouldRetry) {
              logger.warn(`MCP tool execution detected transport issue - attempting reconnect`, {
                executionId,
                serverName,
                toolName: t.name,
                toolKey: key,
                status: 'retrying',
                attempt: attempt + 1,
                maxAttempts,
                duration: Math.round(duration * 100) / 100,
                error: errorMessage,
                transport
              });

              try {
                await reconnectClient('call-tool-failure');
                continue;
              } catch (reconnectError) {
                logger.error(`MCP tool execution reconnect failed`, {
                  executionId,
                  serverName,
                  toolName: t.name,
                  toolKey: key,
                  error: reconnectError instanceof Error ? reconnectError.message : reconnectError,
                  transport
                });
                throw reconnectError;
              }
            }

            logger.error(`MCP tool execution failed via AI conversion: ${errorMessage}`, {
              executionId,
              serverName,
              toolName: t.name,
              toolKey: key,
              sequenceId,
              parentToolCall,
              status: 'error',
              duration: Math.round(duration * 100) / 100,
              error: errorMessage,
              errorStack: error instanceof Error ? error.stack : undefined,
              transport
            });

            throw error;
          }
        }
      },
    };
  }

  return aiTools;
}

// === SERVER REGISTRY STATE ===

// Module-level server registry state
const serverRegistry = new Map<string, MCPServerInstance>();
const worldServerMapping = new Map<string, Set<string>>(); // worldId -> Set of serverIds

// Module-level tool cache state
const toolsCache = new Map<string, ToolCacheEntry>(); // serverName -> cached tools
const DEFAULT_TTL = 60 * 60 * 1000; // 1 hour default TTL
const MAX_CACHE_ENTRIES = 100; // Maximum cached servers

let isInitialized = false;
let shutdownInProgress = false;

// === CORE REGISTRY FUNCTIONS ===

/**
 * Generate unique server ID based on configuration hash for sharing
 */
function generateServerId(config: MCPServerConfig): string {
  const configString = JSON.stringify({
    name: config.name,
    transport: config.transport,
    ...(config.transport === 'stdio' ? {
      command: config.command,
      args: config.args,
      env: config.env
    } : {
      url: config.url,
      headers: config.headers
    })
  }, null, 0);

  return createHash('sha256').update(configString).digest('hex');
}

/**
 * Initialize MCP registry - called on Express app startup
 */
export function initializeMCPRegistry(): void {
  if (isInitialized) {
    logger.warn('MCP registry already initialized');
    return;
  }
  isInitialized = true;
  shutdownInProgress = false;
  logger.info('MCP registry initialized');
}

/**
 * Register and start an MCP server with reference counting
 * Returns the server ID for tracking. Reuses existing servers when possible.
 */
export async function registerMCPServer(
  config: MCPServerConfig,
  worldId: string
): Promise<string> {
  if (shutdownInProgress) {
    throw new Error('MCP registry is shutting down');
  }

  const serverId = generateServerId(config);
  let serverInstance = serverRegistry.get(serverId);

  if (serverInstance) {
    // Reuse existing server
    serverInstance.referenceCount++;
    serverInstance.associatedWorlds.add(worldId);

    const worldServers = worldServerMapping.get(worldId) || new Set();
    worldServers.add(serverId);
    worldServerMapping.set(worldId, worldServers);

    logger.debug(`Reusing existing MCP server: ${config.name}`, {
      serverId: serverId.slice(0, 8),
      referenceCount: serverInstance.referenceCount,
      status: serverInstance.status
    });

    return serverId;
  }

  // Create new server instance
  serverInstance = {
    id: serverId,
    config,
    client: null,
    status: 'starting',
    referenceCount: 1,
    startedAt: new Date(),
    lastHealthCheck: new Date(),
    associatedWorlds: new Set([worldId])
  };

  serverRegistry.set(serverId, serverInstance);

  const worldServers = worldServerMapping.get(worldId) || new Set();
  worldServers.add(serverId);
  worldServerMapping.set(worldId, worldServers);

  logger.info(`Starting MCP server: ${config.name}`, {
    serverId: serverId.slice(0, 8),
    transport: config.transport,
    worldId
  });

  // Debug log: Full server configuration being used
  logger.debug(`MCP server registration configuration`, {
    serverId: serverId.slice(0, 8),
    serverName: config.name,
    worldId,
    fullConfig: JSON.stringify(config, null, 2)
  });

  // Start server and wait for ready state
  try {
    await startServerAsync(serverInstance);
    logger.debug(`MCP server ready: ${config.name}`, {
      serverId: serverId.slice(0, 8),
      status: serverInstance.status
    });
  } catch (error) {
    logger.error(`Failed to start MCP server: ${config.name}`, {
      serverId: serverId.slice(0, 8),
      error: error instanceof Error ? error.message : error
    });
    serverInstance.status = 'error';
    serverInstance.error = error instanceof Error ? error : new Error(String(error));
    throw error;
  }

  return serverId;
}

/**
 * Unregister MCP server for a world - decreases reference count
 * Schedules shutdown when no more references exist
 */
export async function unregisterMCPServer(serverId: string, worldId: string): Promise<boolean> {
  const serverInstance = serverRegistry.get(serverId);
  if (!serverInstance) return false;

  serverInstance.associatedWorlds.delete(worldId);
  serverInstance.referenceCount = Math.max(0, serverInstance.referenceCount - 1);

  const worldServers = worldServerMapping.get(worldId);
  if (worldServers) {
    worldServers.delete(serverId);
    if (worldServers.size === 0) worldServerMapping.delete(worldId);
  }

  logger.debug(`Unregistered MCP server for world: ${worldId}`, {
    serverId: serverId.slice(0, 8),
    referenceCount: serverInstance.referenceCount
  });

  // Schedule shutdown after 30s if no more references
  if (serverInstance.referenceCount === 0) {
    logger.info(`Scheduling MCP server shutdown: ${serverInstance.config.name}`, {
      serverId: serverId.slice(0, 8)
    });

    setTimeout(async () => {
      if (serverInstance.referenceCount === 0) {
        await stopServer(serverInstance);
        serverRegistry.delete(serverId);
      }
    }, 30000);
  }

  return true;
}

// === REGISTRY ACCESS FUNCTIONS ===

/** Get MCP server instance by ID */
export function getMCPServer(serverId: string): MCPServerInstance | null {
  return serverRegistry.get(serverId) || null;
}

/** List all MCP servers */
export function listMCPServers(): MCPServerInstance[] {
  return Array.from(serverRegistry.values());
}

/** Get server IDs for a specific world */
export function getMCPServersForWorld(worldId: string): string[] {
  const worldServers = worldServerMapping.get(worldId);
  return worldServers ? Array.from(worldServers) : [];
}

// === LIFECYCLE MANAGEMENT ===

/** Shutdown all MCP servers - called on Express app shutdown */
export async function shutdownAllMCPServers(): Promise<void> {
  if (shutdownInProgress) {
    logger.warn('Shutdown already in progress');
    return;
  }

  shutdownInProgress = true;
  logger.info(`Shutting down ${serverRegistry.size} MCP servers`);

  const shutdownPromises = Array.from(serverRegistry.values()).map(async (serverInstance) => {
    try {
      await stopServer(serverInstance);
    } catch (error) {
      logger.error(`Error shutting down MCP server: ${serverInstance.config.name}`, {
        serverId: serverInstance.id.slice(0, 8),
        error: error instanceof Error ? error.message : error
      });
    }
  });

  await Promise.allSettled(shutdownPromises);

  serverRegistry.clear();
  worldServerMapping.clear();

  // Clear tools cache during shutdown
  const cacheEntriesCleared = await disposeAllToolCacheEntries('shutdown');

  isInitialized = false;
  shutdownInProgress = false;

  logger.info('All MCP servers shut down', {
    cacheEntriesCleared
  });
}

// === INTERNAL HELPER FUNCTIONS ===

/** Start server asynchronously */
async function startServerAsync(serverInstance: MCPServerInstance): Promise<void> {
  try {
    const client = await connectMCPServer(serverInstance.config);
    serverInstance.client = client;

    serverInstance.status = 'running';
    serverInstance.lastHealthCheck = new Date();

    logger.info(`MCP server started successfully: ${serverInstance.config.name}`, {
      serverId: serverInstance.id.slice(0, 8),
      referenceCount: serverInstance.referenceCount,
      transport: serverInstance.config.transport
    });
  } catch (error) {
    serverInstance.status = 'error';
    serverInstance.error = error instanceof Error ? error : new Error(String(error));
    throw error;
  }
}

/** Stop server and cleanup resources */
async function stopServer(serverInstance: MCPServerInstance): Promise<void> {
  if (serverInstance.status === 'stopping' || serverInstance.status === 'error') {
    return;
  }

  serverInstance.status = 'stopping';

  if (serverInstance.client) {
    try {
      await safelyCloseClient(serverInstance.client, {
        serverName: serverInstance.config.name,
        reason: 'stop-server'
      });
      serverInstance.client = null;

      logger.info(`MCP server stopped: ${serverInstance.config.name}`, {
        serverId: serverInstance.id.slice(0, 8)
      });
    } catch (error) {
      logger.error(`Error stopping MCP server: ${serverInstance.config.name}`, {
        serverId: serverInstance.id.slice(0, 8),
        error: error instanceof Error ? error.message : error
      });
    }
  }
}

// === MONITORING AND UTILITIES ===

/** Health check for MCP servers - can be called periodically */
export function performHealthCheck(): void {
  const now = new Date();
  for (const serverInstance of serverRegistry.values()) {
    if (serverInstance.status === 'running' && serverInstance.client) {
      serverInstance.lastHealthCheck = now;
    }
  }
}

/** Get registry statistics */
export function getMCPRegistryStats(): {
  totalServers: number;
  runningServers: number;
  errorServers: number;
  totalWorlds: number;
} {
  const servers = Array.from(serverRegistry.values());
  return {
    totalServers: servers.length,
    runningServers: servers.filter(s => s.status === 'running').length,
    errorServers: servers.filter(s => s.status === 'error').length,
    totalWorlds: worldServerMapping.size
  };
}

// === CONFIGURATION VALIDATION ===

/** Validate MCP configuration format and content */
export function validateMCPConfig(config: any): config is MCPConfig {
  try {
    // Must have either 'servers' or 'mcpServers' field
    if (!config?.servers && !config?.mcpServers) return false;

    const serverDefs = config.servers || config.mcpServers;
    if (typeof serverDefs !== 'object') return false;

    for (const [serverName, server] of Object.entries(serverDefs)) {
      if (!serverName || !server || typeof server !== 'object') return false;

      const serverConfig = server as any;
      const transport = serverConfig.transport ||
        (serverConfig.type === 'http' ? 'streamable-http' : serverConfig.type) ||
        'stdio';

      if (!['stdio', 'sse', 'streamable-http', 'http'].includes(transport)) return false;

      if (transport === 'stdio') {
        if (!serverConfig.command || typeof serverConfig.command !== 'string') return false;
      } else {
        if (!serverConfig.url || typeof serverConfig.url !== 'string') return false;
      }
    }

    return true;
  } catch (error) {
    logger.error('Error validating MCP config', { error: error instanceof Error ? error.message : error });
    return false;
  }
}

/** Parse MCP configuration string safely */
export function parseMCPConfig(configString: string): MCPConfig | null {
  try {
    if (!configString?.trim()) return null;

    const config = JSON.parse(configString);
    return validateMCPConfig(config) ? config as MCPConfig : null;
  } catch (error) {
    logger.error('Failed to parse MCP config', {
      error: error instanceof Error ? error.message : error,
      configString: configString.slice(0, 100) + (configString.length > 100 ? '...' : '')
    });
    return null;
  }
}

// === HIGH-LEVEL WORLD INTEGRATION ===

/** Start MCP servers for a world based on its configuration */
export async function startMCPServersForWorld(worldId: string, mcpConfig: string): Promise<string[]> {
  if (!mcpConfig) {
    logger.debug(`No MCP config for world: ${worldId}`);
    return [];
  }

  const config = parseMCPConfig(mcpConfig);
  if (!config) {
    logger.error(`Invalid MCP config for world: ${worldId}`);
    return [];
  }

  const serverConfigs = parseServersFromConfig(config);
  const serverIds: string[] = [];
  const startupPromises: Promise<void>[] = [];

  for (const serverConfig of serverConfigs) {
    try {
      const serverIdPromise = registerMCPServer(serverConfig, worldId);
      startupPromises.push(
        serverIdPromise.then(serverId => {
          serverIds.push(serverId);
        }).catch(error => {
          logger.error(`Failed to start MCP server: ${serverConfig.name}`, {
            worldId,
            error: error instanceof Error ? error.message : error
          });
        })
      );
    } catch (error) {
      logger.error(`Error registering MCP server: ${serverConfig.name}`, {
        worldId,
        error: error instanceof Error ? error.message : error
      });
    }
  }

  await Promise.allSettled(startupPromises);

  logger.info(`Started ${serverIds.length}/${serverConfigs.length} MCP servers for world: ${worldId}`, {
    serverIds: serverIds.map(id => id.slice(0, 8))
  });

  return serverIds;
}

/** Stop MCP servers for a world - decreases reference counts */
export async function stopMCPServersForWorld(worldId: string): Promise<void> {
  const worldServers = worldServerMapping.get(worldId);
  if (!worldServers?.size) {
    logger.debug(`No MCP servers to stop for world: ${worldId}`);
    return;
  }

  logger.info(`Stopping MCP servers for world: ${worldId}`, {
    serverCount: worldServers.size,
    serverIds: Array.from(worldServers).map(id => id.slice(0, 8))
  });

  const stopPromises = Array.from(worldServers).map(async (serverId) => {
    try {
      await unregisterMCPServer(serverId, worldId);
    } catch (error) {
      logger.error(`Error stopping MCP server: ${serverId.slice(0, 8)}`, {
        worldId,
        error: error instanceof Error ? error.message : error
      });
    }
  });

  await Promise.allSettled(stopPromises);
}

/** Update MCP servers for a world when configuration changes */
export async function updateMCPServersForWorld(worldId: string, newMcpConfig: string): Promise<string[]> {
  logger.info(`Updating MCP servers for world: ${worldId}`);
  await stopMCPServersForWorld(worldId);
  return await startMCPServersForWorld(worldId, newMcpConfig);
}

/**
 * Get MCP tools available for a world with on-demand server startup
 */
/**
 * Get MCP tools available for a world with registry-level caching
 * Uses cache-first strategy to avoid repeated tool fetching during ephemeral connections
 */
export async function getMCPToolsForWorld(worldId: string): Promise<Record<string, any>> {
  const startTime = performance.now();

  const world = await getWorld(worldId);
  if (!world?.mcpConfig) {
    logger.debug(`No MCP config for world: ${worldId}`);
    return {};
  }

  const config = parseMCPConfig(world.mcpConfig);
  if (!config) {
    logger.error(`Invalid MCP config for world: ${worldId}`);
    return {};
  }

  const serverConfigs = parseServersFromConfig(config);
  const allTools: Record<string, any> = {};
  const serverPromises: Promise<void>[] = [];

  let cacheHits = 0;
  let cacheMisses = 0;

  for (const serverConfig of serverConfigs) {
    const serverPromise = (async () => {
      try {
        const cacheKey = getToolCacheKey(serverConfig.name);
        const cached = toolsCache.get(cacheKey);
        const cacheIsValid = cached ? isCacheValid(cached, serverConfig) : false;

        // Check cache first
        if (cached && cacheIsValid) {
          // Cache hit
          cacheHits++;
          Object.assign(allTools, cached.tools);

          logger.debug(`Tools cache hit for server: ${serverConfig.name}`, {
            serverName: serverConfig.name,
            toolCount: Object.keys(cached.tools).length,
            age: Date.now() - cached.cachedAt.getTime()
          });
          return;
        }

        if (cached && !cacheIsValid) {
          await disposeToolCacheEntry(cached, 'stale-cache-entry');
          toolsCache.delete(cacheKey);
        }

        // Cache miss - fetch and cache tools
        cacheMisses++;

        if (cached) {
          logger.debug(`Tools cache miss (invalid) for server: ${serverConfig.name}`, {
            serverName: serverConfig.name,
            reason: cacheIsValid ? 'unknown' : 'invalid'
          });
        } else {
          logger.debug(`Tools cache miss (not found) for server: ${serverConfig.name}`, {
            serverName: serverConfig.name
          });
        }

        const serverTools = await fetchAndCacheTools(serverConfig);
        Object.assign(allTools, serverTools);
      } catch (error) {
        logger.error(`Failed to get tools from MCP server: ${serverConfig.name}`, {
          worldId,
          error: error instanceof Error ? error.message : error
        });
      }
    })();

    serverPromises.push(serverPromise);
  }

  await Promise.allSettled(serverPromises);

  const totalTools = Object.keys(allTools).length;
  const duration = performance.now() - startTime;

  logger.info(`Retrieved ${totalTools} total MCP tools for world: ${worldId}`, {
    worldId,
    totalTools,
    cacheHits,
    cacheMisses,
    cacheHitRate: cacheHits + cacheMisses > 0 ? Math.round((cacheHits / (cacheHits + cacheMisses)) * 100) : 0,
    duration: Math.round(duration * 100) / 100,
    cacheSize: toolsCache.size
  });

  return allTools;
}

/**
 * Execute MCP tool by server ID and tool name
 * 
 * @param serverId - Server ID from registry
 * @param toolName - Name of the tool to execute
 * @param args - Tool arguments (will be validated if schema provided)
 * @param sequenceId - Optional sequence ID for tracking
 * @param parentToolCall - Optional parent tool call ID
 * @param toolSchema - Optional tool input schema for parameter validation.
 *                     If provided, applies validateAndCorrectToolArgs to fix
 *                     common LLM parameter mistakes (string→array, string→number, 
 *                     invalid enums, etc.)
 * 
 * @example
 * // With validation (recommended for external callers)
 * const schema = { properties: { limit: { type: 'number' } }, required: [] };
 * const result = await executeMCPTool(serverId, 'searchAgents', args, seq, parent, schema);
 * 
 * // Without validation (legacy behavior)
 * const result = await executeMCPTool(serverId, 'searchAgents', args);
 */
export async function executeMCPTool(
  serverId: string,
  toolName: string,
  args: any,
  sequenceId?: string,
  parentToolCall?: string,
  toolSchema?: any
): Promise<any> {
  const serverInstance = serverRegistry.get(serverId);
  if (!serverInstance) {
    throw new Error(`MCP server not found: ${serverId.slice(0, 8)}`);
  }

  if (serverInstance.status !== 'running' || !serverInstance.client) {
    throw new Error(`MCP server not available: ${serverInstance.config.name} (status: ${serverInstance.status})`);
  }

  const startTime = performance.now();
  const executionId = `${serverId.slice(0, 8)}-${toolName}-${Date.now()}`;

  logger.debug(`MCP tool execution starting`, {
    executionId,
    serverId: serverId.slice(0, 8),
    toolName,
    serverName: serverInstance.config.name,
    sequenceId,
    parentToolCall,
    argsPresent: !!args,
    argsKeys: args ? Object.keys(args) : [],
    hasSchema: !!toolSchema
  });

  // OLLAMA BUG FIX: Translate "$" arguments to proper parameter names
  let validatedArgs = translateOllamaArguments(args || {}, toolSchema);

  // ENHANCEMENT: Apply parameter validation if schema provided
  // This ensures executeMCPTool has same validation as mcpToolsToAiTools wrapper
  if (toolSchema) {
    validatedArgs = validateAndCorrectToolArgs(validatedArgs, toolSchema);

    logger.debug(`Parameter validation applied in executeMCPTool`, {
      executionId,
      serverId: serverId.slice(0, 8),
      toolName,
      hasSchema: true,
      originalArgs: args,
      validatedArgs
    });
  }

  const requestPayload = { name: toolName, arguments: validatedArgs };
  logger.debug(`MCP server direct request payload`, {
    executionId,
    serverId: serverId.slice(0, 8),
    toolName,
    serverName: serverInstance.config.name,
    requestPayload: JSON.stringify(requestPayload, null, 2)
  });

  const maxAttempts = 2;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (!serverInstance.client) {
      throw new Error(`MCP server not available: ${serverInstance.config.name} (client disconnected)`);
    }

    try {
      const result = await serverInstance.client.callTool(requestPayload);

      const mcpError = isMCPErrorResponse(result);
      if (mcpError) {
        logger.error(`MCP tool execution returned error payload`, {
          executionId,
          serverId: serverId.slice(0, 8),
          toolName,
          serverName: serverInstance.config.name,
          error: mcpError.message
        });
        throw mcpError;
      }

      // Debug log: Raw response data received from MCP server
      logger.debug(`MCP server direct response payload`, {
        executionId,
        serverId: serverId.slice(0, 8),
        toolName,
        serverName: serverInstance.config.name,
        responsePayload: JSON.stringify(result, null, 2),
        responseType: typeof result,
        hasContent: !!(result?.content),
        contentLength: Array.isArray(result?.content) ? result.content.length : 0
      });

      const duration = performance.now() - startTime;
      const hasContent = result?.content && Array.isArray(result.content) && result.content.length > 0;
      const contentTypes = hasContent ? (result.content as any[]).map((c: any) => c?.type).filter(Boolean) : [];
      const resultSize = hasContent ? JSON.stringify(result).length : 0;

      logger.debug(`MCP tool execution completed`, {
        executionId,
        serverId: serverId.slice(0, 8),
        toolName,
        serverName: serverInstance.config.name,
        sequenceId,
        parentToolCall,
        status: 'success',
        duration: Math.round(duration * 100) / 100, // Round to 2 decimal places
        hasContent,
        contentTypes,
        resultSize,
        resultPreview: hasContent ? JSON.stringify(result).slice(0, 200) + (resultSize > 200 ? '...' : '') : null
      });

      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isLastAttempt = attempt === maxAttempts - 1;
      const shouldRetry = !isLastAttempt && isConnectionLevelError(error);

      if (shouldRetry) {
        logger.warn(`MCP tool execution detected transport issue - attempting direct reconnect`, {
          executionId,
          serverId: serverId.slice(0, 8),
          toolName,
          serverName: serverInstance.config.name,
          status: 'retrying',
          attempt: attempt + 1,
          maxAttempts,
          duration: Math.round(duration * 100) / 100,
          error: errorMessage
        });

        await safelyCloseClient(serverInstance.client, {
          serverName: serverInstance.config.name,
          reason: 'direct-call-reconnect'
        });
        serverInstance.client = null;

        try {
          serverInstance.client = await connectMCPServer(serverInstance.config);
          serverInstance.status = 'running';
          serverInstance.lastHealthCheck = new Date();
          continue;
        } catch (reconnectError) {
          const reconnectMessage = reconnectError instanceof Error ? reconnectError.message : String(reconnectError);
          logger.error(`MCP direct tool execution reconnect failed`, {
            executionId,
            serverId: serverId.slice(0, 8),
            toolName,
            serverName: serverInstance.config.name,
            error: reconnectMessage
          });
          serverInstance.status = 'error';
          serverInstance.error = reconnectError instanceof Error ? reconnectError : new Error(reconnectMessage);
          throw reconnectError;
        }
      }

      logger.error(`MCP tool execution failed: ${errorMessage}`, {
        executionId,
        serverId: serverId.slice(0, 8),
        toolName,
        serverName: serverInstance.config.name,
        sequenceId,
        parentToolCall,
        status: 'error',
        duration: Math.round(duration * 100) / 100,
        error: errorMessage,
        errorStack: error instanceof Error ? error.stack : undefined
      });

      throw error;
    }
  }
}

/**
 * Restart MCP server by ID
 */
export async function restartMCPServer(serverId: string): Promise<boolean> {
  const serverInstance = serverRegistry.get(serverId);
  if (!serverInstance) return false;

  logger.info(`Restarting MCP server: ${serverInstance.config.name}`, {
    serverId: serverId.slice(0, 8)
  });

  try {
    await stopServer(serverInstance);
    await startServerAsync(serverInstance);
    return true;
  } catch (error) {
    logger.error(`Failed to restart MCP server: ${serverInstance.config.name}`, {
      serverId: serverId.slice(0, 8),
      error: error instanceof Error ? error.message : error
    });

    serverInstance.status = 'error';
    serverInstance.error = error instanceof Error ? error : new Error(String(error));
    return false;
  }
}

// === TOOL CACHE MANAGEMENT ===

/**
 * Clear cached tools for specific server or all servers
 * Useful for forcing cache refresh when server tools change
 */
export async function clearToolsCache(serverName?: string): Promise<void> {
  if (serverName) {
    const cacheKey = getToolCacheKey(serverName);
    const entry = toolsCache.get(cacheKey);
    let deleted = false;

    if (entry) {
      await disposeToolCacheEntry(entry, 'manual-clear');
      deleted = toolsCache.delete(cacheKey);
    }

    logger.info(`Cleared tools cache for server: ${serverName}`, {
      serverName,
      found: deleted,
      remainingEntries: toolsCache.size
    });
  } else {
    const entriesCleared = await disposeAllToolCacheEntries('manual-clear-all');

    logger.info(`Cleared all tools cache entries`, {
      entriesCleared
    });
  }
}

/**
 * Get tools cache statistics for monitoring and debugging
 */
export function getToolsCacheStats(): {
  totalEntries: number;
  totalTools: number;
  cacheSize: number;
  oldestEntry?: { serverName: string; cachedAt: Date };
  newestEntry?: { serverName: string; cachedAt: Date };
  memoryUsage: { approximate: string };
} {
  const entries = Array.from(toolsCache.values());

  if (entries.length === 0) {
    return {
      totalEntries: 0,
      totalTools: 0,
      cacheSize: 0,
      memoryUsage: { approximate: '0 B' }
    };
  }

  const sortedByDate = entries.sort((a, b) => a.cachedAt.getTime() - b.cachedAt.getTime());
  const totalTools = entries.reduce((sum, entry) => sum + Object.keys(entry.tools).length, 0);

  // Rough memory usage estimate (ignore non-serializable client references)
  const approximateSize = JSON.stringify(entries.map(entry => ({
    serverName: entry.serverName,
    cachedAt: entry.cachedAt.toISOString(),
    toolCount: Object.keys(entry.tools).length,
    transport: entry.serverConfig.transport
  }))).length;
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${Math.round(bytes / (1024 * 1024) * 100) / 100} MB`;
  };

  return {
    totalEntries: entries.length,
    totalTools,
    cacheSize: toolsCache.size,
    oldestEntry: sortedByDate.length > 0 ? {
      serverName: sortedByDate[0].serverName,
      cachedAt: sortedByDate[0].cachedAt
    } : undefined,
    newestEntry: sortedByDate.length > 0 ? {
      serverName: sortedByDate[sortedByDate.length - 1].serverName,
      cachedAt: sortedByDate[sortedByDate.length - 1].cachedAt
    } : undefined,
    memoryUsage: { approximate: formatSize(approximateSize) }
  };
}

/**
 * Refresh cached tools for a specific server (force cache miss on next access)
 */
export async function refreshServerToolsCache(serverName: string): Promise<boolean> {
  const cacheKey = getToolCacheKey(serverName);
  const entry = toolsCache.get(cacheKey);

  if (entry) {
    await disposeToolCacheEntry(entry, 'manual-refresh');
    toolsCache.delete(cacheKey);
    logger.info(`Marked tools cache for refresh: ${serverName}`, {
      serverName,
      remainingEntries: toolsCache.size
    });
    return true;
  }

  logger.debug(`Tools cache not found for server: ${serverName}`, {
    serverName
  });

  return false;
}

/** Get MCP system health status */
export function getMCPSystemHealth(): {
  status: 'healthy' | 'degraded' | 'unhealthy';
  details: {
    totalServers: number;
    healthyServers: number;
    unhealthyServers: number;
    errors: string[];
  };
} {
  const servers = Array.from(serverRegistry.values());
  const healthyServers = servers.filter(s => s.status === 'running');
  const unhealthyServers = servers.filter(s => s.status === 'error');
  const errors = unhealthyServers.map(s => s.error?.message || 'Unknown error');

  let status: 'healthy' | 'degraded' | 'unhealthy';
  if (servers.length === 0) {
    status = 'healthy'; // No servers is healthy
  } else if (unhealthyServers.length === 0) {
    status = 'healthy';
  } else if (healthyServers.length > unhealthyServers.length) {
    status = 'degraded';
  } else {
    status = 'unhealthy';
  }

  return {
    status,
    details: {
      totalServers: servers.length,
      healthyServers: healthyServers.length,
      unhealthyServers: unhealthyServers.length,
      errors
    }
  };
}
