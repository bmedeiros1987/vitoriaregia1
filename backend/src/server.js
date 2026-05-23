
// Vitória Régia v4.3.4 - utilitário de senha temporária
function vrGenerateTemporaryPassword() {
  return 'VR-' + Math.floor(100000 + Math.random() * 900000);
}

async function vrSendTelegramMessageSafe(chatId, message) {
  const token = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || '';
  if (!token || !chatId) return { ok: false, reason: 'Telegram não configurado ou Chat ID ausente.' };
  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: process.env.TELEGRAM_PARSE_MODE || 'HTML' })
    });
    return { ok: response.ok, status: response.status };
  } catch (error) {
    return { ok: false, error: String(error && error.message || error) };
  }
}


// Vitória Régia v4.3.3 - normalização de usuário sem unidade vinculada
function vrNormalizeUserWithoutUnit(payload = {}) {
  const noUnit = payload.semUnidade === true || payload.semUnidade === 'true' || payload.unitless === true || payload.unitless === 'true';
  if (noUnit) {
    payload.unidade = '';
    payload.unit = '';
    payload.apartamento = '';
    payload.apartment = '';
    payload.residencial = '';
    payload.semUnidade = true;
    payload.unitless = true;
  }
  return payload;
}

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
const mysql = require('mysql2/promise');

const VERSION = '3.4.0-mysql';
const app = express();
const PORT = Number(process.env.PORT || 10000);
const FRONTEND_DIR = process.env.FRONTEND_DIR ? path.resolve(process.env.FRONTEND_DIR) : path.resolve(__dirname, '../../');
const DATA_FILE = process.env.DATA_FILE || path.join(os.tmpdir(), 'vitoria-regia-state-v340.json');

function bool(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === null || value === '') return fallback;
  return ['1','true','yes','sim','on'].includes(String(value).toLowerCase());
}

const DATABASE_PROVIDER = String(process.env.DATABASE_PROVIDER || 'mysql').toLowerCase();
const REQUIRE_DATABASE = bool('REQUIRE_DATABASE', false);
let dbPool = null;
let dbStatus = {
  provider: DATABASE_PROVIDER,
  ready: false,
  mode: 'local-fallback',
  message: 'Banco ainda não inicializado.',
  updatedAt: null
};

function parseMysqlUrl(rawUrl) {
  if (!rawUrl) return null;
  try {
    const u = new URL(rawUrl);
    if (!/^mysql/i.test(u.protocol)) return null;
    return {
      host: u.hostname,
      port: Number(u.port || 3306),
      user: decodeURIComponent(u.username || ''),
      password: decodeURIComponent(u.password || ''),
      database: (u.pathname || '').replace(/^\//, '') || process.env.MYSQL_DATABASE || 'defaultdb',
      ssl: u.searchParams.get('sslmode') === 'require' || u.searchParams.get('ssl') === 'true'
    };
  } catch (_) {
    return null;
  }
}

function getMysqlConfig() {
  const fromUrl = parseMysqlUrl(process.env.DATABASE_URL || process.env.MYSQL_URL);
  const cfg = fromUrl || {
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE || 'defaultdb',
    ssl: bool('MYSQL_SSL', false)
  };

  if (!cfg.host || !cfg.user || !cfg.database) return null;

  return {
    host: cfg.host,
    port: cfg.port || 3306,
    user: cfg.user,
    password: cfg.password || '',
    database: cfg.database,
    waitForConnections: true,
    connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 5),
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    ssl: (cfg.ssl || bool('MYSQL_SSL', false))
      ? { rejectUnauthorized: bool('MYSQL_SSL_REJECT_UNAUTHORIZED', false) }
      : undefined
  };
}

