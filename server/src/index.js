import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import nodemailer from 'nodemailer';
import sgMail from '@sendgrid/mail';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const APP_VERSION = process.env.APP_VERSION || 'Vitória Régia Pro v6.9';
const JWT_SECRET = process.env.JWT_SECRET || 'troque-este-segredo-em-producao';
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://localhost/vitoriaregia';
const DB_SSL_MODE = String(process.env.DATABASE_SSL_MODE || process.env.DATABASE_SSL || 'auto').trim().toLowerCase();
let pool;

function maskDatabaseUrl(value = '') {
  try {
    const u = new URL(value);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return value.replace(/:\/\/([^:\/\s]+):([^@\s]+)@/, '://$1:***@');
  }
}

function removeSslQueryParams(value = '') {
  try {
    const u = new URL(value);
    ['sslmode', 'sslcert', 'sslkey', 'sslrootcert'].forEach((key) => u.searchParams.delete(key));
    return u.toString();
  } catch {
    return value
      .replace(/[?&](sslmode|sslcert|sslkey|sslrootcert)=[^&]*/gi, '')
      .replace(/\?&/, '?')
      .replace(/[?&]$/, '');
  }
}

function urlSslMode(value = '') {
  try {
    return new URL(value).searchParams.get('sslmode')?.toLowerCase() || '';
  } catch {
    const m = value.match(/[?&]sslmode=([^&]+)/i);
    return m ? decodeURIComponent(m[1]).toLowerCase() : '';
  }
}

function looksLikeExternalCloudDb(value = '') {
  try {
    const host = new URL(value).hostname;
    return /render\.com|neon\.tech|supabase\.co|railway\.app|amazonaws\.com|azure\.com|googleusercontent\.com|aivencloud\.com/i.test(host);
  } catch {
    return /render\.com|neon\.tech|supabase\.co|railway\.app|amazonaws\.com|azure\.com|googleusercontent\.com|aivencloud\.com/i.test(value);
  }
}

function preferredSslAttempts() {
  const sslMode = urlSslMode(DATABASE_URL);
  const noSslFirst = [false, true];
  const sslFirst = [true, false];

  if (['0', 'false', 'no', 'off', 'disable', 'disabled'].includes(DB_SSL_MODE)) return noSslFirst;
  if (['1', 'true', 'yes', 'on', 'require', 'required'].includes(DB_SSL_MODE)) return sslFirst;
  if (['prefer', 'preferred'].includes(DB_SSL_MODE)) return sslFirst;
  if (sslMode === 'disable') return noSslFirst;
  if (['require', 'prefer', 'verify-ca', 'verify-full', 'no-verify'].includes(sslMode)) return sslFirst;
  if (looksLikeExternalCloudDb(DATABASE_URL)) return sslFirst;
  return noSslFirst;
}

function poolConfig(sslEnabled) {
  // Removemos sslmode da URL para evitar conflito com a configuração explícita do node-postgres.
  return {
    connectionString: removeSslQueryParams(DATABASE_URL),
    ssl: sslEnabled ? { rejectUnauthorized: false } : false,
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT || 30000),
    connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT || 15000)
  };
}

function isRetryableSslError(error) {
  const message = String(error?.message || error || '');
  return /ssl|tls|certificate|self[- ]signed|handshake|no pg_hba\.conf entry|encryption/i.test(message);
}

async function createConnectedPool() {
  const attempts = [...new Set(preferredSslAttempts())];
  let lastError;

  for (const sslEnabled of attempts) {
    const candidate = new Pool(poolConfig(sslEnabled));
    try {
      await candidate.query('SELECT 1');
      console.log(`Banco conectado ${sslEnabled ? 'com SSL/TLS' : 'sem SSL/TLS'}: ${maskDatabaseUrl(DATABASE_URL)}`);
      return candidate;
    } catch (error) {
      lastError = error;
      await candidate.end().catch(() => null);
      console.warn(`Tentativa de banco ${sslEnabled ? 'com SSL/TLS' : 'sem SSL/TLS'} falhou: ${error.message}`);
      if (!isRetryableSslError(error)) break;
    }
  }

  throw lastError;
}

