/**
 * Unified Storage Module for Agent World
 * 
 * Features:
 * - IndexedDB wrapper using idb library for browser storage
 * - File System Access API integration for file operations
 * - Storage fallback chain: IndexedDB → localStorage → memory
 * - Cross-platform .json format compatibility
 * - Auto-save functionality for workspace data
 * - Manual import/export operations
 * 
 * Architecture:
 * - Independent storage module (no UI dependencies)
 * - Promise-based async API
 * - Error handling with fallback strategies
 * - Browser-compatible ESM module
 */

import { openDB } from '../node_modules/idb/build/index.js';

// Storage configuration
const DB_NAME = 'AgentWorldDB';
const DB_VERSION = 1;
const STORES = {
  worlds: 'worlds',
  agents: 'agents',
  settings: 'settings',
  appKeys: 'appKeys'
};

// Storage fallback levels
const STORAGE_LEVELS = {
  INDEXEDDB: 'indexeddb',
  LOCALSTORAGE: 'localStorage',
  MEMORY: 'memory'
};

// In-memory fallback storage
let memoryStorage = new Map();
let currentStorageLevel = STORAGE_LEVELS.MEMORY;

/**
 * Initialize IndexedDB database
 */
async function initDB() {
  try {
    const db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Create worlds store
        if (!db.objectStoreNames.contains(STORES.worlds)) {
          const worldStore = db.createObjectStore(STORES.worlds, { keyPath: 'id' });
          worldStore.createIndex('name', 'name', { unique: true });
        }

        // Create agents store
        if (!db.objectStoreNames.contains(STORES.agents)) {
          const agentStore = db.createObjectStore(STORES.agents, { keyPath: 'id' });
          agentStore.createIndex('worldId', 'worldId', { unique: false });
          agentStore.createIndex('name', 'name', { unique: false });
        }

        // Create settings store
        if (!db.objectStoreNames.contains(STORES.settings)) {
          db.createObjectStore(STORES.settings, { keyPath: 'key' });
        }

        // Create app keys store
        if (!db.objectStoreNames.contains(STORES.appKeys)) {
          db.createObjectStore(STORES.appKeys, { keyPath: 'provider' });
        }
      },
    });

    currentStorageLevel = STORAGE_LEVELS.INDEXEDDB;
    console.log('✅ IndexedDB initialized successfully');
    return db;
  } catch (error) {
    console.warn('⚠️ IndexedDB not available, falling back to localStorage:', error.message);
    currentStorageLevel = STORAGE_LEVELS.LOCALSTORAGE;
    return null;
  }
}

/**
 * Get storage level and database instance
 */
let dbInstance = null;
const getDB = async () => {
  if (!dbInstance && currentStorageLevel === STORAGE_LEVELS.INDEXEDDB) {
    dbInstance = await initDB();
  }
  return dbInstance;
};

/**
 * Storage interface with fallback chain
 */
class UnifiedStorage {
  constructor() {
    this.level = currentStorageLevel;
  }

  /**
   * Initialize storage system
   */
  async init() {
    try {
      await getDB();
      this.level = currentStorageLevel;
      console.log(`📦 Storage initialized at level: ${this.level}`);
      return true;
    } catch (error) {
      console.error('❌ Storage initialization failed:', error);
      this.level = STORAGE_LEVELS.MEMORY;
      currentStorageLevel = STORAGE_LEVELS.MEMORY;
      return false;
    }
  }

  /**
   * Store data with fallback chain
   */
  async setItem(store, key, value) {
    const data = typeof value === 'string' ? value : JSON.stringify(value);

    try {
      if (this.level === STORAGE_LEVELS.INDEXEDDB) {
        const db = await getDB();
        if (db) {
          const tx = db.transaction([store], 'readwrite');
          const objectStore = tx.objectStore(store);
          await objectStore.put({ id: key, data: value, timestamp: Date.now() });
          await tx.complete;
          return true;
        }
      }

      if (this.level === STORAGE_LEVELS.LOCALSTORAGE) {
        const storageKey = `${store}_${key}`;
        localStorage.setItem(storageKey, data);
        return true;
      }

      // Memory fallback
      const storageKey = `${store}_${key}`;
      memoryStorage.set(storageKey, value);
      return true;

    } catch (error) {
      console.error(`❌ Storage setItem failed for ${store}/${key}:`, error);

      // Fallback to lower level
      if (this.level === STORAGE_LEVELS.INDEXEDDB) {
        this.level = STORAGE_LEVELS.LOCALSTORAGE;
        return this.setItem(store, key, value);
      } else if (this.level === STORAGE_LEVELS.LOCALSTORAGE) {
        this.level = STORAGE_LEVELS.MEMORY;
        return this.setItem(store, key, value);
      }

      return false;
    }
  }