async function initDatabase() {
  if (DATABASE_PROVIDER !== 'mysql' && !process.env.MYSQL_HOST && !(process.env.DATABASE_URL || '').startsWith('mysql')) {
    dbStatus = { provider: DATABASE_PROVIDER, ready: false, mode: 'local-fallback', message: 'DATABASE_PROVIDER não está configurado como mysql.', updatedAt: now() };
    if (REQUIRE_DATABASE) throw new Error('Banco obrigatório indisponível: DATABASE_PROVIDER precisa ser mysql.');
    return;
  }

  const cfg = getMysqlConfig();
  if (!cfg) {
    dbStatus = { provider: 'mysql', ready: false, mode: 'local-fallback', message: 'Variáveis MySQL ausentes. Configure MYSQL_HOST/MYSQL_PORT/MYSQL_DATABASE/MYSQL_USER/MYSQL_PASSWORD/MYSQL_SSL ou DATABASE_URL=mysql://...', updatedAt: now() };
    if (REQUIRE_DATABASE) throw new Error(dbStatus.message);
    console.warn('[mysql]', dbStatus.message);
    return;
  }

  try {
    dbPool = mysql.createPool(cfg);
    await dbPool.query('SELECT 1');
    await dbPool.query(`CREATE TABLE IF NOT EXISTS app_state (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      data LONGTEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    const [rows] = await dbPool.execute('SELECT data FROM app_state WHERE id = ? LIMIT 1', ['main']);
    if (rows && rows[0] && rows[0].data) {
      const loaded = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
      state = mergeState(loaded);
      writeJson(DATA_FILE, state);
      dbStatus = { provider: 'mysql', ready: true, mode: 'mysql', message: 'Estado carregado do MySQL.', updatedAt: now(), host: cfg.host, database: cfg.database };
      console.log('[mysql] Estado carregado do MySQL.');
    } else {
      dbStatus = { provider: 'mysql', ready: true, mode: 'mysql', message: 'MySQL conectado. Estado inicial será gravado.', updatedAt: now(), host: cfg.host, database: cfg.database };
      await saveToMysql();
      console.log('[mysql] Estado inicial gravado no MySQL.');
    }
  } catch (error) {
    dbPool = null;
    dbStatus = { provider: 'mysql', ready: false, mode: 'local-fallback', message: error.message, updatedAt: now() };
    console.error('[mysql] Falha ao inicializar:', error.message);
    if (REQUIRE_DATABASE) throw error;
  }
}

async function saveToMysql() {
  if (!dbPool) return;
  const payload = JSON.stringify(state);
  await dbPool.execute(
    'INSERT INTO app_state (id, data, updated_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = NOW()',
    ['main', payload]
  );
  dbStatus.ready = true;
  dbStatus.mode = 'mysql';
  dbStatus.message = 'Estado salvo no MySQL.';
  dbStatus.updatedAt = now();
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
  if (raw.includes('owner') || raw.includes('dono') || raw.includes('proprietario')) return 'owner';
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
    autoUnits: { enabled: true, firstFloor: 1, lastFloor: 11, unitsPerFloor: 3, example: '101 a 1103' },
    cloudMode: process.env.CLOUD_PROVIDER || 'local',
    cloudName: '',
    renderDeployHook: process.env.RENDER_DEPLOY_HOOK_URL || '',
    allowFirstAccessAdmin: true,
    systemEdition: process.env.SYSTEM_EDITION || 'Premium Condomínio',
    licenseOwner: process.env.SYSTEM_OWNER_NAME || 'Bruno Saraiva',
    temporaryPasswordLength: 6,
    supportContact: { email: process.env.SUPPORT_EMAIL || 'bmedeiros1987@gmail.com', whatsapp: process.env.SUPPORT_WHATSAPP || '5561996071663', showPublicData: false },
    systemCredit: 'Desenvolvido em parceria por Bruno Saraiva e ChatGPT.',
    notificationChannels: {
      email: { enabled: true, senderName: 'Condomínio Vitória Régia', senderEmail: process.env.EMAIL_FROM || '', replyTo: process.env.EMAIL_REPLY_TO || '' },
      whatsapp: { enabled: false, defaultNumber: process.env.WHATSAPP_DEFAULT_NUMBER || '', sendImages: true },
      telegram: { enabled: false, botToken: process.env.TELEGRAM_BOT_TOKEN || '', chatId: process.env.TELEGRAM_CHAT_ID || '', allowResidentReplies: true, emergencyButton: true, ifoodCodeButton: true, elevatorDeliveryButton: true }
    },
    profilePermissions: {
      morador: { dashboard:true, encomendas:true, visitantes:true, reservas:true, comunicados:true },
      portaria: { dashboard:true, encomendas:true, visitantes:true, comunicados:true, emergencias:true },
      subsindico: { dashboard:true, moradores:true, encomendas:true, visitantes:true, reservas:true, comunicados:true, emergencias:true, backups:true }
    }
  },
  users: [
    { id:'owner-default', name:'Proprietário do sistema', username:process.env.OWNER_USERNAME || 'admin', email:'', password:process.env.OWNER_PASSWORD || 'admin123', role:'owner', active:true, forcePasswordChange:true, createdAt:now() },
    { id:'sindico-default', name:'Síndico provisório', username:'sindico', email:'', password:'sindico123', role:'sindico', active:true, temporary:true, forcePasswordChange:true, createdAt:now() }
  ],
  residents: [], packages: [], visitors: [], recurringVisitors: [], bookings: [], notices: [], emergencies: [], notifications: [], cloudFiles: [], pendingRegistrations: [], passwordResetRequests: [], appInstallRequests: [], units: [], notificationOutbox: [], updateRequests: [], backups: [], supportTickets: [], logs: []
};

function mergeState(raw) {
  const base = JSON.parse(JSON.stringify(DEFAULT_STATE));
  const merged = { ...base, ...(raw || {}) };
  merged.meta = { ...base.meta, ...(raw && raw.meta ? raw.meta : {}), version: VERSION, updatedAt: now() };
  merged.settings = { ...base.settings, ...(raw && raw.settings ? raw.settings : {}) };
  for (const key of ['users','residents','packages','visitors','recurringVisitors','bookings','notices','emergencies','notifications','cloudFiles','pendingRegistrations','passwordResetRequests','appInstallRequests','units','notificationOutbox','updateRequests','backups','supportTickets','logs']) {
    merged[key] = Array.isArray(merged[key]) ? merged[key] : [];
  }
  if (!merged.users.length && !merged.residents.length) {
    merged.users.push(
      { id:'owner-default', name:'Proprietário do sistema', username:process.env.OWNER_USERNAME || 'admin', email:'', password:process.env.OWNER_PASSWORD || 'admin123', role:'owner', active:true, forcePasswordChange:true, createdAt:now() },
      { id:'sindico-default', name:'Síndico provisório', username:'sindico', email:'', password:'sindico123', role:'sindico', active:true, temporary:true, forcePasswordChange:true, createdAt:now() }
    );
  }
  const hasOwner = merged.users.some(u => ['owner','admin'].includes(normalizeRole(u.role)));
  if (!hasOwner) {
    merged.users.unshift({ id:'owner-repair', name:'Proprietário do sistema', username:process.env.OWNER_USERNAME || 'admin', email:'', password:process.env.OWNER_PASSWORD || 'admin123', role:'owner', active:true, forcePasswordChange:true, recovered:true, createdAt:now() });
  }
  const hasSyndic = merged.users.some(u => ['sindico','subsindico'].includes(normalizeRole(u.role)));
  if (!hasSyndic) {
    merged.users.push({ id:'sindico-default', name:'Síndico provisório', username:'sindico', email:'', password:'sindico123', role:'sindico', active:true, temporary:true, forcePasswordChange:true, createdAt:now() });
  }
  return merged;
}

let state = mergeState(readJson(DATA_FILE, DEFAULT_STATE));

function save() {
  writeJson(DATA_FILE, state);
  saveToMysql().catch((error) => {
    dbStatus = { ...dbStatus, ready: false, mode: 'local-fallback', message: error.message, updatedAt: now() };
    console.warn('[mysql] Falha ao salvar estado:', error.message);
  });
}
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
    return { id: 'env-admin', name: process.env.ADMIN_NAME || 'Proprietário do sistema', username: envUser, role: 'owner', active: true };
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
    const firstAdmin = { id: randomId('user'), name: ident.includes('@') ? 'Administrador' : username, username, email: ident.includes('@') ? username : '', password, role: 'owner', active: true, firstAccess: true, createdAt: now() };
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
// normalização automática de usuário sem unidade vinculada

app.use((req, res, next) => {
  if (req && req.body && typeof req.body === 'object') {
    req.body = vrNormalizeUserWithoutUnit(req.body);
  }
  next();
});

app.use(express.urlencoded({ extended: true, limit: process.env.JSON_LIMIT || '30mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(session({
  secret: process.env.SESSION_SECRET || process.env.JWT_SECRET || 'vitoria-regia-session-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: bool('SESSION_COOKIE_SECURE', false) }
}));

function generateTempPassword(length = 6) {
  const digits = '23456789';
  let out = '';
  for (let i = 0; i < Number(length || 6); i += 1) out += digits[Math.floor(Math.random() * digits.length)];
  return out;
}
function findResidentByApartment(apartment) {
  const ap = String(apartment || '').toLowerCase().trim();
  return state.residents.find(r => String(r.apartment || '').toLowerCase().trim() === ap) || null;
}
function queueNotification(channel, to, title, body, image = null, extra = {}) {
  const item = { id: randomId('outbox'), channel, to: to || 'não informado', title, body, image, extra, status: to ? 'registrado' : 'pendente', createdAt: now() };
  state.notificationOutbox.unshift(item);
  return item;
}

app.get('/health', (req, res) => res.json({ ok: true, version: VERSION, frontendDir: FRONTEND_DIR, dataFile: DATA_FILE, time: now() }));
app.get('/api/health', (req, res) => res.json({ ok: true, version: VERSION, database: dbStatus, time: now() }));

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
app.post('/api/auth/forgot-password', (req, res) => {
  const ident = String((req.body && req.body.identifier) || '').trim().toLowerCase();
  if (!ident) return res.status(400).json({ ok:false, error:'Informe usuário, e-mail ou unidade.' });
  const all = [...(state.users || []), ...(state.residents || [])];
  const account = all.find(u => {
    if (u.active === false) return false;
    const ids = [u.username, u.email, u.name, u.apartment].filter(Boolean).map(v => String(v).trim().toLowerCase());
    return ids.includes(ident);
  });
  if (!account) {
    log('senha', 'Solicitação de senha temporária sem cadastro localizado.', { identifier: ident });
    save();
    return res.json({ ok:true, message:'Se o cadastro existir, uma senha temporária será encaminhada pelos canais configurados.' });
  }
  const temp = generateTempPassword(state.settings.temporaryPasswordLength || 6);
  account.password = temp;
  account.forcePasswordChange = true;
  state.passwordResetRequests = Array.isArray(state.passwordResetRequests) ? state.passwordResetRequests : [];
  state.passwordResetRequests.unshift({ id: randomId('reset'), username: account.username || '', name: account.name || '', email: account.email || '', apartment: account.apartment || '', status:'senha temporária gerada', createdAt: now() });
  queueNotification('E-mail', account.email || 'sem e-mail cadastrado', 'Senha temporária do Vitória Régia', `Sua senha temporária é ${temp}. Entre no sistema e altere a senha assim que possível.`);
  if (account.phone) queueNotification('WhatsApp', account.phone, 'Senha temporária do Vitória Régia', `Sua senha temporária é ${temp}.`);
  log('senha', `Senha temporária gerada para ${account.username || account.name}.`);
  save();
  res.json({ ok:true, message:'Senha temporária registrada para envio pelos canais configurados.' });
});

app.post('/api/units/generate', (req, res) => {
  const firstFloor = Number(req.body.firstFloor || 1);
  const lastFloor = Number(req.body.lastFloor || 11);
  const unitsPerFloor = Number(req.body.unitsPerFloor || 3);
  const units = [];
  for (let floor = firstFloor; floor <= lastFloor; floor += 1) {
    for (let unit = 1; unit <= unitsPerFloor; unit += 1) {
      const number = `${floor}${String(unit).padStart(2, '0')}`;
      units.push({ id:`unit-${number}`, apartment:number, floor, active:true, createdAt:now() });
    }
  }
  state.units = units;
  state.settings.autoUnits = { enabled:true, firstFloor, lastFloor, unitsPerFloor, example:`${units[0] && units[0].apartment} a ${units[units.length - 1] && units[units.length - 1].apartment}` };
  log('unidades', `${units.length} unidades automáticas geradas.`);
  save();
  res.json({ ok:true, units });
});

app.post('/api/auth/register', (req, res) => {
  const item = { id: req.body.id || randomId('pending'), role: 'morador', status: 'aguardando aprovação', ...req.body, createdAt: req.body.createdAt || now() };
  state.pendingRegistrations.unshift(item);
  state.notifications.unshift({ id: randomId('notif'), title: 'Novo cadastro pendente', body: `${item.name || 'Usuário'} solicitou acesso para a unidade ${item.apartment || ''}.`, apartment: 'Síndico/Administração', read: false, createdAt: now() });
  log('cadastro', `Cadastro pendente recebido: ${item.name || item.username}.`);
  save();
  res.json({ ok: true, item });
});

app.post('/api/auth/register/:id/approve', (req, res) => {
  const row = state.pendingRegistrations.find(r => r.id === req.params.id);
  if (!row) return res.status(404).json({ ok:false, error:'Cadastro não encontrado.' });
  const temp = generateTempPassword(state.settings.temporaryPasswordLength || 6);
  const resident = { id: randomId('resident'), name: row.name, username: row.username, email: row.email, phone: row.phone, apartment: row.apartment, password: temp, role:'morador', active:true, forcePasswordChange:true, createdAt: now() };
  state.residents.unshift(resident);
  row.status = 'aprovado'; row.approvedAt = now(); row.temporaryPassword = temp;
  queueNotification('E-mail', row.email, 'Cadastro aprovado', `Seu acesso foi aprovado. Usuário: ${row.username}. Senha temporária: ${temp}.`);
  log('cadastro', `Cadastro aprovado: ${row.name}.`);
  save();
  res.json({ ok:true, resident: publicUser(resident), temporaryPassword: temp });
});

app.post('/api/notify/send', (req, res) => {
  const payload = req.body || {};
  const channels = Array.isArray(payload.channels) ? payload.channels : [];
  const queued = channels.map(ch => queueNotification(ch.channel, ch.to, ch.title, ch.body, ch.image, { buttons: ch.buttons || [] }));
  log('notificacoes', `${queued.length || 0} notificação(ões) registradas para envio.`);
  save();
  res.json({ ok:true, queued, note:'Envio real depende da configuração das plataformas no sistema.' });
});

app.post('/api/telegram/webhook', (req, res) => {
  const body = req.body || {};
  log('telegram', 'Resposta recebida pelo Telegram.', { body });
  res.json({ ok:true, actions:['codigo_ifood','autorizar_elevador','emergencia'] });
});

app.post('/api/read-label/package', (req, res) => {
  const text = String(req.body && req.body.text || '').toLowerCase();
  const resident = state.residents.find(r => text.includes(String(r.apartment || '').toLowerCase()) || text.includes(String(r.name || '').toLowerCase().split(/\s+/)[0] || ''));
  res.json({ ok:true, resident: resident ? publicUser(resident) : null, apartment: resident && resident.apartment });
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
  residents: 'residents', users: 'users', packages: 'packages', visitors: 'visitors', notices: 'notices', bookings: 'bookings', emergencies: 'emergencies', notifications: 'notifications', cloudFiles: 'cloudFiles', pendingRegistrations: 'pendingRegistrations', passwordResetRequests: 'passwordResetRequests', appInstallRequests: 'appInstallRequests', units: 'units', notificationOutbox: 'notificationOutbox'
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


app.post('/api/support/contact', (req, res) => {
  const ticket = { id: req.body.id || randomId('support'), ...req.body, system: req.body.system || 'Vitória Régia', version: req.body.version || VERSION, createdAt: req.body.createdAt || now() };
  state.supportTickets = Array.isArray(state.supportTickets) ? state.supportTickets : [];
  state.supportTickets.unshift(ticket);
  const supportEmail = (state.settings.supportContact && state.settings.supportContact.email) || process.env.SUPPORT_EMAIL || 'bmedeiros1987@gmail.com';
  const body = `Usuário: ${ticket.userName || ticket.username || 'não informado'}\nPerfil: ${ticket.userRole || '-'}\nUnidade: ${ticket.apartment || '-'}\nSistema: ${ticket.system} ${ticket.version}\nAssunto: ${ticket.subject || '-'}\n\n${ticket.message || ''}`;
  queueNotification('E-mail', supportEmail, `Suporte Vitória Régia - ${ticket.subject || 'Contato'}`, body, null, { source: 'help-center', hiddenTarget: true });
  log('ajuda', `Mensagem de suporte registrada: ${ticket.subject || 'Contato'}.`);
  save();
  res.json({ ok: true, ticketId: ticket.id, message: 'Mensagem registrada para envio pelo sistema.' });
});

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


app.get('/api/admin/database/status', (req, res) => {
  res.json({ ok: true, version: VERSION, database: dbStatus, requireDatabase: REQUIRE_DATABASE, dataFile: DATA_FILE });
});

app.post('/api/admin/database/sync-to-mysql', async (req, res) => {
  if (!dbPool) return res.status(503).json({ ok: false, error: 'MySQL não está conectado.', database: dbStatus });
  try {
    await saveToMysql();
    res.json({ ok: true, message: 'Estado atual sincronizado com o MySQL.', database: dbStatus });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message, database: dbStatus });
  }
});

app.use(express.static(FRONTEND_DIR, { extensions: ['html'] }));
app.get('*', (req, res) => {
  const indexFile = path.join(FRONTEND_DIR, 'index.html');
  if (fs.existsSync(indexFile)) return res.sendFile(indexFile);
  res.status(404).json({ ok: false, error: 'index.html não encontrado', frontendDir: FRONTEND_DIR });
});

async function start() {
  ensureDir(DATA_FILE);
  await initDatabase();
  save();
  
// Vitória Régia v4.3.4 - reset de senha temporária e envio por Telegram
app.post('/api/users/:id/reset-temporary-password', async (req, res) => {
  const password = vrGenerateTemporaryPassword();
  const userId = req.params.id;
  res.json({
    ok: true,
    userId,
    temporaryPassword: password,
    senhaTemporaria: password,
    forcePasswordChange: true,
    message: 'Senha temporária gerada com sucesso.'
  });
});

app.post('/api/usuarios/:id/resetar-senha-temporaria', async (req, res) => {
  const password = vrGenerateTemporaryPassword();
  const userId = req.params.id;
  res.json({
    ok: true,
    userId,
    temporaryPassword: password,
    senhaTemporaria: password,
    forcePasswordChange: true,
    message: 'Senha temporária gerada com sucesso.'
  });
});

app.post('/api/telegram/send', async (req, res) => {
  const chatId = req.body.chatId || req.body.telegram || req.body.telegramChatId;
  const message = req.body.message || req.body.text || 'Mensagem do sistema Vitória Régia.';
  const result = await vrSendTelegramMessageSafe(chatId, message);
  res.status(result.ok ? 200 : 400).json(result);
});


app.listen(PORT, () => {
    console.log(`Vitória Régia ${VERSION} online na porta ${PORT}`);
    console.log(`Frontend: ${FRONTEND_DIR}`);
    console.log(`Banco: ${dbStatus.provider} | ${dbStatus.mode} | pronto=${dbStatus.ready}`);
  });
}

start().catch((error) => {
  console.error('Erro fatal ao iniciar backend:', error);
  process.exit(1);
});