app.use(cors({ origin: process.env.CORS_ORIGIN || true, credentials: true }));
app.use(express.json({ limit: '10mb' }));

async function q(sql, params = []) {
  if (!pool) throw new Error('Banco ainda não inicializado.');
  return pool.query(sql, params);
}

async function init() {
  await q(`
CREATE TABLE IF NOT EXISTS users(
  id SERIAL PRIMARY KEY,
  name TEXT,
  email TEXT UNIQUE,
  password_hash TEXT,
  role TEXT DEFAULT 'sindico',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS residents(
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  unit TEXT,
  phone TEXT,
  email TEXT,
  document TEXT,
  vehicle TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS packages(
  id SERIAL PRIMARY KEY,
  tracking TEXT,
  recipient TEXT,
  unit TEXT,
  status TEXT DEFAULT 'pendente',
  label TEXT,
  photo_url TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT now(),
  delivered_at TIMESTAMP
);
CREATE TABLE IF NOT EXISTS visitors(
  id SERIAL PRIMARY KEY,
  name TEXT,
  document TEXT,
  unit TEXT,
  authorized_by TEXT,
  status TEXT DEFAULT 'autorizado',
  plate TEXT,
  created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS reservations(
  id SERIAL PRIMARY KEY,
  area TEXT,
  unit TEXT,
  resident TEXT,
  reserved_for DATE,
  shift TEXT,
  status TEXT DEFAULT 'confirmada',
  created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS finance(
  id SERIAL PRIMARY KEY,
  title TEXT,
  amount NUMERIC(12,2),
  type TEXT,
  status TEXT DEFAULT 'pendente',
  due_date DATE,
  created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS notices(
  id SERIAL PRIMARY KEY,
  title TEXT,
  body TEXT,
  channel TEXT DEFAULT 'app',
  priority TEXT DEFAULT 'normal',
  created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS incidents(
  id SERIAL PRIMARY KEY,
  title TEXT,
  description TEXT,
  unit TEXT,
  severity TEXT DEFAULT 'normal',
  status TEXT DEFAULT 'aberta',
  created_at TIMESTAMP DEFAULT now(),
  closed_at TIMESTAMP
);
CREATE TABLE IF NOT EXISTS maintenance(
  id SERIAL PRIMARY KEY,
  title TEXT,
  supplier TEXT,
  scheduled_for DATE,
  status TEXT DEFAULT 'planejada',
  cost NUMERIC(12,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS settings(
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit(
  id SERIAL PRIMARY KEY,
  actor TEXT,
  action TEXT,
  entity TEXT,
  created_at TIMESTAMP DEFAULT now()
);
`);

  const alters = [
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true",
    "ALTER TABLE residents ADD COLUMN IF NOT EXISTS document TEXT",
    "ALTER TABLE residents ADD COLUMN IF NOT EXISTS vehicle TEXT",
    "ALTER TABLE residents ADD COLUMN IF NOT EXISTS notes TEXT",
    "ALTER TABLE packages ADD COLUMN IF NOT EXISTS notes TEXT",
    "ALTER TABLE visitors ADD COLUMN IF NOT EXISTS plate TEXT",
    "ALTER TABLE reservations ADD COLUMN IF NOT EXISTS shift TEXT",
    "ALTER TABLE notices ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal'",
    "ALTER TABLE settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT now()",
    "ALTER TABLE finance ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pendente'",
    "ALTER TABLE finance ADD COLUMN IF NOT EXISTS due_date DATE"
  ];
  for (const sql of alters) await q(sql).catch(() => null);

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@vitoriaregia.local';
  const adminPassword = process.env.ADMIN_PASSWORD || '123456';
  const exists = await q('SELECT id FROM users WHERE email=$1', [adminEmail]);
  if (!exists.rowCount) {
    await q('INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,$4)', [
      'Síndico', adminEmail, await bcrypt.hash(adminPassword, 10), 'sindico'
    ]);
  }

  const defaultSettings = {
    THEME_ACCENT: '#1f8f7a',
    MENU_ORIENTATION: 'vertical',
    UI_DENSITY: 'comfort',
    APPEARANCE: 'light',
    CONDO_NAME: 'Condomínio Vitória Régia',
    WEATHER_CITY: 'João Pessoa',
    EMERGENCY_CONFIRM: 'true',
    ONLY_LOGIN_DASHBOARD: 'true',
    FOOTER_MODE: 'minimal',
    MAIL_PROVIDER: 'sendgrid',
    SENDGRID_FROM_EMAIL: '',
    SENDGRID_FROM_NAME: 'Condomínio Vitória Régia',
    SENDGRID_REPLY_TO: '',
    SENDGRID_TO_DEFAULT: '',
    SENDGRID_DATA_RESIDENCY: 'global'
  };
  for (const [key, value] of Object.entries(defaultSettings)) {
    await q('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO NOTHING', [key, value]);
  }
}

