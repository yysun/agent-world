/**
 * User Storage - User Directory and File Management
 *
 * Features:
 * - User directory creation and management
 * - User world path resolution
 * - Directory cleanup and validation
 * - Storage information and statistics
 * - File system abstraction for user data
 *
 * Directory Structure:
 * - data/users/{userId}/
 * - data/users/{userId}/worlds/{worldName}/
 * - data/users/{userId}/worlds/{worldName}/config.json
 * - data/users/{userId}/worlds/{worldName}/agents/
 *
 * Core Functions:
 * - createUserDirectory: Initialize user storage directory
 * - getUserWorldPath: Get path to user's world directory
 * - deleteUserDirectory: Clean up user storage
 * - userWorldExists: Check if user world exists
 * - getUserStorageInfo: Get user storage statistics
 *
 * Implementation:
 * - Uses Node.js fs/promises for file operations
 * - Handles path resolution and validation
 * - Provides safe directory operations
 * - Integrates with existing storage patterns
 * - Maintains separation from template worlds
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { UserStorageInfo } from '../server/websocket-types';

// User storage configuration
const USER_DATA_DIR = path.join(process.cwd(), 'data', 'users');

/**
 * Create user directory structure
 */
export async function createUserDirectory(userId: string): Promise<string> {
  const userPath = path.join(USER_DATA_DIR, userId);
  const worldsPath = path.join(userPath, 'worlds');

  try {
    // Create user directory
    await fs.mkdir(userPath, { recursive: true });

    // Create worlds subdirectory
    await fs.mkdir(worldsPath, { recursive: true });

    return userPath;
  } catch (error) {
    throw new Error(`Failed to create user directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get path to user's world directory
 */
export function getUserWorldPath(userId: string, worldName: string): string {
  return path.join(USER_DATA_DIR, userId, 'worlds', worldName);
}

/**
 * Get path to user's base directory
 */
export function getUserPath(userId: string): string {
  return path.join(USER_DATA_DIR, userId);
}

/**
 * Get path to user's worlds directory
 */
export function getUserWorldsPath(userId: string): string {
  return path.join(USER_DATA_DIR, userId, 'worlds');
}

/**
 * Check if user world exists
 */
export async function userWorldExists(userId: string, worldName: string): Promise<boolean> {
  const worldPath = getUserWorldPath(userId, worldName);

  try {
    const stats = await fs.stat(worldPath);
    return stats.isDirectory();
  } catch (error) {
    return false;
  }
}

/**
 * Check if user directory exists
 */
export async function userDirectoryExists(userId: string): Promise<boolean> {
  const userPath = getUserPath(userId);

  try {
    const stats = await fs.stat(userPath);
    return stats.isDirectory();
  } catch (error) {
    return false;
  }
}

/**
 * Delete user directory and all contents
 */
export async function deleteUserDirectory(userId: string): Promise<void> {
  const userPath = getUserPath(userId);

  try {
    await fs.rm(userPath, { recursive: true, force: true });
  } catch (error) {
    throw new Error(`Failed to delete user directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Delete specific user world
 */
export async function deleteUserWorld(userId: string, worldName: string): Promise<void> {
  const worldPath = getUserWorldPath(userId, worldName);

  try {
    await fs.rm(worldPath, { recursive: true, force: true });
  } catch (error) {
    throw new Error(`Failed to delete user world: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * List all worlds for a user
 */
export async function listUserWorlds(userId: string): Promise<string[]> {
  const worldsPath = getUserWorldsPath(userId);

  try {
    const entries = await fs.readdir(worldsPath, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);
  } catch (error) {
    // Return empty array if directory doesn't exist
    return [];
  }
}

/**
 * Get user storage information and statistics
 */
export async function getUserStorageInfo(userId: string): Promise<UserStorageInfo> {
  const userPath = getUserPath(userId);
  const worldsPath = getUserWorldsPath(userId);

  const info: UserStorageInfo = {
    userId,
    userPath,
    worldsPath,
    exists: false,
    worldCount: 0
  };

  try {
    // Check if user directory exists
    const userStats = await fs.stat(userPath);
    info.exists = userStats.isDirectory();
    info.createdAt = userStats.birthtime;

    if (info.exists) {
      // Count worlds
      const worlds = await listUserWorlds(userId);
      info.worldCount = worlds.length;
    }
  } catch (error) {
    // User directory doesn't exist
    info.exists = false;
  }

  return info;
}

/**
 * Get storage statistics for all users
 */
export async function getAllUsersStorageInfo(): Promise<UserStorageInfo[]> {
  try {
    const entries = await fs.readdir(USER_DATA_DIR, { withFileTypes: true });
    const userIds = entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);

    const storageInfos = await Promise.all(
      userIds.map(userId => getUserStorageInfo(userId))
    );

    return storageInfos;
  } catch (error) {
    // Return empty array if users directory doesn't exist
    return [];
  }
}

/**
 * Clean up empty user directories
 */
export async function cleanupEmptyUserDirectories(): Promise<number> {
  let cleanedCount = 0;

  try {
    const storageInfos = await getAllUsersStorageInfo();

    for (const info of storageInfos) {
      if (info.exists && info.worldCount === 0) {
        try {
          await deleteUserDirectory(info.userId);
          cleanedCount++;
        } catch (error) {
          console.error(`Failed to cleanup empty user directory ${info.userId}:`, error);
        }
      }
    }
  } catch (error) {
    console.error('Error during cleanup of empty user directories:', error);
  }

  return cleanedCount;
}

/**
 * Validate user ID format
 */
export function isValidUserId(userId: string): boolean {
  // Basic validation - alphanumeric, hyphens, underscores
  const validPattern = /^[a-zA-Z0-9_-]+$/;
  return validPattern.test(userId) && userId.length >= 1 && userId.length <= 64;
}

/**
 * Validate world name format
 */
export function isValidWorldName(worldName: string): boolean {
  // Basic validation - alphanumeric, hyphens, underscores, spaces
  const validPattern = /^[a-zA-Z0-9_\-\s]+$/;
  return validPattern.test(worldName) && worldName.length >= 1 && worldName.length <= 64;
}

/**
 * Ensure user data directory exists
 */
export async function ensureUserDataDirectory(): Promise<void> {
  try {
    await fs.mkdir(USER_DATA_DIR, { recursive: true });
  } catch (error) {
    throw new Error(`Failed to create user data directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get total storage usage for all users
 */
export async function getTotalStorageUsage(): Promise<number> {
  try {
    const storageInfos = await getAllUsersStorageInfo();
    let totalSize = 0;

    for (const info of storageInfos) {
      if (info.exists) {
        totalSize += await getDirectorySize(info.userPath);
      }
    }

    return totalSize;
  } catch (error) {
    console.error('Error calculating total storage usage:', error);
    return 0;
  }
}

/**
 * Get directory size recursively
 */
async function getDirectorySize(dirPath: string): Promise<number> {
  let totalSize = 0;

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        totalSize += await getDirectorySize(fullPath);
      } else {
        const stats = await fs.stat(fullPath);
        totalSize += stats.size;
      }
    }
  } catch (error) {
    // Ignore errors for individual files/directories
  }

  return totalSize;
}
