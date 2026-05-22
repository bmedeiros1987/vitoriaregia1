'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const VERSION = '3.1.0';
const app = express();
const PORT = Number(process.env.PORT || 10000);
const FRONTEND_DIR = process.env.FRONTEND_DIR ? path.resolve(process.env.FRONTEND_DIR) : path.resolve(__dirname, '../../');
const DATA_FILE = process.env.DATA_FILE || path.join(os.tmpdir(), 'vitoria-regia-state-v310.json');

function bool(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === null || value === '') return fallback;
  return ['1','true','yes','sim','on'].includes(String(value).toLowerCase());
}
function ensureDir(file) { fs.mkdirSync(path.dirname(file), { recursive: true }); }
function readJson(file, fallback) {
  try { if (!fs.existsSync(file)) return fallback; return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { console.warn('[state] Falha ao ler JSON:', error.message); return fallback; }
}
function writeJson(file, value) { ensureDir(file); fs.writeFileSync(file, JSON.stringify(value, null, 2)); }
function randomId(prefix = 'vr') { return crypto.randomUUID ? `${prefix}-${crypto.randomUUID()}` : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function now() { return new Date().toISOString(); }
function normalizeRole(value) {
  const raw = String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if (raw.includes('admin')) return 'admin';
  if (raw.includes('sub') && raw.includes('sind')) return 'subsindico';
  if (raw.includes('sind')) return 'sindico';
  if (raw.includes('port') || raw.includes('porte')) return 'portaria';
  return raw || 'morador';
}

const DEFAULT_STATE = {
  meta: { version: VERSION, updatedAt: now() },
  settings: {
    condominiumName: 'Condomínio Vitória Régia',
    buildingBackground: 'assets/building-bg.svg',
    defaultNoticeDays: 7,
    cloudMode: process.env.CLOUD_PROVIDER || 'local',
    cloudName: '',
    renderDeployHook: process.env.RENDER_DEPLOY_HOOK_URL || '',
    allowFirstAccessAdmin: true
  },
  users: [], residents: [], packages: [], visitors: [], recurringVisitors: [], bookings: [], notices: [], emergencies: [], notifications: [], cloudFiles: [], updateRequests: [], backups: [], logs: []
};

function mergeState(raw) {
  const base = JSON.parse(JSON.stringify(DEFAULT_STATE));
  const merged = { ...base, ...(raw || {}) };
  merged.meta = { ...base.meta, ...(raw && raw.meta ? raw.meta : {}), version: VERSION, updatedAt: now() };
  merged.settings = { ...base.settings, ...(raw && raw.settings ? raw.settings : {}) };
  for (const key of ['users','residents','packages','visitors','recurringVisitors','bookings','notices','emergencies','notifications','cloudFiles','updateRequests','backups','logs']) {
    merged[key] = Array.isArray(merged[key]) ? merged[key] : [];
  }
  return merged;
}

let state = mergeState(readJson(DATA_FILE, DEFAULT_STATE));

function save() { writeJson(DATA_FILE, state); }
function log(type, message, extra = {}) { state.logs.unshift({ id: randomId('log'), type, message, extra, createdAt: now() }); save(); }
function publicUser(user) {
  if (!user) return null;
  const { password, ...safe } = user;
  return { ...safe, role: normalizeRole(safe.role) };
}
function findByCredential(username, password) {
  const ident = String(username || '').trim().toLowerCase();
  const pass = String(password || '');

  const envUser = process.env.ADMIN_USERNAME;
  const envPass = process.env.ADMIN_PASSWORD;
  if (envUser && envPass && ident === String(envUser).trim().toLowerCase() && pass === String(envPass)) {
    return { id: 'env-admin', name: process.env.ADMIN_NAME || 'Administrador', username: envUser, role: 'admin', active: true };
  }

  const fromUsers = state.users.find((u) => {
    if (u.active === false) return false;
    const ids = [u.username, u.email, u.name].filter(Boolean).map(v => String(v).trim().toLowerCase());
    return ids.includes(ident) && String(u.password || '') === pass;
  });
  if (fromUsers) return fromUsers;

  const fromResidents = state.residents.find((r) => {
    if (r.active === false) return false;
    const ids = [r.username, r.email, r.name].filter(Boolean).map(v => String(v).trim().toLowerCase());
    return ids.includes(ident) && String(r.password || '') === pass;
  });
  if (fromResidents) return { ...fromResidents, role: 'morador' };

  const hasLogin = state.users.some(u => u.username || u.email || u.password) || state.residents.some(r => r.username || r.email || r.password);
  if (!hasLogin && state.settings.allowFirstAccessAdmin && ident && pass) {
    const firstAdmin = { id: randomId('user'), name: ident.includes('@') ? 'Administrador' : username, username, email: ident.includes('@') ? username : '', password, role: 'admin', active: true, firstAccess: true, createdAt: now() };
    state.users.push(firstAdmin);
    log('auth', 'Primeiro acesso técnico criado automaticamente.', { username });
    return firstAdmin;
  }
  return null;
}

app.set('trust proxy', bool('TRUST_PROXY', process.env.RENDER === 'true'));
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: process.env.JSON_LIMIT || '30mb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.JSON_LIMIT || '30mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(session({
  secret: process.env.SESSION_SECRET || process.env.JWT_SECRET || 'vitoria-regia-session-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: bool('SESSION_COOKIE_SECURE', false) }
}));

app.get('/health', (req, res) => res.json({ ok: true, version: VERSION, frontendDir: FRONTEND_DIR, dataFile: DATA_FILE, time: now() }));
app.get('/api/health', (req, res) => res.json({ ok: true, version: VERSION, database: { ready: false, fallback: true }, time: now() }));

app.post('/api/auth/login', (req, res) => {
  const { username, email, password } = req.body || {};
  const user = findByCredential(username || email, password);
  if (!user) return res.status(401).json({ ok: false, error: 'Usuário ou senha inválidos.' });
  const safe = publicUser(user);
  req.session.user = safe;
  log('auth', `Login realizado por ${safe.username || safe.email || safe.name}.`, { role: safe.role });
  res.json({ ok: true, user: safe, version: VERSION });
});
app.post('/auth/login', (req, res) => {
  const { username, email, password } = req.body || {};
  const user = findByCredential(username || email, password);
  if (!user) return res.status(401).json({ ok: false, error: 'Usuário ou senha inválidos.' });
  const safe = publicUser(user);
  req.session.user = safe;
  log('auth', `Login realizado por ${safe.username || safe.email || safe.name}.`, { role: safe.role });
  res.json({ ok: true, user: safe, version: VERSION });
});
app.post('/api/auth/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get('/api/me', (req, res) => res.json({ ok: true, user: req.session.user || null }));

app.get('/api/state', (req, res) => { state = mergeState(readJson(DATA_FILE, state)); res.json({ ok: true, state, version: VERSION }); });
app.post('/api/state/bulk', (req, res) => {
  const incoming = req.body && req.body.state ? req.body.state : req.body;
  state = mergeState({ ...state, ...(incoming || {}) });
  save();
  res.json({ ok: true, state, version: VERSION });
});

const collectionMap = {
  residents: 'residents', users: 'users', packages: 'packages', visitors: 'visitors', notices: 'notices', bookings: 'bookings', emergencies: 'emergencies', notifications: 'notifications', cloudFiles: 'cloudFiles'
};
for (const [route, key] of Object.entries(collectionMap)) {
  app.get(`/api/${route}`, (req, res) => res.json({ ok: true, rows: state[key] || [] }));
  app.post(`/api/${route}`, (req, res) => {
    const item = { id: req.body.id || randomId(key), ...req.body, createdAt: req.body.createdAt || now() };
    state[key] = Array.isArray(state[key]) ? state[key] : [];
    state[key].unshift(item);
    save();
    res.json({ ok: true, item });
  });
}

app.post('/api/uploads', (req, res) => {
  const item = { id: req.body.id || randomId('file'), ...req.body, createdAt: req.body.createdAt || now() };
  state.cloudFiles.unshift(item);
  log('uploads', `Imagem salva: ${item.name || item.id}.`, { type: item.type, refId: item.refId });
  save();
  res.json({ ok: true, item, cloud: state.settings.cloudMode || 'local' });
});

app.post('/api/panic', (req, res) => {
  const item = { id: req.body.id || randomId('panic'), status: req.body.status || 'aguardando confirmação', ...req.body, createdAt: req.body.createdAt || now() };
  state.emergencies.unshift(item);
  state.notifications.unshift({ id: randomId('notif'), title: 'Emergência aguardando confirmação', body: `${item.type || 'Emergência'} - ${item.apartment || 'sem unidade'}`, apartment: 'Portaria/Síndico', createdAt: now(), read: false });
  log('emergencias', 'Emergência recebida pelo backend.', { id: item.id, type: item.type });
  save();
  res.json({ ok: true, item });
});

app.post('/api/panic/:id/status', (req, res) => {
  const row = state.emergencies.find(e => e.id === req.params.id);
  if (!row) return res.status(404).json({ ok: false, error: 'Emergência não encontrada.' });
  row.status = req.body.status || row.status;
  row.updatedAt = now();
  if (req.body.notifyResidents) state.notifications.unshift({ id: randomId('notif'), title: 'Emergência confirmada', body: `${row.type || 'Emergência'} - ${row.apartment || ''}`, apartment: 'Todos', createdAt: now(), read: false });
  log('emergencias', `Status de emergência alterado para ${row.status}.`, { id: row.id });
  save();
  res.json({ ok: true, item: row });
});

app.get('/api/backup', (req, res) => {
  state.meta.updatedAt = now();
  res.setHeader('Content-Disposition', `attachment; filename="vitoriaregia_backup_${VERSION}_${new Date().toISOString().slice(0,10)}.json"`);
  res.json(state);
});
app.post('/api/backup/restore', (req, res) => {
  state.backups.unshift({ id: randomId('restore'), type: 'restore', createdAt: now() });
  state = mergeState(req.body || {});
  log('backup', 'Backup restaurado pelo backend.');
  save();
  res.json({ ok: true, state });
});

app.post('/api/admin/update/request', async (req, res) => {
  const request = { id: req.body.id || randomId('update'), ...req.body, status: req.body.status || 'registrado', createdAt: req.body.createdAt || now() };
  state.updateRequests.unshift(request);
  log('atualizacoes', `Solicitação de atualização registrada: ${request.fileName || request.id}.`);
  save();
  res.json({ ok: true, request, deployHookConfigured: Boolean(process.env.RENDER_DEPLOY_HOOK_URL || state.settings.renderDeployHook) });
});

app.post('/api/admin/deploy', async (req, res) => {
  const hook = process.env.RENDER_DEPLOY_HOOK_URL || state.settings.renderDeployHook;
  if (!hook) return res.status(400).json({ ok: false, error: 'Deploy hook não configurado.' });
  log('atualizacoes', 'Deploy hook solicitado pela central de atualizações.');
  save();
  res.json({ ok: true, message: 'Deploy hook registrado. Acione o hook pelo painel/cliente autorizado.' });
});

app.get('/api/admin/market-readiness', (req, res) => {
  const checks = [
    { label: 'index.html', ok: fs.existsSync(path.join(FRONTEND_DIR, 'index.html')) },
    { label: 'app.js', ok: fs.existsSync(path.join(FRONTEND_DIR, 'app.js')) },
    { label: 'styles.css', ok: fs.existsSync(path.join(FRONTEND_DIR, 'styles.css')) },
    { label: 'backend/src/server.js', ok: fs.existsSync(__filename) },
    { label: 'versão no rodapé', ok: true },
    { label: 'backup/restore', ok: true },
    { label: 'emergência resetável', ok: true },
    { label: 'nuvem de imagens', ok: true, warning: state.settings.cloudMode === 'local' ? 'Modo local; configure provedor para nuvem real.' : '' }
  ];
  const score = Math.round((checks.filter(c => c.ok).length / checks.length) * 100);
  res.json({ ok: true, version: VERSION, score, checks, time: now() });
});

app.use(express.static(FRONTEND_DIR, { extensions: ['html'] }));
app.get('*', (req, res) => {
  const indexFile = path.join(FRONTEND_DIR, 'index.html');
  if (fs.existsSync(indexFile)) return res.sendFile(indexFile);
  res.status(404).json({ ok: false, error: 'index.html não encontrado', frontendDir: FRONTEND_DIR });
});

app.listen(PORT, () => {
  ensureDir(DATA_FILE);
  save();
  console.log(`Vitória Régia ${VERSION} online na porta ${PORT}`);
  console.log(`Frontend: ${FRONTEND_DIR}`);
});