function sanitizeUser(row) {
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}

function auth(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Não autorizado' });
  }
}

async function audit(actor, action, entity = '') {
  await q('INSERT INTO audit(actor,action,entity) VALUES($1,$2,$3)', [actor || 'sistema', action, entity]).catch(() => null);
}

async function getSettingsObject() {
  const rows = (await q('SELECT key,value FROM settings ORDER BY key')).rows;
  return rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
}

async function getSetting(key, fallback = '') {
  const r = await q('SELECT value FROM settings WHERE key=$1', [key]);
  const fromDb = r.rowCount ? String(r.rows[0].value || '').trim() : '';
  return fromDb || process.env[key] || fallback;
}

function requireFields(body, fields) {
  const missing = fields.filter((field) => !String(body[field] ?? '').trim());
  if (missing.length) {
    const err = new Error('Preencha: ' + missing.join(', '));
    err.status = 400;
    throw err;
  }
}

app.get('/api/health', (_req, res) => res.json({ ok: true, version: APP_VERSION }));

app.post('/api/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    requireFields(req.body, ['email', 'password']);
    const r = await q('SELECT * FROM users WHERE email=$1 AND active IS NOT false', [email]);
    if (!r.rowCount || !(await bcrypt.compare(password, r.rows[0].password_hash))) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }
    const user = sanitizeUser(r.rows[0]);
    await audit(user.email, 'login', 'painel');
    res.json({
      token: jwt.sign(user, JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES || '12h' }),
      user
    });
  } catch (e) { next(e); }
});

app.get('/api/dashboard', auth, async (req, res, next) => {
  try {
    const [residents, pendingPackages, visitors, reservations, incidents, maintenance, financeRows, notices] = await Promise.all([
      q('SELECT COUNT(*)::int total FROM residents'),
      q("SELECT COUNT(*)::int total FROM packages WHERE COALESCE(status,'pendente') <> 'entregue'"),
      q('SELECT COUNT(*)::int total FROM visitors'),
      q("SELECT COUNT(*)::int total FROM reservations WHERE COALESCE(status,'confirmada') = 'confirmada'"),
      q("SELECT COUNT(*)::int total FROM incidents WHERE COALESCE(status,'aberta') <> 'fechada'"),
      q("SELECT COUNT(*)::int total FROM maintenance WHERE COALESCE(status,'planejada') <> 'concluida'"),
      q("SELECT COALESCE(SUM(CASE WHEN type='receita' THEN amount ELSE -amount END),0)::numeric balance FROM finance"),
      q('SELECT COUNT(*)::int total FROM notices')
    ]);
    res.json({
      version: APP_VERSION,
      user: req.user,
      metrics: {
        residents: residents.rows[0].total,
        pendingPackages: pendingPackages.rows[0].total,
        visitors: visitors.rows[0].total,
        reservations: reservations.rows[0].total,
        incidents: incidents.rows[0].total,
        maintenance: maintenance.rows[0].total,
        balance: Number(financeRows.rows[0].balance || 0),
        notices: notices.rows[0].total
      }
    });
  } catch (e) { next(e); }
});

