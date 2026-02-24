/**
 * World Chat Composer Action Tests
 *
 * Purpose:
 * - Verify send/stop button toggle logic used by web chat composer.
 *
 * Coverage:
 * - Stop mode activates only for active current-chat processing.
 * - Stop mode disabled state while stop request is in flight.
 * - Send mode labels/disable rules for idle and sending states.
 *
 * Recent Changes:
 * - 2026-02-21: Updated assertions for Electron-style composer state (`composerDisabled`, icon-button class names, and simplified labels).
 * - 2026-02-20: Added coverage for send-button disable behavior while a HITL prompt is active.
 */

import { describe, expect, it } from 'vitest';
import { getComposerActionState } from '../../web/src/components/world-chat';

describe('web/world-chat composer action', () => {
  it('shows stop mode when current chat is processing', () => {
    const state = getComposerActionState({
      currentChatId: 'chat-1',
      isWaiting: true,
      isBusy: false,
      isStopping: false,
      isSending: false,
      hasActiveHitlPrompt: false,
      userInput: 'hello',
    });

    expect(state.canStopCurrentSession).toBe(true);
    expect(state.composerDisabled).toBe(false);
    expect(state.actionButtonClass).toBe('composer-submit-button stop-button');
    expect(state.actionButtonLabel).toBe('Stop message processing');
    expect(state.actionButtonDisabled).toBe(false);
  });

  it('disables stop mode while stop request is in flight', () => {
    const state = getComposerActionState({
      currentChatId: 'chat-1',
      isWaiting: true,
      isBusy: true,
      isStopping: true,
      isSending: false,
      hasActiveHitlPrompt: false,
      userInput: 'hello',
    });

    expect(state.canStopCurrentSession).toBe(true);
    expect(state.composerDisabled).toBe(false);
    expect(state.actionButtonLabel).toBe('Stop message processing');
    expect(state.actionButtonDisabled).toBe(true);
  });

  it('uses send mode and disables empty input when not processing', () => {
    const state = getComposerActionState({
      currentChatId: 'chat-1',
      isWaiting: false,
      isBusy: false,
      isStopping: false,
      isSending: false,
      hasActiveHitlPrompt: false,
      userInput: '   ',
    });

    expect(state.canStopCurrentSession).toBe(false);
    expect(state.composerDisabled).toBe(false);
    expect(state.actionButtonClass).toBe('composer-submit-button');
    expect(state.actionButtonLabel).toBe('Send message');
    expect(state.actionButtonDisabled).toBe(true);
  });

  it('keeps send button disabled while actively sending and not in stop mode', () => {
    const state = getComposerActionState({
      currentChatId: null,
      isWaiting: false,
      isBusy: false,
      isStopping: false,
      isSending: true,
      hasActiveHitlPrompt: false,
      userInput: 'hello',
    });

    expect(state.canStopCurrentSession).toBe(false);
    expect(state.composerDisabled).toBe(false);
    expect(state.actionButtonLabel).toBe('Send message');
    expect(state.actionButtonDisabled).toBe(true);
  });

  it('disables send mode while HITL prompt is active', () => {
    const state = getComposerActionState({
      currentChatId: 'chat-1',
      isWaiting: false,
      isBusy: false,
      isStopping: false,
      isSending: false,
      hasActiveHitlPrompt: true,
      userInput: 'hello',
    });

    expect(state.canStopCurrentSession).toBe(false);
    expect(state.composerDisabled).toBe(true);
    expect(state.actionButtonLabel).toBe('Send message');
    expect(state.actionButtonDisabled).toBe(true);
  });

  it('keeps composer enabled during active stop-mode even with HITL prompt', () => {
    const state = getComposerActionState({
      currentChatId: 'chat-1',
      isWaiting: true,
      isBusy: true,
      isStopping: false,
      isSending: false,
      hasActiveHitlPrompt: true,
      userInput: 'hello',
    });

    expect(state.canStopCurrentSession).toBe(true);
    expect(state.composerDisabled).toBe(false);
    expect(state.actionButtonDisabled).toBe(false);
  });
});
