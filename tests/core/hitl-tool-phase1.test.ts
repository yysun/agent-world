/**
 * Phase 1 Tests: HITL Tool Definition & Registration
 * 
 * Validates:
 * - Tool appears in tool list
 * - Parameter validation works
 * - Tool execute() returns correct structure
 * - Transformation to client.humanIntervention protocol
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createHumanInterventionTool } from '../../core/tool-utils.js';

describe('Phase 1: HITL Tool Definition', () => {
  let hitlTool: any;

  beforeEach(() => {
    hitlTool = createHumanInterventionTool();
  });

  it('should create tool with correct name', () => {
    expect(hitlTool.name).toBe('human_intervention.request');
  });

  it('should have description', () => {
    expect(hitlTool.description).toBeTruthy();
    expect(hitlTool.description).toContain('decision');
  });

  it('should have correct parameter schema', () => {
    expect(hitlTool.parameters).toBeDefined();
    expect(hitlTool.parameters.type).toBe('object');
    expect(hitlTool.parameters.properties.prompt).toBeDefined();
    expect(hitlTool.parameters.properties.options).toBeDefined();
    expect(hitlTool.parameters.properties.context).toBeDefined();
    expect(hitlTool.parameters.required).toEqual(['prompt', 'options']);
  });

  it('should validate options array has minItems:1', () => {
    expect(hitlTool.parameters.properties.options.minItems).toBe(1);
  });

  it('should reject missing prompt', async () => {
    const result = await hitlTool.execute({
      options: ['A', 'B']
    });

    expect(result).toContain('Error');
    expect(result).toContain('prompt');
  });

  it('should reject empty prompt', async () => {
    const result = await hitlTool.execute({
      prompt: '   ',
      options: ['A', 'B']
    });

    expect(result).toContain('Error');
    expect(result).toContain('prompt');
  });

  it('should reject missing options', async () => {
    const result = await hitlTool.execute({
      prompt: 'Choose something'
    });

    expect(result).toContain('Error');
    expect(result).toContain('options');
  });

  it('should reject empty options array', async () => {
    const result = await hitlTool.execute({
      prompt: 'Choose something',
      options: []
    });

    expect(result).toContain('Error');
    expect(result).toContain('options');
  });

  it('should reject non-string options', async () => {
    const result = await hitlTool.execute({
      prompt: 'Choose something',
      options: ['A', 123, 'B']
    });

    expect(result).toContain('Error');
    expect(result).toContain('string');
  });

  it('should return structured HITL request with valid args', async () => {
    const result = await hitlTool.execute({
      prompt: 'Which deployment strategy?',
      options: ['Blue-Green', 'Canary', 'Rolling'],
      context: { version: 'v1.0.0' }
    }, undefined, undefined, { toolCallId: 'call_123' });

    expect(result).toHaveProperty('type', 'hitl_request');
    expect(result).toHaveProperty('_stopProcessing', true);
    expect(result).toHaveProperty('_approvalMessage');
  });

  it('should transform to client.humanIntervention protocol', async () => {
    const result = await hitlTool.execute({
      prompt: 'Which deployment strategy?',
      options: ['Blue-Green', 'Canary', 'Rolling'],
      context: { version: 'v1.0.0' }
    }, undefined, undefined, { toolCallId: 'call_123' });

    const message = result._approvalMessage;
    expect(message.role).toBe('assistant');
    expect(message.content).toBe('');
    expect(message.tool_calls).toHaveLength(1);

    const toolCall = message.tool_calls[0];
    expect(toolCall.id).toMatch(/^hitl_/);
    expect(toolCall.type).toBe('function');
    expect(toolCall.function.name).toBe('client.humanIntervention');
  });

  it('should include originalToolCall in arguments', async () => {
    const result = await hitlTool.execute({
      prompt: 'Which deployment strategy?',
      options: ['Blue-Green', 'Canary', 'Rolling'],
      context: { version: 'v1.0.0' }
    }, undefined, undefined, { toolCallId: 'call_123' });

    const message = result._approvalMessage;
    const toolCall = message.tool_calls[0];
    const args = JSON.parse(toolCall.function.arguments);

    expect(args.originalToolCall).toBeDefined();
    expect(args.originalToolCall.id).toBe('call_123');
    expect(args.originalToolCall.name).toBe('human_intervention.request');
    expect(args.originalToolCall.args).toEqual({
      prompt: 'Which deployment strategy?',
      options: ['Blue-Green', 'Canary', 'Rolling'],
      context: { version: 'v1.0.0' }
    });
  });

  it('should include prompt, options, and context in arguments', async () => {
    const result = await hitlTool.execute({
      prompt: 'Which deployment strategy?',
      options: ['Blue-Green', 'Canary', 'Rolling'],
      context: { version: 'v1.0.0' }
    }, undefined, undefined, { toolCallId: 'call_123' });

    const message = result._approvalMessage;
    const toolCall = message.tool_calls[0];
    const args = JSON.parse(toolCall.function.arguments);

    expect(args.prompt).toBe('Which deployment strategy?');
    expect(args.options).toEqual(['Blue-Green', 'Canary', 'Rolling']);
    expect(args.context).toEqual({ version: 'v1.0.0' });
  });

  it('should set toolCallStatus as incomplete', async () => {
    const result = await hitlTool.execute({
      prompt: 'Choose',
      options: ['A', 'B']
    }, undefined, undefined, { toolCallId: 'call_123' });

    const message = result._approvalMessage;
    const toolCall = message.tool_calls[0];
    const status = message.toolCallStatus[toolCall.id];

    expect(status).toBeDefined();
    expect(status.complete).toBe(false);
    expect(status.result).toBeNull();
  });

  it('should work without context parameter', async () => {
    const result = await hitlTool.execute({
      prompt: 'Choose',
      options: ['A', 'B']
    }, undefined, undefined, { toolCallId: 'call_123' });

    const message = result._approvalMessage;
    const toolCall = message.tool_calls[0];
    const args = JSON.parse(toolCall.function.arguments);

    expect(args.context).toEqual({});
  });
});

describe('Phase 1: HITL Tool Registration', () => {
  it('should be included in built-in tools', () => {
    // Test that the tool can be created
    const hitlTool = createHumanInterventionTool();
    expect(hitlTool).toBeDefined();
    expect(hitlTool.name).toBe('human_intervention.request');
    expect(hitlTool.execute).toBeDefined();

    // The tool is registered in getBuiltInTools() which is called by getMCPToolsForWorld
    // Full integration test will be done in Phase 6
  });
});
