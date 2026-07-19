import express from 'express';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
import { classifyTelegramCallPayload } from './telegram-call-classifier.mjs';

const nativeFetch = globalThis.fetch.bind(globalThis);
const JWT_SECRET = process.env.JWT_SECRET || 'troque-este-segredo-em-producao';
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://localhost/vitoriaregia';
const CALLMEBOT_BASE_URL = process.env.VR_CALLMEBOT_BASE_URL || 'https://api.callmebot.com/start.php';
const CALL_ENABLED = bool(process.env.VR_TELEGRAM_CALL_ENABLED, true);
const AUDIO_SECRET = process.env.VR_TELEGRAM_CALL_AUDIO_SECRET || JWT_SECRET;
const recentCalls = new Map();
const testRateLimit = new Map();
let routesInstalled = false;
let schemaPromise = null;

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1','true','yes','sim','on','enabled','ativo'].includes(String(value).trim().toLowerCase());
}
function number(value, fallback, min = 0, max = 999999) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
function clean(value = '', max = 256) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[#*_`>|~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}
function normalizeUsername(value = '') {
  const username = String(value || '').trim().replace(/^@/, '').replace(/[^A-Za-z0-9_]/g, '');
  return username ? `@${username}` : '';
}
function externalDb() {
  try {
    const host = new URL(DATABASE_URL).hostname;
    return !['localhost','127.0.0.1','::1'].includes(host);
  } catch { return /render|neon|supabase|railway|aiven|amazonaws|azure/i.test(DATABASE_URL); }
}
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: externalDb() ? { rejectUnauthorized: false } : false,
  max: number(process.env.VR_TELEGRAM_CALL_POOL_MAX, 3, 1, 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 12000,
});
async function q(sql, params = []) { return pool.query(sql, params); }

async function ensureSchema() {
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    await q(`CREATE TABLE IF NOT EXISTS telegram_call_logs(
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      resident_id INTEGER REFERENCES residents(id) ON DELETE SET NULL,
      chat_id TEXT,
      telegram_username TEXT,
      category TEXT DEFAULT 'notificacao',
      reason TEXT,
      message TEXT,
      provider TEXT DEFAULT 'callmebot',
      mode TEXT DEFAULT 'tts',
      status TEXT DEFAULT 'pendente',
      response_status INTEGER,
      response_excerpt TEXT,
      dedupe_key TEXT UNIQUE,
      requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT now(),
      completed_at TIMESTAMP
    )`);
    await q('CREATE INDEX IF NOT EXISTS telegram_call_logs_user_idx ON telegram_call_logs(user_id, created_at DESC)');
    await q('CREATE INDEX IF NOT EXISTS telegram_call_logs_resident_idx ON telegram_call_logs(resident_id, created_at DESC)');
    await q('CREATE INDEX IF NOT EXISTS telegram_call_logs_chat_idx ON telegram_call_logs(chat_id, created_at DESC)');
  })().catch(error => {
    schemaPromise = null;
    console.warn('[telegram-calls] Falha ao preparar banco:', error.message);
    throw error;
  });
  return schemaPromise;
}

