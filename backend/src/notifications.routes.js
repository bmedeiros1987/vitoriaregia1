const express = require('express');
const crypto = require('crypto');
const { query, rowsOf } = require('./db');

const router = express.Router();
let tablesReady = false;

function randomId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clean(value, max = 500) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, max);
}

function normalizeRole(value) {
  const text = clean(value, 80)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (['administrador', 'administradora'].includes(text)) return 'admin';
  if (['síndico', 'sindico'].includes(text)) return 'sindico';
  if (['subsíndico', 'sub-sindico', 'subsindico'].includes(text)) return 'subsindico';
  if (['porteiro', 'recepcao', 'recepção'].includes(text)) return 'portaria';
  if (['residente', 'condomino', 'condômino'].includes(text)) return 'morador';
  return text;
}

function boolEnv(name, fallback = false) {
  const value = String(process.env[name] || '').trim().toLowerCase();
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'sim', 'on'].includes(value);
}

function currentUser(req) {
  const fromMiddleware = req.user || req.auth || req.session?.user || req.session?.usuario || {};
  const body = req.body || {};
  const queryParams = req.query || {};

  const id = clean(
    fromMiddleware.id || fromMiddleware.userId || fromMiddleware.email ||
    req.headers['x-vr-user-id'] || queryParams.userId || body.userId || 'anonymous',
    160
  );

  const role = normalizeRole(
    fromMiddleware.role || fromMiddleware.perfil || fromMiddleware.tipo ||
    req.headers['x-vr-user-role'] || queryParams.role || body.role || 'morador'
  );

  const unit = clean(
    fromMiddleware.unit || fromMiddleware.unidade || fromMiddleware.apartment || fromMiddleware.apartamento ||
    req.headers['x-vr-user-unit'] || queryParams.unit || body.unit || '',
    80
  );

  const name = clean(
    fromMiddleware.name || fromMiddleware.nome || req.headers['x-vr-user-name'] || body.name || '',
    160
  );

  return { id, role, unit, name };
}

function canCreateNotification(user) {
  if (boolEnv('NOTIFICATIONS_ALLOW_INSECURE_CREATE', false)) return true;
  return ['admin', 'sindico', 'subsindico', 'portaria'].includes(normalizeRole(user.role));
}

async function ensureTables() {
  if (tablesReady) return;

  await query(`
    create table if not exists browser_notifications (
      id varchar(100) primary key,
      title varchar(180) not null,
      body text not null,
      type varchar(50) default 'geral',
      priority varchar(30) default 'normal',
      audience varchar(40) default 'all',
      target_unit varchar(80),
      target_role varchar(80),
      target_user_id varchar(160),
      url text,
      payload json,
      created_by varchar(160),
      created_at timestamp default current_timestamp
    )
  `);

  await query(`
    create table if not exists browser_notification_reads (
      notification_id varchar(100) not null,
      user_id varchar(160) not null,
      read_at timestamp default current_timestamp,
      primary key (notification_id, user_id)
    )
  `);

  tablesReady = true;
}

function mapRow(row) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    type: row.type,
    priority: row.priority,
    audience: row.audience,
    target_unit: row.target_unit || row.targetUnit,
    targetUnit: row.target_unit || row.targetUnit,
    target_role: row.target_role || row.targetRole,
    targetRole: row.target_role || row.targetRole,
    target_user_id: row.target_user_id || row.targetUserId,
    targetUserId: row.target_user_id || row.targetUserId,
    url: row.url,
    payload: row.payload || {},
    created_by: row.created_by || row.createdBy,
    createdAt: row.created_at || row.createdAt,
    created_at: row.created_at || row.createdAt,
    read: Boolean(row.read || row.is_read),
    source: 'central',
  };
}

router.get('/health', async (_req, res) => {
  try {
    await ensureTables();
    res.json({ ok: true, feature: 'browser-notifications' });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    await ensureTables();
    const user = currentUser(req);
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 100);

    const result = await query(`
      select
        n.*,
        case when r.notification_id is null then 0 else 1 end as read
      from browser_notifications n
      left join browser_notification_reads r
        on r.notification_id = n.id and r.user_id = ?
      where
        n.audience in ('all', 'geral', 'general', 'todos')
        or n.target_unit = ?
        or n.target_role = ?
        or n.target_user_id = ?
      order by n.created_at desc
      limit ${limit}
    `, [user.id, user.unit, user.role, user.id]);

    res.json({ ok: true, notifications: rowsOf(result).map(mapRow) });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    await ensureTables();
    const user = currentUser(req);
    if (!canCreateNotification(user)) {
      return res.status(403).json({
        ok: false,
        error: 'Usuário sem permissão para publicar comunicados.',
      });
    }

    const body = req.body || {};
    const id = clean(body.id, 100) || randomId();
    const title = clean(body.title || body.titulo, 180);
    const message = clean(body.body || body.message || body.mensagem, 2000);

    if (!title || !message) {
      return res.status(400).json({ ok: false, error: 'Título e mensagem são obrigatórios.' });
    }

    const notification = {
      id,
      title,
      body: message,
      type: clean(body.type || 'comunicado', 50),
      priority: clean(body.priority || 'normal', 30),
      audience: clean(body.audience || 'all', 40),
      target_unit: clean(body.targetUnit || body.target_unit || '', 80),
      target_role: normalizeRole(body.targetRole || body.target_role || ''),
      target_user_id: clean(body.targetUserId || body.target_user_id || '', 160),
      url: clean(body.url || '#comunicados', 500),
      payload: body.payload || {},
      created_by: user.id,
    };

    await query(`
      insert into browser_notifications
        (id, title, body, type, priority, audience, target_unit, target_role, target_user_id, url, payload, created_by)
      values
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      notification.id,
      notification.title,
      notification.body,
      notification.type,
      notification.priority,
      notification.audience,
      notification.target_unit || null,
      notification.target_role || null,
      notification.target_user_id || null,
      notification.url,
      JSON.stringify(notification.payload || {}),
      notification.created_by,
    ]);

    const saved = await query('select * from browser_notifications where id = ?', [notification.id]);
    res.status(201).json({ ok: true, notification: mapRow(rowsOf(saved)[0] || notification) });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/:id/read', async (req, res) => {
  try {
    await ensureTables();
    const user = currentUser(req);
    const id = clean(req.params.id, 100);
    await query(`
      insert into browser_notification_reads (notification_id, user_id, read_at)
      values (?, ?, current_timestamp)
      on duplicate key update read_at = values(read_at)
    `, [id, user.id]);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
