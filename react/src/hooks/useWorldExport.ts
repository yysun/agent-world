/**
 * World Export Hooks - Export and view operations
 * 
 * Source: Replaces web/src/domain/world-export.ts API functions
 * Created for: React 19.2.0
 * 
 * Features:
 * - useExportWorld - Download world as markdown
 * - useViewMarkdown - View world markdown in new window
 * 
 * Changes from source:
 * - Converted API and browser operations to React hooks
 * - Added loading states
 * - Uses useCallback for stable references
 */

import { useState, useCallback } from 'react';
import * as api from '../lib/api';
import { generateStyledHTML } from '../lib/domain/formatting';
import { createExportURL } from '../lib/domain/path-helpers';

/**
 * Hook for exporting world as markdown file (download)
 * 
 * @param worldName - Name of the world
 * @returns Export function and state
 */
export function useExportWorld(worldName: string) {
  const [isExporting, setIsExporting] = useState(false);

  const exportWorld = useCallback(async () => {
    setIsExporting(true);
    try {
      window.location.href = createExportURL(worldName);
      return { success: true };
    } finally {
      // Reset after a brief delay to account for download initiation
      setTimeout(() => setIsExporting(false), 1000);
    }
  }, [worldName]);

  return { exportWorld, isExporting };
}

/**
 * Hook for viewing world markdown in new window
 * 
 * @param worldName - Name of the world
 * @returns View function and state
 */
export function useViewMarkdown(worldName: string) {
  const [isViewing, setIsViewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const viewMarkdown = useCallback(async () => {
    setIsViewing(true);
    setError(null);
    try {
      const markdown = await api.getWorldMarkdown(worldName);

      // Assuming markdown rendering is handled by a library
      // For now, wrap in basic HTML
      const htmlContent = `<pre>${markdown}</pre>`;
      const fullHtml = generateStyledHTML(htmlContent, worldName);

      const newWindow = window.open();
      if (newWindow) {
        newWindow.document.write(fullHtml);
        newWindow.document.close();
        return { success: true };
      } else {
        throw new Error('Failed to open new window');
      }
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to view markdown';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsViewing(false);
    }
  }, [worldName]);

  return { viewMarkdown, isViewing, error };
}
