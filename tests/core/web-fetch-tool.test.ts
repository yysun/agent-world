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
 * - 2026-03-21: Added durable tool-envelope coverage for persisted `web_fetch` success and failure paths.
 * - 2026-03-12: Added regression coverage for blocked private targets without world context so execute never falls through to an uncontrolled network fetch.
 * - 2026-02-28: Added initial unit coverage for built-in web_fetch tool.
 * - 2026-03-01: Added coverage for includeLinks=false behavior to ensure anchor text is preserved without markdown links.
 * - 2026-03-05: Added timeout-abort coverage to enforce deterministic `timeout_error` mapping.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseToolExecutionEnvelopeContent } from '../../core/tool-execution-envelope.js';

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

  it('wraps persisted web_fetch results in a durable tool envelope with preview metadata', async () => {
    const html = '<html><head><title>Envelope App</title></head><body><h1>Ready</h1><p>Hello world</p></body></html>';

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
    const raw = await tool.execute(
      { url: 'https://example.com/envelope' },
      undefined,
      undefined,
      {
        toolCallId: 'web-fetch-1',
        persistToolEnvelope: true,
      },
    );

    const envelope = parseToolExecutionEnvelopeContent(String(raw));
    expect(envelope?.tool).toBe('web_fetch');
    expect(envelope?.status).toBe('completed');
    expect(envelope?.tool_call_id).toBe('web-fetch-1');
    expect(JSON.stringify(envelope?.preview || null)).toContain('# Envelope App');
    expect(JSON.stringify(envelope?.preview || null)).toContain('https://example.com/envelope');

    const parsedResult = JSON.parse(String(envelope?.result || '{}'));
    expect(parsedResult.title).toBe('Envelope App');
    expect(parsedResult.mode).toBe('html');
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

  it('blocks localhost targets when no world context is available for approval', async () => {
    const tool = createWebFetchToolDefinition();
    const result = await tool.execute({ url: 'http://localhost:3000' });

    expect(String(result)).toContain('Error: web_fetch failed - blocked_target: local/private hostnames are not allowed');
  });

  it('wraps persisted web_fetch failures in a durable tool envelope', async () => {
    const tool = createWebFetchToolDefinition();
    const raw = await tool.execute(
      { url: 'http://localhost:3000' },
      undefined,
      undefined,
      {
        toolCallId: 'web-fetch-err-1',
        persistToolEnvelope: true,
      },
    );

    const envelope = parseToolExecutionEnvelopeContent(String(raw));
    expect(envelope?.tool).toBe('web_fetch');
    expect(envelope?.status).toBe('failed');
    expect(envelope?.tool_call_id).toBe('web-fetch-err-1');
    expect(String(envelope?.result || '')).toContain('blocked_target');
    expect(JSON.stringify(envelope?.preview || null)).toContain('web_fetch failed');
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

  it('persists durable approval prompt and resolution messages when localhost access is denied', async () => {
    mockRequestWorldOption.mockImplementationOnce(async (_world, request) => ({
      requestId: String(request?.requestId || ''),
      worldId: 'world-1',
      chatId: 'chat-1',
      optionId: 'no',
      source: 'user',
    }));

    const messages: Array<Record<string, unknown>> = [];
    const tool = createWebFetchToolDefinition();
    const result = await tool.execute(
      { url: 'http://127.0.0.1:8080' },
      undefined,
      undefined,
      {
        world: { id: 'world-1', currentChatId: 'chat-1' } as any,
        chatId: 'chat-1',
        toolCallId: 'web-fetch-call-1',
        agentName: 'agent-1',
        messages: messages as any,
      },
    );

    expect(String(result)).toContain('Error: web_fetch failed - blocked_target: local/private access denied');
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      role: 'assistant',
      sender: 'agent-1',
      tool_calls: [
        expect.objectContaining({ id: 'web-fetch-call-1::approval' }),
      ],
    });

    const promptArgs = JSON.parse(String((messages[0] as any).tool_calls[0].function.arguments));
    expect(promptArgs).toMatchObject({
      title: 'Allow local/private web_fetch access?',
      defaultOptionId: 'no',
      defaultOption: 'No',
      metadata: {
        tool: 'web_fetch',
        toolCallId: 'web-fetch-call-1',
      },
    });
    expect(promptArgs.options).toEqual([
      {
        id: 'yes',
        label: 'Yes',
        description: 'Allow this local/private fetch request.',
      },
      {
        id: 'no',
        label: 'No',
        description: 'Keep blocking this request.',
      },
    ]);

    expect(JSON.parse(String(messages[1].content))).toMatchObject({
      requestId: 'web-fetch-call-1::approval',
      toolCallId: 'web-fetch-call-1',
      tool: 'web_fetch',
      status: 'denied',
      reason: 'user_denied',
    });
  });

  it('does not infer chatId from world context for localhost approval', async () => {
    const tool = createWebFetchToolDefinition();
    const result = await tool.execute(
      { url: 'http://127.0.0.1:8080' },
      undefined,
      undefined,
      {
        world: { id: 'world-1', currentChatId: 'chat-1' } as any,
        toolCallId: 'tc-3',
        agentName: 'agent-1',
      },
    );

    expect(String(result)).toContain('Error: web_fetch failed - blocked_target: local/private access approval requires an explicit chatId');
    expect(mockRequestWorldOption).not.toHaveBeenCalled();
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
