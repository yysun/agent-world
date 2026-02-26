/**
 * Server Error Response Mapping
 *
 * Purpose:
 * - Convert runtime/server errors into stable, user-meaningful HTTP responses.
 *
 * Features:
 * - Specific mappings for oversized request payloads and invalid JSON bodies.
 * - Readonly SQLite detection with actionable error messaging.
 * - Safe fallback for unknown internal errors.
 *
 * Implementation Notes:
 * - JSON parse mapping is intentionally strict to body-parser parse errors only,
 *   so unrelated `SyntaxError`s in route logic are not mislabeled as request-body issues.
 *
 * Changes:
 * - 2026-02-26: Tightened invalid JSON detection to avoid misclassifying generic runtime SyntaxErrors.
 * - 2026-02-26: Initial extraction from `server/index.ts` for reusable, testable global error mapping.
 */

export type ErrorResponsePayload = {
  error: string;
  code: string;
};

function isEntityTooLargeError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { type?: string; status?: number; statusCode?: number };
  return candidate.type === 'entity.too.large' || candidate.status === 413 || candidate.statusCode === 413;
}

function isJsonParseError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { type?: string; status?: number; statusCode?: number; body?: unknown };
  const isBodyParserParseType = candidate.type === 'entity.parse.failed';
  const isBodyParserSyntaxError = error instanceof SyntaxError
    && (candidate.status === 400 || candidate.statusCode === 400)
    && 'body' in candidate;
  return isBodyParserParseType || isBodyParserSyntaxError;
}

function isReadonlySqliteError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { message?: string; code?: string };
  return candidate.code === 'SQLITE_READONLY' || String(candidate.message || '').includes('SQLITE_READONLY');
}

export function getErrorResponse(error: unknown): { status: number; payload: ErrorResponsePayload } {
  if (isEntityTooLargeError(error)) {
    return {
      status: 413,
      payload: {
        error: 'Request payload too large. Try submitting a smaller update payload.',
        code: 'PAYLOAD_TOO_LARGE'
      }
    };
  }

  if (isJsonParseError(error)) {
    return {
      status: 400,
      payload: {
        error: 'Invalid JSON body. Please check request formatting.',
        code: 'INVALID_JSON_BODY'
      }
    };
  }

  if (isReadonlySqliteError(error)) {
    return {
      status: 503,
      payload: {
        error: 'Database is read-only. Check database file permissions and retry.',
        code: 'DATABASE_READONLY'
      }
    };
  }

  return {
    status: 500,
    payload: {
      error: 'Server failed to process the request.',
      code: 'INTERNAL_ERROR'
    }
  };
}
