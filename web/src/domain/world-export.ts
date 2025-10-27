/**
 * World Export Domain Module - Markdown Export and View Operations
 * 
 * Features:
 * - World markdown export (download)
 * - World markdown view (new window with styled HTML)
 * - HTML rendering with custom styles
 * - Error handling for export operations
 * 
 * Pure functions for testability and reusability.
 * 
 * Created: 2025-10-27 - Domain Module Extraction from World.update.ts
 */

import type { WorldComponentState } from '../types';
import api from '../api';
import { renderMarkdown } from '../utils/markdown';

// Browser window interface for Node.js compatibility
declare const window: {
  location: { href: string };
  open(): any;
} | undefined;

/**
 * Generic Data Interface for Framework Agnosticism
 * Can be adapted to any frontend framework
 */
export interface WorldExportData {
  worldName: string;
}

/**
 * World Export State Interface (AppRun-specific)
 * Encapsulates export-related state
 */
export interface WorldExportState {
  worldName: string;
  error: string | null;
}

/**
 * Framework-agnostic business logic for world export
 * Returns the result of the operation
 */
export async function exportWorldMarkdownLogic(
  worldName: string
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    if (typeof window !== 'undefined') {
      window.location.href = `/api/worlds/${encodeURIComponent(worldName)}/export`;
    }
    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to export world'
    };
  }
}

/**
 * Export world as markdown file (download) - AppRun-specific wrapper
 * 
 * @param state - Current component state
 * @param worldName - Name of the world to export
 * @returns Promise<WorldComponentState> - Updated state
 */
export async function exportWorldMarkdown(
  state: WorldComponentState,
  worldName: string
): Promise<WorldComponentState> {
  const result = await exportWorldMarkdownLogic(worldName);

  if (result.success) {
    return state;
  } else {
    return { ...state, error: result.error };
  }
}

/**
 * Framework-agnostic business logic for viewing world markdown
 * Returns the result of the operation
 */
export async function viewWorldMarkdownLogic(
  worldName: string
): Promise<{
  success: boolean;
  error?: string;
  htmlContent?: string;
}> {
  try {
    const markdown = await api.getWorldMarkdown(worldName);
    const htmlContent = renderMarkdown(markdown);
    const fullHtml = generateStyledHTML(htmlContent, worldName);

    if (typeof window !== 'undefined') {
      const newWindow = window.open();
      if (newWindow) {
        newWindow.document.write(fullHtml);
        newWindow.document.close();
      }
    }
    return { success: true, htmlContent: fullHtml };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to view world markdown'
    };
  }
}

/**
 * View world markdown in new window with styled HTML - AppRun-specific wrapper
 * 
 * @param state - Current component state
 * @param worldName - Name of the world to view
 * @returns Promise<WorldComponentState> - Updated state
 */
export async function viewWorldMarkdown(
  state: WorldComponentState,
  worldName: string
): Promise<WorldComponentState> {
  const result = await viewWorldMarkdownLogic(worldName);

  if (result.success) {
    return state;
  } else {
    return { ...state, error: result.error };
  }
}

/**
 * Generate styled HTML for markdown content
 * 
 * @param htmlContent - Rendered HTML from markdown
 * @param worldName - Name of the world (for title)
 * @returns Complete HTML document with styles
 */
export function generateStyledHTML(htmlContent: string, worldName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>World Export: ${worldName}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            line-height: 1.6;
            color: #333;
        }
        h1, h2, h3 { color: #2c3e50; }
        h1 { border-bottom: 2px solid #3498db; padding-bottom: 10px; }
        h2 { border-bottom: 1px solid #bdc3c7; padding-bottom: 5px; }
        code {
            background: #f8f9fa;
            padding: 2px 4px;
            border-radius: 3px;
            font-family: 'Monaco', 'Consolas', monospace;
        }
        pre { background: #f8f9fa; padding: 15px; border-radius: 5px; overflow-x: auto; }
        pre code { background: none; padding: 0; }
        ul { padding-left: 20px; }
        li { margin-bottom: 5px; }
        hr { border: none; height: 1px; background: #bdc3c7; margin: 30px 0; }
        strong { color: #2c3e50; }
    </style>
</head>
<body>${htmlContent}</body>
</html>`;
}

/**
 * Helper function to validate world name for export
 * 
 * @param worldName - World name to validate
 * @returns boolean - True if valid
 */
export function isValidWorldName(worldName: string): boolean {
  return Boolean(worldName && worldName.trim().length > 0);
}

/**
 * Helper function to encode world name for URL
 * 
 * @param worldName - World name to encode
 * @returns Encoded world name
 */
export function encodeWorldNameForURL(worldName: string): string {
  return encodeURIComponent(worldName);
}

/**
 * Helper function to create export URL
 * 
 * @param worldName - World name
 * @returns Export URL
 */
export function createExportURL(worldName: string): string {
  return `/api/worlds/${encodeWorldNameForURL(worldName)}/export`;
}

/**
 * Helper function to handle window opening with fallback
 * 
 * @param content - HTML content to display
 * @returns boolean - True if window opened successfully
 */
export function openWindowWithContent(content: string): boolean {
  try {
    if (typeof window === 'undefined') return false;

    const newWindow = window.open();
    if (newWindow) {
      newWindow.document.write(content);
      newWindow.document.close();
      return true;
    }
    return false;
  } catch (error) {
    console.error('Failed to open window:', error);
    return false;
  }
}