/**
 * User Manager - User Session and World Management
 *
 * Features:
 * - Anonymous and persistent user session management
 * - User world cloning from templates
 * - Session lifecycle and cleanup
 * - User directory structure management
 * - Integration with existing world API
 *
 * Core Functions:
 * - createUserSession: Create new user session with world clone
 * - getUserSession: Retrieve existing user session
 * - deleteUserSession: Clean up user session and data
 * - listUserWorlds: Get all worlds for a user
 * - saveUserWorld: Persist user world changes
 * - cloneWorldForUser: Clone template world for user
 *
 * Architecture:
 * - Uses existing world API without modification
 * - Handles user-specific logic internally
 * - Manages user directory structure
 * - Coordinates with world cloning system
 * - Provides clean separation between templates and user data
 *
 * User Session Flow:
 * 1. User selects template world
 * 2. System clones template to user directory
 * 3. Session tracks user world instance
 * 4. User interacts with private world copy
 * 5. Changes saved to user directory
 * 6. Session cleanup on disconnect/timeout
 */

import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import { WorldState } from './types';
import {
  createUserDirectory,
  getUserWorldPath,
  deleteUserDirectory,
  userWorldExists,
  getUserStorageInfo
} from './user-storage';
import {
  cloneTemplateWorld,
  getTemplateWorldConfig,
  templateWorldExists,
  getAvailableTemplates,
  loadUserWorld,
  saveUserWorld as saveUserWorldToDisk
} from './world-cloning';

// Type definitions
interface UserSessionOptions {
  persistent?: boolean;
}

interface UserSession {
  userId: string;
  sessionId: string;
  worldName: string;
  templateName: string;
  worldPath: string;
  isPersistent: boolean;
  createdAt: Date;
  lastAccessed: Date;
  connectionCount: number;
}

interface UserWorldInfo {
  userId: string;
  worldName: string;
  templateName: string;
  worldPath: string;
  exists: boolean;
  lastModified: Date;
}

interface CloneWorldOptions {
  overwrite?: boolean;
}

interface CloneWorldResult {
  worldPath: string;
  success: boolean;
}

interface UserStorageInfo {
  exists: boolean;
  path: string;
}

// In-memory session storage
const userSessions = new Map<string, UserSession>();
const sessionsByUserId = new Map<string, Set<string>>();

/**
 * Create a new user session with world cloning
 */
