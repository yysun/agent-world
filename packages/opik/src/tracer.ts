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
  private scenarioName: string = "default_run";

  constructor() {
    this.client = OpikClient.getInstance()!;
  }

  public setScenarioName(name: string) {
      this.scenarioName = name;
      // Clear active traces so next event starts a new trace with new name
      this.activeTraces.clear();
      this.activeSpans.clear();
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
    // DEBUG: Log ALL world events associated with this tracer
    console.log(`[OpikTracer] 📥 World Event: ${payload.type}`, payload.toolExecution ? `Tool: ${payload.toolExecution.toolName}` : '');

    // Tool start
    if (payload.type === 'tool-start') {
      const trace = this.ensureTrace(payload.agentName);
      if (!trace) return;
      
      // Phase 4: Shadow Monitoring - Risk Tagging
      const toolName = payload.toolExecution.toolName;
      const isRisky = toolName === 'shell_cmd' || toolName.startsWith('fs_');
      
      // DEBUG: Log tool name detection
      if (isRisky) {
          console.log(`[OpikTracer] 🚨 High risk tool detected: ${toolName}. Tagging as 'risk_level:high'.`);
      } else {
        console.log(`[OpikTracer] Normal tool detected: ${toolName}`);
      }

      const span = trace.span({
        name: toolName,
        type: 'tool',
        input: payload.toolExecution.input,
        tags: isRisky ? ['risk_level:high', 'tool:risky', `tool:${toolName}`] : [`tool:${toolName}`]
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
         // Update with output before ending the span
         span.update({
           output: payload.toolExecution.result
         });
         
         span.end();
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
        input: { messages: payload.messages || "Input messages not captured in SSE payload" } 
      });
      // Store object wrapper to hold accumulated content
      this.storeSpan(payload.messageId, { span, content: "" });
    }
    
    if (payload.type === 'chunk' && payload.content) {
        const spanMap = this.getSpan(payload.messageId);
        if (spanMap) {
            spanMap.content += payload.content;
        }
    }

    if (payload.type === 'end') {
      const spanMap = this.getSpan(payload.messageId);
      if (spanMap) {
        const span = spanMap.span;
        const recordedContent = spanMap.content;
        
        // If content is empty/missing, check if there are tool calls in the payload
        // Note: The SSE 'end' payload might not carry tool calls in current architecture,
        // but if we had access to them, we'd log them.
        // For now, if content is empty, use a placeholder so the trace isn't blank "1"
        const finalContent = recordedContent ? recordedContent : "(No text content generated)";

        // Update span with final output
        span.update({
            output: { content: finalContent }
        });
        span.end();
        
        this.removeSpan(payload.messageId);
      }
    }
  }

  public async flush() {
      if (this.client) {
          await this.client.flush();
      }
  }

  // Simplified trace management for POC
  private ensureTrace(agentId: string): any {
    let trace = this.activeTraces.get(agentId);
    if (!trace) {
      trace = this.client.trace({
        name: `${this.scenarioName}: ${agentId}`,
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
