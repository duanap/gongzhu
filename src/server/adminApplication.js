'use strict';

class AdminError extends Error {
  constructor(code, message, statusCode = 400, details = null) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

const QUERY_PERMISSIONS = Object.freeze({
  overview: 'overview.read', users: 'users.read', user: 'users.read', matches: 'matches.read',
  match: 'matches.read', rooms: 'rooms.read', room: 'rooms.read', aiLearning: 'ai.read', audit: 'audit.read'
});

const COMMAND_PERMISSIONS = Object.freeze({
  updateUserStatus: 'users.moderate', disbandRoom: 'rooms.disband'
});

function createAdminApplication(options = {}) {
  const users = options.users;
  const rooms = options.rooms;
  const adminStore = options.adminStore;
  const aiLearning = options.aiLearning;
  if (!users || !rooms || !adminStore) throw new Error('users, rooms and adminStore are required');

  function authorize(actor, permission) {
    if (!adminStore.can(actor, permission)) throw new AdminError('FORBIDDEN', '权限不足', 403);
  }

  function query(request, actor) {
    const kind = request?.kind;
    authorize(actor, QUERY_PERMISSIONS[kind]);
    const params = request.params || {};
    if (kind === 'overview') return { ...users.counts(), ...rooms.counts(), aiSamples: Number(aiLearning?.getSummary?.().totalSamples || 0) };
    if (kind === 'users') return users.listUsers(params);
    if (kind === 'user') {
      const row = users.getUser(params.userId);
      if (!row) throw new AdminError('USER_NOT_FOUND', '用户不存在', 404);
      return row;
    }
    if (kind === 'matches') return users.listMatches(params);
    if (kind === 'match') {
      const row = users.getMatch(params.matchId);
      if (!row) throw new AdminError('MATCH_NOT_FOUND', '对局不存在', 404);
      return row;
    }
    if (kind === 'rooms') return rooms.list(params);
    if (kind === 'room') {
      const row = rooms.get(params.roomId, { includeSensitive: adminStore.can(actor, 'rooms.inspectSensitive') && params.includeSensitive });
      if (!row) throw new AdminError('ROOM_NOT_FOUND', '房间不存在', 404);
      return row;
    }
    if (kind === 'aiLearning') return aiLearning?.getSummary?.() || {};
    if (kind === 'audit') return adminStore.listAudit(params);
    throw new AdminError('UNKNOWN_QUERY', '不支持的查询', 400);
  }

  function execute(command, actor, context = {}) {
    const kind = command?.kind;
    authorize(actor, COMMAND_PERMISSIONS[kind]);
    const requestId = String(context.requestId || '');
    const reason = String(command.reason || '').trim().slice(0, 500);
    if (!reason) throw new AdminError('REASON_REQUIRED', '管理操作必须填写原因', 400);

    let result;
    let audit;
    if (kind === 'updateUserStatus') {
      if (!['active', 'suspended', 'banned'].includes(command.status)) {
        throw new AdminError('INVALID_USER_STATUS', '用户状态无效', 400);
      }
      if (!Number.isInteger(command.expectedVersion) || command.expectedVersion < 0) {
        throw new AdminError('EXPECTED_VERSION_REQUIRED', '必须提供当前用户版本号', 400);
      }
      if (command.status === 'suspended') {
        const expiresAt = Date.parse(String(command.expiresAt || ''));
        if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
          throw new AdminError('INVALID_SUSPENSION_EXPIRY', '停权必须设置未来的到期时间', 400);
        }
      }
      try {
        result = users.updateUserStatus(command.userId, {
          status: command.status,
          reason,
          expiresAt: command.expiresAt,
          expectedVersion: command.expectedVersion
        });
      } catch (error) {
        if (error.code === 'VERSION_CONFLICT') throw new AdminError('VERSION_CONFLICT', '用户数据已发生变化，请刷新后重试', 409);
        throw error;
      }
      if (!result) throw new AdminError('USER_NOT_FOUND', '用户不存在', 404);
      audit = { action: 'user.status.update', targetType: 'user', targetId: command.userId, before: result.before, after: result.after };
    } else if (kind === 'disbandRoom') {
      const before = rooms.get(command.roomId);
      if (!before) throw new AdminError('ROOM_NOT_FOUND', '房间不存在', 404);
      rooms.disband(command.roomId, `管理员操作：${reason}`);
      result = { ok: true, roomId: command.roomId };
      audit = { action: 'room.disband', targetType: 'room', targetId: command.roomId, before, after: null };
    } else {
      throw new AdminError('UNKNOWN_COMMAND', '不支持的管理操作', 400);
    }

    adminStore.writeAudit({
      requestId,
      adminId: actor.adminId,
      reason,
      ip: context.ip || '',
      ...audit
    });
    return result;
  }

  return { execute, query };
}

module.exports = { AdminError, createAdminApplication };
