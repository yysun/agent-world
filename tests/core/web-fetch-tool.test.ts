/**
 * web_fetch Tool Tests
 *
 * Features:
 * - Validates URL/scheme and network-target safety checks
 * - Verifies HTML to markdown conversion with Turndown
 * - Verifies SPA bootstrap JSON extraction for JS-heavy shells
 *
 * Implementation Notes:
 * - Mocks DNS lookups to keep tests deterministic and offline
 * - Mocks global fetch to avoid real network calls
 *
 * Recent Changes:
 * - 2026-02-28: Added initial unit coverage for built-in web_fetch tool.
 * - 2026-03-01: Added coverage for includeLinks=false behavior to ensure anchor text is preserved without markdown links.
 * - 2026-03-05: Added timeout-abort coverage to enforce deterministic `timeout_error` mapping.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockLookup = vi.hoisted(() => vi.fn());
const mockRequestWorldOption = vi.hoisted(() => vi.fn());

vi.mock('dns/promises', () => ({
  lookup: mockLookup,
}));

vi.mock('../../core/hitl.js', () => ({
  requestWorldOption: mockRequestWorldOption,
}));

import { createWebFetchToolDefinition } from '../../core/web-fetch-tool.js';

describe('web_fetch tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    mockRequestWorldOption.mockResolvedValue({
      requestId: 'req-1',
      worldId: 'world-1',
      chatId: 'chat-1',
      optionId: 'yes',
      source: 'user',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects unsupported URL schemes', async () => {
    const tool = createWebFetchToolDefinition();
    const result = await tool.execute({ url: 'ftp://example.com/data' });

    expect(String(result)).toContain('Error: web_fetch failed - unsupported_scheme');
  });

  it('converts fetched HTML to markdown and extracts SPA bootstrap JSON', async () => {
    const html = `
      <html>
        <head>
          <title>Example App</title>
          <script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"name":"Agent World"}}}</script>
        </head>
        <body>
          <main>
            <h1>Welcome</h1>
            <p>Hello <a href="https://example.com/docs">Docs</a></p>
          </main>
        </body>
      </html>
    `;

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(html, {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })
      )
    );

    const tool = createWebFetchToolDefinition();
    const raw = await tool.execute({ url: 'https://example.com', maxChars: 20000 });

    expect(typeof raw).toBe('string');
    const parsed = JSON.parse(String(raw));

    expect(parsed.ok).toBe(true);
    expect(parsed.status).toBe(200);
    expect(parsed.mode).toBe('spa-data');
    expect(parsed.title).toBe('Example App');
    expect(parsed.markdown).toContain('# Example App');
    expect(parsed.markdown).toContain('# Welcome');
    expect(parsed.markdown).toContain('Hello [Docs](https://example.com/docs)');
    expect(parsed.markdown).toContain('## SPA Bootstrap Data');
    expect(parsed.markdown).toContain('__NEXT_DATA__');
  });

  it('strips link markup when includeLinks is false while keeping text content', async () => {
    const html = '<html><body><p>Read <a href="https://example.com/docs">the docs</a> now.</p></body></html>';

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(html, {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })
      )
    );

    const tool = createWebFetchToolDefinition();
    const raw = await tool.execute({ url: 'https://example.com', includeLinks: false });
    const parsed = JSON.parse(String(raw));

    expect(parsed.ok).toBe(true);
    expect(parsed.markdown).toContain('Read the docs now.');
    expect(parsed.markdown).not.toContain('[the docs](');
  });

  it('blocks private network targets resolved from DNS', async () => {
    mockLookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);

    const tool = createWebFetchToolDefinition();
    const result = await tool.execute({ url: 'https://internal.example.com' });

    expect(String(result)).toContain('Error: web_fetch failed - blocked_target');
  });

  it('requests HITL approval and allows localhost fetch when approved', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('<html><head><title>Local App</title></head><body><h1>Ready</h1></body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })
      )
    );

    const tool = createWebFetchToolDefinition();
    const raw = await tool.execute(
      { url: 'http://localhost:3000' },
      undefined,
      undefined,
      {
        world: { id: 'world-1', currentChatId: 'chat-1' } as any,
        chatId: 'chat-1',
        toolCallId: 'tc-1',
        agentName: 'agent-1',
      },
    );

    const parsed = JSON.parse(String(raw));
    expect(parsed.ok).toBe(true);
    expect(parsed.title).toBe('Local App');
    expect(mockRequestWorldOption).toHaveBeenCalledTimes(1);
  });

  it('returns blocked_target error when HITL approval is denied for localhost', async () => {
    mockRequestWorldOption.mockResolvedValueOnce({
      requestId: 'req-2',
      worldId: 'world-1',
      chatId: 'chat-1',
      optionId: 'no',
      source: 'user',
    });

    const tool = createWebFetchToolDefinition();
    const result = await tool.execute(
      { url: 'http://127.0.0.1:8080' },
      undefined,
      undefined,
      {
        world: { id: 'world-1', currentChatId: 'chat-1' } as any,
        chatId: 'chat-1',
        toolCallId: 'tc-2',
        agentName: 'agent-1',
      },
    );

    expect(String(result)).toContain('Error: web_fetch failed - blocked_target: local/private access denied');
    expect(mockRequestWorldOption).toHaveBeenCalledTimes(1);
  });

  it('maps request timeout aborts to deterministic timeout_error category', async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal(
        'fetch',
        vi.fn((_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('aborted', 'AbortError'));
            });
          }),
        ),
      );

      const tool = createWebFetchToolDefinition();
      const pending = tool.execute({ url: 'https://example.com/slow', timeoutMs: 1000 });
      await vi.advanceTimersByTimeAsync(1000);

      await expect(pending).resolves.toContain(
        'Error: web_fetch failed - timeout_error: request exceeded 1000ms',
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