const DEFAULT_PREFS = Object.freeze({
  enabled: false,
  emergency: true,
  visitor: true,
  intercom: true,
  urgent_package: true,
  package: false,
  notice: false,
  quiet_hours_enabled: true,
  quiet_start: '22:00',
  quiet_end: '07:00',
  emergency_overrides_quiet: true,
});
function normalizePrefs(raw = {}) {
  const source = parseJson(raw, {});
  const specific = source.telegram_call || source.telegram_calls || {};
  return {
    ...DEFAULT_PREFS,
    ...Object.fromEntries(Object.entries(specific).filter(([, value]) => value !== undefined)),
  };
}
function validTime(value, fallback) {
  const normalized = String(value || '').trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(normalized) ? normalized : fallback;
}
function sanitizePrefs(body = {}) {
  const allowed = ['enabled','emergency','visitor','intercom','urgent_package','package','notice','quiet_hours_enabled','emergency_overrides_quiet'];
  const out = {};
  for (const key of allowed) if (key in body) out[key] = Boolean(body[key]);
  if ('quiet_start' in body) out.quiet_start = validTime(body.quiet_start, DEFAULT_PREFS.quiet_start);
  if ('quiet_end' in body) out.quiet_end = validTime(body.quiet_end, DEFAULT_PREFS.quiet_end);
  return out;
}
function minuteOfDay(date = new Date()) { return date.getHours() * 60 + date.getMinutes(); }
function timeToMinute(value) {
  const [hours, minutes] = validTime(value, '00:00').split(':').map(Number);
  return hours * 60 + minutes;
}
function isQuietHours(prefs, date = new Date()) {
  if (!prefs.quiet_hours_enabled) return false;
  const now = minuteOfDay(date);
  const start = timeToMinute(prefs.quiet_start);
  const end = timeToMinute(prefs.quiet_end);
  if (start === end) return true;
  return start < end ? now >= start && now < end : now >= start || now < end;
}
function categoryLabel(category) {
  return ({ emergency:'Emergência', visitor:'Visitante', intercom:'Interfone', urgent_package:'Encomenda urgente', package:'Encomenda', notice:'Comunicado', notification:'Notificação' }[category] || 'Notificação');
}
function delayFor(category) {
  const map = {
    emergency: number(process.env.VR_TELEGRAM_CALL_EMERGENCY_DELAY_SECONDS, 2, 0, 300),
    visitor: number(process.env.VR_TELEGRAM_CALL_VISITOR_DELAY_SECONDS, 20, 0, 600),
    intercom: number(process.env.VR_TELEGRAM_CALL_INTERCOM_DELAY_SECONDS, 10, 0, 600),
    urgent_package: number(process.env.VR_TELEGRAM_CALL_URGENT_PACKAGE_DELAY_SECONDS, 5, 0, 600),
    package: number(process.env.VR_TELEGRAM_CALL_PACKAGE_DELAY_SECONDS, 0, 0, 600),
    notice: number(process.env.VR_TELEGRAM_CALL_NOTICE_DELAY_SECONDS, 0, 0, 600),
  };
  return map[category] ?? 0;
}
function shouldCall(prefs, category) {
  if (!CALL_ENABLED || !prefs.enabled) return false;
  if (!(category in prefs) || prefs[category] !== true) return false;
  if (isQuietHours(prefs) && !(category === 'emergency' && prefs.emergency_overrides_quiet)) return false;
  return true;
}
function callText(category, text) {
  const condensed = clean(text, 210);
  const prefix = category === 'emergency'
    ? 'Atenção. Alerta de emergência do Condomínio Vitória Régia.'
    : category === 'visitor'
      ? 'Atenção. Há um visitante aguardando na portaria do Condomínio Vitória Régia.'
      : category === 'intercom'
        ? 'A portaria do Condomínio Vitória Régia está tentando falar com você.'
        : category === 'urgent_package'
          ? 'Atenção. A portaria recebeu uma encomenda urgente para sua unidade.'
          : category === 'package'
            ? 'A portaria do Condomínio Vitória Régia recebeu uma encomenda para sua unidade.'
            : 'Você recebeu um aviso importante do Condomínio Vitória Régia.';
  const details = condensed.replace(/^.*?(vit[oó]ria r[eé]gia|condom[ií]nio)\.?/i, '').trim();
  return clean(details ? `${prefix} ${details}` : `${prefix} Consulte o Telegram para ver os detalhes.`, 256);
}
function pruneRecentCalls() {
  const now = Date.now();
  const ttl = number(process.env.VR_TELEGRAM_CALL_DEDUPE_TTL_MS, 180000, 30000, 3600000);
  for (const [key, timestamp] of recentCalls.entries()) if (now - timestamp > ttl) recentCalls.delete(key);
}
function dedupeKey(target, category, message) {
  const ttl = number(process.env.VR_TELEGRAM_CALL_DEDUPE_TTL_MS, 180000, 30000, 3600000);
  const bucket = Math.floor(Date.now() / ttl);
  return createHash('sha256').update(`${target}|${category}|${clean(message, 256)}|${bucket}`).digest('hex');
}

