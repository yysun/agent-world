/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Short Stack"', 'cursive'],
      },
      colors: {
        bg: {
          primary: '#ffffff',
          secondary: '#f8f9fa',
          tertiary: '#f7fafc',
          accent: '#f1f5f9',
        },
        border: {
          primary: '#e2e8f0',
          secondary: '#cbd5e0',
          accent: '#475569',
        },
        text: {
          primary: '#2d3748',
          secondary: '#4a5568',
          tertiary: '#718096',
          quaternary: '#a0aec0',
        },
        accent: {
          primary: '#475569',
          secondary: '#334155',
        },
        message: {
          user: '#e2e8f0',
          agent: '#2196f3',
          cross: '#ff9800',
          memory: '#9e9e9e',
          system: '#e53935',
        },
      },
      screens: {
        'mobile': '480px',
        'tablet': '600px',
        'desktop': '768px',
      },
      boxShadow: {
        'sm': '0 1px 2px rgba(0, 0, 0, 0.05)',
        'md': '0 2px 8px rgba(0, 0, 0, 0.05)',
        'lg': '0 4px 12px rgba(0, 0, 0, 0.1)',
        'xl': '0 4px 20px rgba(71, 85, 105, 0.2)',
      },
    },
  },
  plugins: [],
  // CRITICAL: Preserve Doodle CSS specificity
  corePlugins: {
    preflight: false, // Disable Tailwind's base reset
  },
}
