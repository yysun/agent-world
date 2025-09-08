import { promisify } from 'util';
import * as path from 'path';
import * as os from 'os';
import type { Database } from 'sqlite3';
import { createSQLiteSchemaContext, SQLiteConfig } from './sqlite-schema.js';

export interface AuthSession {
  id: string;
  clientId?: string | null;
  codeVerifier?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  idToken?: string | null;
  expiresAt?: number | null;
  scope?: string | null;
  userinfo?: any | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

async function getCtx() {
  const dbPath = process.env.AGENT_WORLD_SQLITE_DATABASE || path.join(os.homedir(), 'agent-world', 'database.db');
  const cfg: SQLiteConfig = { database: dbPath };
  const ctx = await createSQLiteSchemaContext(cfg);
  return ctx;
}

export async function ensureSessionsTable(ctx: Awaited<ReturnType<typeof getCtx>>) {
  const db: Database = ctx.db;
  const run = promisify(db.run.bind(db));
  const sql = `
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      client_id TEXT,
      code_verifier TEXT,
      access_token TEXT,
      refresh_token TEXT,
      id_token TEXT,
      expires_at INTEGER,
      scope TEXT,
      userinfo TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
  `;
  await run(sql);
}

export async function saveSession(session: AuthSession): Promise<void> {
  const schemaCtx = await getCtx();
  const db: Database = schemaCtx.db;
  const run = promisify(db.run.bind(db));
  await ensureSessionsTable(schemaCtx);
  const now = new Date().toISOString();
  const sql = `
    INSERT INTO sessions (id, client_id, code_verifier, access_token, refresh_token, id_token, expires_at, scope, userinfo, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM sessions WHERE id = ?), ?), ?)
    ON CONFLICT(id) DO UPDATE SET
      client_id = excluded.client_id,
      code_verifier = excluded.code_verifier,
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      id_token = excluded.id_token,
      expires_at = excluded.expires_at,
      scope = excluded.scope,
      userinfo = excluded.userinfo,
      updated_at = excluded.updated_at;
  `;
  const params = [
    session.id,
    session.clientId || null,
    session.codeVerifier || null,
    session.accessToken || null,
    session.refreshToken || null,
    session.idToken || null,
    session.expiresAt ?? null,
    session.scope || null,
    session.userinfo ? JSON.stringify(session.userinfo) : null,
    session.id,
    session.createdAt || now,
    session.updatedAt || now
  ];
  await run(sql, params);
}

export async function loadSession(id: string): Promise<AuthSession | null> {
  const schemaCtx = await getCtx();
  const db: Database = schemaCtx.db;
  const get = promisify(db.get.bind(db));
  await ensureSessionsTable(schemaCtx);
  const row: any = await get('SELECT * FROM sessions WHERE id = ?', [id]);
  if (!row) return null;
  return {
    id: row.id,
    clientId: row.client_id,
    codeVerifier: row.code_verifier,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    idToken: row.id_token,
    expiresAt: row.expires_at,
    scope: row.scope,
    userinfo: row.userinfo ? JSON.parse(row.userinfo) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function deleteSession(id: string): Promise<void> {
  const schemaCtx = await getCtx();
  const db: Database = schemaCtx.db;
  const run = promisify(db.run.bind(db));
  await ensureSessionsTable(schemaCtx);
  await run('DELETE FROM sessions WHERE id = ?', [id]);
}