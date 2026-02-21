/**
 * Custom Renderers Registry
 *
 * Purpose:
 * - Provide a pluggable registry for specialized message rendering.
 * - Keep domain-specific renderers outside the core message-content flow.
 *
 * Key Features:
 * - Ordered renderer resolution (first match wins)
 * - Shared helpers for matching tool-result messages and extracting payloads
 * - Clean extension point for non-demo renderers (charts, PDFs, audio, etc.)
 *
 * Recent Changes:
 * - 2026-02-20: Split sheet-music logic into dedicated renderer module and kept this file framework-level.
 */

import type { Message } from '../types';
import { vexflowToolRenderer } from './renderers/vexflow-tool-renderer';
import { youtubeRenderer } from './renderers/youtube-renderer';
import { extractToolPayload, isToolMessageFor } from './renderers/custom-renderer-utils';

export interface CustomRenderer {
  id: string;
  match: (message: Message) => boolean;
  render: (message: Message) => any;
}

const customRenderers: CustomRenderer[] = [youtubeRenderer, vexflowToolRenderer];

export { extractToolPayload, isToolMessageFor };

export function getCustomRenderer(message: Message): CustomRenderer | undefined {
  return customRenderers.find((renderer) => renderer.match(message));
}
