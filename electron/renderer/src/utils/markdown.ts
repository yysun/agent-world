/**
 * Markdown Rendering Utility for Electron Renderer
 * 
 * Purpose:
 * - Provides safe markdown-to-HTML conversion for message display
 * - Maintains feature parity with web app markdown rendering
 * 
 * Features:
 * - Full markdown support including tables, links, code blocks, etc.
 * - HTML sanitization to prevent XSS attacks using DOMPurify
 * - GitHub Flavored Markdown support
 * - Configurable allowed tags and attributes
 * 
 * Implementation Notes:
 * - Adapted from web app's markdown utility
 * - Uses marked library for parsing
 * - Uses DOMPurify for sanitization
 * - Handles browser/window environment checks
 * 
 * Recent Changes:
 * - 2026-02-28: Added DOMPurify import-shape normalization for consistent sanitize calls across runtime/test module formats.
 * - 2026-02-28: Added multiline-link normalization so wrapped markdown links render correctly in Electron chat cards.
 * - 2026-02-26: Replaced markdown-render fallback error console logging with categorized renderer logger output.
 * - 2026-02-10: Converted to TypeScript with proper type definitions
 * - 2026-02-10: Initial implementation for Electron app markdown rendering
 */

import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { rendererLogger } from './logger';

const dompurify = (typeof window !== 'undefined' && DOMPurify && (DOMPurify as any).default)
  ? (DOMPurify as any).default
  : DOMPurify;

// Configure marked for GitHub Flavored Markdown
marked.setOptions({
  gfm: true, // GitHub Flavored Markdown
  breaks: true, // Convert line breaks to <br>
});

// Configure DOMPurify to allow safe HTML elements
const ALLOWED_TAGS: string[] = [
  'p', 'br', 'strong', 'em', 'u', 'strike', 'del', 's',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'blockquote',
  'code', 'pre',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'a', 'img',
  'hr',
  'div', 'span'
];

const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  'a': ['href', 'title'],
  'img': ['src', 'alt', 'title', 'width', 'height'],
  'table': ['class'],
  'th': ['align', 'class'],
  'td': ['align', 'class'],
  'code': ['class'],
  'pre': ['class'],
  'div': ['class'],
  'span': ['class']
};

function sanitizeMarkdownHtml(rawHtml: string): string {
  const sanitizeOptions = {
    ALLOWED_TAGS: ALLOWED_TAGS,
    ALLOWED_ATTR: ALLOWED_ATTRIBUTES as any, // DOMPurify types expect string[] but accept Record<string, string[]>
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    FORBID_TAGS: ['script', 'object', 'embed', 'form', 'input', 'button'],
    FORBID_ATTR: ['onload', 'onerror', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
  };

  if (dompurify && typeof (dompurify as any).sanitize === 'function') {
    return (dompurify as any).sanitize(rawHtml, sanitizeOptions);
  }

  if (typeof dompurify === 'function' && typeof window !== 'undefined') {
    const createdPurifier = (dompurify as any)(window);
    if (createdPurifier && typeof createdPurifier.sanitize === 'function') {
      return createdPurifier.sanitize(rawHtml, sanitizeOptions);
    }
  }

  return rawHtml;
}

function normalizeMultilineMarkdownLinks(markdownText: string): string {
  return markdownText.replace(/\[([\s\S]*?)\]\(([^)]*?)\)/g, (_full, rawLabel: string, rawHref: string) => {
    const normalizedLabel = rawLabel
      .replace(/\s*\n\s*/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    const normalizedHref = rawHref
      .replace(/\s*\n\s*/g, '')
      .trim();

    return `[${normalizedLabel}](${normalizedHref})`;
  });
}

/**
 * Renders markdown text to safe HTML
 * @param markdownText - The markdown text to render
 * @returns Safe HTML string ready for insertion into DOM
 */
export function renderMarkdown(markdownText: string | null | undefined): string {
  if (!markdownText || typeof markdownText !== 'string') {
    return '';
  }

  try {
    const normalizedMarkdown = normalizeMultilineMarkdownLinks(markdownText);

    // Convert markdown to HTML
    const rawHtml = marked(normalizedMarkdown) as string;

    // Sanitize the HTML to prevent XSS
    const sanitizedHtml = sanitizeMarkdownHtml(rawHtml);

    return sanitizedHtml;
  } catch (error) {
    rendererLogger.error('electron.renderer.markdown', 'Error rendering markdown', {
      error: error instanceof Error ? error.message : String(error)
    });
    // Return escaped plain text as fallback
    return markdownText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }
}

/**
 * Check if text appears to contain markdown syntax
 * @param text - Text to check
 * @returns true when common markdown patterns are detected
 */
export function hasMarkdown(text: string | null | undefined): boolean {
  if (!text || typeof text !== 'string') {
    return false;
  }

  const markdownPatterns = [
    /^#{1,6}\s+/m,
    /\*\*[^*]+\*\*/,
    /\*[^*]+\*/,
    /`[^`]+`/,
    /```[\s\S]*?```/,
    /^\s*[-*+]\s+/m,
    /^\s*\d+\.\s+/m,
    /^>\s+/m,
    /\[[^\]]+\]\([^)]+\)/,
    /^\|.+\|$/m,
    /^---+$/m,
  ];

  return markdownPatterns.some(pattern => pattern.test(text));
}