async function findTargetByChat(chatId = '') {
  const chat = String(chatId || '').trim();
  if (!chat) return null;
  const users = await q(`SELECT u.id AS user_id,u.resident_id,u.name,u.email,u.unit,u.role,u.telegram_chat_id,u.telegram_username,u.notification_preferences,
      r.telegram_username AS resident_telegram_username,r.notification_preferences AS resident_preferences
    FROM users u LEFT JOIN residents r ON r.id=u.resident_id
    WHERE u.telegram_chat_id=$1 AND COALESCE(u.active,true)=true ORDER BY u.id DESC LIMIT 1`, [chat]);
  if (users.rows[0]) {
    const row = users.rows[0];
    return {
      ...row,
      chat_id: chat,
      telegram_username: row.telegram_username || row.resident_telegram_username || '',
      preferences: row.notification_preferences || row.resident_preferences || {},
    };
  }
  const residents = await q(`SELECT id AS resident_id,name,email,unit,telegram_chat_id,telegram_username,notification_preferences
    FROM residents WHERE telegram_chat_id=$1 AND COALESCE(active,true)=true ORDER BY id DESC LIMIT 1`, [chat]);
  if (!residents.rows[0]) return null;
  return { ...residents.rows[0], chat_id: chat, preferences: residents.rows[0].notification_preferences || {} };
}
async function findAuthenticatedUser(payload = {}) {
  const id = Number(payload.id || payload.user_id || payload.sub || 0);
  if (id) {
    const result = await q(`SELECT u.*,r.telegram_username AS resident_telegram_username,r.telegram_chat_id AS resident_telegram_chat_id,
      r.notification_preferences AS resident_preferences FROM users u LEFT JOIN residents r ON r.id=u.resident_id WHERE u.id=$1 LIMIT 1`, [id]);
    if (result.rows[0]) return result.rows[0];
  }
  const email = String(payload.email || '').trim();
  if (email) {
    const result = await q(`SELECT u.*,r.telegram_username AS resident_telegram_username,r.telegram_chat_id AS resident_telegram_chat_id,
      r.notification_preferences AS resident_preferences FROM users u LEFT JOIN residents r ON r.id=u.resident_id WHERE lower(u.email)=lower($1) LIMIT 1`, [email]);
    if (result.rows[0]) return result.rows[0];
  }
  return null;
}
async function findManualTarget(body = {}) {
  if (body.user_id) {
    const result = await q(`SELECT u.id AS user_id,u.resident_id,u.name,u.email,u.unit,u.role,u.telegram_chat_id,u.telegram_username,u.notification_preferences,
      r.telegram_username AS resident_telegram_username,r.telegram_chat_id AS resident_telegram_chat_id,r.notification_preferences AS resident_preferences
      FROM users u LEFT JOIN residents r ON r.id=u.resident_id WHERE u.id=$1 LIMIT 1`, [Number(body.user_id)]);
    const row = result.rows[0];
    if (row) return { ...row, chat_id:row.telegram_chat_id || row.resident_telegram_chat_id || '', telegram_username:row.telegram_username || row.resident_telegram_username || '', preferences:row.notification_preferences || row.resident_preferences || {} };
  }
  if (body.resident_id) {
    const result = await q('SELECT id AS resident_id,name,email,unit,telegram_chat_id,telegram_username,notification_preferences FROM residents WHERE id=$1 LIMIT 1', [Number(body.resident_id)]);
    const row = result.rows[0];
    if (row) return { ...row, chat_id:row.telegram_chat_id || '', preferences:row.notification_preferences || {} };
  }
  const unit = String(body.unit || '').trim().replace(/\s+/g, '').toUpperCase();
  if (unit) {
    const result = await q(`SELECT r.id AS resident_id,r.name,r.email,r.unit,r.telegram_chat_id,r.telegram_username,r.notification_preferences,
      u.id AS user_id,u.role,u.telegram_username AS user_telegram_username,u.telegram_chat_id AS user_telegram_chat_id,u.notification_preferences AS user_preferences
      FROM residents r LEFT JOIN users u ON u.resident_id=r.id AND COALESCE(u.active,true)=true
      WHERE upper(replace(coalesce(r.unit,''),' ',''))=$1 AND COALESCE(r.active,true)=true ORDER BY u.id DESC NULLS LAST,r.id DESC LIMIT 1`, [unit]);
    const row = result.rows[0];
    if (row) return { ...row, chat_id:row.user_telegram_chat_id || row.telegram_chat_id || '', telegram_username:row.user_telegram_username || row.telegram_username || '', preferences:row.user_preferences || row.notification_preferences || {} };
    const fallback = await q(`SELECT id AS user_id,resident_id,name,email,unit,role,telegram_chat_id,telegram_username,notification_preferences
      FROM users WHERE upper(replace(coalesce(unit,''),' ',''))=$1 AND COALESCE(active,true)=true ORDER BY id DESC LIMIT 1`, [unit]);
    if (fallback.rows[0]) return { ...fallback.rows[0], chat_id:fallback.rows[0].telegram_chat_id || '', preferences:fallback.rows[0].notification_preferences || {} };
  }
  return null;
}

