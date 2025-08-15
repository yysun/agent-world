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
  servers: Array<
    | { name: string; transport: 'stdio'; command: string; args?: string[]; env?: Record<string, string> }
    | { name: string; transport: 'sse' | 'streamable-http'; url: string; headers?: Record<string, string> }
  >;
};

const sanitize = (s: string) => s.replace(/[^\w\-]/g, '-'); // keep simple; colon inserted by us
const nsName = (server: string, tool: string) => `${sanitize(server)}:${tool}`;

/**
 * Connect to an MCP server using the specified configuration
 */
export async function connectMCPServer(server: MCPConfig['servers'][0]): Promise<Client> {
  const transport =
    server.transport === 'stdio'
      ? new StdioClientTransport({ command: server.command, args: server.args ?? [], env: server.env })
      : server.transport === 'sse'
      ? new SSEClientTransport(new URL(server.url), { 
          requestInit: { headers: server.headers } 
        })
      : new StreamableHTTPClientTransport(new URL(server.url), { 
          requestInit: { headers: server.headers } 
        });

  const client = new Client({ name: 'my-app', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);
  return client;
}


/**
 * Convert MCP tools to AI-compatible tool format
 */
export async function mcpToolsToAiTools(client: Client, serverName: string) {
  const { tools } = await client.listTools();
  const aiTools: Record<string, any> = {};

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
