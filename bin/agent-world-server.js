#!/usr/bin/env node
/**
 * Agent World Bin Launcher (server entry).
 *
 * Purpose:
 * - Provide a stable npm bin entry for `agent-world-server`.
 *
 * Key Features:
 * - Performs a Node.js runtime preflight check with a clear user-facing error.
 * - Defers to the published server runtime after validation.
 *
 * Notes on Implementation:
 * - Uses dynamic import so the preflight runs before loading modern runtime dependencies.
 *
 * Recent Changes:
 * - 2026-02-19: Added wrapper to avoid silent exits on unsupported Node versions.
 */

const MIN_NODE_MAJOR = 20;

function getNodeMajor() {
  const major = Number.parseInt((process.versions.node || '').split('.')[0] || '0', 10);
  return Number.isFinite(major) ? major : 0;
}

function ensureSupportedNode() {
  const nodeMajor = getNodeMajor();
  if (nodeMajor >= MIN_NODE_MAJOR) return;

  console.error(`[agent-world-server] Node.js ${MIN_NODE_MAJOR}+ is required. Detected ${process.version}.`);
  console.error('[agent-world-server] Please upgrade Node.js and run the command again.');
  process.exit(1);
}

ensureSupportedNode();

import('../dist/server/index.js').catch((error) => {
  console.error('[agent-world-server] Failed to start server:', error);
  process.exit(1);
});
