/**
 * Server Global Error Response Mapping Tests
 *
 * Purpose:
 * - Ensure global Express error handling returns specific, actionable error responses.
 *
 * Coverage:
 * - Payload-too-large errors map to HTTP 413 with `PAYLOAD_TOO_LARGE`.
 * - Invalid JSON errors map to HTTP 400 with `INVALID_JSON_BODY`.
 * - Readonly SQLite errors map to HTTP 503 with `DATABASE_READONLY`.
 * - Unknown errors map to HTTP 500 with `INTERNAL_ERROR`.
 */

import { describe, expect, it } from 'vitest';
import { getErrorResponse } from '../../server/error-response.js';

describe('server global error response mapping', () => {
  it('maps payload-too-large errors', () => {
    const result = getErrorResponse({ type: 'entity.too.large', status: 413 });
    expect(result).toEqual({
      status: 413,
      payload: {
        error: 'Request payload too large. Try submitting a smaller update payload.',
        code: 'PAYLOAD_TOO_LARGE',
      },
    });
  });

  it('maps invalid JSON parse errors', () => {
    const result = getErrorResponse({ type: 'entity.parse.failed' });
    expect(result).toEqual({
      status: 400,
      payload: {
        error: 'Invalid JSON body. Please check request formatting.',
        code: 'INVALID_JSON_BODY',
      },
    });
  });

  it('does not misclassify generic SyntaxError as invalid JSON body', () => {
    const result = getErrorResponse(new SyntaxError('Unexpected token in route logic'));
    expect(result).toEqual({
      status: 500,
      payload: {
        error: 'Server failed to process the request.',
        code: 'INTERNAL_ERROR',
      },
    });
  });

  it('maps readonly sqlite errors', () => {
    const result = getErrorResponse({ code: 'SQLITE_READONLY', message: 'SQLITE_READONLY: attempt to write a readonly database' });
    expect(result).toEqual({
      status: 503,
      payload: {
        error: 'Database is read-only. Check database file permissions and retry.',
        code: 'DATABASE_READONLY',
      },
    });
  });

  it('maps unknown errors to INTERNAL_ERROR', () => {
    const result = getErrorResponse(new Error('unexpected'));
    expect(result).toEqual({
      status: 500,
      payload: {
        error: 'Server failed to process the request.',
        code: 'INTERNAL_ERROR',
      },
    });
  });
});