function signAudioPayload(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', AUDIO_SECRET).update(body).digest('base64url');
  return `${body}.${signature}`;
}
function verifyAudioPayload(token = '') {
  const [body, signature] = String(token || '').split('.');
  if (!body || !signature) return null;
  const expected = createHmac('sha256', AUDIO_SECRET).update(body).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (!payload?.exp || Number(payload.exp) < Date.now()) return null;
  return payload;
}
function publicBaseUrl() {
  return String(process.env.PUBLIC_APP_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');
}
async function edgeAudioUrl(message) {
  const base = publicBaseUrl();
  if (!base || !process.env.VR_TTS_BASE_URL || !bool(process.env.VR_TELEGRAM_CALL_USE_EDGE_TTS, false)) return '';
  const token = signAudioPayload({
    text: clean(message, 256),
    voice: process.env.VR_TTS_VOICE || 'pt-BR-FranciscaNeural',
    speed: number(process.env.VR_TTS_SPEED, 0.95, 0.5, 2),
    exp: Date.now() + 5 * 60 * 1000,
  });
  return `${base}/api/telegram-calls/audio/${encodeURIComponent(token)}.mp3`;
}
async function performCall({ target, category = 'notification', message, reason = '', requestedBy = null, force = false }) {
  await ensureSchema();
  const username = normalizeUsername(target?.telegram_username);
  if (!username) return { ok:false, skipped:true, reason:'O usuário ainda não possui @username do Telegram vinculado.' };
  const prefs = normalizePrefs(target?.preferences);
  if (!force && !shouldCall(prefs, category)) return { ok:false, skipped:true, reason:'Chamadas desativadas nas preferências do destinatário ou durante o horário silencioso.' };
  const spoken = callText(category, message);
  const key = dedupeKey(username, category, spoken);
  pruneRecentCalls();
  if (recentCalls.has(key)) return { ok:true, skipped:true, deduped:true, reason:'Chamada duplicada bloqueada.' };
  recentCalls.set(key, Date.now());

  const inserted = await q(`INSERT INTO telegram_call_logs(user_id,resident_id,chat_id,telegram_username,category,reason,message,mode,status,dedupe_key,requested_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,'iniciando',$9,$10) ON CONFLICT(dedupe_key) DO NOTHING RETURNING id`,
    [target.user_id || null,target.resident_id || null,target.chat_id || '',username,category,clean(reason,180),spoken,bool(process.env.VR_TELEGRAM_CALL_USE_EDGE_TTS,false)?'mp3':'tts',key,requestedBy || null]);
  const logId = inserted.rows[0]?.id;
  if (!logId) return { ok:true, skipped:true, deduped:true, reason:'Chamada já registrada.' };

  const callUrl = new URL(CALLMEBOT_BASE_URL);
  callUrl.searchParams.set('user', username);
  const mp3 = await edgeAudioUrl(spoken);
  if (mp3) callUrl.searchParams.set('file', mp3);
  else {
    callUrl.searchParams.set('text', spoken);
    callUrl.searchParams.set('lang', process.env.VR_CALLMEBOT_LANG || 'pt-BR-Standard-A');
    callUrl.searchParams.set('rpt', String(number(process.env.VR_CALLMEBOT_REPEAT, 2, 1, 5)));
    callUrl.searchParams.set('cc', process.env.VR_CALLMEBOT_TEXT_COPY || 'missed');
    callUrl.searchParams.set('timeout', String(number(process.env.VR_CALLMEBOT_TIMEOUT_SECONDS, 45, 15, 180)));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), number(process.env.VR_CALLMEBOT_REQUEST_TIMEOUT_MS, 12000, 3000, 30000));
  try {
    const response = await nativeFetch(callUrl, { signal:controller.signal, headers:{ 'user-agent':'Vitoria-Regia-Pro/12.8.5' } });
    const raw = await response.text().catch(() => '');
    const providerOk = response.ok && !/(error|invalid|unauthor|not allowed|disabled)/i.test(raw);
    await q(`UPDATE telegram_call_logs SET status=$1,response_status=$2,response_excerpt=$3,completed_at=now() WHERE id=$4`,
      [providerOk ? 'solicitada' : 'erro',response.status,clean(raw,500),logId]);
    return { ok:providerOk, provider:'callmebot', mode:mp3?'mp3':'tts', status:response.status, log_id:logId, description:providerOk?'Chamada solicitada ao CallMeBot.':clean(raw,300) || 'CallMeBot recusou a chamada.' };
  } catch (error) {
    const description = error.name === 'AbortError' ? 'Tempo limite ao chamar o CallMeBot.' : error.message;
    await q(`UPDATE telegram_call_logs SET status='erro',response_excerpt=$1,completed_at=now() WHERE id=$2`, [clean(description,500),logId]).catch(()=>null);
    return { ok:false, provider:'callmebot', log_id:logId, error:description };
  } finally { clearTimeout(timeout); }
}

