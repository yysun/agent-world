/**
 * Web App Entry Point
 *
 * Purpose:
 * - Bootstrap AppRun layout and page route registration for the web client.
 *
 * Key Features:
 * - Registers primary routes for Home, World, and Settings pages.
 * - Loads global Tailwind, Doodle CSS, and app style layers.
 *
 * Implementation Notes:
 * - Routing is intentionally centralized in this module for predictable page wiring.
 *
 * Recent Changes:
 * - 2026-02-19: Enabled `/Settings` route for MVP parity requirements.
 */

import app from 'apprun';
import Layout from './components/Layout';
import Home from './pages/Home';
import World from './pages/World';
import Settings from './pages/Settings';

import './tailwind.css';
import 'doodle.css/doodle.css';
import './styles.css';

app.render('#root', <Layout />);
app.addComponents('#pages', {
  '/': Home,
  '/World': World,
  '/Settings': Settings,
});