app.get('/api/residents', auth, async (_req, res, next) => { try { res.json((await q('SELECT * FROM residents ORDER BY id DESC')).rows); } catch (e) { next(e); } });
app.post('/api/residents', auth, async (req, res, next) => { try { requireFields(req.body, ['name', 'unit']); const { name, unit, phone, email, document, vehicle, notes } = req.body; const r = await q('INSERT INTO residents(name,unit,phone,email,document,vehicle,notes) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *', [name, unit, phone, email, document, vehicle, notes]); await audit(req.user.email, 'criou morador', name); res.json(r.rows[0]); } catch (e) { next(e); } });
app.put('/api/residents/:id', auth, async (req, res, next) => { try { const { name, unit, phone, email, document, vehicle, notes } = req.body; const r = await q('UPDATE residents SET name=$1,unit=$2,phone=$3,email=$4,document=$5,vehicle=$6,notes=$7 WHERE id=$8 RETURNING *', [name, unit, phone, email, document, vehicle, notes, req.params.id]); res.json(r.rows[0] || {}); } catch (e) { next(e); } });
app.delete('/api/residents/:id', auth, async (req, res, next) => { try { await q('DELETE FROM residents WHERE id=$1', [req.params.id]); await audit(req.user.email, 'removeu morador', req.params.id); res.json({ ok: true }); } catch (e) { next(e); } });

app.get('/api/packages', auth, async (_req, res, next) => { try { res.json((await q('SELECT * FROM packages ORDER BY id DESC')).rows); } catch (e) { next(e); } });
app.post('/api/packages', auth, async (req, res, next) => { try { requireFields(req.body, ['tracking', 'recipient', 'unit']); const { tracking, recipient, unit, label, notes } = req.body; const r = await q('INSERT INTO packages(tracking,recipient,unit,label,notes) VALUES($1,$2,$3,$4,$5) RETURNING *', [tracking, recipient, unit, label || tracking, notes]); await audit(req.user.email, 'registrou encomenda', tracking); res.json(r.rows[0]); } catch (e) { next(e); } });
app.post('/api/packages/:id/deliver', auth, async (req, res, next) => { try { const r = await q("UPDATE packages SET status='entregue',delivered_at=now() WHERE id=$1 RETURNING *", [req.params.id]); await audit(req.user.email, 'entregou encomenda', req.params.id); res.json(r.rows[0] || {}); } catch (e) { next(e); } });

app.get('/api/visitors', auth, async (_req, res, next) => { try { res.json((await q('SELECT * FROM visitors ORDER BY id DESC')).rows); } catch (e) { next(e); } });
app.post('/api/visitors', auth, async (req, res, next) => { try { requireFields(req.body, ['name', 'unit']); const { name, document, unit, authorized_by, plate } = req.body; const r = await q('INSERT INTO visitors(name,document,unit,authorized_by,plate) VALUES($1,$2,$3,$4,$5) RETURNING *', [name, document, unit, authorized_by, plate]); await audit(req.user.email, 'autorizou visitante', name); res.json(r.rows[0]); } catch (e) { next(e); } });
app.delete('/api/visitors/:id', auth, async (req, res, next) => { try { await q('DELETE FROM visitors WHERE id=$1', [req.params.id]); await audit(req.user.email, 'removeu visitante', req.params.id); res.json({ ok: true }); } catch (e) { next(e); } });

app.get('/api/reservations', auth, async (_req, res, next) => { try { res.json((await q('SELECT * FROM reservations ORDER BY reserved_for DESC NULLS LAST,id DESC')).rows); } catch (e) { next(e); } });
app.post('/api/reservations', auth, async (req, res, next) => { try { requireFields(req.body, ['area', 'unit', 'resident', 'reserved_for']); const { area, unit, resident, reserved_for, shift } = req.body; const r = await q('INSERT INTO reservations(area,unit,resident,reserved_for,shift) VALUES($1,$2,$3,$4,$5) RETURNING *', [area, unit, resident, reserved_for, shift]); await audit(req.user.email, 'criou reserva', area); res.json(r.rows[0]); } catch (e) { next(e); } });
app.post('/api/reservations/:id/cancel', auth, async (req, res, next) => { try { const r = await q("UPDATE reservations SET status='cancelada' WHERE id=$1 RETURNING *", [req.params.id]); await audit(req.user.email, 'cancelou reserva', req.params.id); res.json(r.rows[0] || {}); } catch (e) { next(e); } });