async function processTelegramDelivery(url, init, response) {
  if (!CALL_ENABLED || !response?.ok) return;
  const targetUrl = String(typeof url === 'string' ? url : url?.url || url || '');
  if (!/\/bot[^/]+\/sendMessage(?:\?|$)/i.test(targetUrl)) return;
  const telegramResult = await response.json().catch(() => ({}));
  if (telegramResult?.ok === false) return;
  let body = null;
  try { body = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body; } catch {}
  if (!body?.chat_id || !body?.text) {
    try {
      const parsed = new URL(targetUrl);
      body = { chat_id:parsed.searchParams.get('chat_id') || '', text:parsed.searchParams.get('text') || '' };
    } catch { return; }
  }
  if (!body?.chat_id || !body?.text) return;
  const category = classifyTelegramCallPayload(body);
  if (category === 'notification') return;
  const target = await findTargetByChat(body.chat_id).catch(() => null);
  if (!target) return;
  const prefs = normalizePrefs(target.preferences);
  if (!shouldCall(prefs, category)) return;
  const delay = delayFor(category) * 1000;
  setTimeout(() => performCall({ target, category, message:body.text, reason:'Alerta automático após mensagem do Telegram' }).catch(error => console.warn('[telegram-calls] chamada automática:', error.message)), delay).unref?.();
}

globalThis.fetch = async function patchedFetch(input, init) {
  const response = await nativeFetch(input, init);
  try { void processTelegramDelivery(input, init, response.clone()); } catch {}
  return response;
};

