/**
 * Utility functions for common operations
 */

/**
 * Generate initials from a name for avatar display
 * @param {string} name - The name to generate initials from
 * @returns {string} The initials (2 characters max)
 */
export function getAvatarInitials(name) {
  if (!name) return '?';
  const words = name.trim().split(' ');
  if (words.length === 1) {
    return words[0].substring(0, 2).toUpperCase();
  }
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/**
 * Generate a consistent color for an avatar based on name
 * @param {string} name - The name to generate color for
 * @returns {string} A hex color string
 */
export function getAvatarColor(name) {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57',
    '#FF9FF3', '#54A0FF', '#5F27CD', '#00D2D3', '#FF9F43',
    '#10AC84', '#EE5A24', '#0984E3', '#6C5CE7', '#A29BFE'
  ];

  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }

  return colors[Math.abs(hash) % colors.length];
}
