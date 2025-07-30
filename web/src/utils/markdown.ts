/**
 * Markdown Rendering Utility
 * 
 * Provides safe markdown-to-HTML conversion with table support using marked and DOMPurify.
 * 
 * Features:
 * - Full markdown support including tables, links, code blocks, etc.
 * - HTML sanitization to prevent XSS attacks
 * - Configurable marked options for consistent rendering
 * - Support for GitHub Flavored Markdown tables
 * 
 * Usage:
 * ```typescript
 * import { renderMarkdown } from './utils/markdown';
 * 
 * const htmlContent = renderMarkdown('# Hello\n\n| Col1 | Col2 |\n|------|------|\n| A | B |');
 * ```
 */

import { marked } from 'marked';
import DOMPurify from 'dompurify';
// @ts-ignore
const dompurify = (typeof window !== 'undefined' && DOMPurify && (DOMPurify as any).default) ? (DOMPurify as any).default : DOMPurify;

// Configure marked for better table and markdown support
marked.setOptions({
  gfm: true, // GitHub Flavored Markdown
  breaks: true, // Convert line breaks to <br>
  // headerIds: false, // Disable header IDs for security (option not supported in this version)
  // mangle: false, // Don't mangle autolinks (option not supported in this version)
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

/**
 * Renders markdown text to safe HTML
 * @param markdownText - The markdown text to render
 * @returns Safe HTML string ready for insertion into DOM
 */
export function renderMarkdown(markdownText: string): string {
  if (!markdownText || typeof markdownText !== 'string') {
    return '';
  }

  try {
    // Convert markdown to HTML
    const rawHtml = marked(markdownText) as string;

    // Sanitize the HTML to prevent XSS
    // DOMPurify options: use correct option names and types
    const sanitizedHtml = dompurify.sanitize(rawHtml, {
      ALLOWED_TAGS,
      ALLOWED_ATTR: ALLOWED_ATTRIBUTES,
      ALLOW_DATA_ATTR: false,
      ALLOW_UNKNOWN_PROTOCOLS: false,
      FORBID_TAGS: ['script', 'object', 'embed', 'form', 'input', 'button'],
      FORBID_ATTR: ['onload', 'onerror', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
    } as any);
    return sanitizedHtml;
  } catch (error) {
    console.error('Error rendering markdown:', error);
    // Return escaped plain text as fallback
    return markdownText.replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }
}

/**
 * Checks if a string contains markdown syntax
 * @param text - Text to check for markdown
 * @returns true if text appears to contain markdown
 */
export function hasMarkdown(text: string): boolean {
  if (!text || typeof text !== 'string') {
    return false;
  }

  // Simple heuristics to detect common markdown patterns
  const markdownPatterns = [
    /\*\*.*\*\*/, // Bold
    /\*.*\*/, // Italic
    /^#+\s/, // Headers
    /^\|.*\|/, // Tables
    /```/, // Code blocks
    /`.*`/, // Inline code
    /^\s*[-*+]\s/, // Lists
    /^\s*\d+\.\s/, // Numbered lists
    /\[.*\]\(.*\)/, // Links
    /^>\s/, // Blockquotes
  ];

  return markdownPatterns.some(pattern => pattern.test(text));
}