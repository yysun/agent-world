/**
 * MCP Tools Integration
 * 
 * This file provides utilities for integrating with Model Context Protocol (MCP) servers.
 * 
 * Features:
 * - Convert MCP tools to AI-compatible tool format
 * - Handle tool execution with proper result parsing
 * - Support for various MCP server transport types
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export type MCPConfig = {
  servers: Record<string, {
    command: string;
    args?: string[];
    env?: Record<string, string>;
    transport?: 'stdio'; // Default to stdio, could extend for other transports
  } | {
    url: string;
    headers?: Record<string, string>;
    transport: 'sse' | 'streamable-http';
  } | {
    type: 'http' | 'sse' | 'streamable-http';
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

const sanitize = (s: string) => s.replace(/[^\w\-]/g, '-'); // keep simple; colon inserted by us
const nsName = (server: string, tool: string) => `${sanitize(server)}:${tool}`;

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
      // HTTP/SSE transport - handle both 'transport' and 'type' fields
      const transportType = ('transport' in serverDef)
        ? serverDef.transport
        : ('type' in serverDef)
          ? (serverDef.type === 'http' ? 'streamable-http' : serverDef.type)
          : 'streamable-http'; // default to streamable-http for URL-based configs

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


/**
 * Convert MCP tools to AI-compatible tool format
 */
export async function mcpToolsToAiTools(client: Client, serverName: string) {
  // Add timeout to prevent hanging
  const listToolsPromise = client.listTools();
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Timeout waiting for tools list')), 5000);
  });

  const { tools } = await Promise.race([listToolsPromise, timeoutPromise]);
  const aiTools: Record<string, any> = {};

  // Convert tools to AI format without logging individual tool names
  // Only log total count to avoid verbose output

  for (const t of tools as Tool[]) {
    const key = nsName(serverName, t.name);

    aiTools[key] = {
      description: t.description ?? '',
      parameters: t.inputSchema ?? { type: 'object', properties: {} },
      execute: async (args: any) => {
        const res = await client.callTool({ name: t.name, arguments: args ?? {} });

        // Handle the result content safely
        if (res && typeof res === 'object' && 'content' in res) {
          const content = res.content as any[];
          if (Array.isArray(content)) {
            // Prefer text → json → fallback
            const textPart = content.find((p: any) => p?.type === 'text');
            if (textPart && 'text' in textPart) return textPart.text;

            const jsonPart = content.find((p: any) => p?.type === 'json');
            if (jsonPart && 'json' in jsonPart) return jsonPart.json;
          }
        }

        return JSON.stringify(res);
      },
    };
  }

  return aiTools;
}