app.get('/api/finance', auth, async (_req, res, next) => { try { res.json((await q('SELECT * FROM finance ORDER BY due_date DESC NULLS LAST,id DESC')).rows); } catch (e) { next(e); } });
app.post('/api/finance', auth, async (req, res, next) => { try { requireFields(req.body, ['title', 'amount', 'type']); const { title, amount, type, due_date } = req.body; const r = await q('INSERT INTO finance(title,amount,type,due_date) VALUES($1,$2,$3,$4) RETURNING *', [title, amount, type, due_date || null]); await audit(req.user.email, 'lançou financeiro', title); res.json(r.rows[0]); } catch (e) { next(e); } });
app.post('/api/finance/:id/pay', auth, async (req, res, next) => { try { const r = await q("UPDATE finance SET status='pago' WHERE id=$1 RETURNING *", [req.params.id]); await audit(req.user.email, 'baixou financeiro', req.params.id); res.json(r.rows[0] || {}); } catch (e) { next(e); } });

app.get('/api/notices', auth, async (_req, res, next) => { try { res.json((await q('SELECT * FROM notices ORDER BY id DESC')).rows); } catch (e) { next(e); } });
app.post('/api/notices', auth, async (req, res, next) => { try { requireFields(req.body, ['title', 'body']); const { title, body, channel, priority } = req.body; const r = await q('INSERT INTO notices(title,body,channel,priority) VALUES($1,$2,$3,$4) RETURNING *', [title, body, channel || 'app', priority || 'normal']); await audit(req.user.email, 'criou comunicado', title); const ch = String(channel || 'app').toLowerCase(); if (['email','sendgrid','todos','all'].includes(ch)) { const to = await getSetting('SENDGRID_TO_DEFAULT') || await getSetting('MAIL_TO_DEFAULT'); if (to) await sendEmailSmart({ to, subject: title, body }, 'auto').catch((err) => console.warn('Falha ao enviar comunicado por e-mail:', err.message)); } res.json(r.rows[0]); } catch (e) { next(e); } });

app.get('/api/incidents', auth, async (_req, res, next) => { try { res.json((await q('SELECT * FROM incidents ORDER BY id DESC')).rows); } catch (e) { next(e); } });
app.post('/api/incidents', auth, async (req, res, next) => { try { requireFields(req.body, ['title']); const { title, description, unit, severity } = req.body; const r = await q('INSERT INTO incidents(title,description,unit,severity) VALUES($1,$2,$3,$4) RETURNING *', [title, description, unit, severity || 'normal']); await audit(req.user.email, 'registrou ocorrência', title); res.json(r.rows[0]); } catch (e) { next(e); } });
app.post('/api/incidents/:id/close', auth, async (req, res, next) => { try { const r = await q("UPDATE incidents SET status='fechada',closed_at=now() WHERE id=$1 RETURNING *", [req.params.id]); await audit(req.user.email, 'fechou ocorrência', req.params.id); res.json(r.rows[0] || {}); } catch (e) { next(e); } });

app.get('/api/maintenance', auth, async (_req, res, next) => { try { res.json((await q('SELECT * FROM maintenance ORDER BY scheduled_for DESC NULLS LAST,id DESC')).rows); } catch (e) { next(e); } });
app.post('/api/maintenance', auth, async (req, res, next) => { try { requireFields(req.body, ['title']); const { title, supplier, scheduled_for, status, cost, notes } = req.body; const r = await q('INSERT INTO maintenance(title,supplier,scheduled_for,status,cost,notes) VALUES($1,$2,$3,$4,$5,$6) RETURNING *', [title, supplier, scheduled_for || null, status || 'planejada', cost || 0, notes]); await audit(req.user.email, 'criou manutenção', title); res.json(r.rows[0]); } catch (e) { next(e); } });
app.post('/api/maintenance/:id/done', auth, async (req, res, next) => { try { const r = await q("UPDATE maintenance SET status='concluida' WHERE id=$1 RETURNING *", [req.params.id]); await audit(req.user.email, 'concluiu manutenção', req.params.id); res.json(r.rows[0] || {}); } catch (e) { next(e); } });

