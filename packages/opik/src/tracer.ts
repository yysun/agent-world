import { Opik } from 'opik';
import { OpikClient } from './client.js';
// We need to import types from core, but safely
import type { World, Agent } from '@agent-world/core/types';

interface SpanMap {
  [id: string]: any; // Opik Span type
}

export class OpikTracer {
  private client: Opik;
  private activeSpans: Map<string, SpanMap> = new Map();
  private activeTraces: Map<string, any> = new Map();

  constructor() {
    this.client = OpikClient.getInstance()!;
  }

  /**
   * Start tracking a world instance
   */
  public attachToWorld(world: any) { // Using any until we confirm type resolution
    if (!this.client) {
      console.warn('Opik client not initialized, tracing disabled');
      return;
    }

    const eventEmitter = world.eventEmitter;
    if (!eventEmitter) return;

    // Listen for tool events
    eventEmitter.on('world', (payload: any) => {
      this.handleWorldEvent(payload);
    });

    // Listen for SSE (LLM generation) events
    eventEmitter.on('sse', (payload: any) => {
      this.handleSSEEvent(payload);
    });
    
    console.log('Opik tracer attached to world');
  }

  private handleWorldEvent(payload: any) {
    // Tool start
    if (payload.type === 'tool-start') {
      const trace = this.ensureTrace(payload.agentName);
      if (!trace) return;
      
      const span = trace.span({
        name: payload.toolExecution.toolName,
        type: 'tool',
        input: payload.toolExecution.input,
      });
      // Store span by toolCallId if available, or generate one
      const id = payload.messageId + ':' + payload.toolExecution.toolCallId;
      this.storeSpan(id, span);
    }
    
    // Tool result
    if (payload.type === 'tool-result' || payload.type === 'tool-error') {
       const id = payload.messageId + ':' + payload.toolExecution.toolCallId;
       const span = this.getSpan(id);
       if (span) {
         span.end(); // spans typically don't take output in end(), use update() or properties if needed, but span.end() is void in typings above?
         // Actually span.end returns 'this'.
         // To set output, Opik spans usually require setting output in the span data or via update()
         
         // Looking at typings: update: (updates: SpanUpdateData) => this;
         // I should check SpanUpdateData
         span.update({
           output: payload.toolExecution.result
         });
         
         this.removeSpan(id);
       }
    }
  }

  private handleSSEEvent(payload: any) {
    if (payload.type === 'start') {
      const trace = this.ensureTrace(payload.agentName);
      if (!trace) return;

      // This is the start of an LLM generation
      const span = trace.span({
        name: 'llm_generation',
        type: 'llm',
      });
      this.storeSpan(payload.messageId, span);
    }

    if (payload.type === 'end') {
      const span = this.getSpan(payload.messageId);
      if (span) {
        // We don't have the full content here, it was streamed. 
        // We might need to accumulate chunks if we want to log the output.
        // For now just end it.
        span.end();
        this.removeSpan(payload.messageId);
      }
    }
  }

  // Simplified trace management for POC
  private ensureTrace(agentId: string): any {
    let trace = this.activeTraces.get(agentId);
    if (!trace) {
      trace = this.client.trace({
        name: `agent_run_${agentId}`,
      });
      this.activeTraces.set(agentId, trace);
    }
    return trace;
  }

  private storeSpan(id: string, span: any) {
    // Basic in-memory map logic
    // Implementation depends on actual Opik SDK span object structure
    // span typically has an ID itself
    if (!this.activeSpans.has(id)) {
      this.activeSpans.set(id, {});
    }
    this.activeSpans.set(id, span);
  }

  private getSpan(id: string) {
    return this.activeSpans.get(id);
  }

  private removeSpan(id: string) {
    this.activeSpans.delete(id);
  }
}
