const { serializeId } = require('../utils');

const LOGS_COLLECTION = 'audit_logs';

async function logAction(db, { actorName, actorRole, action, targetType, targetId = null, metadata = {} }) {
  await db.collection(LOGS_COLLECTION).insertOne({
    action,
    actor_name: actorName,
    actor_role: actorRole,
    target_type: targetType,
    target_id: targetId,
    metadata,
    created_at: new Date(),
  });
}

function serializeLog(document) {
  return {
    id: serializeId(document._id),
    action: document.action,
    actor_name: document.actor_name,
    actor_role: document.actor_role,
    target_type: document.target_type,
    target_id: document.target_id ?? null,
    metadata: document.metadata || {},
    created_at: document.created_at,
  };
}

async function listLogs(db, limit = 100) {
  const logs = await db
    .collection(LOGS_COLLECTION)
    .find({})
    .sort({ created_at: -1 })
    .limit(limit)
    .toArray();

  return logs.map(serializeLog);
}

module.exports = {
  LOGS_COLLECTION,
  listLogs,
  logAction,
};