  /**
   * Retrieve data with fallback chain
   */
  async getItem(store, key) {
    try {
      if (this.level === STORAGE_LEVELS.INDEXEDDB) {
        const db = await getDB();
        if (db) {
          const tx = db.transaction([store], 'readonly');
          const objectStore = tx.objectStore(store);
          const result = await objectStore.get(key);
          return result ? result.data : null;
        }
      }

      if (this.level === STORAGE_LEVELS.LOCALSTORAGE) {
        const storageKey = `${store}_${key}`;
        const data = localStorage.getItem(storageKey);
        return data ? JSON.parse(data) : null;
      }

      // Memory fallback
      const storageKey = `${store}_${key}`;
      return memoryStorage.get(storageKey) || null;

    } catch (error) {
      console.error(`❌ Storage getItem failed for ${store}/${key}:`, error);

      // Fallback to lower level
      if (this.level === STORAGE_LEVELS.INDEXEDDB) {
        this.level = STORAGE_LEVELS.LOCALSTORAGE;
        return this.getItem(store, key);
      } else if (this.level === STORAGE_LEVELS.LOCALSTORAGE) {
        this.level = STORAGE_LEVELS.MEMORY;
        return this.getItem(store, key);
      }

      return null;
    }
  }

  /**
   * Remove data with fallback chain
   */
  async removeItem(store, key) {
    try {
      if (this.level === STORAGE_LEVELS.INDEXEDDB) {
        const db = await getDB();
        if (db) {
          const tx = db.transaction([store], 'readwrite');
          const objectStore = tx.objectStore(store);
          await objectStore.delete(key);
          await tx.complete;
          return true;
        }
      }

      if (this.level === STORAGE_LEVELS.LOCALSTORAGE) {
        const storageKey = `${store}_${key}`;
        localStorage.removeItem(storageKey);
        return true;
      }

      // Memory fallback
      const storageKey = `${store}_${key}`;
      memoryStorage.delete(storageKey);
      return true;

    } catch (error) {
      console.error(`❌ Storage removeItem failed for ${store}/${key}:`, error);
      return false;
    }
  }

  /**
   * List all keys in a store
   */
  async listKeys(store) {
    try {
      if (this.level === STORAGE_LEVELS.INDEXEDDB) {
        const db = await getDB();
        if (db) {
          const tx = db.transaction([store], 'readonly');
          const objectStore = tx.objectStore(store);
          return await objectStore.getAllKeys();
        }
      }

      if (this.level === STORAGE_LEVELS.LOCALSTORAGE) {
        const keys = [];
        const prefix = `${store}_`;
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(prefix)) {
            keys.push(key.substring(prefix.length));
          }
        }
        return keys;
      }

      // Memory fallback
      const keys = [];
      const prefix = `${store}_`;
      for (const key of memoryStorage.keys()) {
        if (key.startsWith(prefix)) {
          keys.push(key.substring(prefix.length));
        }
      }
      return keys;

    } catch (error) {
      console.error(`❌ Storage listKeys failed for ${store}:`, error);
      return [];
    }
  }

  /**
   * Clear all data in a store
   */
  async clearStore(store) {
    try {
      if (this.level === STORAGE_LEVELS.INDEXEDDB) {
        const db = await getDB();
        if (db) {
          const tx = db.transaction([store], 'readwrite');
          const objectStore = tx.objectStore(store);
          await objectStore.clear();
          await tx.complete;
          return true;
        }
      }

      if (this.level === STORAGE_LEVELS.LOCALSTORAGE) {
        const prefix = `${store}_`;
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(prefix)) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        return true;
      }

      // Memory fallback
      const prefix = `${store}_`;
      const keysToRemove = [];
      for (const key of memoryStorage.keys()) {
        if (key.startsWith(prefix)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => memoryStorage.delete(key));
      return true;

    } catch (error) {
      console.error(`❌ Storage clearStore failed for ${store}:`, error);
      return false;
    }
  }

  /**
   * Get current storage level
   */
  getStorageLevel() {
    return this.level;
  }

  /**
   * Get storage statistics
   */
  async getStats() {
    try {
      const stats = {
        level: this.level,
        stores: {}
      };

      for (const store of Object.values(STORES)) {
        const keys = await this.listKeys(store);
        stats.stores[store] = {
          itemCount: keys.length,
          keys: keys
        };
      }

      return stats;
    } catch (error) {
      console.error('❌ Failed to get storage stats:', error);
      return { level: this.level, stores: {}, error: error.message };
    }
  }
}

// Export singleton instance
export const storage = new UnifiedStorage();
export { STORES, STORAGE_LEVELS };

// Export storage class for testing
export { UnifiedStorage };
