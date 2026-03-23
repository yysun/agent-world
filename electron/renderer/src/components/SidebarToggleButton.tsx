/**
 * SidebarToggleButton Component
 * Purpose:
 * - Render the shared left-sidebar toggle control used across desktop workspace surfaces.
 *
 * Key Features:
 * - Uses a sidebar-shaped icon instead of directional chevrons.
 * - Switches label and arrow direction based on whether the sidebar is collapsed.
 * - Accepts caller-provided styling so header, editor, and sidebar surfaces stay visually consistent.
 *
 * Implementation Notes:
 * - Stateless button; parent owns the sidebar collapsed state.
 * - Keeps aria-label and title synchronized for accessibility and tests.
 *
 * Recent Changes:
 * - 2026-03-23: Initial shared toggle extracted so the skill editor can keep the sidebar control visible.
 */

import React from 'react';

export default function SidebarToggleButton({
  collapsed,
  onToggle,
  className,
  style,
}: {
  collapsed: boolean;
  onToggle: (nextCollapsed: boolean) => void;
  className: string;
  style?: React.CSSProperties;
}) {
  const label = collapsed ? 'Show sidebar' : 'Collapse sidebar';

  return (
    <button
      type="button"
      onClick={() => onToggle(!collapsed)}
      className={className}
      title={label}
      aria-label={label}
      style={style}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
        aria-hidden="true"
      >
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M9 4v16" />
        {collapsed ? (
          <polyline points="13 9 16 12 13 15" />
        ) : (
          <polyline points="15 9 12 12 15 15" />
        )}
      </svg>
    </button>
  );
}