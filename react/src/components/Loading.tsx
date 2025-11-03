/**
 * Loading Component - Generic loading spinner
 * 
 * Purpose: Reusable loading indicator for async operations
 * 
 * Features:
 * - Animated spinner with customizable size
 * - Optional loading text message
 * - Centered layout
 * - Accessible with aria-label
 * 
 * Implementation:
 * - CSS animation for spinner rotation
 * - Tailwind CSS for styling
 * - Small, medium, large size variants
 * 
 * Changes:
 * - 2025-11-03: Created for Phase 5 (new component)
 */

interface LoadingProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function Loading({ message = 'Loading...', size = 'md', className = '' }: LoadingProps) {
  const sizeClasses = {
    sm: 'w-6 h-6 border-2',
    md: 'w-10 h-10 border-3',
    lg: 'w-16 h-16 border-4'
  };

  return (
    <div className={`flex flex-col items-center justify-center p-8 ${className}`}>
      <div
        className={`${sizeClasses[size]} border-primary border-t-transparent rounded-full animate-spin`}
        role="status"
        aria-label={message}
      />
      {message && (
        <p className="mt-4 text-sm text-muted-foreground font-sans">{message}</p>
      )}
    </div>
  );
}
