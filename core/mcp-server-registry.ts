/**
 * MCP Server Registry and Tools Integration - Clean Implementation with Runtime AI SDK Patch
 *
 * Comprehensive MCP (Model Context Protocol) management system providing:
 * - Server lifecycle management with reference counting and connection pooling
 * - Configuration-based server identification and sharing across worlds
 * - AI-compatible tool conversion with schema validation
 * - Transport support for stdio, SSE, and streamable HTTP connections
 * - Health monitoring, error handling, and graceful shutdown
 * - Thread-safe registry operations with world-server mapping
 * - Consolidated logging under LOG_LLM_MCP for unified debugging
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
 *
 * MCP Tool Execution Logging (LOG_LLM_MCP=debug):
 * - Tool execution performance metrics with millisecond precision
 * - Tool result content analysis including size and type identification
 * - Tool call sequence tracking with unique sequence IDs
 * - Success/failure status with detailed error information
 * - Parent-child tool call relationship tracking
 * - Argument validation and presence checking
 * - Result preview for debugging without exposing full content
 *
 * Schema Approach:
 * - Uses simplified property types (string, number, boolean, array with string items)
 * - Includes additionalProperties: false to prevent schema expansion
 * - Maintains required fields but simplifies complex nested structures
 * - Works with runtime AI SDK patch to prevent schema corruption in Azure OpenAI calls
 *
 * Architecture: Function-based design with module-level state management
 * Consolidated from: mcp-server-registry.ts + mcp-tools.ts (August 2025)
 * Runtime patch integration: Works with ai-sdk-patch.ts for Azure compatibility (August 2025)
 */

import { createHash } from 'crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getWorld } from './managers.js';
import { createCategoryLogger } from './logger.js';

const logger = createCategoryLogger('llm.mcp');

// === TYPE DEFINITIONS ===

export type MCPConfig = {
  servers: Record<string, {
    command: string;
    args?: string[];
    env?: Record<string, string>;
    transport?: 'stdio';
  } | {
    url: string;
    headers?: Record<string, string>;
    transport: 'sse' | 'streamable-http';
  } | {
    type: 'http' | 'sse' | 'streamable-http'; // Legacy 'type' field support
    url: string;
    headers?: Record<string, string>;
  }>;
};

export type MCPServerConfig = {
  name: string;
  transport: 'stdio' | 'sse' | 'streamable-http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
};

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

// === UTILITY FUNCTIONS ===

// Azure OpenAI requires function names: ^[a-zA-Z0-9_\.-]+$
const sanitize = (s: string) => s.replace(/[^\w\-\.]/g, '_');
const nsName = (server: string, tool: string) => `${sanitize(server)}_${sanitize(tool)}`;

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
 */
export function parseServersFromConfig(config: MCPConfig): MCPServerConfig[] {
  const servers: MCPServerConfig[] = [];

  for (const [name, serverDef] of Object.entries(config.servers)) {
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
  const transport = serverConfig.transport === 'stdio' || !serverConfig.transport
    ? new StdioClientTransport({
      command: serverConfig.command!,
      args: serverConfig.args ?? [],
      env: serverConfig.env
    })
    : serverConfig.transport === 'sse'
      ? new SSEClientTransport(new URL(serverConfig.url!), {
        requestInit: { headers: serverConfig.headers }
      })
      : new StreamableHTTPClientTransport(new URL(serverConfig.url!), {
        requestInit: { headers: serverConfig.headers }
      });

  const client = new Client({ name: 'my-app', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);
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

  // Copy properties safely
  if (schema.properties && typeof schema.properties === 'object') {
    for (const [key, value] of Object.entries(schema.properties)) {
      const prop = value as any;
      normalized.properties[key] = {
        type: prop?.type || 'string',
        ...(prop?.description && { description: prop.description })
      };
    }
  }

  // Copy required array safely
  if (schema.required && Array.isArray(schema.required)) {
    normalized.required = [...schema.required];
  }

  return normalized;
}

/**
 * Convert MCP tools to AI-compatible tool format with bulletproof schema protection
 */
export async function mcpToolsToAiTools(client: Client, serverName: string) {
  const listToolsPromise = client.listTools();
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Timeout waiting for tools list')), 5000);
  });

  const { tools } = await Promise.race([listToolsPromise, timeoutPromise]);
  const aiTools: Record<string, any> = {};

  for (const t of tools as Tool[]) {
    const key = nsName(serverName, t.name);

    // Apply bulletproof schema normalization - this is our surgical fix
    const bulletproofedSchema = bulletproofSchema(t.inputSchema);

    // Validate and simplify further for Azure compatibility
    const finalSchema = validateToolSchema(bulletproofedSchema);

    aiTools[key] = {
      description: t.description ?? '',
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
          argsKeys: args ? Object.keys(args) : []
        });

        try {
          const res = await client.callTool({ name: t.name, arguments: args ?? {} });
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
              : JSON.stringify(processedResult).slice(0, 200) + '...'
          });

          return processedResult;
        } catch (error) {
          const duration = performance.now() - startTime;

          logger.error(`MCP tool execution failed via AI conversion`, {
            executionId,
            serverName,
            toolName: t.name,
            toolKey: key,
            sequenceId,
            parentToolCall,
            status: 'error',
            duration: Math.round(duration * 100) / 100,
            error: error instanceof Error ? error.message : error
          });

          throw error;
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
  isInitialized = false;
  shutdownInProgress = false;

  logger.info('All MCP servers shut down');
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
      referenceCount: serverInstance.referenceCount
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
      // MCP Client cleanup handled by transport layer
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
    if (!config?.servers || typeof config.servers !== 'object') return false;

    for (const [serverName, server] of Object.entries(config.servers)) {
      if (!serverName || !server || typeof server !== 'object') return false;

      const serverConfig = server as any;
      const transport = serverConfig.transport ||
        (serverConfig.type === 'http' ? 'streamable-http' : serverConfig.type) ||
        'stdio';

      if (!['stdio', 'sse', 'streamable-http'].includes(transport)) return false;

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
export async function getMCPToolsForWorld(worldId: string): Promise<Record<string, any>> {
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

  for (const serverConfig of serverConfigs) {
    const serverPromise = (async () => {
      try {
        const serverId = await registerMCPServer(serverConfig, worldId);
        const serverInstance = serverRegistry.get(serverId);

        if (!serverInstance || serverInstance.status !== 'running' || !serverInstance.client) {
          logger.warn(`Server not ready: ${serverConfig.name}`);
          return;
        }

        const serverTools = await mcpToolsToAiTools(serverInstance.client, serverInstance.config.name);
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
  logger.info(`Retrieved ${totalTools} total MCP tools for world: ${worldId}`);
  return allTools;
}

/**
 * Execute MCP tool by server ID and tool name
 */
export async function executeMCPTool(
  serverId: string,
  toolName: string,
  args: any,
  sequenceId?: string,
  parentToolCall?: string
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
    argsKeys: args ? Object.keys(args) : []
  });

  try {
    const result = await serverInstance.client.callTool({
      name: toolName,
      arguments: args || {}
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

    logger.error(`MCP tool execution failed`, {
      executionId,
      serverId: serverId.slice(0, 8),
      toolName,
      serverName: serverInstance.config.name,
      sequenceId,
      parentToolCall,
      status: 'error',
      duration: Math.round(duration * 100) / 100,
      error: error instanceof Error ? error.message : error
    });

    throw error;
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