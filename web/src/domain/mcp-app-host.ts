/**
 * MCP App Host - AppBridge Lifecycle Helpers
 *
 * Purpose:
 * - Pure, framework-agnostic helpers for hosting MCP App UIs via the AppBridge SDK.
 * - Shared by both the Electron renderer (React) and web app (AppRun) components.
 *
 * Key Features:
 * - createAppBridgeHost: instantiates and connects an AppBridge to an outer proxy iframe.
 * - destroyAppBridgeHost: tears down the bridge gracefully.
 * - buildProxySrc: returns the URL to mcp-sandbox-proxy.html (relative, env-agnostic).
 * - sessionUiResourceCache: module-level HTML bundle cache keyed by resourceUri.
 *
 * Implementation Notes:
 * - AppBridge is created with client=null; tool calls are forwarded via IPC (Electron)
 *   or REST (web) to the process that owns the real MCP client.
 * - PostMessageTransport targets the outer proxy iframe's contentWindow. The proxy then
 *   relays messages to/from the untrusted inner srcdoc iframe.
 * - The sandbox proxy page is served at /mcp-sandbox-proxy.html (web, same-origin) or
 *   app://host/mcp-sandbox-proxy.html (Electron, custom protocol).
 *
 * Recent Changes:
 * - 2026-02-28: Initial implementation.
 */

import {
  AppBridge,
  PostMessageTransport,
} from '@modelcontextprotocol/ext-apps/app-bridge';
import type {
  McpUiResourceCsp,
  McpUiResourcePermissions,
  McpUiHostCapabilities,
} from '@modelcontextprotocol/ext-apps/app-bridge';
import type { CallToolRequest, CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/** Session-scoped HTML bundle cache keyed by resourceUri to avoid redundant fetches. */
export const sessionUiResourceCache = new Map<string, string>();

/** Callbacks provided to createAppBridgeHost for handling App-initiated events. */
export interface AppBridgeCallbacks {
  /** Called when the App requests a tool call. Returns the tool result or throws. */
  oncalltool: (params: CallToolRequest['params']) => Promise<CallToolResult>;
  /** Called when the App opens an external link. */
  onopenlink?: (url: string) => void;
  /** Called when the App reports a new desired size. */
  onsizechange?: (width: number, height: number) => void;
  /** Called when the AppBridge is fully initialized (after sendSandboxResourceReady). */
  oninitialized?: () => void;
}

/** Options for createAppBridgeHost. */
export interface AppBridgeHostOptions {
  /** HTML bundle to load in the inner sandboxed iframe. */
  html: string;
  /** Tool arguments from the LLM turn. Sent to the App immediately after init. */
  toolArgs?: Record<string, unknown>;
  /** MCP server tool result. Sent to the App after sendToolInput. */
  toolResult?: CallToolResult;
  /** Server name used as hostInfo. */
  serverName: string;
  /** CSP for the inner iframe (optional). */
  csp?: McpUiResourceCsp;
  /** Permissions for the inner iframe (optional). */
  permissions?: McpUiResourcePermissions;
}

/**
 * Returns the URL to the outer sandbox proxy page.
 * - Web: `/mcp-sandbox-proxy.html` (same origin, served from public/)
 * - Electron: `app://host/mcp-sandbox-proxy.html` (custom protocol)
 *
 * Allow explicit override by setting window.__MCP_PROXY_SRC (e.g. in Electron).
 */
export function buildProxySrc(): string {
  const override = (globalThis as Record<string, unknown>).__MCP_PROXY_SRC;
  if (typeof override === 'string' && override) return override;
  return '/mcp-sandbox-proxy.html';
}

/**
 * Creates, connects, and configures an AppBridge for a given outer proxy iframe.
 *
 * Lifecycle:
 * 1. Creates AppBridge with client=null (tool calls forwarded via callbacks.oncalltool).
 * 2. Sets up all callbacks (onsandboxready, oninitialized, oncalltool, onopenlink, onsizechange).
 * 3. Calls bridge.connect(PostMessageTransport) targeting the iframe's contentWindow.
 * 4. When onsandboxready fires: calls sendSandboxResourceReady(html, csp, permissions).
 * 5. When oninitialized fires: calls sendToolInput(toolArgs) then sendToolResult(toolResult).
 * 6. Returns the AppBridge instance for the caller to hold (needed for destroyAppBridgeHost).
 */
export function createAppBridgeHost(
  iframe: HTMLIFrameElement,
  callbacks: AppBridgeCallbacks,
  options: AppBridgeHostOptions
): AppBridge {
  const { html, toolArgs, toolResult, serverName, csp, permissions } = options;

  const capabilities: McpUiHostCapabilities = {
    serverTools: {},
    openLinks: callbacks.onopenlink ? {} : undefined,
  };

  const bridge = new AppBridge(
    null,
    { name: serverName, version: '1.0.0' },
    capabilities
  );

  bridge.onsandboxready = async () => {
    await bridge.sendSandboxResourceReady({ html, csp, permissions });
  };

  bridge.oninitialized = async () => {
    if (toolArgs !== undefined) {
      await bridge.sendToolInput({ arguments: toolArgs });
    }
    if (toolResult !== undefined) {
      await bridge.sendToolResult(toolResult);
    }
    callbacks.oninitialized?.();
  };

  bridge.oncalltool = async (params, _extra) => {
    return callbacks.oncalltool(params);
  };

  if (callbacks.onopenlink) {
    const openlink = callbacks.onopenlink;
    bridge.onopenlink = async ({ url }) => {
      openlink(url);
      return {};
    };
  }

  if (callbacks.onsizechange) {
    const sizechange = callbacks.onsizechange;
    bridge.onsizechange = ({ width, height }) => {
      sizechange(width ?? 0, height ?? 0);
    };
  }

  const win = iframe.contentWindow as Window;
  const transport = new PostMessageTransport(win, win);
  bridge.connect(transport).catch(() => {
    // Connection errors are non-fatal; the proxy page may not be ready yet.
  });

  return bridge;
}

/**
 * Tears down an AppBridge, sending teardownResource to the App and disconnecting.
 * Safe to call multiple times (no-op if bridge is null).
 */
export async function destroyAppBridgeHost(bridge: AppBridge | null): Promise<void> {
  if (!bridge) return;
  try {
    await bridge.teardownResource({});
  } catch {
    // Teardown errors are expected if the iframe is already gone.
  }
  try {
    await bridge.close();
  } catch {
    // Ignore close errors.
  }
}
