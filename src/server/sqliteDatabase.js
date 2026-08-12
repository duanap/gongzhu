'use strict';

const fs = require('fs');
const path = require('path');

function createSqliteDatabase(options = {}) {
  let DatabaseSync;
  try {
    ({ DatabaseSync } = require('node:sqlite'));
  } catch (error) {
    throw new Error('SQLite backend requires Node.js 22 or newer');
  }

  const databaseFile = options.databaseFile || path.join(__dirname, '..', '..', 'data', 'hearts.sqlite');
  if (databaseFile !== ':memory:') fs.mkdirSync(path.dirname(databaseFile), { recursive: true });
  const database = new DatabaseSync(databaseFile);
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      provider_subject TEXT UNIQUE,
      nickname TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT '',
      last_login_at TEXT NOT NULL DEFAULT '',
      last_played_at TEXT NOT NULL DEFAULT '',
      data_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS users_status_created_idx ON users(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS users_nickname_idx ON users(nickname);

    CREATE TABLE IF NOT EXISTS guests (
      guest_id TEXT PRIMARY KEY,
      nickname TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT '',
      last_played_at TEXT NOT NULL DEFAULT '',
      data_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS matches (
      match_id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL DEFAULT '',
      played_at TEXT NOT NULL DEFAULT '',
      data_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS matches_played_idx ON matches(played_at DESC, match_id DESC);
    CREATE INDEX IF NOT EXISTS matches_room_idx ON matches(room_id, played_at DESC);

    CREATE TABLE IF NOT EXISTS admins (
      admin_id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      role TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      last_login_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS admin_sessions (
      token_hash TEXT PRIMARY KEY,
      admin_id TEXT NOT NULL REFERENCES admins(admin_id) ON DELETE CASCADE,
      csrf_token TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS admin_sessions_expiry_idx ON admin_sessions(expires_at);

    CREATE TABLE IF NOT EXISTS admin_idempotency (
      admin_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      response_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(admin_id, idempotency_key)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT NOT NULL,
      admin_id TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL DEFAULT '',
      reason TEXT NOT NULL DEFAULT '',
      before_json TEXT,
      after_json TEXT,
      ip TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs(created_at DESC, audit_id DESC);

    INSERT OR IGNORE INTO schema_migrations(version, name) VALUES (1, 'initial-admin-and-player-store');
  `);

  return {
    database,
    databaseFile,
    close() {
      database.close();
    }
  };
}

module.exports = { createSqliteDatabase };
