/**
 * World Export Domain Module Tests
 * 
 * Tests for markdown export and view operations.
 */

import * as WorldExportDomain from '../../web/src/domain/world-export';
import type { WorldComponentState } from '../../web/src/types';
import api from '../../web/src/api';

// Mock the API
jest.mock('../../web/src/api', () => ({
  getWorldMarkdown: jest.fn(),
}));

// Mock the markdown renderer
jest.mock('../../web/src/utils/markdown', () => ({
  renderMarkdown: jest.fn(),
}));

const mockApi = api as jest.Mocked<typeof api>;

// Mock window.open for testing
const mockWindowOpen = jest.fn();
(global as any).window = {
  open: mockWindowOpen,
  location: {
    href: '',
  },
};

import { renderMarkdown } from '../../web/src/utils/markdown';
const mockRenderMarkdown = renderMarkdown as jest.MockedFunction<typeof renderMarkdown>;

describe('World Export Domain Module', () => {
  let mockState: WorldComponentState;

  beforeEach(() => {
    mockState = {
      worldName: 'test-world',
      world: null,
      messages: [],
      userInput: '',
      loading: false,
      error: null,
      messagesLoading: false,
      isSending: false,
      isWaiting: false,
      selectedSettingsTarget: 'world',
      selectedAgent: null,
      activeAgent: null,
      showAgentEdit: false,
      agentEditMode: 'create',
      selectedAgentForEdit: null,
      showWorldEdit: false,
      worldEditMode: 'edit',
      selectedWorldForEdit: null,
      chatToDelete: null,
      connectionStatus: 'connected',
      needScroll: false,
      currentChat: null,
      editingMessageId: null,
      editingText: '',
      messageToDelete: null,
      activeAgentFilters: []
    };

    // Reset mocks and window
    jest.clearAllMocks();
    mockWindowOpen.mockClear();

    // Restore window mock
    (global as any).window = {
      open: mockWindowOpen,
      location: {
        href: '',
      },
    };
  });

  describe('exportWorldMarkdown', () => {
    it('should trigger download by setting window.location.href', async () => {
      const result = await WorldExportDomain.exportWorldMarkdown(mockState, 'test-world');

      expect((global as any).window.location.href).toBe('/api/worlds/test-world/export');
      expect(result).toBe(mockState); // State unchanged
    });

    it('should handle URL encoding for world names with special characters', async () => {
      const result = await WorldExportDomain.exportWorldMarkdown(mockState, 'test world with spaces');

      expect((global as any).window.location.href).toBe('/api/worlds/test%20world%20with%20spaces/export');
      expect(result).toBe(mockState);
    });

    it('should handle errors during export', async () => {
      // Simulate error by throwing in getter
      Object.defineProperty((global as any).window, 'location', {
        get() {
          throw new Error('Location access denied');
        },
        configurable: true
      });

      const result = await WorldExportDomain.exportWorldMarkdown(mockState, 'test-world');

      expect(result.error).toBe('Location access denied');
    });
  });

  describe('viewWorldMarkdown', () => {
    const mockMarkdown = '# Test World\n\nThis is a test world.';
    const mockHTML = '<h1>Test World</h1><p>This is a test world.</p>';

    beforeEach(() => {
      mockApi.getWorldMarkdown.mockResolvedValue(mockMarkdown);
      mockRenderMarkdown.mockReturnValue(mockHTML);
    });

    it('should fetch markdown, render HTML, and open in new window', async () => {
      const mockNewWindow = {
        document: {
          write: jest.fn(),
          close: jest.fn(),
        },
      };
      mockWindowOpen.mockReturnValue(mockNewWindow as any);

      const result = await WorldExportDomain.viewWorldMarkdown(mockState, 'test-world');

      expect(mockApi.getWorldMarkdown).toHaveBeenCalledWith('test-world');
      expect(mockRenderMarkdown).toHaveBeenCalledWith(mockMarkdown);
      expect(mockWindowOpen).toHaveBeenCalled();
      expect(mockNewWindow.document.write).toHaveBeenCalledWith(
        expect.stringContaining('<title>World Export: test-world</title>')
      );
      expect(mockNewWindow.document.write).toHaveBeenCalledWith(
        expect.stringContaining(mockHTML)
      );
      expect(mockNewWindow.document.close).toHaveBeenCalled();
      expect(result).toBe(mockState);
    });

    it('should handle API error when fetching markdown', async () => {
      const errorMessage = 'Failed to fetch markdown';
      mockApi.getWorldMarkdown.mockRejectedValue(new Error(errorMessage));

      const result = await WorldExportDomain.viewWorldMarkdown(mockState, 'test-world');

      expect(result.error).toBe(errorMessage);
      expect(mockWindowOpen).not.toHaveBeenCalled();
    });

    it('should handle window.open returning null', async () => {
      mockWindowOpen.mockReturnValue(null);

      const result = await WorldExportDomain.viewWorldMarkdown(mockState, 'test-world');

      expect(mockApi.getWorldMarkdown).toHaveBeenCalledWith('test-world');
      expect(mockWindowOpen).toHaveBeenCalled();
      expect(result).toBe(mockState); // No error, just fails silently
    });

    it('should handle generic API error without message', async () => {
      mockApi.getWorldMarkdown.mockRejectedValue(new Error());

      const result = await WorldExportDomain.viewWorldMarkdown(mockState, 'test-world');

      expect(result.error).toBe('Failed to view world markdown');
    });
  });

  describe('Helper Functions', () => {
    describe('generateStyledHTML', () => {
      it('should generate complete HTML document with styles', () => {
        const htmlContent = '<h1>Test</h1>';
        const worldName = 'test-world';

        const result = WorldExportDomain.generateStyledHTML(htmlContent, worldName);

        expect(result).toContain('<!DOCTYPE html>');
        expect(result).toContain('<title>World Export: test-world</title>');
        expect(result).toContain(htmlContent);
        expect(result).toContain('font-family: -apple-system');
        expect(result).toContain('max-width: 800px');
      });

      it('should handle special characters in world name', () => {
        const htmlContent = '<p>Content</p>';
        const worldName = 'Test & "World" <with> special chars';

        const result = WorldExportDomain.generateStyledHTML(htmlContent, worldName);

        expect(result).toContain('<title>World Export: Test & "World" <with> special chars</title>');
      });
    });

    describe('isValidWorldName', () => {
      it('should return true for valid world names', () => {
        expect(WorldExportDomain.isValidWorldName('test-world')).toBe(true);
        expect(WorldExportDomain.isValidWorldName('World 123')).toBe(true);
        expect(WorldExportDomain.isValidWorldName('   trimmed   ')).toBe(true);
      });

      it('should return false for invalid world names', () => {
        expect(WorldExportDomain.isValidWorldName('')).toBe(false);
        expect(WorldExportDomain.isValidWorldName('   ')).toBe(false);
        expect(WorldExportDomain.isValidWorldName(null as any)).toBe(false);
        expect(WorldExportDomain.isValidWorldName(undefined as any)).toBe(false);
      });
    });

    describe('encodeWorldNameForURL', () => {
      it('should encode special characters for URL', () => {
        expect(WorldExportDomain.encodeWorldNameForURL('test world')).toBe('test%20world');
        expect(WorldExportDomain.encodeWorldNameForURL('test&world')).toBe('test%26world');
        expect(WorldExportDomain.encodeWorldNameForURL('test+world')).toBe('test%2Bworld');
      });

      it('should handle normal names without encoding', () => {
        expect(WorldExportDomain.encodeWorldNameForURL('test-world')).toBe('test-world');
        expect(WorldExportDomain.encodeWorldNameForURL('TestWorld123')).toBe('TestWorld123');
      });
    });

    describe('createExportURL', () => {
      it('should create properly formatted export URL', () => {
        const result = WorldExportDomain.createExportURL('test-world');
        expect(result).toBe('/api/worlds/test-world/export');
      });

      it('should handle world names with special characters', () => {
        const result = WorldExportDomain.createExportURL('test world');
        expect(result).toBe('/api/worlds/test%20world/export');
      });
    });

    describe('openWindowWithContent', () => {
      it('should open window and write content successfully', () => {
        const mockNewWindow = {
          document: {
            write: jest.fn(),
            close: jest.fn(),
          },
        };
        mockWindowOpen.mockReturnValue(mockNewWindow as any);
        const content = '<html><body>Test</body></html>';

        const result = WorldExportDomain.openWindowWithContent(content);

        expect(result).toBe(true);
        expect(mockWindowOpen).toHaveBeenCalled();
        expect(mockNewWindow.document.write).toHaveBeenCalledWith(content);
        expect(mockNewWindow.document.close).toHaveBeenCalled();
      });

      it('should return false when window.open returns null', () => {
        mockWindowOpen.mockReturnValue(null);
        const content = '<html><body>Test</body></html>';

        const result = WorldExportDomain.openWindowWithContent(content);

        expect(result).toBe(false);
        expect(mockWindowOpen).toHaveBeenCalled();
      });

      it('should handle errors during window operations', () => {
        const mockNewWindow = {
          document: {
            write: jest.fn(() => {
              throw new Error('Write failed');
            }),
            close: jest.fn(),
          },
        };
        mockWindowOpen.mockReturnValue(mockNewWindow as any);
        const content = '<html><body>Test</body></html>';

        const result = WorldExportDomain.openWindowWithContent(content);

        expect(result).toBe(false);
      });
    });
  });
});