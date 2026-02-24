/**
 * Web World Update Branch Chat Tests
 *
 * Purpose:
 * - Lock current web behavior after branch-from-message UI flow was removed.
 *
 * Coverage:
 * - Confirms branch API helper is not exposed.
 * - Confirms world update handler does not register branch event.
 */

import { describe, expect, it } from 'vitest';
import api from '../../web/src/api';
import { worldUpdateHandlers } from '../../web/src/pages/World.update';

describe('web/world-update branch-chat-from-message', () => {
  it('does not expose branch API helper in web client', async () => {
    expect((api as any).branchChatFromMessage).toBeUndefined();
  });

  it('does not register branch-from-message handler in world updates', async () => {
    expect((worldUpdateHandlers as any)['branch-chat-from-message']).toBeUndefined();
  });
});
