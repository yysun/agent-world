/**
 * Formatting Domain Module - HTML and string formatting
 * 
 * Source: Extracted from web/src/domain/world-export.ts (AppRun frontend)
 * Adapted for: React 19.2.0 - Framework-agnostic pure functions
 * 
 * Features:
 * - Styled HTML generation for markdown exports
 * 
 * All functions are pure with no side effects.
 * 
 * Changes from source:
 * - Removed API calls and browser APIs (moved to hooks)
 * - Kept only pure HTML generation
 */

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