function authenticate(req, res, next) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error:'Sessão necessária.' });
  try { req.vrToken = jwt.verify(token, JWT_SECRET); return next(); }
  catch { return res.status(401).json({ error:'Sessão inválida ou expirada.' }); }
}
function adminRole(role = '') { return ['master','admin','sindico','subsindico','portaria'].includes(String(role).toLowerCase()); }
async function attachUser(req, res, next) {
  try {
    req.vrUser = await findAuthenticatedUser(req.vrToken || {});
    if (!req.vrUser) return res.status(401).json({ error:'Usuário não encontrado.' });
    return next();
  } catch (error) { return res.status(500).json({ error:'Falha ao identificar usuário.', details:error.message }); }
}
function safeStatus(user) {
  const prefsSource = user?.notification_preferences || user?.resident_preferences || {};
  const username = normalizeUsername(user?.telegram_username || user?.resident_telegram_username || '');
  const chatId = String(user?.telegram_chat_id || user?.resident_telegram_chat_id || '').trim();
  return {
    enabled: CALL_ENABLED,
    configured: Boolean(CALLMEBOT_BASE_URL),
    provider: 'callmebot',
    audio_mode: bool(process.env.VR_TELEGRAM_CALL_USE_EDGE_TTS,false) && process.env.VR_TTS_BASE_URL ? 'edge_mp3' : 'callmebot_tts',
    username,
    linked: Boolean(chatId),
    ready: Boolean(chatId && username && CALL_ENABLED),
    preferences: normalizePrefs(prefsSource),
    authorization_url: 'https://t.me/CallMeBot_txtbot',
    ios_audio_warning: true,
    limits: { tts_characters:256, shared_bot_timeout_seconds:30 },
  };
}

