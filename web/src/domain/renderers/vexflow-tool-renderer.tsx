/**
 * VexFlow Tool Renderer
 *
 * Purpose:
 * - Render structured output from the `render_sheet_music` tool via VexFlow-backed UI component.
 * - Keep demo/component-specific logic isolated from the registry core.
 *
 * Key Features:
 * - Matches on tool name via generic registry helper
 * - Accepts object payload directly or parses JSON text payloads
 * - Falls back safely to an empty score object when payload is invalid
 *
 * Recent Changes:
 * - 2026-02-21: Renamed from sheet-music tool renderer to explicit VexFlow renderer naming.
 */

import { app } from 'apprun';
import type { CustomRenderer } from '../custom-renderers';
import type { Message, SheetMusicData } from '../../types';
import { extractToolPayload, isToolMessageFor } from './custom-renderer-utils';
import SheetMusic from '../../components/demos/sheet-music';

const VALID_DURATIONS = new Set(['w', 'h', 'q', '8', '16']);

function normalizeDuration(value: unknown): string {
  const raw = String(value || '').trim().toLowerCase();
  if (VALID_DURATIONS.has(raw)) {
    return raw;
  }

  const aliases: Record<string, string> = {
    whole: 'w',
    'whole-note': 'w',
    'whole note': 'w',
    half: 'h',
    'half-note': 'h',
    'half note': 'h',
    quarter: 'q',
    'quarter-note': 'q',
    'quarter note': 'q',
    eighth: '8',
    '8th': '8',
    'eighth-note': '8',
    'eighth note': '8',
    sixteenth: '16',
    '16th': '16',
    'sixteenth-note': '16',
    'sixteenth note': '16',
  };

  return aliases[raw] || 'q';
}

function normalizeKeyToken(value: unknown): string | null {
  const token = String(value || '').trim().toLowerCase();
  if (!token) {
    return null;
  }

  const withOctave = /^([a-g](?:#|b)?)\/(\d)$/.exec(token);
  if (withOctave) {
    return `${withOctave[1]}/${withOctave[2]}`;
  }

  const compactOctave = /^([a-g](?:#|b)?)(\d)$/.exec(token);
  if (compactOctave) {
    return `${compactOctave[1]}/${compactOctave[2]}`;
  }

  const quoteOctave = /^([a-g](?:#|b)?)(['`]+)\/(\d)$/.exec(token);
  if (quoteOctave) {
    const octave = Number(quoteOctave[3]) + quoteOctave[2].length;
    return `${quoteOctave[1]}/${octave}`;
  }

  const quoteWithDuration = /^([a-g](?:#|b)?)(['`]+)\/(w|h|q|8|16)$/.exec(token);
  if (quoteWithDuration) {
    const octave = 4 + quoteWithDuration[2].length;
    return `${quoteWithDuration[1]}/${octave}`;
  }

  const bareNote = /^([a-g](?:#|b)?)$/.exec(token);
  if (bareNote) {
    return `${bareNote[1]}/4`;
  }

  return null;
}

function normalizeNotes(value: unknown): Array<{ keys: string[]; duration: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const raw = entry as Record<string, unknown>;
      const rawKeys = Array.isArray(raw.keys)
        ? raw.keys
        : typeof raw.key === 'string'
          ? [raw.key]
          : [];

      const keys = rawKeys
        .map((item) => normalizeKeyToken(item))
        .filter((item): item is string => !!item);

      if (keys.length === 0) {
        return null;
      }

      return {
        keys,
        duration: normalizeDuration(raw.duration),
      };
    })
    .filter((item): item is { keys: string[]; duration: string } => !!item);

  return normalized;
}

function normalizeSheetMusicData(data: Record<string, unknown>): SheetMusicData {
  return {
    clef: typeof data.clef === 'string' ? data.clef : 'treble',
    keySignature: typeof data.keySignature === 'string' ? data.keySignature : 'C',
    timeSignature: typeof data.timeSignature === 'string' ? data.timeSignature : '4/4',
    notes: normalizeNotes(data.notes),
  };
}

function toSheetMusicData(payload: unknown): SheetMusicData {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return normalizeSheetMusicData(payload as Record<string, unknown>);
  }
  return { notes: [] };
}

function parseRenderSheetMusicText(text: string): SheetMusicData {
  if (!text || !text.includes('render_sheet_music')) {
    return { notes: [] };
  }

  const match = /render_sheet_music\s*\(\s*({[\s\S]*})\s*\)/i.exec(text);
  if (!match?.[1]) {
    return { notes: [] };
  }

  const objectLiteral = match[1];
  const normalizedJson = objectLiteral
    .replace(/\/\/.*$/gm, '')
    .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3')
    .replace(/,\s*([}\]])/g, '$1')
    .trim();

  try {
    const parsed = JSON.parse(normalizedJson);
    return toSheetMusicData(parsed);
  } catch {
    return { notes: [] };
  }
}

function hasSheetMusicShape(data: SheetMusicData): boolean {
  return Array.isArray(data.notes) && data.notes.length > 0;
}

export const vexflowToolRenderer: CustomRenderer = {
  id: 'tool-render-vexflow',
  match: (message: Message) => {
    if (isToolMessageFor(message, 'render_sheet_music')) {
      return true;
    }

    const parsed = parseRenderSheetMusicText(message.text || '');
    return hasSheetMusicShape(parsed);
  },
  render: (message: Message) => {
    const payload = extractToolPayload(message);
    const fromToolPayload = toSheetMusicData(payload);
    const data = hasSheetMusicShape(fromToolPayload)
      ? fromToolPayload
      : parseRenderSheetMusicText(message.text || '');
    return <SheetMusic data={data} />;
  }
};
