/**
 * Renderer Bootstrap - React Root Initialization
 *
 * Features:
 * - Mounts the desktop renderer application into #root
 * - Loads Tailwind-enabled global styles
 *
 * Implementation Notes:
 * - Uses React 19 createRoot API
 *
 * Recent Changes:
 * - 2026-02-08: Initial Vite + React bootstrap for Electron renderer
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Renderer root element not found.');
}

const root = createRoot(container);
root.render(<App />);
