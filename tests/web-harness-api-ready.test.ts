/**
 * Unit tests for web E2E API readiness polling.
 *
 * Purpose:
 * - Lock the retry contract that protects direct API setup calls during Playwright startup.
 *
 * Key Features:
 * - Verifies transient health-check failures are retried until the API becomes ready.
 * - Verifies the final startup error is surfaced when the API never becomes reachable.
 *
 * Notes on Implementation:
 * - Exercises the Playwright-free helper with injected fetch and sleep fakes only.
 * - Avoids real timers, sockets, and browser boot.
 *
 * Summary of Recent Changes:
 * - 2026-03-24: Added regression coverage for the shared API readiness helper.
 */

import { describe, expect, it, vi } from 'vitest';

import { waitForApiReady } from './web-e2e/support/api-ready.js';

function createResponse(ok: boolean, status: number): Response {
  return {
    ok,
    status,
  } as Response;
}

describe('waitForApiReady', () => {
  it('retries until the API health endpoint responds successfully', async () => {
    const sleep = vi.fn(async () => undefined);
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:3000'))
      .mockResolvedValueOnce(createResponse(false, 503))
      .mockResolvedValueOnce(createResponse(true, 200));

    await waitForApiReady({
      fetchImpl,
      sleep,
      retries: 3,
      retryDelayMs: 1,
      requestTimeoutMs: 100,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('surfaces the final error when the API never becomes reachable', async () => {
    const sleep = vi.fn(async () => undefined);
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:3000'));

    await expect(
      waitForApiReady({
        fetchImpl,
        sleep,
        retries: 2,
        retryDelayMs: 1,
        requestTimeoutMs: 100,
      }),
    ).rejects.toThrow('connect ECONNREFUSED 127.0.0.1:3000');

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});