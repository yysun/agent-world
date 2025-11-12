/**
 * Configuration - Environment variables and app settings
 * 
 * Purpose: Centralized configuration for the React frontend
 * 
 * Features:
 * - API base URL from environment
 * - Fallback defaults for development
 * 
 * Usage:
 * ```typescript
 * import { API_BASE_URL } from '@/lib/config';
 * const response = await fetch(`${API_BASE_URL}/worlds`);
 * ```
 * 
 * Changes:
 * - 2025-11-12: Updated to use API_BASE_URL instead of WS_URL for REST API
 */

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
