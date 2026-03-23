import { pathToFileURL } from 'node:url';

/**
 * Release Metadata Resolution
 *
 * Purpose:
 * - Resolves the effective release tag for GitHub Actions release workflows.
 * - Validates the tag/version contract against the root package version.
 * - Derives the publish channel used by electron-builder (`release` vs `prerelease`).
 *
 * Key Features:
 * - Supports both tag-triggered runs and manual workflow dispatch runs.
 * - Produces GitHub Actions output-compatible `key=value` lines.
 * - Exposes pure helper functions for unit tests.
 *
 * Implementation Notes:
 * - Manual dispatch prefers an explicit `release_tag` input over `GITHUB_REF_NAME`.
 * - Tag validation accepts `vX.Y.Z` and prerelease tags like `vX.Y.Z-beta.1`.
 * - Root package version remains the single authoritative release version.
 *
 * Recent Changes:
 * - 2026-03-21: Added workflow-dispatch-aware release metadata validation.
 */

const RELEASE_TAG_PATTERN = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function normalizeValue(value) {
  return String(value || '').trim();
}

export function isValidReleaseTag(tag) {
  return RELEASE_TAG_PATTERN.test(tag);
}

export function toFileHref(filePath) {
  const normalizedFilePath = normalizeValue(filePath);

  if (!normalizedFilePath) {
    return '';
  }

  if (/^[A-Za-z]:[\\/]/.test(normalizedFilePath)) {
    return new URL(`file:///${normalizedFilePath.replace(/\\/g, '/')}`).href;
  }

  return pathToFileURL(normalizedFilePath).href;
}

export function isDirectExecution(importMetaUrl, argvEntry) {
  return normalizeValue(importMetaUrl) === toFileHref(argvEntry);
}

export function resolveReleaseMetadata({ refName, inputTag, packageVersion }) {
  const normalizedRefName = normalizeValue(refName);
  const normalizedInputTag = normalizeValue(inputTag);
  const normalizedPackageVersion = normalizeValue(packageVersion);
  const tag = normalizedInputTag || normalizedRefName;

  if (!tag) {
    throw new Error('Missing release tag. Provide a git tag ref or workflow_dispatch release_tag input.');
  }

  if (!isValidReleaseTag(tag)) {
    throw new Error(`Invalid release tag format: ${tag}. Expected vX.Y.Z or vX.Y.Z-prerelease.N.`);
  }

  if (!normalizedPackageVersion) {
    throw new Error('Missing package version for release metadata validation.');
  }

  if (`v${normalizedPackageVersion}` !== tag) {
    throw new Error(`Tag/version mismatch: tag=${tag}, package.json=${normalizedPackageVersion}`);
  }

  return {
    tag,
    releaseType: tag.includes('-') ? 'prerelease' : 'release',
  };
}

function parseArgs(argv) {
  const args = {
    refName: '',
    inputTag: '',
    packageVersion: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === '--ref-name') {
      args.refName = next || '';
      index += 1;
      continue;
    }

    if (current === '--input-tag') {
      args.inputTag = next || '';
      index += 1;
      continue;
    }

    if (current === '--package-version') {
      args.packageVersion = next || '';
      index += 1;
    }
  }

  return args;
}

function main() {
  try {
    const metadata = resolveReleaseMetadata(parseArgs(process.argv.slice(2)));
    process.stdout.write(`tag=${metadata.tag}\n`);
    process.stdout.write(`release_type=${metadata.releaseType}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  main();
}