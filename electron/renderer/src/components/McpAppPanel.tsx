/**
 * McpAppPanel - Sandboxed MCP App UI Host Component
 *
 * Purpose:
 * - Renders an outer proxy iframe that hosts the double-iframe MCP App sandbox.
 * - Manages the AppBridge lifecycle: connect, sendToolInput/Result, dismiss, teardown.
 *
 * Key Features:
 * - Each tool-result message with a UI-capable tool gets its own independent panel.
 * - Dismiss button teardowns the bridge and removes the panel.
 * - Tool calls from inside the app are proxied via IPC to the main process.
 *
 * Implementation Notes:
 * - AppBridge is created with client=null; oncalltool forwards via window.agentWorldDesktop.
 * - The outer iframe src is `app://host/mcp-sandbox-proxy.html` (Electron custom protocol).
 * - Uses useRef to track bridge across renders; useEffect for mount/unmount lifecycle.
 *
 * Recent Changes:
 * - 2026-02-28: Initial implementation.
 */

import { useEffect, useRef, useState } from 'react';
import { AppBridge } from '@modelcontextprotocol/ext-apps/app-bridge';
import {
  createAppBridgeHost,
  destroyAppBridgeHost,
  type AppBridgeCallbacks,
  type AppBridgeHostOptions,
} from '../../../../web/src/domain/mcp-app-host';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

const ELECTRON_PROXY_SRC = 'app://host/mcp-sandbox-proxy.html';

export interface McpAppPanelProps {
  worldId: string;
  serverKey: string;
  htmlBundle: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: CallToolResult;
  serverName?: string;
  onClose: () => void;
}

export default function McpAppPanel({
  worldId,
  serverKey,
  htmlBundle,
  toolArgs,
  toolResult,
  serverName,
  onClose,
}: McpAppPanelProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<AppBridge | null>(null);
  const [panelHeight, setPanelHeight] = useState<number>(400);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const callbacks: AppBridgeCallbacks = {
      oncalltool: async (params) => {
        const desktop = (window as any).agentWorldDesktop;
        if (!desktop?.mcpProxyToolCall) {
          throw new Error('mcpProxyToolCall bridge not available');
        }
        const result = await desktop.mcpProxyToolCall({
          worldId,
          serverKey,
          toolName: params.name,
          args: params.arguments,
        });
        return result as CallToolResult;
      },
      onopenlink: (url) => {
        window.open(url, '_blank', 'noopener,noreferrer');
      },
      onsizechange: (_width, height) => {
        if (height > 0) setPanelHeight(height);
      },
    };

    const options: AppBridgeHostOptions = {
      html: htmlBundle,
      toolArgs,
      toolResult,
      serverName: serverName || serverKey,
    };

    // Set the Electron custom protocol src before creating the bridge.
    (globalThis as Record<string, unknown>).__MCP_PROXY_SRC = ELECTRON_PROXY_SRC;

    // Wait for the iframe src to load before connecting.
    const handleLoad = () => {
      const bridge = createAppBridgeHost(iframe, callbacks, options);
      bridgeRef.current = bridge;
    };

    iframe.addEventListener('load', handleLoad);
    iframe.src = ELECTRON_PROXY_SRC;

    return () => {
      iframe.removeEventListener('load', handleLoad);
      destroyAppBridgeHost(bridgeRef.current).catch(() => undefined);
      bridgeRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDismiss = async () => {
    await destroyAppBridgeHost(bridgeRef.current);
    bridgeRef.current = null;
    onClose();
  };

  return (
    <div className="mcp-app-panel" style={{ position: 'relative', width: '100%' }}>
      <button
        className="mcp-app-panel__dismiss"
        onClick={handleDismiss}
        aria-label="Dismiss MCP App panel"
        style={{ position: 'absolute', top: 4, right: 4, zIndex: 10 }}
      >
        ✕
      </button>
      <iframe
        ref={iframeRef}
        title="MCP App"
        sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
        style={{ border: 'none', width: '100%', height: panelHeight, display: 'block' }}
      />
    </div>
  );
}
