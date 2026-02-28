/**
 * McpAppPanel - Sandboxed MCP App UI Host Component (AppRun)
 *
 * Purpose:
 * - Renders an outer proxy iframe that hosts the double-iframe MCP App sandbox.
 * - Manages the AppBridge lifecycle using AppRun's rendered/unload hooks.
 *
 * Key Features:
 * - Each tool-result message with a UI-capable tool gets its own independent panel.
 * - Dismiss button tears down the bridge and removes the panel.
 * - Tool calls from inside the app are proxied via REST to /api/worlds/:id/mcp/tool-proxy.
 *
 * Implementation Notes:
 * - AppBridge is stored as a class instance property (not in AppRun state).
 * - rendered() initialises the bridge once after the first render (guarded by `initialized` flag).
 * - this.element.querySelector('iframe') locates the proxy iframe after render.
 * - onsizechange updates panelHeight via this.setState, triggering a state-driven re-render.
 *
 * Recent Changes:
 * - 2026-02-28: Initial implementation.
 */

import { app, Component } from 'apprun';
import {
  createAppBridgeHost,
  destroyAppBridgeHost,
  type AppBridgeCallbacks,
  type AppBridgeHostOptions,
} from '../domain/mcp-app-host';
import type { AppBridge } from '@modelcontextprotocol/ext-apps/app-bridge';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

const WEB_PROXY_SRC = '/mcp-sandbox-proxy.html';

export interface McpAppPanelProps {
  worldId: string;
  serverKey: string;
  htmlBundle: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: CallToolResult;
  serverName?: string;
  onClose: () => void;
}

interface McpAppPanelState {
  panelHeight: number;
}

export default class McpAppPanel extends Component<McpAppPanelState> {
  private bridge: AppBridge | null = null;
  private panelProps: McpAppPanelProps | null = null;
  private initialized = false;

  state: McpAppPanelState = { panelHeight: 400 };

  mounted = (props: McpAppPanelProps): McpAppPanelState => {
    this.panelProps = props;
    this.initialized = false;
    return { panelHeight: 400 };
  };

  rendered = (_state: McpAppPanelState): void => {
    if (this.initialized || !this.panelProps || !this.element) return;
    this.initialized = true;
    this.initBridge();
  };

  private initBridge(): void {
    const props = this.panelProps!;
    const iframe = this.element.querySelector('iframe') as HTMLIFrameElement | null;
    if (!iframe) return;

    const callbacks: AppBridgeCallbacks = {
      oncalltool: async (params) => {
        const response = await fetch(
          `/api/worlds/${encodeURIComponent(props.worldId)}/mcp/tool-proxy`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              serverKey: props.serverKey,
              toolName: params.name,
              args: params.arguments,
            }),
          }
        );
        if (!response.ok) {
          throw new Error(`Tool proxy error: ${response.status}`);
        }
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        return data.result as CallToolResult;
      },
      onopenlink: (url) => {
        window.open(url, '_blank', 'noopener,noreferrer');
      },
      onsizechange: (_width, height) => {
        if (height > 0) {
          this.setState({ panelHeight: height });
        }
      },
    };

    const options: AppBridgeHostOptions = {
      html: props.htmlBundle,
      toolArgs: props.toolArgs,
      toolResult: props.toolResult,
      serverName: props.serverName || props.serverKey,
    };

    const handleLoad = () => {
      this.bridge = createAppBridgeHost(iframe, callbacks, options);
    };

    iframe.addEventListener('load', handleLoad, { once: true });
    iframe.src = WEB_PROXY_SRC;
  }

  unload = (): void => {
    destroyAppBridgeHost(this.bridge).catch(() => undefined);
    this.bridge = null;
  };

  view = (state: McpAppPanelState) => (
    <div className="mcp-app-panel" style={{ position: 'relative', width: '100%' }}>
      <button
        className="mcp-app-panel__dismiss"
        $onclick="mcp-panel-dismiss"
        aria-label="Dismiss MCP App panel"
        style={{ position: 'absolute', top: '4px', right: '4px', zIndex: 10 }}
      >
        ✕
      </button>
      <iframe
        title="MCP App"
        sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
        style={{ border: 'none', width: '100%', height: `${state.panelHeight}px`, display: 'block' }}
      />
    </div>
  );

  update = {
    'mcp-panel-dismiss': async (state: McpAppPanelState): Promise<McpAppPanelState> => {
      await destroyAppBridgeHost(this.bridge);
      this.bridge = null;
      this.panelProps?.onClose();
      return state;
    },
  };
}
