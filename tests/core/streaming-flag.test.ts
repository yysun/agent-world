/**
 * Streaming Flag Unit Tests
 *
 * Tests for the global streaming flag functionality to ensure
 * proper flag state management and mode switching support.
 */

import { 
  isStreamingEnabled, 
  setStreamingEnabled, 
  enableStreaming, 
  disableStreaming, 
  getStreamingStatus 
} from '../../core/streaming-flag.js';

describe('Streaming Flag', () => {
  beforeEach(() => {
    // Reset to default state before each test
    setStreamingEnabled(true);
  });

  describe('Basic Flag Operations', () => {
    test('should default to streaming enabled', () => {
      expect(isStreamingEnabled()).toBe(true);
      expect(getStreamingStatus()).toBe('ON');
    });

    test('should set streaming flag to false', () => {
      setStreamingEnabled(false);
      expect(isStreamingEnabled()).toBe(false);
      expect(getStreamingStatus()).toBe('OFF');
    });

    test('should set streaming flag to true', () => {
      setStreamingEnabled(false); // First disable
      setStreamingEnabled(true);  // Then enable
      expect(isStreamingEnabled()).toBe(true);
      expect(getStreamingStatus()).toBe('ON');
    });
  });

  describe('Convenience Functions', () => {
    test('should enable streaming via convenience function', () => {
      setStreamingEnabled(false); // First disable
      enableStreaming();
      expect(isStreamingEnabled()).toBe(true);
      expect(getStreamingStatus()).toBe('ON');
    });

    test('should disable streaming via convenience function', () => {
      disableStreaming();
      expect(isStreamingEnabled()).toBe(false);
      expect(getStreamingStatus()).toBe('OFF');
    });
  });

  describe('Status Reporting', () => {
    test('should return correct status string when enabled', () => {
      setStreamingEnabled(true);
      expect(getStreamingStatus()).toBe('ON');
    });

    test('should return correct status string when disabled', () => {
      setStreamingEnabled(false);
      expect(getStreamingStatus()).toBe('OFF');
    });
  });

  describe('State Persistence', () => {
    test('should maintain state across multiple calls', () => {
      setStreamingEnabled(false);
      
      // Multiple checks should return consistent state
      expect(isStreamingEnabled()).toBe(false);
      expect(isStreamingEnabled()).toBe(false);
      expect(getStreamingStatus()).toBe('OFF');
      expect(getStreamingStatus()).toBe('OFF');
    });

    test('should handle rapid state changes', () => {
      // Rapid toggling
      for (let i = 0; i < 10; i++) {
        setStreamingEnabled(i % 2 === 0);
        expect(isStreamingEnabled()).toBe(i % 2 === 0);
      }
    });
  });
});