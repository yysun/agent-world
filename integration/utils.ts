/**
 * Shared utilities for integration tests
 *
 * Features:
 * - Common API configuration for integration/api tests
 * - Shared helper functions for HTTP calls
 * - Color utilities for consistent test output across all integration tests
 * - Assertion helpers for test validation
 * - Logging utilities for test reporting
 *
 * Implementation:
 * - Centralized configuration to avoid conflicts
 * - Reusable API helper functions
 * - Consistent error handling and logging
 * - Used by all tests in integration/ and integration/api/ directories
 * 
 * Usage:
 * - Import color functions: boldRed, boldGreen, red, green, yellow, cyan, etc.
 * - Import utilities: log, assert, apiCall
 * - Used across integration test files for consistent output and functionality
 */

export const API_BASE_URL = 'http://localhost:8080/api';

// Color helpers for consistent output
export const boldRed = (text: string) => `\x1b[1m\x1b[31m${text.toString()}\x1b[0m`;
export const boldGreen = (text: string) => `\x1b[1m\x1b[32m${text.toString()}\x1b[0m`;
export const boldYellow = (text: string) => `\x1b[1m\x1b[33m${text.toString()}\x1b[0m`;
export const red = (text: string) => `\x1b[31m${text.toString()}\x1b[0m`;
export const green = (text: string) => `\x1b[32m${text.toString()}\x1b[0m`;
export const yellow = (text: string) => `\x1b[33m${text.toString()}\x1b[0m`;
export const cyan = (text: string) => `\x1b[36m${text.toString()}\x1b[0m`;

// Helper to log for test output
export function log(label: string, value: any): void {
  console.log(`${label}:`, value);
}

// Helper to assert values with error messages
export function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.log(red(`❌ ASSERTION FAILED: ${message}`));
    throw new Error(message);
  } else {
    console.log(green(`✅ ${message}`));
  }
}

// API Helper function
export async function apiCall(endpoint: string, options: RequestInit = {}): Promise<{ status: number; data?: any; error?: string; headers?: Headers }> {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });

    let data;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    return {
      status: response.status,
      data: response.ok ? data : undefined,
      error: response.ok ? undefined : (typeof data === 'object' ? data.error : data),
      headers: response.headers
    };
  } catch (error) {
    return {
      status: 0,
      error: error instanceof Error ? error.message : 'Network error'
    };
  }
}