app.get('/api/audit', auth, async (_req, res, next) => { try { res.json((await q('SELECT * FROM audit ORDER BY id DESC LIMIT 150')).rows); } catch (e) { next(e); } });
app.get('/api/settings', auth, async (_req, res, next) => { try { res.json(await getSettingsObject()); } catch (e) { next(e); } });
app.post('/api/settings', auth, async (req, res, next) => {
  try {
    for (const [key, value] of Object.entries(req.body || {})) {
      await q('INSERT INTO settings(key,value,updated_at) VALUES($1,$2,now()) ON CONFLICT(key) DO UPDATE SET value=$2,updated_at=now()', [key, String(value ?? '')]);
    }
    await audit(req.user.email, 'alterou configurações', Object.keys(req.body || {}).join(','));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

function htmlFromText(text = '') {
  const escaped = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
  return `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#172033">${escaped}</div>`;
}

function splitAddress(value = '') {
  const raw = String(value || '').trim();
  const m = raw.match(/^(.+?)\s*<([^>]+)>$/);
  if (m) return { name: m[1].replace(/^['"]|['"]$/g, '').trim(), email: m[2].trim() };
  return { name: '', email: raw };
}

function recipients(value = '') {
  if (Array.isArray(value)) return value.map(String).map(v => v.trim()).filter(Boolean);
  return String(value || '').split(/[;,]/).map(v => v.trim()).filter(Boolean);
}

function sendGridErrorMessage(error) {
  const body = error?.response?.body;
  const sgMsg = Array.isArray(body?.errors) ? body.errors.map(e => e.message).filter(Boolean).join('; ') : '';
  return sgMsg || error?.message || 'Falha ao enviar pelo SendGrid';
}

async function sendEmailViaSendGrid({ to, subject, body, html }) {
  const apiKey = await getSetting('SENDGRID_API_KEY');
  if (!apiKey) {
    const err = new Error('Configure SENDGRID_API_KEY nas Environment Variables do Render.');
    err.status = 400;
    throw err;
  }
  if (String(await getSetting('SENDGRID_DATA_RESIDENCY', 'global')).toLowerCase() === 'eu' && typeof sgMail.setDataResidency === 'function') {
    sgMail.setDataResidency('eu');
  }
  sgMail.setApiKey(apiKey);
  const mailFrom = splitAddress(await getSetting('SENDGRID_FROM_EMAIL') || await getSetting('MAIL_FROM') || await getSetting('SMTP_USER'));
  if (!mailFrom.email) {
    const err = new Error('Configure SENDGRID_FROM_EMAIL com o remetente verificado no SendGrid.');
    err.status = 400;
    throw err;
  }
  const fromName = await getSetting('SENDGRID_FROM_NAME', mailFrom.name || 'Condomínio Vitória Régia');
  const reply = splitAddress(await getSetting('SENDGRID_REPLY_TO') || mailFrom.email);
  const msg = {
    to: recipients(to),
    from: { email: mailFrom.email, name: fromName || mailFrom.name || 'Condomínio Vitória Régia' },
    subject,
    text: String(body || ''),
    html: html || htmlFromText(body),
    categories: ['vitoria-regia']
  };
  if (reply.email) msg.replyTo = { email: reply.email, name: reply.name || fromName };
  try {
    const [response] = await sgMail.send(msg);
    return { ok: true, provider: 'sendgrid', statusCode: response?.statusCode || 202 };
  } catch (error) {
    const err = new Error(sendGridErrorMessage(error));
    err.status = error?.code || 400;
    throw err;
  }
}

async function sendEmailViaSmtp({ to, subject, body, html }) {
  const host = await getSetting('SMTP_HOST');
  const user = await getSetting('SMTP_USER');
  const pass = await getSetting('SMTP_PASS');
  const port = Number(await getSetting('SMTP_PORT', '587'));
  if (!host || !user || !pass) {
    const err = new Error('Configure SMTP_HOST, SMTP_USER e SMTP_PASS em Configurações.');
    err.status = 400;
    throw err;
  }
  const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  await transporter.sendMail({ from: await getSetting('MAIL_FROM', user), to: recipients(to).join(','), subject, text: body, html: html || htmlFromText(body) });
  return { ok: true, provider: 'smtp' };
}

async function sendEmailSmart(payload, preferredProvider = '') {
  const provider = String(preferredProvider || await getSetting('MAIL_PROVIDER', 'sendgrid')).toLowerCase();
  if (provider === 'smtp') return sendEmailViaSmtp(payload);
  if (provider === 'auto') {
    if (await getSetting('SENDGRID_API_KEY')) return sendEmailViaSendGrid(payload);
    return sendEmailViaSmtp(payload);
  }
  return sendEmailViaSendGrid(payload);
}

app.get('/api/integrations/sendgrid/status', auth, async (_req, res, next) => {
  try {
    res.json({
      configured: Boolean(await getSetting('SENDGRID_API_KEY')),
      from: await getSetting('SENDGRID_FROM_EMAIL'),
      defaultTo: await getSetting('SENDGRID_TO_DEFAULT'),
      provider: await getSetting('MAIL_PROVIDER', 'sendgrid'),
      dataResidency: await getSetting('SENDGRID_DATA_RESIDENCY', 'global')
    });
  } catch (e) { next(e); }
});

app.post('/api/notify/email', auth, async (req, res, next) => {
  try {
    requireFields(req.body, ['to', 'subject', 'body']);
    const result = await sendEmailSmart(req.body, req.body.provider);
    await audit(req.user.email, `enviou e-mail via ${result.provider}`, req.body.to);
    res.json(result);
  } catch (e) { next(e); }
});

app.post('/api/notify/sendgrid/test', auth, async (req, res, next) => {
  try {
    const to = req.body.to || await getSetting('SENDGRID_TO_DEFAULT') || await getSetting('SENDGRID_FROM_EMAIL');
    const subject = req.body.subject || 'Teste SendGrid - Vitória Régia';
    const body = req.body.body || 'Integração SendGrid ativa no Sistema Vitória Régia Pro.';
    requireFields({ to, subject, body }, ['to', 'subject', 'body']);
    const result = await sendEmailViaSendGrid({ to, subject, body });
    await audit(req.user.email, 'testou SendGrid', to);
    res.json(result);
  } catch (e) { next(e); }
});

app.post('/api/notify/telegram', auth, async (req, res, next) => {
  try {
    requireFields(req.body, ['message']);
    const token = await getSetting('TELEGRAM_BOT_TOKEN');
    const chat = await getSetting('TELEGRAM_CHAT_ID');
    if (!token || !chat) return res.status(400).json({ error: 'Configure TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID em Configurações.' });
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: req.body.message })
    });
    const data = await r.json().catch(() => ({}));
    await audit(req.user.email, 'enviou Telegram', chat);
    res.status(r.ok ? 200 : 400).json(data);
  } catch (e) { next(e); }
});

app.post('/api/emergency', auth, async (req, res, next) => {
  try {
    const settings = await getSettingsObject();
    const msg = req.body.message || `Emergência acionada no ${settings.CONDO_NAME || 'Condomínio Vitória Régia'}`;
    await q('INSERT INTO incidents(title,description,severity,status) VALUES($1,$2,$3,$4)', ['Emergência acionada', msg, 'critica', 'aberta']);
    await audit(req.user.email, 'acionou emergência', msg);
    const token = settings.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
    const chat = settings.TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
    if (token && chat) {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chat, text: `🚨 ${msg}` })
      }).catch(() => null);
    }
    const emergencyEmail = settings.SENDGRID_TO_DEFAULT || settings.EMERGENCY_EMAIL || process.env.EMERGENCY_EMAIL;
    if (emergencyEmail) {
      await sendEmailSmart({ to: emergencyEmail, subject: '🚨 Emergência acionada - Vitória Régia', body: msg }, 'auto').catch((err) => console.warn('Falha ao enviar emergência por e-mail:', err.message));
    }
    res.json({ ok: true, message: 'Emergência registrada e encaminhada aos canais configurados.' });
  } catch (e) { next(e); }
});

