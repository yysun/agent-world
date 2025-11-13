/**
 * Path Helpers Domain Module - URL and path builders
 * 
 * Source: Extracted from web/src/domain/*.ts (AppRun frontend)
 * Adapted for: React 19.2.0 - Framework-agnostic pure functions
 * 
 * Features:
 * - Chat route path building
 * - Export URL creation
 * - World name encoding
 * 
 * All functions are pure with no side effects.
 * 
 * Changes from source:
 * - Combined path helpers from multiple modules
 * - No framework dependencies
 */

/**
 * Build chat route path
 * 
 * @param worldName - World name
 * @param chatId - Optional chat ID
 * @returns Route path
 */
export function buildChatRoutePath(
  worldName: string,
  chatId?: string
): string {
  const encodedWorldName = encodeURIComponent(worldName);
  if (chatId) {
    return `/World/${encodedWorldName}/${encodeURIComponent(chatId)}`;
  }
  return `/World/${encodedWorldName}`;
}

/**
 * Encode world name for URL
 * 
 * @param worldName - World name to encode
 * @returns Encoded world name
 */
export function encodeWorldNameForURL(worldName: string): string {
  return encodeURIComponent(worldName);
}

/**
 * Create export URL
 * 
 * @param worldName - World name
 * @returns Export URL
 */
export function createExportURL(worldName: string): string {
  return `/api/worlds/${encodeWorldNameForURL(worldName)}/export`;
}
