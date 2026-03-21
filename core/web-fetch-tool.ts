/**
 * Web Fetch Tool - Lightweight web retrieval with markdown normalization.
 *
 * Features:
 * - Built-in `web_fetch` tool definition for world toolsets
 * - URL validation with http/https scheme enforcement
 * - Basic SSRF safeguards for loopback/private/link-local targets
 * - Lightweight SPA bootstrap-data extraction from HTML script payloads
 * - Markdown conversion via Turndown + GFM plugin
 *
 * Implementation Notes:
 * - Uses native fetch in Node runtime; no browser automation dependencies
 * - Does not execute page JavaScript; instead extracts embedded JSON state when available
 * - Returns deterministic JSON string payloads for downstream tool consumers
 * - Applies timeout and output-size bounds with explicit truncation metadata
 *
 * Recent Changes:
 * - 2026-03-21: Added durable tool-envelope preview/result wrapping for persisted `web_fetch` executions.
 * - 2026-03-12: Restored private-target gating in the main execute path so blocked hosts require explicit approval before any network fetch starts.
 * - 2026-03-12: Shared tool approval flow now persists durable approval prompt/resolution messages for replay-safe local/private access denials.
 * - 2026-03-12: Removed permission level gating — web_fetch is now allowed at all levels (read/ask/auto), like read_file.
 * - 2026-03-06: Removed `world.currentChatId` fallback from local/private access approvals; HITL approval now requires explicit `context.chatId`.
 * - 2026-03-05: Added deterministic timeout-error mapping (`timeout_error`) for aborted fetches caused by per-request timeout limits.
 * - 2026-03-05: Switched timeout/output bounds constants to shared reliability config.
 * - 2026-02-28: Initial implementation of fetch-only web retrieval with Turndown conversion and SPA JSON heuristics.
 */

/// <reference path="./globals.d.ts" />

import { lookup as dnsLookup } from 'dns/promises';
import { isIP } from 'net';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { requestToolApproval } from './tool-approval.js';
import { RELIABILITY_CONFIG } from './reliability-config.js';
import { type AgentMessage, type World } from './types.js';
import {
  createTextToolPreview,
  createUrlToolPreview,
  serializeToolExecutionEnvelope,
  type ToolPreview,
} from './tool-execution-envelope.js';

type WebFetchArgs = {
  url: string;
  timeoutMs?: number;
  maxChars?: number;
  includeLinks?: boolean;
  includeImages?: boolean;
};

type WebFetchToolContext = {
  world?: World;
  chatId?: string | null;
  toolCallId?: string;
  agentName?: string | null;
  messages?: AgentMessage[];
  persistToolEnvelope?: boolean;
};

type WebFetchResult = {
  url: string;
  resolvedUrl: string;
  status: number;
  ok: boolean;
  contentType: string | null;
  title: string | null;
  mode: 'html' | 'text' | 'json' | 'spa-data' | 'unsupported';
  markdown: string;
  limitationReason?: string;
  truncated: boolean;
  timingMs: number;
};

const DEFAULT_TIMEOUT_MS = RELIABILITY_CONFIG.webFetch.defaultTimeoutMs;
const MAX_TIMEOUT_MS = RELIABILITY_CONFIG.webFetch.maxTimeoutMs;
const DEFAULT_MAX_CHARS = RELIABILITY_CONFIG.webFetch.defaultMaxChars;
const MAX_MAX_CHARS = RELIABILITY_CONFIG.webFetch.maxMaxChars;
const MIN_TIMEOUT_MS = RELIABILITY_CONFIG.webFetch.minTimeoutMs;
const LOCAL_APPROVE_OPTION = 'yes';
const LOCAL_DENY_OPTION = 'no';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAbortError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof Error && error.name === 'AbortError') return true;
  const message = toErrorMessage(error).toLowerCase();
  return message.includes('aborted');
}

