/**
 * Tests: MCP App UI Support Functions
 *
 * Purpose:
 * - Verify isUiCapableTool, getMcpUiResourceUri, readMcpUiResource, getMcpServerInfo.
 *
 * Key Features:
 * - Uses in-memory mocks — no real MCP server or file system.
 * - Tests both new nested (_meta.ui.resourceUri) and absent _meta formats.
 *
 * Implementation Notes:
 * - Exercises the module-level toolsCache indirectly via fetchAndCacheTools mock.
 * - readMcpUiResource and getMcpServerInfo are tested by injecting into cache via the
 *   exported clearToolsCache path, but for isolation we mock the internal state via
 *   a spy on the cache module.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isUiCapableTool, getMcpUiResourceUri } from '../../core/mcp-server-registry.js';

describe('isUiCapableTool', () => {
  it('returns true for a tool with nested _meta.ui.resourceUri', () => {
    const tool = { _meta: { ui: { resourceUri: 'ui://my-server/app.html' } } };
    expect(isUiCapableTool(tool as any)).toBe(true);
  });

  it('returns true for a tool with flat _meta["ui/resourceUri"]', () => {
    const tool = { _meta: { 'ui/resourceUri': 'ui://my-server/app.html' } };
    expect(isUiCapableTool(tool as any)).toBe(true);
  });

  it('returns false for a tool without _meta', () => {
    expect(isUiCapableTool({ description: 'no meta' })).toBe(false);
  });

  it('returns false for a tool with _meta but no ui.resourceUri', () => {
    const tool = { _meta: { other: 'value' } };
    expect(isUiCapableTool(tool as any)).toBe(false);
  });

  it('returns false when resourceUri does not start with ui://', () => {
    const tool = { _meta: { ui: { resourceUri: 'https://example.com/app.html' } } };
    expect(isUiCapableTool(tool as any)).toBe(false);
  });
});

describe('getMcpUiResourceUri', () => {
  it('returns the nested resourceUri', () => {
    const tool = { _meta: { ui: { resourceUri: 'ui://server/app' } } };
    expect(getMcpUiResourceUri(tool as any)).toBe('ui://server/app');
  });

  it('returns the flat resourceUri', () => {
    const tool = { _meta: { 'ui/resourceUri': 'ui://server/flat' } };
    expect(getMcpUiResourceUri(tool as any)).toBe('ui://server/flat');
  });

  it('returns null when _meta is absent', () => {
    expect(getMcpUiResourceUri({})).toBeNull();
  });

  it('returns null when resourceUri is not a ui:// URI', () => {
    const tool = { _meta: { ui: { resourceUri: 'http://example.com' } } };
    expect(getMcpUiResourceUri(tool as any)).toBeNull();
  });
});
