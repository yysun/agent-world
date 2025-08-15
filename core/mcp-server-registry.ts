/**
 * MCP Server Registry - Function-Based
 *
 * Features:
 * - Function-based MCP server lifecycle management
 * - Server instance tracking with reference counting
 * - Configuration hash-based server identification for sharing
 * - Health monitoring and error state management
 * - Graceful startup and shutdown handling
 * - Thread-safe server registry operations
 *
 * Changes:
 * - Initial implementation of MCP server registry
 * - Module-level state management following function-based architecture
 * - Server sharing optimization based on configuration hash
 * - Proper cleanup and resource management
 */

import { createHash } from 'crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { connectMCPServer, MCPConfig, MCPServerConfig, mcpToolsToAiTools, parseServersFromConfig } from './mcp-tools.js';
import { getWorld } from './managers.js';
import { createCategoryLogger } from './logger.js';

const logger = createCategoryLogger('mcp-registry');

export interface MCPServerInstance {
  id: string; // hash of configuration
  config: MCPServerConfig;
  client: Client | null; // null when starting/stopping
  status: 'starting' | 'running' | 'stopping' | 'error';
  referenceCount: number;
  startedAt: Date;
  lastHealthCheck: Date;
  error?: Error;
  associatedWorlds: Set<string>; // Track which worlds are using this server
}

// Module-level server registry state
const serverRegistry = new Map<string, MCPServerInstance>();
const worldServerMapping = new Map<string, Set<string>>(); // worldId -> Set of serverIds
let isInitialized = false;
let shutdownInProgress = false;

/**
 * Generate unique server ID based on configuration hash
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
 * Register and start an MCP server if not already running
 * Returns the server ID for reference tracking
 */
export async function registerMCPServer(
  config: MCPServerConfig,
  worldId: string
): Promise<string> {
  if (shutdownInProgress) {
    throw new Error('MCP registry is shutting down');
  }

  const serverId = generateServerId(config);

  // Check if server already exists
  let serverInstance = serverRegistry.get(serverId);

  if (serverInstance) {
    // Server exists, increment reference count
    serverInstance.referenceCount++;
    serverInstance.associatedWorlds.add(worldId);

    // Add to world mapping
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

  // Add to world mapping
  const worldServers = worldServerMapping.get(worldId) || new Set();
  worldServers.add(serverId);
  worldServerMapping.set(worldId, worldServers);

  logger.info(`Starting MCP server: ${config.name}`, {
    serverId: serverId.slice(0, 8),
    transport: config.transport,
    worldId
  });

  // Start server and wait for it to be ready
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
    throw error; // Re-throw to indicate startup failure
  }

  return serverId;
}

/**
 * Unregister MCP server for a world - decreases reference count
 */
export async function unregisterMCPServer(serverId: string, worldId: string): Promise<boolean> {
  const serverInstance = serverRegistry.get(serverId);
  if (!serverInstance) {
    return false;
  }

  // Remove world from server's associated worlds
  serverInstance.associatedWorlds.delete(worldId);
  serverInstance.referenceCount = Math.max(0, serverInstance.referenceCount - 1);

  // Remove from world mapping
  const worldServers = worldServerMapping.get(worldId);
  if (worldServers) {
    worldServers.delete(serverId);
    if (worldServers.size === 0) {
      worldServerMapping.delete(worldId);
    }
  }

  logger.debug(`Unregistered MCP server for world: ${worldId}`, {
    serverId: serverId.slice(0, 8),
    referenceCount: serverInstance.referenceCount
  });

  // Schedule shutdown if no more references
  if (serverInstance.referenceCount === 0) {
    logger.info(`Scheduling MCP server shutdown: ${serverInstance.config.name}`, {
      serverId: serverId.slice(0, 8)
    });

    // Schedule shutdown after delay to allow for reconnections
    setTimeout(async () => {
      if (serverInstance.referenceCount === 0) {
        await stopServer(serverInstance);
        serverRegistry.delete(serverId);
      }
    }, 30000); // 30 second delay
  }

  return true;
}

/**
 * Get MCP server instance by ID
 */
export function getMCPServer(serverId: string): MCPServerInstance | null {
  return serverRegistry.get(serverId) || null;
}

/**
 * List all MCP servers
 */
export function listMCPServers(): MCPServerInstance[] {
  return Array.from(serverRegistry.values());
}

/**
 * Get server IDs for a specific world
 */
export function getMCPServersForWorld(worldId: string): string[] {
  const worldServers = worldServerMapping.get(worldId);
  return worldServers ? Array.from(worldServers) : [];
}

/**
 * Shutdown all MCP servers - called on Express app shutdown
 */
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

/**
 * Start server asynchronously
 */
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

/**
 * Stop server and cleanup resources
 */