function parseUrlOrThrow(urlValue: unknown): URL {
  if (typeof urlValue !== 'string' || !urlValue.trim()) {
    throw new Error('invalid_url: url is required');
  }

  let parsed: URL;
  try {
    parsed = new URL(urlValue.trim());
  } catch {
    throw new Error('invalid_url: malformed URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('unsupported_scheme: only http/https URLs are allowed');
  }

  return parsed;
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) return true;

  if (normalized === 'localhost' || normalized.endsWith('.localhost')) {
    return true;
  }

  if (normalized === '0.0.0.0' || normalized === '::' || normalized === '[::]') {
    return true;
  }

  if (normalized.endsWith('.local') || normalized.endsWith('.internal')) {
    return true;
  }

  return false;
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return true;
  }

  if (parts[0] === 10) return true;
  if (parts[0] === 127) return true;
  if (parts[0] === 0) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;

  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (normalized.startsWith('fe80:')) return true;
  return false;
}

async function getTargetBlockReason(url: URL): Promise<string | null> {
  if (isBlockedHostname(url.hostname)) {
    return 'local/private hostnames are not allowed';
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const ipVersion = isIP(hostname);
  if (ipVersion === 4 && isPrivateIpv4(hostname)) {
    return 'private network targets are not allowed';
  }
  if (ipVersion === 6 && isPrivateIpv6(hostname)) {
    return 'private network targets are not allowed';
  }

  if (ipVersion !== 0) {
    return null;
  }

  try {
    const resolved = await dnsLookup(hostname, { all: true });
    for (const entry of resolved) {
      if ((entry.family === 4 && isPrivateIpv4(entry.address)) || (entry.family === 6 && isPrivateIpv6(entry.address))) {
        return 'hostname resolved to a private network address';
      }
    }
  } catch (error) {
    // DNS lookup can fail on transient infra issues; keep behavior permissive for public domains.
  }

  return null;
}

async function requestLocalAccessApproval(options: {
  world: World;
  url: URL;
  chatId: string;
  reason: string;
  toolCallId?: string;
  agentName?: string | null;
  messages?: AgentMessage[];
}): Promise<{ approved: boolean; reason: 'approved' | 'user_denied' | 'timeout' }> {
  const resolution = await requestToolApproval({
    world: options.world,
    title: 'Allow local/private web_fetch access?',
    message: [
      `web_fetch requested URL: ${options.url.toString()}`,
      `Blocked by default because: ${options.reason}`,
      'Allow this request to proceed?',
    ].join('\n'),
    chatId: options.chatId,
    toolCallId: options.toolCallId,
    defaultOptionId: LOCAL_DENY_OPTION,
    options: [
      { id: LOCAL_APPROVE_OPTION, label: 'Yes', description: 'Allow this local/private fetch request.' },
      { id: LOCAL_DENY_OPTION, label: 'No', description: 'Keep blocking this request.' },
    ],
    approvedOptionIds: [LOCAL_APPROVE_OPTION],
    metadata: {
      tool: 'web_fetch',
      url: options.url.toString(),
      blockedReason: options.reason,
      ...(typeof options.toolCallId === 'string' && options.toolCallId.trim()
        ? { toolCallId: options.toolCallId.trim() }
        : {}),
    },
    agentName: options.agentName || null,
    messages: options.messages,
  });

  return {
    approved: resolution.approved,
    reason: resolution.reason,
  };
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return null;
  const title = decodeHtmlEntities(match[1].replace(/\s+/g, ' ').trim());
  return title || null;
}

function stripNoiseHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '')
    .replace(/<!--([\s\S]*?)-->/g, '');
}

