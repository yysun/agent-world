/**
 * YouTube Message Renderer
 *
 * Purpose:
 * - Render YouTube links as embedded video cards in chat messages.
 * - Support both plain-text links and tool payload-driven video references.
 *
 * Key Features:
 * - Extracts video IDs from youtube.com, youtu.be, shorts, and embed URLs.
 * - Supports tool payload shape `{ url }` or `{ videoId }`.
 * - Falls back to normal message rendering when no valid YouTube ID is found.
 * - Always shows a usable YouTube link below the embed for blocked/unavailable videos.
 *
 * Notes on Implementation:
 * - Keeps matching logic local to this renderer module.
 * - Uses no unsafe HTML injection; embed URL is constructed from validated video ID.
 */

import { app } from 'apprun';
import type { CustomRenderer } from '../custom-renderers';
import type { Message } from '../../types';
import { extractToolPayload, isToolMessageFor } from './custom-renderer-utils';

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'www.youtube-nocookie.com',
  'youtube-nocookie.com',
  'youtu.be',
  'www.youtu.be'
]);

function isValidYouTubeId(value: string): boolean {
  return /^[A-Za-z0-9_-]{11}$/.test(value);
}

function extractVideoIdFromUrl(urlText: string): string | null {
  try {
    const url = new URL(urlText.trim());
    const host = url.hostname.toLowerCase();
    if (!YOUTUBE_HOSTS.has(host)) {
      return null;
    }

    if (host.includes('youtu.be')) {
      const id = url.pathname.split('/').filter(Boolean)[0] || '';
      return isValidYouTubeId(id) ? id : null;
    }

    const watchId = url.searchParams.get('v') || '';
    if (isValidYouTubeId(watchId)) {
      return watchId;
    }

    const parts = url.pathname.split('/').filter(Boolean);
    const embedIndex = parts.findIndex((part) => part === 'embed');
    if (embedIndex >= 0 && parts[embedIndex + 1] && isValidYouTubeId(parts[embedIndex + 1])) {
      return parts[embedIndex + 1];
    }

    const shortsIndex = parts.findIndex((part) => part === 'shorts');
    if (shortsIndex >= 0 && parts[shortsIndex + 1] && isValidYouTubeId(parts[shortsIndex + 1])) {
      return parts[shortsIndex + 1];
    }

    return null;
  } catch {
    return null;
  }
}

function extractFirstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s]+/i);
  if (!match?.[0]) {
    return null;
  }
  return match[0].replace(/[),.;!?]+$/g, '');
}

function extractYouTubeInfoFromPayload(payload: unknown): { videoId: string | null; sourceUrl: string | null } {
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const match = extractYouTubeInfoFromPayload(item);
      if (match.videoId) {
        return match;
      }
    }
    return { videoId: null, sourceUrl: null };
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { videoId: null, sourceUrl: null };
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.videoId === 'string' && isValidYouTubeId(record.videoId)) {
    return { videoId: record.videoId, sourceUrl: null };
  }

  const candidateUrl =
    typeof record.url === 'string'
      ? record.url
      : typeof record.videoUrl === 'string'
        ? record.videoUrl
        : typeof record.youtubeUrl === 'string'
          ? record.youtubeUrl
          : typeof record.link === 'string'
            ? record.link
            : null;

  if (candidateUrl) {
    return {
      videoId: extractVideoIdFromUrl(candidateUrl),
      sourceUrl: candidateUrl,
    };
  }

  if (record.renderer === 'youtube' && typeof record.url === 'string') {
    return {
      videoId: extractVideoIdFromUrl(record.url),
      sourceUrl: record.url,
    };
  }

  return { videoId: null, sourceUrl: null };
}

function extractYouTubeRenderData(message: Message): { videoId: string | null; sourceUrl: string | null; canonicalUrl: string | null } {
  const payload = extractToolPayload(message);
  const payloadInfo = extractYouTubeInfoFromPayload(payload);
  if (payloadInfo.videoId) {
    const canonicalUrl = `https://www.youtube.com/watch?v=${payloadInfo.videoId}`;
    return {
      videoId: payloadInfo.videoId,
      sourceUrl: payloadInfo.sourceUrl,
      canonicalUrl,
    };
  }

  if (!message.text) {
    return { videoId: null, sourceUrl: null, canonicalUrl: null };
  }

  const sourceUrl = extractFirstUrl(message.text);
  if (!sourceUrl) {
    return { videoId: null, sourceUrl: null, canonicalUrl: null };
  }

  const videoId = extractVideoIdFromUrl(sourceUrl);
  if (!videoId) {
    return { videoId: null, sourceUrl: null, canonicalUrl: null };
  }

  return {
    videoId,
    sourceUrl,
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

export const youtubeRenderer: CustomRenderer = {
  id: 'youtube-video',
  match: (message: Message) => {
    if (isToolMessageFor(message, 'render_youtube_video')) {
      return true;
    }
    return !!extractYouTubeRenderData(message).videoId;
  },
  render: (message: Message) => {
    const { videoId, sourceUrl, canonicalUrl } = extractYouTubeRenderData(message);
    if (!videoId) {
      return <div className="message-content">{message.text || ''}</div>;
    }

    const embedUrl = `https://www.youtube.com/embed/${videoId}`;
    const fallbackUrl = canonicalUrl || sourceUrl || embedUrl;

    return (
      <div className="youtube-video-container p-3 bg-white rounded-lg shadow-sm my-2">
        <div className="mb-2 text-xs text-gray-700">
          <a href={fallbackUrl} target="_blank" rel="noopener noreferrer" className="underline break-all font-medium">
            Open in YouTube
          </a>
          <div className="mt-1 break-all">URL: {fallbackUrl}</div>
          {sourceUrl && sourceUrl !== fallbackUrl && (
            <div className="mt-1 break-all">Source: {sourceUrl}</div>
          )}
          <div className="mt-1 text-gray-500">If embed shows “Video unavailable”, open the URL above in a new tab.</div>
        </div>
        <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
          <iframe
            className="absolute top-0 left-0 w-full h-full rounded"
            src={embedUrl}
            title="YouTube video"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
    );
  }
};
