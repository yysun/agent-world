/**
 * Tool-permission web_fetch target helpers.
 *
 * Purpose:
 * - Provide a shared public URL for E2E tool-permission `web_fetch` coverage.
 *
 * Key Features:
 * - Centralizes the `web_fetch` permission-matrix target used by web and Electron E2E harnesses.
 * - Exposes a deterministic guard that flags obviously local/private HTTP targets.
 *
 * Implementation Notes:
 * - The permission-matrix coverage must avoid localhost/private URLs because `web_fetch`
 *   applies a separate local/private approval gate that is independent of `tool_permission`.
 * - The guard is intentionally conservative and only covers the local/private patterns needed
 *   to prevent accidental regression back to loopback or RFC1918 targets.
 *
 * Recent Changes:
 * - 2026-03-12: Initial file extracted from duplicated E2E harness constants.
 */

export const TOOL_PERMISSION_FETCH_URL = 'https://example.com/';

export function isLikelyLocalOrPrivateFetchTarget(urlValue: string): boolean {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(urlValue);
  } catch {
    return true;
  }

  const hostname = parsedUrl.hostname.trim().toLowerCase();
  if (!hostname) {
    return true;
  }

  if (
    hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname === '0.0.0.0'
    || hostname === '::'
    || hostname === '::1'
    || hostname.endsWith('.local')
    || hostname.endsWith('.internal')
  ) {
    return true;
  }

  const ipv4Parts = hostname.split('.').map((part) => Number(part));
  if (ipv4Parts.length === 4 && ipv4Parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    const [first, second] = ipv4Parts;
    if (
      first === 0
      || first === 10
      || first === 127
      || (first === 169 && second === 254)
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 168)
    ) {
      return true;
    }
  }

  return hostname.startsWith('fc') || hostname.startsWith('fd') || hostname.startsWith('fe80:');
}