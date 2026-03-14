/**
 * Import Open Action Tests
 * Purpose:
 * - Verify the Electron renderer routes world import into the left sidebar state.
 *
 * Key Features:
 * - Confirms import mode is selected.
 * - Confirms the right panel is explicitly closed for the import flow.
 *
 * Implementation Notes:
 * - Tests the exported pure helper to avoid React hook runtime coupling.
 * - Uses deterministic mocked setters only.
 *
 * Recent Changes:
 * - 2026-03-14: Added regression coverage for left-sidebar world import opening.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('react', () => ({
  useCallback: (fn: unknown) => fn,
  useEffect: () => undefined,
  useMemo: (fn: () => unknown) => fn(),
  useRef: (value?: unknown) => ({ current: value }),
  useState: (value: unknown) => [value, () => undefined],
}), { virtual: true });

import { openImportWorldSidebar } from '../../../electron/renderer/src/hooks/useAppActionHandlers';

describe('electron/renderer import open action', () => {
  it('opens import mode in the left sidebar and closes the right panel', () => {
    const setPanelMode = vi.fn();
    const setPanelOpen = vi.fn();

    openImportWorldSidebar({
      setPanelMode,
      setPanelOpen,
    });

    expect(setPanelMode).toHaveBeenCalledWith('import-world');
    expect(setPanelOpen).toHaveBeenCalledWith(false);
  });
});