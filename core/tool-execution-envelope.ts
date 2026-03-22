/**
 * Tool Execution Envelope
 *
 * Purpose:
 * - Define the persisted preview/result split for completed tool executions.
 *
 * Key Features:
 * - Shared core envelope and preview types for adopted tools.
 * - Parsing and serialization helpers for persisted tool-result records.
 * - Utility helpers for artifact metadata and LLM-safe result extraction.
 *
 * Notes on Implementation:
 * - `preview` is durable UI/history data.
 * - `result` is the canonical payload reintroduced into LLM continuation.
 * - The helpers here stay transport-agnostic and do not depend on SSE state.
 *
 * Recent Changes:
 * - 2026-03-22: Prevented top-level valid JSON stdout from being misclassified as directly renderable markdown when nested string fields contain markdown syntax.
 * - 2026-03-21: Added richer artifact media-type detection for markdown, HTML bundles, PDF, and presentation outputs.
 * - 2026-03-06: Initial envelope contract for `shell_cmd` and `load_skill`.
 */

import { basename, extname } from 'path';

export type ToolPreviewKind = 'text' | 'markdown' | 'artifact' | 'media' | 'graphic' | 'url';
export type ToolPreviewRenderer = 'text' | 'markdown' | 'image' | 'svg' | 'audio' | 'video' | 'youtube' | 'file';
export type DirectDisplayContentKind = 'markdown' | 'html' | 'svg';

const HTML_DISPLAY_ROOT_TAGS = new Set([
  'html', 'body', 'main', 'article', 'section', 'div', 'span', 'p',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'thead', 'tbody',
  'tr', 'th', 'td', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
  'img', 'a', 'figure', 'figcaption', 'hr', 'br', 'strong', 'em',
  'u', 'del', 's'
]);

const HTML_VOID_DISPLAY_TAGS = new Set(['img', 'hr', 'br']);

export interface ToolArtifactReference {
  path?: string;
  url?: string;
  media_type?: string;
  bytes?: number;
  display_name?: string;
}

interface ToolPreviewBase {
  kind: ToolPreviewKind;
  renderer?: ToolPreviewRenderer;
  media_type?: string;
  title?: string;
}

export interface ToolTextPreview extends ToolPreviewBase {
  kind: 'text' | 'markdown';
  text: string;
}

export interface ToolUrlPreview extends ToolPreviewBase {
  kind: 'url';
  url: string;
  text?: string;
}

export interface ToolArtifactPreview extends ToolPreviewBase {
  kind: 'artifact' | 'media' | 'graphic';
  artifact: ToolArtifactReference;
  url?: string;
  text?: string;
}

export type ToolPreview = ToolTextPreview | ToolUrlPreview | ToolArtifactPreview;

export interface ToolExecutionEnvelope<T = unknown> {
  __type: 'tool_execution_envelope';
  version: 1;
  tool: string;
  tool_call_id?: string;
  status?: string;
  preview: ToolPreview | ToolPreview[] | null;
  display_content?: string;
  result: T;
}

export function isToolExecutionEnvelope(value: unknown): value is ToolExecutionEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return record.__type === 'tool_execution_envelope'
    && record.version === 1
    && typeof record.tool === 'string'
    && Object.prototype.hasOwnProperty.call(record, 'preview')
    && Object.prototype.hasOwnProperty.call(record, 'result');
}

export function parseToolExecutionEnvelope(value: unknown): ToolExecutionEnvelope | null {
  return isToolExecutionEnvelope(value) ? value : null;
}

export function parseToolExecutionEnvelopeContent(content: string): ToolExecutionEnvelope | null {
  const normalized = String(content || '').trim();
  if (!normalized) {
    return null;
  }

  try {
    return parseToolExecutionEnvelope(JSON.parse(normalized));
  } catch {
    return null;
  }
}

export function serializeToolExecutionEnvelope(envelope: ToolExecutionEnvelope): string {
  return JSON.stringify(envelope);
}

export function normalizeToolPreviewItems(preview: ToolExecutionEnvelope['preview']): ToolPreview[] {
  if (!preview) {
    return [];
  }

  return Array.isArray(preview) ? preview : [preview];
}

export function stringifyToolExecutionResult(result: unknown): string {
  if (typeof result === 'string') {
    return result;
  }

  if (result == null) {
    return '';
  }

  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

function looksLikeSvgDisplayContent(text: string): boolean {
  const trimmed = String(text || '').trim();
  if (!trimmed || !/<svg\b/i.test(trimmed) || !/<\/svg>\s*$/i.test(trimmed)) {
    return false;
  }

  return /^(?:<\?xml[\s\S]*?\?>\s*)?(?:<!doctype[\s\S]*?>\s*)?<svg\b/i.test(trimmed);
}

function looksLikeHtmlDisplayContent(text: string): boolean {
  const trimmed = String(text || '').trim();
  if (!trimmed || looksLikeSvgDisplayContent(trimmed)) {
    return false;
  }

  if (/^<!doctype html\b/i.test(trimmed) || /^<html\b/i.test(trimmed)) {
    return true;
  }

  const openTagMatch = trimmed.match(/^<([a-z][\w-]*)\b[^>]*>/i);
  if (!openTagMatch?.[1]) {
    return false;
  }

  const rootTag = openTagMatch[1].toLowerCase();
  if (!HTML_DISPLAY_ROOT_TAGS.has(rootTag)) {
    return false;
  }

  if (HTML_VOID_DISPLAY_TAGS.has(rootTag)) {
    return true;
  }

  const closeTagPattern = new RegExp(`</${rootTag}\\s*>\\s*$`, 'i');
  return closeTagPattern.test(trimmed);
}

function looksLikeMarkdownDisplayContent(text: string): boolean {
  const trimmed = String(text || '').trim();
  if (!trimmed || looksLikeSvgDisplayContent(trimmed) || looksLikeHtmlDisplayContent(trimmed)) {
    return false;
  }

  const markdownPatterns = [
    /!\[[^\]]*\]\([^)]+\)/,
    /\[[^\]]+\]\([^)]+\)/,
    /^#{1,6}\s+\S/m,
    /```[\s\S]*```/,
    /^\s*[-*+]\s+\S/m,
    /^\s*\d+\.\s+\S/m,
    /^>\s+\S/m,
    /^\|.+\|\s*$/m,
    /(?:^|\n)\s*---+\s*(?:\n|$)/,
    /data:image\/[a-z0-9.+-]+;base64,/i,
  ];

  return markdownPatterns.some((pattern) => pattern.test(trimmed));
}

