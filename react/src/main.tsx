/**
 * Main Entry Point - React application bootstrap
 * 
 * Purpose: Initialize React app and render root component
 * 
 * Features:
 * - React 19 root API
 * - Global styles import
 * - Strict mode for development
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './styles/globals.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
