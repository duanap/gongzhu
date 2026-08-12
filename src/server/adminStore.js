'use strict';

const crypto = require('crypto');
const { decodeCursor, encodeCursor } = require('./userAdminRepository');

const ROLES = Object.freeze({
  super_admin: ['*'],
  operator: ['overview.read', 'users.read', 'users.moderate', 'matches.read', 'rooms.read', 'rooms.disband', 'ai.read', 'audit.read'],
  viewer: ['overview.read', 'users.read', 'matches.read', 'rooms.read', 'ai.read']
});

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password || ''), salt, 64).toString('base64url');
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function can(admin, permission) {
  const permissions = ROLES[admin?.role] || [];
  return Boolean(admin?.active && (permissions.includes('*') || permissions.includes(permission)));
}

function createAdminStore(options = {}) {
  const database = options.database;
  if (!database) throw new Error('database is required');
  const now = options.now || (() => new Date().toISOString());
  const sessionTtlMs = Number(options.sessionTtlMs || 8 * 60 * 60 * 1000);

  function publicAdmin(row) {
    if (!row) return null;
    return {
      adminId: row.admin_id,
      username: row.username,
      role: row.role,
      active: Boolean(row.active),
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at || ''
    };
  }

  function bootstrap({ username, password, role = 'super_admin' } = {}) {
    const normalizedUsername = String(username || '').trim();
    if (!normalizedUsername || !password) {
      const configured = Number(database.prepare('SELECT COUNT(*) AS count FROM admins WHERE active = 1').get().count || 0) > 0;
      return { created: false, configured };
    }
    if (!ROLES[role]) throw new Error('invalid admin role');
    const existing = database.prepare('SELECT * FROM admins WHERE username = ?').get(normalizedUsername);
    if (existing) return { created: false, configured: true, admin: publicAdmin(existing) };
    if (String(password).length < 12) throw new Error('ADMIN_BOOTSTRAP_PASSWORD must be at least 12 characters');
    const salt = crypto.randomBytes(16).toString('base64url');
    const adminId = crypto.randomUUID();
    database.prepare(`
      INSERT INTO admins(admin_id, username, password_hash, password_salt, role, active, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `).run(adminId, normalizedUsername, hashPassword(password, salt), salt, role, now());
    return { created: true, configured: true, admin: publicAdmin(database.prepare('SELECT * FROM admins WHERE admin_id = ?').get(adminId)) };
  }

  function login(username, password) {
    const row = database.prepare('SELECT * FROM admins WHERE username = ?').get(String(username || '').trim());
    if (!row || !row.active || !safeEqual(hashPassword(password, row.password_salt), row.password_hash)) return null;
    const token = crypto.randomBytes(32).toString('base64url');
    const csrfToken = crypto.randomBytes(24).toString('base64url');
    const createdAt = now();
    const expiresAt = new Date(Date.now() + sessionTtlMs).toISOString();
    database.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').run(createdAt);
    database.prepare(`INSERT INTO admin_sessions(token_hash, admin_id, csrf_token, created_at, expires_at) VALUES (?, ?, ?, ?, ?)`)
      .run(tokenHash(token), row.admin_id, csrfToken, createdAt, expiresAt);
    database.prepare('UPDATE admins SET last_login_at = ? WHERE admin_id = ?').run(createdAt, row.admin_id);
    return { token, csrfToken, expiresAt, admin: publicAdmin({ ...row, last_login_at: createdAt }) };
  }

  function session(token) {
    const row = database.prepare(`
      SELECT s.csrf_token, s.expires_at, a.*
      FROM admin_sessions s JOIN admins a ON a.admin_id = s.admin_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND a.active = 1
    `).get(tokenHash(token), now());
    if (!row) return null;
    return { admin: publicAdmin(row), csrfToken: row.csrf_token, expiresAt: row.expires_at };
  }

  function logout(token) {
    database.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(tokenHash(token));
  }

  function writeAudit(entry) {
    database.prepare(`
      INSERT INTO audit_logs(request_id, admin_id, action, target_type, target_id, reason, before_json, after_json, ip, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.requestId, entry.adminId, entry.action, entry.targetType, entry.targetId || '', entry.reason || '',
      entry.before == null ? null : JSON.stringify(entry.before),
      entry.after == null ? null : JSON.stringify(entry.after),
      entry.ip || '', now()
    );
  }

  function idempotentResult(adminId, key) {
    if (!adminId || !key) return null;
    const row = database.prepare('SELECT response_json FROM admin_idempotency WHERE admin_id = ? AND idempotency_key = ?').get(adminId, key);
    return row ? JSON.parse(row.response_json) : null;
  }

  function saveIdempotentResult(adminId, key, response) {
    database.prepare(`
      INSERT INTO admin_idempotency(admin_id, idempotency_key, response_json, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(admin_id, idempotency_key) DO NOTHING
    `).run(adminId, key, JSON.stringify(response), now());
  }

  function listAudit({ limit = 20, cursor = '', action = '', adminId = '' } = {}) {
    const requestedLimit = Number(limit || 20);
    const safeLimit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(100, Math.floor(requestedLimit))) : 20;
    const offset = decodeCursor(cursor);
    const rows = database.prepare(`
      SELECT audit_id, request_id, admin_id, action, target_type, target_id, reason, before_json, after_json, ip, created_at
      FROM audit_logs
      WHERE (? = '' OR action = ?) AND (? = '' OR admin_id = ?)
      ORDER BY audit_id DESC LIMIT ? OFFSET ?
    `).all(action, action, adminId, adminId, safeLimit + 1, offset);
    const hasNext = rows.length > safeLimit;
    return {
      rows: rows.slice(0, safeLimit).map(row => ({
        auditId: row.audit_id, requestId: row.request_id, adminId: row.admin_id, action: row.action,
        targetType: row.target_type, targetId: row.target_id, reason: row.reason,
        before: row.before_json ? JSON.parse(row.before_json) : null,
        after: row.after_json ? JSON.parse(row.after_json) : null,
        ip: row.ip, createdAt: row.created_at
      })),
      page: { limit: safeLimit, nextCursor: hasNext ? encodeCursor(offset + safeLimit) : '' }
    };
  }

  return { bootstrap, can, idempotentResult, listAudit, login, logout, publicAdmin, saveIdempotentResult, session, writeAudit };
}

module.exports = { ROLES, can, createAdminStore, hashPassword, tokenHash };