function isTopLevelJsonContent(text: string): boolean {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return false;
  }

  const firstChar = trimmed[0];
  if (firstChar !== '{' && firstChar !== '[' && firstChar !== '"') {
    return false;
  }

  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

export function classifyDirectDisplayContent(text: string): DirectDisplayContentKind | null {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return null;
  }

  if (isTopLevelJsonContent(trimmed)) {
    return null;
  }

  if (looksLikeSvgDisplayContent(trimmed)) {
    return 'svg';
  }

  if (looksLikeHtmlDisplayContent(trimmed)) {
    return 'html';
  }

  if (looksLikeMarkdownDisplayContent(trimmed)) {
    return 'markdown';
  }

  return null;
}

export function isAssistantRenderableDisplayContent(text: string): boolean {
  const kind = classifyDirectDisplayContent(text);
  return kind === 'markdown' || kind === 'html';
}

export function buildToolArtifactPreviewUrl(options: { path: string; worldId?: string | null }): string {
  const params = new URLSearchParams();
  params.set('path', options.path);
  if (options.worldId) {
    params.set('worldId', options.worldId);
  }
  return `/api/tool-artifact?${params.toString()}`;
}

export function getToolEventPreviewPayload(content: string): ToolExecutionEnvelope['preview'] | undefined {
  const envelope = parseToolExecutionEnvelopeContent(content);
  if (!envelope) {
    return undefined;
  }

  if (envelope.preview == null) {
    return undefined;
  }

  return envelope.preview;
}

export function guessToolPreviewRenderer(mediaType: string | undefined): ToolPreviewRenderer | undefined {
  const normalized = String(mediaType || '').trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (normalized === 'image/svg+xml') return 'svg';
  if (normalized.startsWith('image/')) return 'image';
  if (normalized.startsWith('audio/')) return 'audio';
  if (normalized.startsWith('video/')) return 'video';
  if (normalized === 'text/markdown') return 'markdown';
  if (normalized === 'text/html' || normalized === 'application/pdf') return 'file';
  if (normalized.startsWith('text/')) return 'text';
  return 'file';
}

export function guessMediaTypeFromPath(filePath: string): string | undefined {
  const extension = extname(String(filePath || '')).toLowerCase();
  const mediaTypeByExtension: Record<string, string> = {
    '.md': 'text/markdown',
    '.txt': 'text/plain',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.cjs': 'text/javascript',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.pdf': 'application/pdf',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  };

  return mediaTypeByExtension[extension];
}

export function createTextToolPreview(
  text: string,
  options: { markdown?: boolean; title?: string } = {},
): ToolTextPreview {
  return {
    kind: options.markdown ? 'markdown' : 'text',
    renderer: options.markdown ? 'markdown' : 'text',
    ...(options.title ? { title: options.title } : {}),
    text: String(text || ''),
  };
}

export function createArtifactToolPreview(options: ToolArtifactReference & { title?: string; url?: string; text?: string }): ToolArtifactPreview {
  const mediaType = options.media_type || guessMediaTypeFromPath(options.path || options.display_name || '');
  const renderer = guessToolPreviewRenderer(mediaType);
  const kind: ToolArtifactPreview['kind'] = mediaType === 'image/svg+xml'
    ? 'graphic'
    : mediaType && (mediaType.startsWith('image/') || mediaType.startsWith('audio/') || mediaType.startsWith('video/'))
      ? 'media'
      : 'artifact';

  return {
    kind,
    ...(renderer ? { renderer } : {}),
    ...(mediaType ? { media_type: mediaType } : {}),
    ...(options.title ? { title: options.title } : {}),
    ...(options.url ? { url: options.url } : {}),
    ...(options.text ? { text: options.text } : {}),
    artifact: {
      ...(options.path ? { path: options.path } : {}),
      ...(options.url ? { url: options.url } : {}),
      ...(mediaType ? { media_type: mediaType } : {}),
      ...(typeof options.bytes === 'number' ? { bytes: options.bytes } : {}),
      display_name: options.display_name || basename(String(options.path || options.url || 'artifact')),
    },
  };
}

export function createUrlToolPreview(
  url: string,
  options: { title?: string; text?: string; media_type?: string; renderer?: ToolPreviewRenderer } = {},
): ToolUrlPreview {
  return {
    kind: 'url',
    ...(options.renderer ? { renderer: options.renderer } : {}),
    ...(options.media_type ? { media_type: options.media_type } : {}),
    ...(options.title ? { title: options.title } : {}),
    ...(options.text ? { text: options.text } : {}),
    url,
  };
}
