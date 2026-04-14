/**
 * BaseEditor Pattern
 *
 * Purpose:
 * - Provide a generic editor/workbench shell with an optional toolbar and optional secondary pane.
 *
 * Key Features:
 * - Flex-based primary content area with optional secondary column.
 * - Optional draggable splitter when a secondary pane is present.
 * - Toolbar inset support for macOS traffic-light clearance in full-area editor views.
 * - Domain-agnostic slot contract: callers supply content and any secondary pane explicitly.
 *
 * Implementation Notes:
 * - Stateless layout shell; parent components own all behavior and state.
 * - Resizing is handled imperatively against the split pane DOM so callers do not need to manage layout state.
 * - Does not import or default to business-specific UI.
 *
 * Recent Changes:
 * - 2026-04-14: Added a generic draggable splitter between the primary and secondary panes.
 * - 2026-03-23: Removed the default editor chat dependency so the pattern no longer imports business-specific UI.
 * - 2026-03-23: Increased collapsed-editor toolbar inset so the Back button clears the floating restore button with more space.
 * - 2026-03-23: Added optional toolbar inset support so full-area editors can clear the macOS traffic lights when the left sidebar is collapsed.
 * - 2026-03-08: Initial implementation as part of editor skill-editor feature.
 */

import type React from 'react';

const MIN_EDITOR_PANE_WIDTH_PX = 240;

function clampPaneWidth(targetWidth: number, containerWidth: number): number {
  const maxWidth = Math.max(MIN_EDITOR_PANE_WIDTH_PX, containerWidth - MIN_EDITOR_PANE_WIDTH_PX);
  return Math.min(Math.max(targetWidth, MIN_EDITOR_PANE_WIDTH_PX), maxWidth);
}

function applyPrimaryPaneWidth(splitRow: HTMLElement, nextWidthPx: number) {
  const primaryPane = splitRow.firstElementChild as HTMLElement | null;
  const secondaryPane = splitRow.lastElementChild as HTMLElement | null;
  const splitter = splitRow.children.item(1) as HTMLElement | null;

  if (!primaryPane || !secondaryPane || !splitter) {
    return;
  }

  const rowRect = splitRow.getBoundingClientRect();
  const availableWidth = rowRect.width - splitter.getBoundingClientRect().width;
  const clampedWidth = clampPaneWidth(nextWidthPx, availableWidth);
  primaryPane.style.flex = `0 0 ${clampedWidth}px`;
  secondaryPane.style.flex = '1 1 0%';
}

function startPaneResize(event: React.MouseEvent<HTMLDivElement>) {
  const splitter = event.currentTarget as HTMLDivElement;
  const splitRow = splitter.parentElement as HTMLElement | null;
  const ownerDocument = splitter.ownerDocument;
  const ownerWindow = ownerDocument.defaultView;

  if (!splitRow || !ownerWindow) {
    return;
  }

  const onMouseMove = (moveEvent: MouseEvent) => {
    const rowRect = splitRow.getBoundingClientRect();
    const proposedWidth = moveEvent.clientX - rowRect.left;
    applyPrimaryPaneWidth(splitRow, proposedWidth);
  };

  const stopResize = () => {
    ownerDocument.body.style.cursor = '';
    ownerDocument.body.style.userSelect = '';
    ownerWindow.removeEventListener('mousemove', onMouseMove);
    ownerWindow.removeEventListener('mouseup', stopResize);
  };

  ownerDocument.body.style.cursor = 'col-resize';
  ownerDocument.body.style.userSelect = 'none';
  ownerWindow.addEventListener('mousemove', onMouseMove);
  ownerWindow.addEventListener('mouseup', stopResize);
}

function resizePaneWithKeyboard(event: React.KeyboardEvent<HTMLDivElement>) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
    return;
  }

  const splitter = event.currentTarget as HTMLDivElement;
  const splitRow = splitter.parentElement as HTMLElement | null;
  if (!splitRow) {
    return;
  }

  const primaryPane = splitRow.firstElementChild as HTMLElement | null;
  if (!primaryPane) {
    return;
  }

  event.preventDefault();
  const step = event.key === 'ArrowLeft' ? -24 : 24;
  const currentWidth = primaryPane.getBoundingClientRect().width;
  applyPrimaryPaneWidth(splitRow, currentWidth + step);
}

export default function BaseEditor({
  toolbar,
  children,
  rightPane,
  reserveTrafficLightSpace = false,
}: {
  toolbar?: React.ReactNode;
  children: React.ReactNode;
  rightPane?: React.ReactNode;
  reserveTrafficLightSpace?: boolean;
}) {
  const hasRightPane = rightPane !== undefined && rightPane !== null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {toolbar ? (
        <div className={`flex-none border-b border-border bg-background pt-2 ${reserveTrafficLightSpace ? 'pb-3 pl-36 pr-5' : 'px-4 py-2'}`}>
          {toolbar}
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1">
        <div className={`flex min-w-0 flex-col overflow-hidden ${hasRightPane ? 'flex-[3]' : 'flex-1'}`}>
          {children}
        </div>
        {hasRightPane ? (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize editor panes"
              tabIndex={0}
              onMouseDown={startPaneResize}
              onKeyDown={resizePaneWithKeyboard}
              className="group flex w-1.5 shrink-0 cursor-col-resize items-stretch justify-center bg-background focus:outline-none"
            >
              <span className="w-px rounded-full bg-border transition-colors group-hover:bg-foreground/30 group-focus:bg-foreground/40" />
            </div>
            <div className="min-w-0 flex-[1] overflow-hidden">
              {rightPane}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}