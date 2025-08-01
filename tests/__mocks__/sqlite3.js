/**
 * Mock implementation of sqlite3 for testing
 */

class MockSQLiteStatement {
  constructor(sql, db) {
    this.sql = sql;
    this.db = db;
  }

  run(...params) {
    this.db.executeSQL(this.sql, params, (err, result) => {
      // Statement run doesn't return results, just executes
    });
    return this;
  }

  get(...params) {
    this.db.executeSQL(this.sql, params, (err, result) => {
      // Statement get returns first row
    });
    return this;
  }

  all(...params) {
    this.db.executeSQL(this.sql, params, (err, result) => {
      // Statement all returns all rows
    });
    return this;
  }

  finalize() {
    // No-op for mock
  }
}

class MockSQLiteDatabase {
  constructor(filename) {
    this.tables = new Map();
    this.autoIncrementCounters = new Map();
    this.inTransaction = false;
    this.transactionRollback = false;

    // Initialize common tables
    this.tables.set('worlds', new Map());
    this.tables.set('agents', new Map());
    this.tables.set('chats', new Map());
    this.tables.set('snapshots', new Map());

    // Set up auto-increment counters
    this.autoIncrementCounters.set('chats', 0);
    this.autoIncrementCounters.set('snapshots', 0);
  }

  serialize(callback) {
    process.nextTick(callback);
  }

  parallelize(callback) {
    process.nextTick(callback);
  }

  run(sql, ...params) {
    const callback = params[params.length - 1];
    const sqlParams = params.slice(0, -1);

    if (typeof callback === 'function') {
      this.executeSQL(sql, sqlParams, callback);
    } else {
      this.executeSQL(sql, params, () => { });
    }
    return this;
  }

  get(sql, ...params) {
    const callback = params[params.length - 1];
    const sqlParams = params.slice(0, -1);

    if (typeof callback === 'function') {
      this.executeSQL(sql, sqlParams, (err, rows) => {
        callback(err, rows && rows.length > 0 ? rows[0] : undefined);
      });
    }
    return this;
  }

  all(sql, ...params) {
    const callback = params[params.length - 1];
    const sqlParams = params.slice(0, -1);

    if (typeof callback === 'function') {
      this.executeSQL(sql, sqlParams, callback);
    }
    return this;
  }

  prepare(sql) {
    return new MockSQLiteStatement(sql, this);
  }

  close(callback) {
    if (callback) {
      process.nextTick(() => callback(null));
    }
  }

  on(event, callback) {
    // Mock event handlers - no-op
  }