function extractTextBodyFromHtml(html: string): string {
  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  const source = bodyMatch ? bodyMatch[1] : html;
  const withoutTags = source
    .replace(/<\/(p|div|section|article|h[1-6]|li|tr|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  return decodeHtmlEntities(withoutTags);
}

function toSafeJsonSnippet(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  const normalized = JSON.stringify(parsed, null, 2);
  return normalized.length > 12000 ? `${normalized.slice(0, 12000)}\n...` : normalized;
}

function extractSpaBootstrapJson(html: string): Array<{ label: string; content: string }> {
  const snippets: Array<{ label: string; content: string }> = [];

  const nextDataMatch = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  const nextData = nextDataMatch ? toSafeJsonSnippet(nextDataMatch[1]) : null;
  if (nextData) {
    snippets.push({ label: '__NEXT_DATA__', content: nextData });
  }

  const nuxtMatch = html.match(/<script[^>]*>\s*window\.__NUXT__\s*=\s*([\s\S]*?)<\/script>/i);
  const nuxtData = nuxtMatch ? toSafeJsonSnippet(nuxtMatch[1].replace(/;\s*$/, '')) : null;
  if (nuxtData) {
    snippets.push({ label: 'window.__NUXT__', content: nuxtData });
  }

  const initialStateMatch = html.match(/<script[^>]*>\s*window\.__INITIAL_STATE__\s*=\s*([\s\S]*?)<\/script>/i);
  const initialState = initialStateMatch ? toSafeJsonSnippet(initialStateMatch[1].replace(/;\s*$/, '')) : null;
  if (initialState) {
    snippets.push({ label: 'window.__INITIAL_STATE__', content: initialState });
  }

  return snippets;
}

function createTurndown(options: { includeLinks: boolean; includeImages: boolean }): TurndownService {
  const service = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '_',
    strongDelimiter: '**',
    linkStyle: 'inlined',
  });

  service.use(gfm);

  if (!options.includeLinks) {
    service.addRule('stripLinks', {
      filter: 'a',
      replacement: (_content: string, node: { textContent?: string | null }) => (node.textContent || '').trim(),
    });
  }

  if (!options.includeImages) {
    service.addRule('stripImages', {
      filter: 'img',
      replacement: () => '',
    });
  }

  return service;
}

function applySizeLimit(markdown: string, maxChars: number): { markdown: string; truncated: boolean } {
  if (markdown.length <= maxChars) {
    return { markdown, truncated: false };
  }

  return {
    markdown: `${markdown.slice(0, maxChars)}\n\n...\n`,
    truncated: true,
  };
}

function buildUnsupportedResponse(url: URL, response: Response, timingMs: number): WebFetchResult {
  return {
    url: url.toString(),
    resolvedUrl: response.url || url.toString(),
    status: response.status,
    ok: response.ok,
    contentType: response.headers.get('content-type'),
    title: null,
    mode: 'unsupported',
    markdown: '',
    limitationReason: 'unsupported_content_type',
    truncated: false,
    timingMs,
  };
}

function stringifyWebFetchResult(result: WebFetchResult): string {
  return JSON.stringify(result, null, 2);
}

function buildWebFetchSummary(result: WebFetchResult): string {
  const lines = [
    `URL: ${result.resolvedUrl || result.url}`,
    `Status: ${result.status}`,
    result.title ? `Title: ${result.title}` : '',
    result.contentType ? `Content-Type: ${result.contentType}` : '',
    `Mode: ${result.mode}`,
    result.limitationReason ? `Limitation: ${result.limitationReason}` : '',
    result.truncated ? 'Output was truncated.' : '',
  ].filter(Boolean);

  return lines.join('\n');
}

function buildWebFetchPreview(result: WebFetchResult): ToolPreview[] {
  const previews: ToolPreview[] = [];
  const markdown = String(result.markdown || '').trim();
  if (markdown) {
    previews.push(createTextToolPreview(markdown, {
      markdown: true,
      title: result.title || 'web_fetch result',
    }));
  } else {
    previews.push(createTextToolPreview(buildWebFetchSummary(result), {
      title: result.title || 'web_fetch result',
    }));
  }

  previews.push(createUrlToolPreview(result.resolvedUrl || result.url, {
    title: result.title || result.url,
    text: [
      `Status ${result.status}`,
      result.contentType || '',
      result.mode,
      result.limitationReason || '',
    ].filter(Boolean).join(' • '),
  }));

  return previews;
}