export async function createUserSession(
  userId: string,
  templateName: string,
  worldName: string,
  options: UserSessionOptions = {}
): Promise<UserSession> {
  try {
    // Validate template exists
    if (!(await templateWorldExists(templateName))) {
      throw new Error(`Template '${templateName}' not found`);
    }

    // Generate session ID
    const sessionId = uuidv4();

    // Create user directory if it doesn't exist
    await createUserDirectory(userId);

    // Check if user world already exists
    const worldExists = await userWorldExists(userId, worldName);
    let worldPath: string;

    if (worldExists) {
      // Use existing world
      worldPath = getUserWorldPath(userId, worldName);
    } else {
      // Clone template world for user
      worldPath = await cloneTemplateWorld(templateName, userId, worldName);
    }

    // Create session object
    const session: UserSession = {
      userId,
      sessionId,
      worldName,
      templateName,
      worldPath,
      isPersistent: options.persistent || false,
      createdAt: new Date(),
      lastAccessed: new Date(),
      connectionCount: 0
    };

    // Store session
    userSessions.set(sessionId, session);

    // Track sessions by user ID
    if (!sessionsByUserId.has(userId)) {
      sessionsByUserId.set(userId, new Set());
    }
    sessionsByUserId.get(userId)!.add(sessionId);

    return session;

  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to create user session: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Get existing user session
 */
export async function getUserSession(userId: string, worldName: string): Promise<UserSession | null> {
  const userSessionIds = sessionsByUserId.get(userId);
  if (!userSessionIds) {
    return null;
  }

  // Find session with matching world name
  for (const sessionId of Array.from(userSessionIds)) {
    const session = userSessions.get(sessionId);
    if (session && session.worldName === worldName) {
      // Update last accessed time
      session.lastAccessed = new Date();
      return session;
    }
  }

  return null;
}

/**
 * Get user session by session ID
 */
export async function getUserSessionById(sessionId: string): Promise<UserSession | null> {
  const session = userSessions.get(sessionId);
  if (session) {
    // Update last accessed time
    session.lastAccessed = new Date();
    return session;
  }
  return null;
}

/**
 * Delete user session and optionally clean up data
 */
export async function deleteUserSession(sessionId: string, cleanupData: boolean = false): Promise<void> {
  const session = userSessions.get(sessionId);
  if (!session) {
    return; // Session doesn't exist, nothing to do
  }

  try {
    // Remove from maps
    userSessions.delete(sessionId);
    const userSessionIds = sessionsByUserId.get(session.userId);
    if (userSessionIds) {
      userSessionIds.delete(sessionId);
      if (userSessionIds.size === 0) {
        sessionsByUserId.delete(session.userId);
      }
    }

    // Clean up user data if requested and session is not persistent
    if (cleanupData && !session.isPersistent) {
      // Check if user has any other sessions
      const hasOtherSessions = sessionsByUserId.has(session.userId);
      if (!hasOtherSessions) {
        await deleteUserDirectory(session.userId);
      }
    }

  } catch (error) {
    console.error(`Error cleaning up user session ${sessionId}:`, error);
    // Don't throw error - session deletion should always succeed
  }
}

/**
 * List all worlds for a user
 */
export async function listUserWorlds(userId: string): Promise<UserWorldInfo[]> {
  try {
    const storageInfo = await getUserStorageInfo(userId);
    if (!storageInfo.exists) {
      return [];
    }

    // Get all sessions for this user to determine template names
    const userSessionIds = sessionsByUserId.get(userId) || new Set();
    const sessions = Array.from(userSessionIds)
      .map(id => userSessions.get(id))
      .filter(Boolean) as UserSession[];

    // Build world info list
    const worldInfos: UserWorldInfo[] = [];
    for (const session of sessions) {
      const worldInfo: UserWorldInfo = {
        userId,
        worldName: session.worldName,
        templateName: session.templateName,
        worldPath: session.worldPath,
        exists: await userWorldExists(userId, session.worldName),
        lastModified: session.lastAccessed
      };
      worldInfos.push(worldInfo);
    }

    return worldInfos;

  } catch (error) {
    console.error(`Error listing user worlds for ${userId}:`, error);
    return [];
  }
}

/**
 * Save user world state
 */
export async function saveUserWorld(
  userId: string,
  worldName: string,
  worldState: WorldState
): Promise<void> {
  try {
    await saveUserWorldToDisk(userId, worldName, worldState);
  } catch (error) {
    throw new Error(`Failed to save user world: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Clone world from template for user
 */
export async function cloneWorldForUser(
  userId: string,
  templateName: string,
  worldName: string
): Promise<WorldState> {
  try {
    await cloneTemplateWorld(templateName, userId, worldName);

    // Load the cloned world state
    const worldState = await loadUserWorld(userId, worldName);
    return worldState;

  } catch (error) {
    throw new Error(`Failed to clone world for user: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Update session connection count
 */
export function incrementConnectionCount(sessionId: string): void {
  const session = userSessions.get(sessionId);
  if (session) {
    session.connectionCount++;
    session.lastAccessed = new Date();
  }
}

export function decrementConnectionCount(sessionId: string): void {
  const session = userSessions.get(sessionId);
  if (session) {
    session.connectionCount = Math.max(0, session.connectionCount - 1);
    session.lastAccessed = new Date();
  }
}

/**
 * Get all active sessions
 */
export function getActiveSessions(): UserSession[] {
  return Array.from(userSessions.values());
}

/**
 * Get sessions for a specific user
 */
export function getUserSessions(userId: string): UserSession[] {
  const userSessionIds = sessionsByUserId.get(userId);
  if (!userSessionIds) {
    return [];
  }

  return Array.from(userSessionIds)
    .map(id => userSessions.get(id))
    .filter(Boolean) as UserSession[];
}

/**
 * Clean up inactive sessions
 */
export async function cleanupInactiveSessions(maxIdleTime: number = 30 * 60 * 1000): Promise<number> {
  const now = new Date();
  const sessionsToDelete: string[] = [];

  for (const [sessionId, session] of Array.from(userSessions.entries())) {
    const idleTime = now.getTime() - session.lastAccessed.getTime();
    if (idleTime > maxIdleTime && session.connectionCount === 0) {
      sessionsToDelete.push(sessionId);
    }
  }

  // Delete inactive sessions
  for (const sessionId of sessionsToDelete) {
    await deleteUserSession(sessionId, true); // Clean up data for non-persistent sessions
  }

  return sessionsToDelete.length;
}

/**
 * Get session statistics
 */
export function getSessionStats() {
  const totalSessions = userSessions.size;
  const activeSessions = Array.from(userSessions.values())
    .filter(session => session.connectionCount > 0).length;
  const persistentSessions = Array.from(userSessions.values())
    .filter(session => session.isPersistent).length;
  const totalUsers = sessionsByUserId.size;

  return {
    totalSessions,
    activeSessions,
    persistentSessions,
    totalUsers
  };
}

/**
 * Test helper: Clear all sessions (for testing only)
 * @internal
 */
export function _clearAllSessionsForTesting(): void {
  userSessions.clear();
  sessionsByUserId.clear();
}
