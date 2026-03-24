/**
 * API readiness helpers for web E2E startup.
 *
 * Purpose:
 * - Wait for the local API server to accept requests before browser tests issue direct API setup calls.
 *
 * Key Features:
 * - Polls the shared `/health` endpoint with retry/backoff.
 * - Supports injected fetch and sleep functions so the retry contract can be unit tested deterministically.
 *
 * Notes on Implementation:
 * - Keeps the helper Playwright-free so Vitest can exercise it without booting browsers.
 * - Leaves browser-app readiness to Playwright's normal `webServer.url` checks; this helper covers the separate API port.
 *
 * Summary of Recent Changes:
 * - 2026-03-24: Added shared API readiness polling to prevent `ECONNREFUSED` races on port 3000 during web E2E startup.
 */

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type WaitForApiReadyOptions = {
  fetchImpl?: FetchLike;
  healthUrl?: string;
  retries?: number;
  retryDelayMs?: number;
  requestTimeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

async function defaultSleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
  fetchImpl: FetchLike,
  input: string,
  init?: RequestInit,
  timeoutMs: number = 10_000,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function waitForApiReady({
  fetchImpl = fetch,
  healthUrl = 'http://127.0.0.1:3000/health',
  retries = 20,
  retryDelayMs = 500,
  requestTimeoutMs = 2_000,
  sleep = defaultSleep,
}: WaitForApiReadyOptions = {}): Promise<void> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetchWithTimeout(fetchImpl, healthUrl, undefined, requestTimeoutMs);
      if (response.ok) {
        return;
      }
      lastError = new Error(`Health check returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await sleep(retryDelayMs);
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}