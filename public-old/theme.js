/**
 * Theme Management Component
 * 
 * Features:
 * - Light/Dark/System theme switching
 * - Theme persistence in localStorage
 * - Dynamic theme application
 * - Theme icons for UI
 * 
 * Implementation:
 * - Function-based theme utilities
 * - CSS custom property manipulation
 * - System theme detection support
 */

const toggleTheme = (state) => {
  const themes = ['light', 'dark', 'system'];
  const currentIndex = themes.indexOf(state.theme || 'system');
  const newTheme = themes[(currentIndex + 1) % themes.length];
  localStorage.setItem('theme', newTheme);
  applyTheme(newTheme);
  return { ...state, theme: newTheme };
};

const applyTheme = (theme) => {
  const root = document.documentElement;
  root.removeAttribute('data-theme');

  if (theme === 'dark') {
    root.setAttribute('data-theme', 'dark');
  } else if (theme === 'light') {
    root.setAttribute('data-theme', 'light');
  }
  // For 'system', we don't set data-theme, letting CSS media query handle it
};

const getThemeIcon = (theme) => {
  switch (theme) {
    case 'light':
      return html`
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="5"/>
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
        </svg>
      `;
    case 'dark':
      return html`
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      `;
    case 'system':
      return html`
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
          <line x1="8" y1="21" x2="16" y2="21"/>
          <line x1="12" y1="17" x2="12" y2="21"/>
        </svg>
      `;
    default:
      return html`
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
          <line x1="8" y1="21" x2="16" y2="21"/>
          <line x1="12" y1="17" x2="12" y2="21"/>
        </svg>
      `;
  }
};

// Export theme functions
export { toggleTheme, applyTheme, getThemeIcon };