function formatWebFetchReturnContent(options: {
  result?: WebFetchResult;
  error?: string;
  persistToolEnvelope: boolean;
  toolCallId?: string;
}): string {
  if (options.result) {
    const resultContent = stringifyWebFetchResult(options.result);
    if (!options.persistToolEnvelope) {
      return resultContent;
    }

    return serializeToolExecutionEnvelope({
      __type: 'tool_execution_envelope',
      version: 1,
      tool: 'web_fetch',
      ...(options.toolCallId ? { tool_call_id: options.toolCallId } : {}),
      status: 'completed',
      preview: buildWebFetchPreview(options.result),
      result: resultContent,
    });
  }

  const errorContent = String(options.error || 'Error: web_fetch failed');
  if (!options.persistToolEnvelope) {
    return errorContent;
  }

  return serializeToolExecutionEnvelope({
    __type: 'tool_execution_envelope',
    version: 1,
    tool: 'web_fetch',
    ...(options.toolCallId ? { tool_call_id: options.toolCallId } : {}),
    status: 'failed',
    preview: createTextToolPreview(errorContent, { title: 'web_fetch error' }),
    result: errorContent,
  });
}

async function executeWebFetch(args: WebFetchArgs, context?: WebFetchToolContext): Promise<string> {
  const startedAt = Date.now();
  const activeTimeoutMs = clamp(Number(args.timeoutMs ?? DEFAULT_TIMEOUT_MS), MIN_TIMEOUT_MS, MAX_TIMEOUT_MS);
  let timedOut = false;
  const persistToolEnvelope = context?.persistToolEnvelope === true;
  const toolCallId = typeof context?.toolCallId === 'string' ? context.toolCallId : undefined;

  // web_fetch is allowed at all permission levels (read/ask/auto), like read_file.

  try {
    const target = parseUrlOrThrow(args.url);
    const blockReason = await getTargetBlockReason(target);
    if (blockReason) {
      const world = context?.world;
      const worldId = String(world?.id || '').trim();

      if (!world || !worldId) {
        throw new Error(`blocked_target: ${blockReason}`);
      }

      const chatId = typeof context?.chatId === 'string' && context.chatId.trim()
        ? context.chatId.trim()
        : null;
      if (!chatId) {
        throw new Error('blocked_target: local/private access approval requires an explicit chatId');
      }

      const approval = await requestLocalAccessApproval({
        world,
        url: target,
        reason: blockReason,
        chatId,
        toolCallId: context?.toolCallId,
        agentName: context?.agentName || null,
        messages: context?.messages,
      });

      if (!approval.approved) {
        if (approval.reason === 'timeout') {
          throw new Error('blocked_target: local/private access approval timed out');
        }
        throw new Error('blocked_target: local/private access denied');
      }
    }

    const timeoutMs = activeTimeoutMs;
    const maxChars = clamp(Number(args.maxChars ?? DEFAULT_MAX_CHARS), 2000, MAX_MAX_CHARS);
    const includeLinks = args.includeLinks !== false;
    const includeImages = args.includeImages === true;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    let response: Response;
    try {
      response = await fetch(target.toString(), {
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'user-agent': 'agent-world-web-fetch/1.0',
          accept: 'text/html,application/json,text/plain;q=0.9,*/*;q=0.8',
        },
      });
    } finally {
      clearTimeout(timer);
    }

    const timingMs = Date.now() - startedAt;
    const contentTypeHeader = response.headers.get('content-type');
    const contentType = contentTypeHeader ? contentTypeHeader.toLowerCase() : '';

    if (!response.ok) {
      throw new Error(`http_error: ${response.status} ${response.statusText || 'request failed'}`);
    }

    if (!(contentType.includes('text/html') || contentType.includes('text/plain') || contentType.includes('application/json') || contentType === '')) {
      return formatWebFetchReturnContent({
        result: buildUnsupportedResponse(target, response, timingMs),
        persistToolEnvelope,
        toolCallId,
      });
    }

    const payload = await response.text();

    if (contentType.includes('application/json')) {
      const jsonSnippet = toSafeJsonSnippet(payload) ?? payload.slice(0, 12000);
      const markdown = ['# JSON Response', '```json', jsonSnippet, '```'].join('\n');
      const limited = applySizeLimit(markdown, maxChars);

      const result: WebFetchResult = {
        url: target.toString(),
        resolvedUrl: response.url || target.toString(),
        status: response.status,
        ok: response.ok,
        contentType: contentTypeHeader,
        title: null,
        mode: 'json',
        markdown: limited.markdown,
        truncated: limited.truncated,
        timingMs,
      };
      return formatWebFetchReturnContent({ result, persistToolEnvelope, toolCallId });
    }

    if (contentType.includes('text/plain')) {
      const markdown = ['```text', payload, '```'].join('\n');
      const limited = applySizeLimit(markdown, maxChars);
      const result: WebFetchResult = {
        url: target.toString(),
        resolvedUrl: response.url || target.toString(),
        status: response.status,
        ok: response.ok,
        contentType: contentTypeHeader,
        title: null,
        mode: 'text',
        markdown: limited.markdown,
        truncated: limited.truncated,
        timingMs,
      };
      return formatWebFetchReturnContent({ result, persistToolEnvelope, toolCallId });
    }

    const title = extractTitle(payload);
    const bootstrapSnippets = extractSpaBootstrapJson(payload);
    const cleanedHtml = stripNoiseHtml(payload);
    const turndown = createTurndown({ includeLinks, includeImages });
    const contentMarkdown = turndown.turndown(cleanedHtml).trim();
    const textBody = extractTextBodyFromHtml(cleanedHtml);

    const sections: string[] = [];
    if (title) {
      sections.push(`# ${title}`);
    }

    if (contentMarkdown) {
      sections.push(contentMarkdown);
    }

    if (bootstrapSnippets.length > 0) {
      sections.push('## SPA Bootstrap Data');
      for (const snippet of bootstrapSnippets) {
        sections.push(`### ${snippet.label}`);
        sections.push('```json');
        sections.push(snippet.content);
        sections.push('```');
      }
    }

    let limitationReason: string | undefined;
    let mode: WebFetchResult['mode'] = 'html';

    if (!contentMarkdown || contentMarkdown.length < 120) {
      if (bootstrapSnippets.length > 0) {
        mode = 'spa-data';
      } else if (textBody.length < 120) {
        limitationReason = 'client_side_rendering_likely_no_bootstrap_data_found';
      }
    }

    if (sections.length === 0) {
      sections.push(textBody || 'No extractable text content found.');
    }

    const combined = sections.join('\n\n').trim();
    const limited = applySizeLimit(combined, maxChars);

    const result: WebFetchResult = {
      url: target.toString(),
      resolvedUrl: response.url || target.toString(),
      status: response.status,
      ok: response.ok,
      contentType: contentTypeHeader,
      title,
      mode,
      markdown: limited.markdown,
      limitationReason,
      truncated: limited.truncated,
      timingMs,
    };

    return formatWebFetchReturnContent({ result, persistToolEnvelope, toolCallId });
  } catch (error) {
    if (timedOut || isAbortError(error)) {
      return formatWebFetchReturnContent({
        error: `Error: web_fetch failed - timeout_error: request exceeded ${activeTimeoutMs}ms`,
        persistToolEnvelope,
        toolCallId,
      });
    }
    const message = toErrorMessage(error);
    return formatWebFetchReturnContent({
      error: `Error: web_fetch failed - ${message}`,
      persistToolEnvelope,
      toolCallId,
    });
  }
}

export function createWebFetchToolDefinition() {
  return {
    description:
      'Fetch a URL and convert response content to markdown. Supports lightweight SPA data extraction from embedded JSON state without running a browser renderer.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Target URL to fetch. Only http/https schemes are allowed.',
        },
        timeoutMs: {
          type: 'number',
          description: `Request timeout in milliseconds (default: ${DEFAULT_TIMEOUT_MS}, max: ${MAX_TIMEOUT_MS}).`,
        },
        maxChars: {
          type: 'number',
          description: `Maximum markdown output characters (default: ${DEFAULT_MAX_CHARS}, max: ${MAX_MAX_CHARS}).`,
        },
        includeLinks: {
          type: 'boolean',
          description: 'When false, link URLs are stripped and only anchor text is kept (default: true).',
        },
        includeImages: {
          type: 'boolean',
          description: 'When true, image markdown is preserved (default: false).',
        },
      },
      required: ['url'],
      additionalProperties: false,
    },
    execute: async (args: WebFetchArgs, _sequenceId?: string, _parentToolCall?: string, context?: WebFetchToolContext) => executeWebFetch(args, context),
  };
}