app.get('/api/export', auth, async (_req, res, next) => {
  try {
    const [residents, packagesRows, visitors, reservations, finance, notices, incidents, maintenance, settings, auditRows] = await Promise.all([
      q('SELECT * FROM residents ORDER BY id'), q('SELECT * FROM packages ORDER BY id'), q('SELECT * FROM visitors ORDER BY id'),
      q('SELECT * FROM reservations ORDER BY id'), q('SELECT * FROM finance ORDER BY id'), q('SELECT * FROM notices ORDER BY id'),
      q('SELECT * FROM incidents ORDER BY id'), q('SELECT * FROM maintenance ORDER BY id'), q('SELECT * FROM settings ORDER BY key'),
      q('SELECT * FROM audit ORDER BY id DESC LIMIT 500')
    ]);
    res.json({ exported_at: new Date().toISOString(), version: APP_VERSION, residents: residents.rows, packages: packagesRows.rows, visitors: visitors.rows, reservations: reservations.rows, finance: finance.rows, notices: notices.rows, incidents: incidents.rows, maintenance: maintenance.rows, settings: settings.rows, audit: auditRows.rows });
  } catch (e) { next(e); }
});

app.post('/api/seed-demo', auth, async (req, res, next) => {
  try {
    await q("INSERT INTO residents(name,unit,phone,email,vehicle) SELECT 'Ana Paula','101','83999990001','ana@example.com','Corolla prata' WHERE NOT EXISTS (SELECT 1 FROM residents WHERE name='Ana Paula' AND unit='101')");
    await q("INSERT INTO residents(name,unit,phone,email,vehicle) SELECT 'Carlos Lima','203','83999990002','carlos@example.com','HB20 branco' WHERE NOT EXISTS (SELECT 1 FROM residents WHERE name='Carlos Lima' AND unit='203')");
    await q("INSERT INTO packages(tracking,recipient,unit,label) SELECT 'VR-EXP-001','Ana Paula','101','VR-EXP-001' WHERE NOT EXISTS (SELECT 1 FROM packages WHERE tracking='VR-EXP-001')");
    await q("INSERT INTO packages(tracking,recipient,unit,label) SELECT 'ML-849392','Carlos Lima','203','ML-849392' WHERE NOT EXISTS (SELECT 1 FROM packages WHERE tracking='ML-849392')");
    await q("INSERT INTO visitors(name,document,unit,authorized_by,plate) SELECT 'João Entregador','***.123.456-**','101','Ana Paula','APP-2026' WHERE NOT EXISTS (SELECT 1 FROM visitors WHERE name='João Entregador' AND unit='101')");
    await q("INSERT INTO reservations(area,unit,resident,reserved_for,shift) SELECT 'Salão de Festas','203','Carlos Lima',current_date + interval '3 days','noite' WHERE NOT EXISTS (SELECT 1 FROM reservations WHERE area='Salão de Festas' AND unit='203')");
    await q("INSERT INTO finance(title,amount,type,due_date) SELECT 'Manutenção elevador',850.00,'despesa',current_date + interval '10 days' WHERE NOT EXISTS (SELECT 1 FROM finance WHERE title='Manutenção elevador')");
    await q("INSERT INTO finance(title,amount,type,due_date) SELECT 'Taxa condomínio 101',650.00,'receita',current_date + interval '5 days' WHERE NOT EXISTS (SELECT 1 FROM finance WHERE title='Taxa condomínio 101')");
    await q("INSERT INTO maintenance(title,supplier,scheduled_for,cost,notes) SELECT 'Revisão das bombas','Fornecedor hidráulico',current_date + interval '7 days',450.00,'Checar pressão e ruído' WHERE NOT EXISTS (SELECT 1 FROM maintenance WHERE title='Revisão das bombas')");
    await q("INSERT INTO notices(title,body,channel,priority) SELECT 'Assembleia ordinária','Reunião marcada para a próxima quinta-feira às 19h.','app','alta' WHERE NOT EXISTS (SELECT 1 FROM notices WHERE title='Assembleia ordinária')");
    await audit(req.user.email, 'carregou demonstração', 'demo');
    res.json({ ok: true });
  } catch (e) { next(e); }
});

const staticDir = path.resolve(__dirname, '../../client/dist');
app.use(express.static(staticDir));
app.get(/.*/, (_req, res) => res.sendFile(path.join(staticDir, 'index.html')));

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Erro interno' });
});

createConnectedPool()
  .then((connectedPool) => { pool = connectedPool; return init(); })
  .then(() => app.listen(process.env.PORT || 3000, () => console.log(`${APP_VERSION} online na porta ${process.env.PORT || 3000}`)))
  .catch((err) => { console.error('Falha ao iniciar:', err); process.exit(1); });
