/**
 * Purpose:
 * - Open a project-folder picker in browser contexts using Web File APIs.
 *
 * Key Features:
 * - Uses `showDirectoryPicker` when available.
 * - Falls back to `input[type=file][webkitdirectory]` for broader support.
 * - Prompts for a working-directory path value to persist in world variables.
 *
 * Notes on Implementation:
 * - Browser security does not expose absolute folder paths from picker handles.
 * - A follow-up prompt is used to collect the persisted `working_directory` value.
 *
 * Summary of Recent Changes:
 * - 2026-02-21: Added to replace server-side/macOS-only folder picking with web-side File API flow.
 */

export interface ProjectFolderPickResult {
  canceled: boolean;
  directoryPath: string | null;
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const maybeError = error as { name?: string };
  return String(maybeError.name || '') === 'AbortError';
}

function firstDirectoryNameFromRelativePath(relativePath: string | undefined): string | null {
  const normalized = String(relativePath || '').trim();
  if (!normalized) {
    return null;
  }
  const firstSegment = normalized.split('/')[0];
  return firstSegment ? firstSegment.trim() : null;
}

function promptForWorkingDirectory(directoryName: string, currentValue: string | null): string | null {
  const defaultValue = String(currentValue || '').trim() || directoryName;
  const entered = window.prompt(
    `Selected folder "${directoryName}". Enter working_directory path to store in this world:`,
    defaultValue
  );
  if (entered == null) {
    return null;
  }
  const normalized = entered.trim();
  return normalized || null;
}

function pickDirectoryNameWithInput(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.setAttribute('webkitdirectory', '');
    input.setAttribute('directory', '');
    input.style.display = 'none';

    const cleanup = () => {
      window.removeEventListener('focus', handleWindowFocus, true);
      input.remove();
    };

    let settled = false;
    const finish = (value: string | null) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(value);
    };

    const handleWindowFocus = () => {
      // If user closes picker without selection, some browsers do not emit `change`.
      // Resolve on focus return so caller can continue.
      window.setTimeout(() => {
        const files = Array.from(input.files || []);
        if (!files.length) {
          finish(null);
        }
      }, 0);
    };

    input.addEventListener('change', () => {
      const files = Array.from(input.files || []);
      const first = files[0] as File & { webkitRelativePath?: string };
      const directoryName = firstDirectoryNameFromRelativePath(first?.webkitRelativePath);
      finish(directoryName);
    }, { once: true });

    input.addEventListener('cancel', () => {
      finish(null);
    }, { once: true });

    window.addEventListener('focus', handleWindowFocus, true);
    document.body.appendChild(input);
    input.click();
  });
}

async function pickDirectoryNameFromBrowserApi(): Promise<string | null> {
  const showDirectoryPicker = (window as unknown as {
    showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<{ name?: string }>;
  }).showDirectoryPicker;

  if (typeof showDirectoryPicker === 'function') {
    try {
      const directoryHandle = await showDirectoryPicker({ mode: 'read' });
      const directoryName = String(directoryHandle?.name || '').trim();
      return directoryName || null;
    } catch (error) {
      if (isAbortError(error)) {
        return null;
      }
      throw error;
    }
  }

  return pickDirectoryNameWithInput();
}

export async function pickProjectFolderPath(currentValue: string | null): Promise<ProjectFolderPickResult> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Project folder picker is only available in browser contexts.');
  }

  const directoryName = await pickDirectoryNameFromBrowserApi();
  if (!directoryName) {
    return { canceled: true, directoryPath: null };
  }

  const directoryPath = promptForWorkingDirectory(directoryName, currentValue);
  if (!directoryPath) {
    return { canceled: true, directoryPath: null };
  }

  return {
    canceled: false,
    directoryPath
  };
}