async function stopServer(serverInstance: MCPServerInstance): Promise<void> {
  if (serverInstance.status === 'stopping' || serverInstance.status === 'error') {
    return;
  }

  serverInstance.status = 'stopping';

  if (serverInstance.client) {
    try {
      // MCP Client doesn't have explicit close method in current SDK
      // The transport connection will be cleaned up by garbage collection
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

/**
 * Health check for MCP servers - can be called periodically
 */
export function performHealthCheck(): void {
  const now = new Date();

  for (const serverInstance of serverRegistry.values()) {
    if (serverInstance.status === 'running' && serverInstance.client) {
      serverInstance.lastHealthCheck = now;

      // Could add actual health check logic here if MCP SDK supports it
      // For now, just update timestamp
    }
  }
}

/**
 * Get registry statistics
 */
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

// Server Lifecycle Management Functions

/**
 * Validate MCP configuration format and content
 */
export function validateMCPConfig(config: any): config is MCPConfig {
  try {
    if (!config || typeof config !== 'object') {
      return false;
    }

    if (!config.servers || typeof config.servers !== 'object') {
      return false;
    }

    for (const [serverName, server] of Object.entries(config.servers)) {
      if (!serverName || typeof serverName !== 'string') {
        return false;
      }

      if (!server || typeof server !== 'object') {
        return false;
      }

      const serverConfig = server as any;

      // Transport is optional, defaults to 'stdio'
      // Handle both 'transport' and 'type' fields for backwards compatibility
      const transport = serverConfig.transport ||
        (serverConfig.type === 'http' ? 'streamable-http' : serverConfig.type) ||
        'stdio';
      if (!['stdio', 'sse', 'streamable-http'].includes(transport)) {
        return false;
      }

      if (transport === 'stdio') {
        if (!serverConfig.command || typeof serverConfig.command !== 'string') {
          return false;
        }
        // args and env are optional
      } else {
        if (!serverConfig.url || typeof serverConfig.url !== 'string') {
          return false;
        }
        // headers are optional
      }
    }

    return true;
  } catch (error) {
    logger.error('Error validating MCP config', { error: error instanceof Error ? error.message : error });
    return false;
  }
}

/**
 * Parse MCP configuration string safely
 */
export function parseMCPConfig(configString: string): MCPConfig | null {
  try {
    if (!configString || configString.trim() === '') {
      return null;
    }

    const config = JSON.parse(configString);

    if (!validateMCPConfig(config)) {
      logger.error('Invalid MCP configuration format');
      return null;
    }

    return config as MCPConfig;
  } catch (error) {
    logger.error('Failed to parse MCP config', {
      error: error instanceof Error ? error.message : error,
      configString: configString.slice(0, 100) + (configString.length > 100 ? '...' : '')
    });
    return null;
  }
}

/**
 * Start MCP servers for a world based on its configuration
 * Returns array of server IDs that were started/registered
 */
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

  // Wait for all server startup attempts to complete (or fail)
  await Promise.allSettled(startupPromises);

  logger.info(`Started ${serverIds.length}/${serverConfigs.length} MCP servers for world: ${worldId}`, {
    serverIds: serverIds.map(id => id.slice(0, 8))
  });

  return serverIds;
}

/**
 * Stop MCP servers for a world - decreases reference counts
 */
export async function stopMCPServersForWorld(worldId: string): Promise<void> {
  const worldServers = worldServerMapping.get(worldId);
  if (!worldServers || worldServers.size === 0) {
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

/**
 * Get MCP tools available for a world
 * Returns combined tools from all running servers for the world
 * Starts servers on-demand if needed (with connection pooling)
 */
export async function getMCPToolsForWorld(worldId: string): Promise<Record<string, any>> {
  // Get world to check for MCP config
  const world = await getWorld(worldId);
  if (!world || !world.mcpConfig) {
    logger.debug(`No MCP config for world: ${worldId}`);
    return {};
  }

  // Parse config and start servers on-demand
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
        // Register server (will reuse existing if already running)
        const serverId = await registerMCPServer(serverConfig, worldId);
        const serverInstance = serverRegistry.get(serverId);

        if (!serverInstance || serverInstance.status !== 'running' || !serverInstance.client) {
          logger.warn(`Server not ready: ${serverConfig.name}`);
          return;
        }

        // Get tools from this server
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

  // Wait for all servers to be ready and tools retrieved
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
  args: any
): Promise<any> {
  const serverInstance = serverRegistry.get(serverId);
  if (!serverInstance) {
    throw new Error(`MCP server not found: ${serverId.slice(0, 8)}`);
  }

  if (serverInstance.status !== 'running' || !serverInstance.client) {
    throw new Error(`MCP server not available: ${serverInstance.config.name} (status: ${serverInstance.status})`);
  }

  try {
    const result = await serverInstance.client.callTool({
      name: toolName,
      arguments: args || {}
    });

    logger.debug(`MCP tool executed successfully`, {
      serverId: serverId.slice(0, 8),
      toolName,
      serverName: serverInstance.config.name
    });

    return result;
  } catch (error) {
    logger.error(`MCP tool execution failed`, {
      serverId: serverId.slice(0, 8),
      toolName,
      serverName: serverInstance.config.name,
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
  if (!serverInstance) {
    return false;
  }

  logger.info(`Restarting MCP server: ${serverInstance.config.name}`, {
    serverId: serverId.slice(0, 8)
  });

  try {
    // Stop the server first
    await stopServer(serverInstance);

    // Start it again
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

/**
 * Update MCP servers for a world when configuration changes
 */
export async function updateMCPServersForWorld(worldId: string, newMcpConfig: string): Promise<string[]> {
  logger.info(`Updating MCP servers for world: ${worldId}`);

  // Stop current servers
  await stopMCPServersForWorld(worldId);

  // Start new servers with new configuration
  return await startMCPServersForWorld(worldId, newMcpConfig);
}

/**
 * Get MCP system health status
 */
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
    status = 'healthy'; // No servers is considered healthy
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