function installRoutes(app) {
  if (routesInstalled) return;
  routesInstalled = true;
  const router = express.Router();
  router.use(express.json({ limit:'256kb' }));

  router.get('/audio/:token.mp3', async (req, res) => {
    const payload = verifyAudioPayload(req.params.token);
    if (!payload) return res.status(403).json({ error:'Áudio temporário inválido ou expirado.' });
    const ttsBase = String(process.env.VR_TTS_BASE_URL || '').replace(/\/$/, '');
    if (!ttsBase) return res.status(503).json({ error:'Serviço de voz não configurado.' });
    try {
      const response = await nativeFetch(`${ttsBase}/v1/audio/speech`, {
        method:'POST',
        headers:{ 'content-type':'application/json', ...(process.env.VR_TTS_API_KEY ? { authorization:`Bearer ${process.env.VR_TTS_API_KEY}` } : {}) },
        body:JSON.stringify({ model:'tts-1', input:payload.text, voice:payload.voice, response_format:'mp3', speed:payload.speed }),
      });
      if (!response.ok) return res.status(502).json({ error:'Serviço de voz indisponível.' });
      const audio = Buffer.from(await response.arrayBuffer());
      res.set({ 'content-type':'audio/mpeg', 'content-length':String(audio.length), 'cache-control':'private, max-age=60', 'x-content-type-options':'nosniff' });
      return res.send(audio);
    } catch (error) { return res.status(502).json({ error:'Falha ao gerar áudio.', details:error.message }); }
  });

  router.use(authenticate, attachUser);
  router.get('/status', async (req, res) => {
    await ensureSchema().catch(()=>null);
    const history = await q(`SELECT id,category,reason,status,mode,created_at,completed_at FROM telegram_call_logs
      WHERE ($1::int IS NOT NULL AND user_id=$1) OR ($2::int IS NOT NULL AND resident_id=$2)
      ORDER BY created_at DESC LIMIT 12`, [req.vrUser.id || null,req.vrUser.resident_id || null]).catch(()=>({rows:[]}));
    return res.json({ ...safeStatus(req.vrUser), history:history.rows, role:req.vrUser.role });
  });
  router.put('/preferences', async (req, res) => {
    const current = parseJson(req.vrUser.notification_preferences, {});
    const prefs = { ...normalizePrefs(current), ...sanitizePrefs(req.body || {}) };
    const merged = { ...current, telegram:true, telegram_call:prefs };
    await q('UPDATE users SET notification_preferences=$1 WHERE id=$2', [JSON.stringify(merged),req.vrUser.id]);
    if (req.vrUser.resident_id) {
      const resident = await q('SELECT notification_preferences FROM residents WHERE id=$1', [req.vrUser.resident_id]);
      const residentCurrent = parseJson(resident.rows[0]?.notification_preferences, {});
      await q('UPDATE residents SET notification_preferences=$1 WHERE id=$2', [JSON.stringify({ ...residentCurrent, telegram:true, telegram_call:prefs }),req.vrUser.resident_id]);
    }
    return res.json({ ok:true, preferences:prefs, status:{ ...safeStatus({ ...req.vrUser, notification_preferences:merged }) } });
  });
  router.post('/test', async (req, res) => {
    const key = String(req.vrUser.id);
    const last = testRateLimit.get(key) || 0;
    if (Date.now() - last < 60000) return res.status(429).json({ error:'Aguarde um minuto antes de testar novamente.' });
    testRateLimit.set(key, Date.now());
    const target = {
      user_id:req.vrUser.id,
      resident_id:req.vrUser.resident_id,
      chat_id:req.vrUser.telegram_chat_id || req.vrUser.resident_telegram_chat_id || '',
      telegram_username:req.vrUser.telegram_username || req.vrUser.resident_telegram_username || '',
      preferences:req.vrUser.notification_preferences || req.vrUser.resident_preferences || {},
    };
    const result = await performCall({ target, category:'notification', message:'Esta é uma chamada de teste do Condomínio Vitória Régia. A integração com o Telegram está funcionando.', reason:'Teste solicitado pelo usuário', requestedBy:req.vrUser.id, force:true });
    return res.status(result.ok ? 200 : result.skipped ? 409 : 502).json(result);
  });
  router.post('/trigger', async (req, res) => {
    if (!adminRole(req.vrUser.role)) return res.status(403).json({ error:'Apenas administração e portaria podem iniciar chamadas manuais.' });
    const target = await findManualTarget(req.body || {});
    if (!target) return res.status(404).json({ error:'Destinatário não localizado.' });
    const category = ['emergency','visitor','intercom','urgent_package','package','notice','notification'].includes(req.body.category) ? req.body.category : 'notification';
    const message = clean(req.body.message || `${categoryLabel(category)} no Condomínio Vitória Régia. Consulte o Telegram para mais detalhes.`, 1000);
    const result = await performCall({ target, category, message, reason:req.body.reason || 'Chamada manual da administração', requestedBy:req.vrUser.id, force:Boolean(req.body.force) && ['master','admin','sindico'].includes(String(req.vrUser.role)) });
    return res.status(result.ok ? 200 : result.skipped ? 409 : 502).json(result);
  });
  router.get('/history', async (req, res) => {
    const isAdmin = adminRole(req.vrUser.role);
    const limit = number(req.query.limit, 40, 1, 200);
    const rows = isAdmin
      ? await q(`SELECT l.*,COALESCE(u.name,r.name,l.telegram_username) AS recipient,COALESCE(u.unit,r.unit) AS unit
          FROM telegram_call_logs l LEFT JOIN users u ON u.id=l.user_id LEFT JOIN residents r ON r.id=l.resident_id ORDER BY l.created_at DESC LIMIT $1`, [limit])
      : await q(`SELECT id,category,reason,status,mode,created_at,completed_at FROM telegram_call_logs WHERE user_id=$1 OR resident_id=$2 ORDER BY created_at DESC LIMIT $3`, [req.vrUser.id,req.vrUser.resident_id || 0,limit]);
    return res.json({ items:rows.rows });
  });

  const originalUse = installRoutes.originalUse || express.application.use;
  originalUse.call(app, '/api/telegram-calls', router);
  const schemaTimer = setTimeout(() => void ensureSchema(), 5000);
  schemaTimer.unref?.();
  console.log('[telegram-calls] Integração CallMeBot carregada.');
}

const originalUse = express.application.use;
installRoutes.originalUse = originalUse;
express.application.use = function patchedUse(...args) {
  if (!routesInstalled) installRoutes(this);
  return originalUse.apply(this, args);
};

console.log('[telegram-calls] Preload ativo.');
