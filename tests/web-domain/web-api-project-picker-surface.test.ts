/**
 * Web API Project Picker Surface Tests
 *
 * Purpose:
 * - Verify web API surface no longer exposes server-side project-folder picker helper.
 *
 * Coverage:
 * - Confirms `openProjectFolder` is not exported from web API client.
 */

import { describe, expect, it } from 'vitest';
import api from '../../web/src/api';

describe('web/api project picker surface', () => {
  it('does not expose openProjectFolder helper', () => {
    expect((api as any).openProjectFolder).toBeUndefined();
  });
});