  executeSQL(sql, params, callback) {
    process.nextTick(() => {
      try {
        const normalizedSQL = sql.trim().toUpperCase();

        if (normalizedSQL.startsWith('PRAGMA')) {
          callback(null, []);
          return;
        }

        if (normalizedSQL.startsWith('BEGIN')) {
          this.inTransaction = true;
          this.transactionRollback = false;
          callback(null, []);
          return;
        }

        if (normalizedSQL.startsWith('COMMIT')) {
          this.inTransaction = false;
          callback(null, []);
          return;
        }

        if (normalizedSQL.startsWith('ROLLBACK')) {
          this.inTransaction = false;
          this.transactionRollback = true;
          callback(null, []);
          return;
        }

        if (normalizedSQL.includes('CREATE TABLE')) {
          const tableMatch = sql.match(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)/i);
          if (tableMatch) {
            const tableName = tableMatch[1];
            if (!this.tables.has(tableName)) {
              this.tables.set(tableName, new Map());
            }
          }
          callback(null, []);
          return;
        }

        if (normalizedSQL.startsWith('INSERT')) {
          this.handleInsert(sql, params, callback);
          return;
        }

        if (normalizedSQL.startsWith('SELECT')) {
          this.handleSelect(sql, params, callback);
          return;
        }

        if (normalizedSQL.startsWith('UPDATE')) {
          this.handleUpdate(sql, params, callback);
          return;
        }

        if (normalizedSQL.startsWith('DELETE')) {
          this.handleDelete(sql, params, callback);
          return;
        }

        callback(null, []);
      } catch (error) {
        callback(error);
      }
    });
  }

  handleInsert(sql, params, callback) {
    if (sql.includes('chats')) {
      const table = this.tables.get('chats');
      const id = this.autoIncrementCounters.get('chats') + 1;
      this.autoIncrementCounters.set('chats', id);

      const chat = {
        id: params[0] || `chat-${id}`,
        worldId: params[1] || 'test-world',
        name: params[2] || 'Test Chat',
        description: params[3] || null,
        createdAt: params[4] || new Date().toISOString(),
        updatedAt: params[5] || new Date().toISOString(),
        messageCount: params[6] || 0,
        summary: params[7] || null,
        tags: params[8] ? JSON.stringify(params[8]) : null
      };
      table.set(chat.id, chat);
    } else if (sql.includes('snapshots')) {
      const table = this.tables.get('snapshots');
      const snapshot = {
        id: this.autoIncrementCounters.get('snapshots') + 1,
        chatId: params[0],
        worldId: params[1],
        snapshotData: params[2]
      };
      this.autoIncrementCounters.set('snapshots', snapshot.id);
      table.set(`${snapshot.chatId}-${snapshot.worldId}`, snapshot);
    }
    callback(null, []);
  }

  handleSelect(sql, params, callback) {
    if (sql.includes('chats')) {
      const table = this.tables.get('chats');
      const rows = Array.from(table.values());

      if (sql.includes('WHERE id = ?') && params[0]) {
        const chat = table.get(params[0]);
        callback(null, chat ? [chat] : []);
      } else if (sql.includes('WHERE worldId = ?') && params[0]) {
        const filtered = rows.filter(row => row.worldId === params[0]);
        callback(null, filtered);
      } else {
        callback(null, rows);
      }
    } else if (sql.includes('snapshots')) {
      const table = this.tables.get('snapshots');
      const rows = Array.from(table.values());

      if (sql.includes('WHERE chatId = ?') && params[0]) {
        const filtered = rows.filter(row => row.chatId === params[0]);
        callback(null, filtered);
      } else {
        callback(null, rows);
      }
    } else {
      callback(null, []);
    }
  }

  handleUpdate(sql, params, callback) {
    if (sql.includes('chats') && sql.includes('WHERE id = ?')) {
      const table = this.tables.get('chats');
      const chatId = params[params.length - 1];
      const existingChat = table.get(chatId);

      if (existingChat) {
        const updatedChat = { ...existingChat };
        if (sql.includes('name = ?')) updatedChat.name = params[0];
        if (sql.includes('description = ?')) updatedChat.description = params[1];
        if (sql.includes('updatedAt = ?')) updatedChat.updatedAt = params[2];
        if (sql.includes('messageCount = ?')) updatedChat.messageCount = params[3];
        if (sql.includes('summary = ?')) updatedChat.summary = params[4];
        if (sql.includes('tags = ?')) updatedChat.tags = params[5];

        table.set(chatId, updatedChat);
      }
    }
    callback(null, []);
  }

  handleDelete(sql, params, callback) {
    if (sql.includes('chats') && sql.includes('WHERE id = ?') && params[0]) {
      const table = this.tables.get('chats');
      table.delete(params[0]);
    } else if (sql.includes('snapshots') && sql.includes('WHERE chatId = ?') && params[0]) {
      const table = this.tables.get('snapshots');
      const keys = Array.from(table.keys()).filter(key => key.startsWith(`${params[0]}-`));
      keys.forEach(key => table.delete(key));
    }
    callback(null, []);
  }
}

const mockSqlite3 = {
  Database: MockSQLiteDatabase,
  OPEN_READWRITE: 1,
  OPEN_CREATE: 2,
  OPEN_FULLMUTEX: 4,
  cached: {
    Database: MockSQLiteDatabase
  }
};

module.exports = mockSqlite3;
