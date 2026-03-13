/**
 * Provider Reasoning Probe Tests
 *
 * Features:
 * - Verifies the probe's effort-to-thinking-config mapping
 * - Verifies Azure/OpenAI chunk summarization for reasoning-aware deltas
 * - Verifies Google chunk summarization for thought-marked content parts
 *
 * Implementation Notes:
 * - Keeps coverage deterministic with synthetic chunk payloads only
 * - Avoids network, filesystem, and real provider dependencies
 *
 * Recent Changes:
 * - 2026-03-13: Added regression coverage for the reasoning probe helpers
 */

import { describe, expect, it } from 'vitest';

import {
  buildGoogleThinkingConfig,
  parseProbeArgs,
  summarizeGoogleChunk,
  summarizeOpenAIChunk,
} from './provider-reasoning-probe.js';

describe('provider reasoning probe helpers', () => {
  it('maps product effort values to probe google thinking budgets', () => {
    expect(buildGoogleThinkingConfig('low')).toEqual({ includeThoughts: true, thinkingBudget: 256 });
    expect(buildGoogleThinkingConfig('medium')).toEqual({ includeThoughts: true, thinkingBudget: 1024 });
    expect(buildGoogleThinkingConfig('high')).toEqual({ includeThoughts: true, thinkingBudget: 2048 });
  });

  it('extracts reasoning previews from azure or openai-style streamed chunks', () => {
    expect(summarizeOpenAIChunk({
      choices: [{
        delta: { reasoning_content: 'step-by-step reasoning', content: 'final answer' },
        finish_reason: null,
      }],
    })).toEqual({
      keys: ['reasoning_content', 'content'],
      contentPreview: 'final answer',
      reasoningPreview: 'step-by-step reasoning',
      finishReason: null,
    });
  });

  it('extracts google thought-marked parts from streamed chunks', () => {
    expect(summarizeGoogleChunk({
      candidates: [{
        content: {
          parts: [
            { text: 'intermediate thought', thought: true },
            { text: 'final answer' },
          ],
        },
        finishReason: 'STOP',
      }],
    })).toEqual({
      parts: [
        { keys: ['text', 'thought'], textPreview: 'intermediate thought', thoughtFlag: true },
        { keys: ['text'], textPreview: 'final answer', thoughtFlag: null },
      ],
      finishReason: 'STOP',
    });
  });

  it('parses probe arguments with provider, effort, and prompt overrides', () => {
    expect(parseProbeArgs(['--provider', 'google', '--effort', 'high', '--prompt', 'hello', '--max-chunks', '4'])).toEqual({
      provider: 'google',
      effort: 'high',
      efforts: ['high'],
      prompt: 'hello',
      model: undefined,
      maxChunks: 4,
    });
  });

  it('expands all effort levels when requested', () => {
    expect(parseProbeArgs(['--provider', 'azure', '--all-efforts'])).toEqual({
      provider: 'azure',
      effort: 'low',
      efforts: ['low', 'medium', 'high'],
      prompt: 'Compare three plugin architectures for an Electron app in one concise paragraph.',
      model: undefined,
      maxChunks: 12,
    });
  });
});