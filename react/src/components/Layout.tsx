/**
 * Layout Component - Main layout wrapper with header and navigation
 * 
 * Purpose: Consistent layout structure for all pages
 * 
 * Features:
 * - Header with site title
 * - Navigation links (to be added in Phase 7 with routing)
 * - Footer removed for cleaner design
 * - Responsive design
 * - Main content area with proper spacing
 * - shadcn design system integration
 * 
 * Implementation:
 * - Flex layout with sticky header
 * - Full height viewport
 * - Styled with Tailwind CSS and shadcn tokens
 * 
 * Changes:
 * - 2025-11-12: Removed ConnectionStatus and WebSocket dependency (now using REST API)
 * - 2025-11-04: Updated with shadcn design principles, removed footer
 * - 2025-11-03: Created for Phase 5 (adapted from Next.js pattern)
 */

import { ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Header removed: site title and Beta badge intentionally omitted */}

      {/* Main Content */}
      <main className="flex-1 w-full">
        {children}
      </main>
    </div>
  );
}
