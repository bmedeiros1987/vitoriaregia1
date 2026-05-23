require('dotenv').config();

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const nodemailer = require('nodemailer');

const { getPool, hasDatabaseConfig, query, testConnection, rowsOf } = require('./db');
const { initDatabase } = require('./schema');

const app = express();
function envBool(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return Boolean(fallback);
  return ['1', 'true', 'yes', 'sim', 'on'].includes(String(raw).trim().toLowerCase());
}

const PORT = Number(process.env.PORT || 10000);
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
const RUNNING_BEHIND_PROXY = envBool('TRUST_PROXY', process.env.RENDER === 'true' || process.env.NODE_ENV === 'production');
const SESSION_COOKIE_SECURE = envBool('SESSION_COOKIE_SECURE', APP_URL.startsWith('https://') || process.env.RENDER === 'true' || process.env.NODE_ENV === 'production');
const SESSION_COOKIE_SAME_SITE = (process.env.SESSION_COOKIE_SAME_SITE || process.env.SESSION_COOKIE_SAMESITE || 'lax').trim().toLowerCase();
if (RUNNING_BEHIND_PROXY) app.set('trust proxy', 1);
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || `${APP_URL.replace(/\/$/, '')}/auth/google/callback`;
const GOOGLE_AUTH_ENABLED = String(process.env.GOOGLE_AUTH_ENABLED || 'false').toLowerCase() === 'true';
const DATA_FILE = process.env.DATA_FILE || path.join(os.tmpdir(), 'vitoria-regia-state.json');
const FRONTEND_DIR = process.env.FRONTEND_DIR
  ? path.resolve(process.env.FRONTEND_DIR)
  : path.resolve(__dirname, '../../');
const REQUIRE_DATABASE = String(process.env.REQUIRE_DATABASE || 'true').toLowerCase() !== 'false';
const ALLOW_LEGACY_DEMO_LOGIN = String(process.env.ALLOW_LEGACY_DEMO_LOGIN || 'false').toLowerCase() === 'true';
const REQUIRE_APPROVED_RESIDENT = String(process.env.REQUIRE_APPROVED_RESIDENT || 'true').toLowerCase() !== 'false';
const BOOTSTRAP_ADMIN_ENABLED = String(process.env.BOOTSTRAP_ADMIN_ENABLED || 'false').toLowerCase() === 'true';
const BOOTSTRAP_ADMIN_EMAIL = String(process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
const BOOTSTRAP_ADMIN_PASSWORD = String(process.env.BOOTSTRAP_ADMIN_PASSWORD || '');
const BOOTSTRAP_ADMIN_NAME = process.env.BOOTSTRAP_ADMIN_NAME || 'Usuário temporário de implantação';
const BOOTSTRAP_DISABLE_AFTER_FIRST_SINDICO = String(process.env.BOOTSTRAP_DISABLE_AFTER_FIRST_SINDICO || 'true').toLowerCase() !== 'false';

let databaseReady = false;

const DEFAULT_STATE = {
  session: null,
  pendingResidents: [],
  residents: [],
  bookings: [],
  packages: [],
  packageLabelMemory: [],
  visitors: [],
  recurringVisitors: [],
  notices: [],
  staff: [],
  staffSchedules: [],
  services: [],
  serviceRequests: [],
  contactMessages: [],
  automationRequests: [],
  financeRecords: [],
  cloudFiles: [],
  emergencyEvents: [],
  emergencySettings: {
    elevatorCompany: '',
    elevatorPhone: '',
    elevatorWhatsapp: '',
    elevatorContract: '',
    elevatorInstructions: 'Mantenha a calma. Não tente abrir a porta à força. Avise portaria e síndico pelo sistema.',
    notifyResidentsAfterConfirm: true,
  },
  settings: null,
};

const DEFAULT_AUTH_ACCOUNTS = [];

const ALLOWED_STATE_KEYS = new Set(Object.keys(DEFAULT_STATE).filter((key) => key !== 'session'));

const DEFAULT_NOTIFICATION_CONFIG = {
  email: {
    enabled: String(process.env.EMAIL_ENABLED || process.env.SMTP_ENABLED || 'false').toLowerCase() === 'true',
    provider: process.env.EMAIL_PROVIDER || (process.env.MAILERSEND_API_KEY ? 'mailersend' : 'smtp'),
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true').toLowerCase() === 'true',
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_APP_PASSWORD || '',
    fromName: process.env.SMTP_FROM_NAME || process.env.MAILERSEND_FROM_NAME || 'Condomínio Vitória Régia',
    fromEmail: process.env.SMTP_FROM_EMAIL || process.env.MAILERSEND_FROM_EMAIL || process.env.SMTP_USER || '',
    testTo: process.env.SMTP_TEST_TO || process.env.MAILERSEND_TEST_TO || process.env.SMTP_USER || '',
    mailersend: {
      apiKey: process.env.MAILERSEND_API_KEY || '',
      fromName: process.env.MAILERSEND_FROM_NAME || process.env.SMTP_FROM_NAME || 'Condomínio Vitória Régia',
      fromEmail: process.env.MAILERSEND_FROM_EMAIL || '',
      testTo: process.env.MAILERSEND_TEST_TO || process.env.SMTP_TEST_TO || process.env.SMTP_USER || '',
    },
  },
  whatsapp: {
    enabled: String(process.env.WHATSAPP_ENABLED || 'false').toLowerCase() === 'true',
    provider: process.env.WHATSAPP_PROVIDER || (process.env.PERISKOPE_API_KEY ? 'periskope' : (process.env.EVOLUTION_API_KEY ? 'evolution' : 'meta')),
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v20.0',
    token: process.env.WHATSAPP_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    countryCode: process.env.WHATSAPP_COUNTRY_CODE || '55',
    testTo: process.env.WHATSAPP_TEST_TO || process.env.EVOLUTION_TEST_TO || process.env.PERISKOPE_TEST_TO || '',
    evolution: {
      serverUrl: process.env.EVOLUTION_API_URL || process.env.EVOLUTION_SERVER_URL || '',
      apiKey: process.env.EVOLUTION_API_KEY || '',
      instanceName: process.env.EVOLUTION_INSTANCE || process.env.EVOLUTION_INSTANCE_NAME || '',
      countryCode: process.env.EVOLUTION_COUNTRY_CODE || process.env.WHATSAPP_COUNTRY_CODE || '55',
      testTo: process.env.EVOLUTION_TEST_TO || process.env.WHATSAPP_TEST_TO || '',
      linkPreview: String(process.env.EVOLUTION_LINK_PREVIEW || 'false').toLowerCase() === 'true',
    },
    periskope: {
      baseUrl: process.env.PERISKOPE_BASE_URL || 'https://api.periskope.app/v1',
      apiKey: process.env.PERISKOPE_API_KEY || '',
      phone: process.env.PERISKOPE_PHONE || process.env.WHATSAPP_SENDER_PHONE || '',
      countryCode: process.env.PERISKOPE_COUNTRY_CODE || process.env.WHATSAPP_COUNTRY_CODE || '55',
      testTo: process.env.PERISKOPE_TEST_TO || process.env.WHATSAPP_TEST_TO || '',
      hideUrlPreview: String(process.env.PERISKOPE_HIDE_URL_PREVIEW || 'true').toLowerCase() !== 'false',
    },
  },
  telegram: {
    enabled: String(process.env.TELEGRAM_ENABLED || 'false').toLowerCase() === 'true',
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    botUsername: process.env.TELEGRAM_BOT_USERNAME || '',
    defaultChatId: process.env.TELEGRAM_DEFAULT_CHAT_ID || process.env.TELEGRAM_TEST_CHAT_ID || '',
    testChatId: process.env.TELEGRAM_TEST_CHAT_ID || process.env.TELEGRAM_DEFAULT_CHAT_ID || '',
    parseMode: process.env.TELEGRAM_PARSE_MODE || 'HTML',
  },
};

const DEFAULT_ASAAS_CONFIG = {
  enabled: String(process.env.ASAAS_ENABLED || 'false').toLowerCase() === 'true',
  environment: process.env.ASAAS_ENVIRONMENT || 'sandbox',
  apiKey: process.env.ASAAS_API_KEY || '',
  dueDaysBeforeReservation: Number(process.env.ASAAS_DUE_DAYS_BEFORE || 2),
  fineValue: Number(process.env.ASAAS_FINE_VALUE || 2),
  interestValue: Number(process.env.ASAAS_INTEREST_VALUE || 1),
  notificationEnabled: String(process.env.ASAAS_NOTIFICATION_ENABLED || 'true').toLowerCase() === 'true',
};

const DEFAULT_STORAGE_CONFIG = {
  enabled: String(process.env.STORAGE_ENABLED || process.env.TERABOX_ENABLED || 'false').toLowerCase() === 'true',
  provider: process.env.STORAGE_PROVIDER || ((process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY)) ? 'supabase' : (process.env.TERABOX_ACCESS_TOKEN ? 'terabox' : 'metadata-only')),
  maxUploadMb: Number(process.env.STORAGE_MAX_UPLOAD_MB || process.env.UPLOAD_MAX_MB || 10),
  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '',
    bucket: process.env.SUPABASE_STORAGE_BUCKET || 'vitoria-regia',
    folder: process.env.SUPABASE_STORAGE_FOLDER || 'documentos',
    publicBucket: String(process.env.SUPABASE_STORAGE_PUBLIC || 'false').toLowerCase() === 'true',
    signedUrlExpires: Number(process.env.SUPABASE_SIGNED_URL_EXPIRES || 3600),
  },
  terabox: {
    baseUrl: process.env.TERABOX_BASE_URL || 'https://www.terabox.com',
    uploadBaseUrl: process.env.TERABOX_UPLOAD_BASE_URL || '',
    accessToken: process.env.TERABOX_ACCESS_TOKEN || '',
    accessTokenParam: process.env.TERABOX_ACCESS_TOKEN_PARAM || 'access_tokens',
    folder: process.env.TERABOX_FOLDER || '/vitoria-regia',
    rtype: Number(process.env.TERABOX_RTYPE || 1),
  },
};

function deepMerge(baseValue, patchValue) {
  const result = { ...(baseValue || {}) };
  for (const [key, value] of Object.entries(patchValue || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) result[key] = deepMerge(result[key], value);
    else result[key] = value;
  }
  return result;
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJsonFileFallback() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return { state: DEFAULT_STATE, notificationConfig: DEFAULT_NOTIFICATION_CONFIG, asaasConfig: DEFAULT_ASAAS_CONFIG, storageConfig: DEFAULT_STORAGE_CONFIG, notificationLogs: [], activityLogs: [], authAccounts: DEFAULT_AUTH_ACCOUNTS };
    }
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return {
      state: { ...DEFAULT_STATE, ...(parsed.state || {}) },
      notificationConfig: deepMerge(DEFAULT_NOTIFICATION_CONFIG, parsed.notificationConfig || {}),
      asaasConfig: deepMerge(DEFAULT_ASAAS_CONFIG, parsed.asaasConfig || {}),
      notificationLogs: Array.isArray(parsed.notificationLogs) ? parsed.notificationLogs : [],
      activityLogs: Array.isArray(parsed.activityLogs) ? parsed.activityLogs : [],
      storageConfig: deepMerge(DEFAULT_STORAGE_CONFIG, parsed.storageConfig || {}),
      authAccounts: Array.isArray(parsed.authAccounts) ? parsed.authAccounts : DEFAULT_AUTH_ACCOUNTS,
    };
  } catch (error) {
    console.warn('Não foi possível ler arquivo local, usando estado vazio:', error.message);
    return { state: DEFAULT_STATE, notificationConfig: DEFAULT_NOTIFICATION_CONFIG, asaasConfig: DEFAULT_ASAAS_CONFIG, storageConfig: DEFAULT_STORAGE_CONFIG, notificationLogs: [], activityLogs: [], authAccounts: DEFAULT_AUTH_ACCOUNTS };
  }
}

function writeJsonFileFallback(store) {
  ensureDir(DATA_FILE);
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}

function normalizeStore(raw = {}) {
  return {
    state: { ...DEFAULT_STATE, ...(raw.state || {}) },
    notificationConfig: deepMerge(DEFAULT_NOTIFICATION_CONFIG, raw.notificationConfig || {}),
    asaasConfig: deepMerge(DEFAULT_ASAAS_CONFIG, raw.asaasConfig || {}),
    storageConfig: deepMerge(DEFAULT_STORAGE_CONFIG, raw.storageConfig || {}),
    notificationLogs: Array.isArray(raw.notificationLogs) ? raw.notificationLogs : [],
    activityLogs: Array.isArray(raw.activityLogs) ? raw.activityLogs : [],
    authAccounts: Array.isArray(raw.authAccounts) ? raw.authAccounts : DEFAULT_AUTH_ACCOUNTS,
  };
}


function stripFileDataForStorage(value) {
  if (Array.isArray(value)) return value.map(stripFileDataForStorage);
  if (!value || typeof value !== 'object') return value;
  const isCloudMetaObject = Boolean(
    (value.storage || value.provider || value.bucket || value.path) &&
    (value.name || value.size || value.uploadedAt || value.type)
  );
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    if (key === 'dataUrl' || key === 'base64' || key === 'fileBase64') continue;
    if (isCloudMetaObject && ['downloadUrl', 'url', 'signedUrl', 'providerResponse', 'rawResponse'].includes(key)) continue;
    if (key === 'photo' && typeof raw === 'string' && raw.startsWith('data:')) {
      out.photo = null;
      out.photoRemovedFromDatabase = true;
      continue;
    }
    if (typeof raw === 'string' && raw.startsWith('data:') && raw.length > 500) {
      out[key] = '[arquivo não armazenado no banco]';
      continue;
    }
    out[key] = stripFileDataForStorage(raw);
  }
  return out;
}
function toJson(value) {
  return JSON.stringify(stripFileDataForStorage(value || {}));
}

function fromJson(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

function mysqlDateTime(value) {
  const date = value ? new Date(value) : new Date();
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  // MySQL TIMESTAMP/DATETIME não aceita ISO com "T", milissegundos e "Z"
  // em todos os ambientes. Enviamos sempre UTC no formato compatível:
  // YYYY-MM-DD HH:mm:ss. O valor ISO original continua preservado dentro
  // do payload JSON quando existir.
  return safe.toISOString().slice(0, 19).replace('T', ' ');
}

function isoOrNow(value) {
  return mysqlDateTime(value);
}

function nullableDate(value) {
  return value || null;
}

async function replaceTableFromState(client, table, rows, mapper) {
  await client.query(`delete from ${table}`);
  for (const item of rows || []) {
    await mapper(client, item || {});
  }
}

async function mirrorStateToTables(client, state) {
  await replaceTableFromState(client, 'residents', state.residents, (c, item) => c.query(
    `insert into residents (id, name, email, whatsapp, apartment, status, payload, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,now())`,
    [item.id || `resident-${Date.now()}`, item.name || 'Morador', item.email || null, item.whatsapp || null, item.apartment || '', item.status || 'approved', toJson(item), isoOrNow(item.createdAt)]
  ));

  await replaceTableFromState(client, 'pending_residents', state.pendingResidents, (c, item) => c.query(
    `insert into pending_residents (id, name, email, whatsapp, apartment, status, payload, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,now())`,
    [item.id || `pending-${Date.now()}`, item.name || 'Morador', item.email || null, item.whatsapp || null, item.apartment || '', item.status || 'pending', toJson(item), isoOrNow(item.createdAt)]
  ));

  await replaceTableFromState(client, 'bookings', state.bookings, (c, item) => c.query(
    `insert into bookings (id, space_id, space_name, date, period, apartment, resident_name, resident_email, resident_whatsapp, status, fee, payload, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now())`,
    [item.id || `booking-${Date.now()}`, item.spaceId || null, item.spaceName || null, nullableDate(item.date), item.period || null, item.apartment || null, item.residentName || null, item.residentEmail || null, item.residentWhatsapp || null, item.status || 'pending', Number(item.fee || 0), toJson(item), isoOrNow(item.createdAt)]
  ));

  await replaceTableFromState(client, 'visitors', state.visitors, (c, item) => c.query(
    `insert into visitors (id, name, document, phone, apartment, type, photo, payload, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())`,
    [item.id || `visitor-${Date.now()}`, item.name || 'Visitante', item.document || null, item.phone || null, item.apartment || null, item.type || null, (typeof item.photo === 'string' && item.photo.startsWith('data:')) ? null : (item.photo || null), toJson(item), isoOrNow(item.createdAt)]
  ));

  await replaceTableFromState(client, 'packages', state.packages, (c, item) => c.query(
    `insert into packages (id, apartment, recipient, carrier, code, status, payload, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,now())`,
    [item.id || `package-${Date.now()}`, item.apartment || null, item.recipient || null, item.carrier || null, item.code || null, item.status || 'open', toJson(item), isoOrNow(item.createdAt)]
  ));

  await replaceTableFromState(client, 'notices', state.notices, (c, item) => c.query(
    `insert into notices (id, title, category, message, payload, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,now())`,
    [item.id || `notice-${Date.now()}`, item.title || 'Comunicado', item.category || null, item.message || null, toJson(item), isoOrNow(item.createdAt)]
  ));

  await replaceTableFromState(client, 'staff', state.staff, (c, item) => c.query(
    `insert into staff (id, name, role, email, whatsapp, active, payload, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,now())`,
    [item.id || `staff-${Date.now()}`, item.name || 'Equipe', item.role || 'porteiro', item.email || null, item.whatsapp || null, item.active !== false, toJson(item), isoOrNow(item.createdAt)]
  ));

  await replaceTableFromState(client, 'services', state.services, (c, item) => c.query(
    `insert into services (id, name, category, price, active, payload, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,now())`,
    [item.id || `service-${Date.now()}`, item.name || 'Serviço', item.category || null, Number(item.price || 0), item.active !== false, toJson(item), isoOrNow(item.createdAt)]
  ));

  await replaceTableFromState(client, 'service_requests', state.serviceRequests, (c, item) => c.query(
    `insert into service_requests (id, service_id, service_name, apartment, resident_name, resident_email, status, amount, payload, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())`,
    [item.id || `service-request-${Date.now()}`, item.serviceId || null, item.serviceName || item.name || null, item.apartment || null, item.residentName || null, item.residentEmail || null, item.status || 'pending', Number(item.amount || item.price || 0), toJson(item), isoOrNow(item.createdAt)]
  ));

  await replaceTableFromState(client, 'contact_messages', state.contactMessages, (c, item) => c.query(
    `insert into contact_messages (id, target, apartment, resident_name, resident_email, subject, message, status, payload, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())`,
    [item.id || `contact-${Date.now()}`, item.target || null, item.apartment || null, item.residentName || null, item.residentEmail || null, item.subject || null, item.message || null, item.status || 'sent', toJson(item), isoOrNow(item.createdAt)]
  ));
}

async function saveStoreToDatabase(nextStore) {
  const db = getPool();
  if (!db || !databaseReady) throw new Error('Banco de dados indisponível.');
  const client = await db.connect();
  try {
    await client.query('begin');
    await client.query(
      `insert into app_meta (` + "`key`" + `, value, updated_at) values ('state', ?, now())
       on duplicate key update value = values(value), updated_at = now()`,
      [toJson(nextStore.state || DEFAULT_STATE)]
    );
    await client.query(
      `insert into notification_config (id, config, updated_at) values (1, ?, now())
       on duplicate key update config = values(config), updated_at = now()`,
      [toJson(nextStore.notificationConfig || DEFAULT_NOTIFICATION_CONFIG)]
    );
    await client.query(
      `insert into asaas_config (id, config, updated_at) values (1, ?, now())
       on duplicate key update config = values(config), updated_at = now()`,
      [toJson(nextStore.asaasConfig || DEFAULT_ASAAS_CONFIG)]
    );
    await client.query(
      `insert into app_meta (` + "`key`" + `, value, updated_at) values ('storage_config', ?, now())
       on duplicate key update value = values(value), updated_at = now()`,
      [toJson(nextStore.storageConfig || DEFAULT_STORAGE_CONFIG)]
    );
    await mirrorStateToTables(client, nextStore.state || DEFAULT_STATE);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function ensureStateRowForUpdate(client) {
  await client.query(
    `insert into app_meta (` + "`key`" + `, value, updated_at) values ('state', ?, now())
     on duplicate key update ` + "`key`" + ` = values(` + "`key`" + `)`,
    [toJson(DEFAULT_STATE)]
  );
  const stateResult = await client.query(`select value from app_meta where ` + "`key`" + ` = 'state' for update`);
  return fromJson(rowsOf(stateResult)[0]?.value, DEFAULT_STATE);
}

async function saveStatePatchToDatabase(patch = {}) {
  const db = getPool();
  if (!db || !databaseReady) throw new Error('Banco de dados indisponível.');
  const client = await db.connect();
  try {
    await client.query('begin');
    const currentState = await ensureStateRowForUpdate(client);
    const nextState = { ...DEFAULT_STATE, ...(currentState || {}) };
    for (const [key, value] of Object.entries(patch || {})) {
      if (ALLOWED_STATE_KEYS.has(key)) nextState[key] = value;
    }
    await client.query(
      `update app_meta set value = ?, updated_at = now() where ` + "`key`" + ` = 'state'`,
      [toJson(nextState)]
    );
    await mirrorStateToTables(client, nextState);
    await client.query('commit');
    store = normalizeStore({ ...store, state: nextState });
    return store.state;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function loadStoreFromDatabase() {
  const stateResult = await query(`select value from app_meta where ` + "`key`" + ` = 'state'`);
  const configResult = await query(`select config from notification_config where id = 1`);
  const asaasConfigResult = await query(`select config from asaas_config where id = 1`);
  const storageConfigResult = await query(`select value from app_meta where ` + "`key`" + ` = 'storage_config'`);
  const logsResult = await query(`
    select id, channel, recipient, subject, message, status, error, provider_response as "providerResponse", created_at as "createdAt"
    from notification_logs
    order by created_at desc
    limit 200
  `);
  const activityLogsResult = await query(`
    select id, actor_name as "actorName", actor_email as "actorEmail", actor_role as "actorRole", action, entity_type as "entityType", entity_id as "entityId", apartment, summary, details, created_at as "createdAt"
    from activity_logs
    order by created_at desc
    limit 200
  `);

  return normalizeStore({
    state: fromJson(rowsOf(stateResult)[0]?.value, DEFAULT_STATE),
    notificationConfig: fromJson(rowsOf(configResult)[0]?.config, DEFAULT_NOTIFICATION_CONFIG),
    asaasConfig: fromJson(rowsOf(asaasConfigResult)[0]?.config, DEFAULT_ASAAS_CONFIG),
    storageConfig: fromJson(rowsOf(storageConfigResult)[0]?.value, DEFAULT_STORAGE_CONFIG),
    notificationLogs: rowsOf(logsResult),
    activityLogs: rowsOf(activityLogsResult),
  });
}

async function loadStore() {
  if (hasDatabaseConfig()) {
    try {
      if (String(process.env.AUTO_INIT_DB || 'true').toLowerCase() !== 'false') await initDatabase();
      databaseReady = true;
      const info = await testConnection();
      console.log(`Banco conectado: ${info.database} (${info.user})`);
      return await loadStoreFromDatabase();
    } catch (error) {
      databaseReady = false;
      console.error('Banco de dados indisponível:', error.message);
      if (REQUIRE_DATABASE) {
        throw new Error(`Banco obrigatório indisponível. Corrija as variáveis MYSQL_HOST/MYSQL_PORT/MYSQL_DATABASE/MYSQL_USER/MYSQL_PASSWORD/MYSQL_SSL no Render. Detalhe: ${error.message}`);
      }
    }
  } else if (REQUIRE_DATABASE) {
    throw new Error('Banco obrigatório não configurado. Informe DATABASE_URL ou MYSQL_HOST/MYSQL_DATABASE/MYSQL_USER/MYSQL_PASSWORD nas Environment Variables do Render.');
  }
  console.warn('Modo temporário por arquivo ativado porque REQUIRE_DATABASE=false. Não use em produção.');
  return readJsonFileFallback();
}

async function saveStore(nextStore) {
  if (databaseReady) {
    try {
      await saveStoreToDatabase(nextStore);
      return;
    } catch (error) {
      console.error('Falha ao salvar no banco:', error.message);
      throw error;
    }
  }
  if (REQUIRE_DATABASE) throw new Error('Banco obrigatório indisponível. Salvamento local/demo está desativado.');
  writeJsonFileFallback(nextStore);
}

async function freshStoreForWrite() {
  if (databaseReady) return await loadStoreFromDatabase();
  return store;
}

let store = normalizeStore({});

function normalizeEmail(value = '') {
  return String(value).trim().toLowerCase();
}

function adminEmails() {
  return String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((item) => normalizeEmail(item))
    .filter(Boolean);
}

function portariaEmails() {
  return String(process.env.PORTARIA_EMAILS || '')
    .split(',')
    .map((item) => normalizeEmail(item))
    .filter(Boolean);
}


function staffAvailable(person, dateISO = new Date().toISOString().slice(0, 10)) {
  if (!person || person.active === false) return false;
  const status = String(person.status || 'disponivel').toLowerCase();
  if (!['disponivel', 'disponível', 'ativo', 'available', ''].includes(status)) {
    const from = String(person.awayFrom || '').slice(0, 10);
    const to = String(person.awayTo || '').slice(0, 10);
    if (!from && !to) return false;
    if ((!from || dateISO >= from) && (!to || dateISO <= to)) return false;
  }
  return true;
}

function activeStaffByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  return (store.state?.staff || []).find((person) => {
    if (person.active === false) return false;
    return normalizeEmail(person.email || '') === normalized;
  }) || null;
}

function hasActiveNonBootstrapSindico() {
  const bootstrapEmail = normalizeEmail(BOOTSTRAP_ADMIN_EMAIL);
  return (store.state?.staff || []).some((person) => {
    if (person.active === false) return false;
    if (!staffIsAdministrator(person)) return false;
    const email = normalizeEmail(person.email || '');
    return email && email !== bootstrapEmail;
  });
}

function bootstrapAdminAvailable() {
  if (!BOOTSTRAP_ADMIN_ENABLED || !BOOTSTRAP_ADMIN_EMAIL || !BOOTSTRAP_ADMIN_PASSWORD) return false;
  if (BOOTSTRAP_DISABLE_AFTER_FIRST_SINDICO && hasActiveNonBootstrapSindico()) return false;
  return true;
}



function passwordPolicy(password = '') {
  const value = String(password || '');
  if (value.length < 6) return 'A senha precisa ter pelo menos 6 caracteres.';
  return '';
}

function makePasswordHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password || ''), salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, storedHash = '') {
  const parts = String(storedHash || '').split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hash] = parts;
  const expected = Buffer.from(hash, 'hex');
  const actual = crypto.scryptSync(String(password || ''), salt, expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function temporaryPassword() {
  // Senha temporária simples para o usuário digitar, mas gerada de forma aleatória.
  // Exemplo: VR-482913
  const number = crypto.randomInt(100000, 1000000);
  return `VR-${number}`;
}

function fallbackAuthAccounts() {
  if (!Array.isArray(store.authAccounts)) store.authAccounts = [];
  return store.authAccounts;
}

function normalizeAuthAccountRow(account = {}) {
  return {
    email: normalizeEmail(account.email || ''),
    role: account.role || 'morador',
    residentId: account.residentId || account.resident_id || null,
    staffId: account.staffId || account.staff_id || null,
    passwordHash: account.passwordHash || account.password_hash || '',
    mustChangePassword: Boolean(account.mustChangePassword ?? account.must_change_password),
    active: Boolean(account.active),
    lastLoginAt: account.lastLoginAt || account.last_login_at || null,
    metadata: fromJson(account.metadata, account.metadata || {}),
    createdAt: account.createdAt || account.created_at || new Date().toISOString(),
    updatedAt: account.updatedAt || account.updated_at || new Date().toISOString(),
  };
}

async function persistFallbackAuthAccounts() {
  if (databaseReady) return;
  if (REQUIRE_DATABASE) throw new Error('Banco obrigatório indisponível. Salvamento local/demo está desativado.');
  writeJsonFileFallback(store);
}

async function authAccountByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  if (!databaseReady) {
    const account = fallbackAuthAccounts().map(normalizeAuthAccountRow).find((item) => item.email === normalized);
    return account || null;
  }
  const result = await query(`select email, role, resident_id as "residentId", staff_id as "staffId", password_hash as "passwordHash", must_change_password as "mustChangePassword", active, last_login_at as "lastLoginAt", metadata from auth_accounts where email = ? limit 1`, [normalized]);
  const row = rowsOf(result)[0];
  return row ? normalizeAuthAccountRow(row) : null;
}

async function upsertAuthAccount({ email, role = 'morador', residentId = null, staffId = null, password, passwordHash, active = false, mustChangePassword = false, metadata = {} }) {
  const normalized = normalizeEmail(email);
  if (!normalized) throw new Error('E-mail obrigatório para criar acesso.');
  const finalHash = passwordHash || makePasswordHash(password || temporaryPassword());
  if (!databaseReady) {
    const accounts = fallbackAuthAccounts();
    const now = new Date().toISOString();
    const existingIndex = accounts.findIndex((item) => normalizeEmail(item.email || '') === normalized);
    const existing = existingIndex >= 0 ? normalizeAuthAccountRow(accounts[existingIndex]) : {};
    const next = {
      ...existing,
      email: normalized,
      role,
      residentId: residentId || null,
      staffId: staffId || null,
      passwordHash: finalHash,
      mustChangePassword: Boolean(mustChangePassword),
      active: Boolean(active),
      metadata: metadata || {},
      createdAt: existing.createdAt || now,
      updatedAt: now,
    };
    if (existingIndex >= 0) accounts[existingIndex] = next; else accounts.unshift(next);
    await persistFallbackAuthAccounts();
    return authAccountByEmail(normalized);
  }
  await query(
    `insert into auth_accounts (email, role, resident_id, staff_id, password_hash, must_change_password, active, metadata, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,now(),now())
     on duplicate key update role=values(role), resident_id=values(resident_id), staff_id=values(staff_id), password_hash=values(password_hash), must_change_password=values(must_change_password), active=values(active), metadata=values(metadata), updated_at=now()`,
    [normalized, role, residentId || null, staffId || null, finalHash, Boolean(mustChangePassword), Boolean(active), toJson(metadata || {})]
  );
  return authAccountByEmail(normalized);
}

async function touchAuthLogin(email) {
  const normalized = normalizeEmail(email);
  try {
    if (!databaseReady) {
      const accounts = fallbackAuthAccounts();
      const index = accounts.findIndex((item) => normalizeEmail(item.email || '') === normalized);
      if (index >= 0) {
        accounts[index] = { ...normalizeAuthAccountRow(accounts[index]), lastLoginAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        await persistFallbackAuthAccounts();
      }
      return;
    }
    await query(`update auth_accounts set last_login_at=now(), updated_at=now() where email = ?`, [normalized]);
  } catch (_) {}
}

function roleKey(value = '') {
  return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function staffIsAdministrator(personOrRole = {}) {
  const role = roleKey(typeof personOrRole === 'object' ? personOrRole.role : personOrRole);
  return Boolean(
    (typeof personOrRole === 'object' && (personOrRole.isAdmin || personOrRole.admin || personOrRole.systemAdmin || personOrRole.accessRole === 'admin')) ||
    ['sindico', 'subsindico', 'administrador', 'admin'].includes(role)
  );
}

function staffRoleToAppRole(personOrRole = '') {
  if (staffIsAdministrator(personOrRole)) return 'sindico';
  const value = roleKey(typeof personOrRole === 'object' ? personOrRole.role : personOrRole);
  if (value === 'porteiro' || value === 'portaria') return 'portaria';
  return 'morador';
}

function normalizeAllowedTabs(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(',');
  return source.map((item) => String(item || '').trim()).filter(Boolean).filter((item, index, arr) => arr.indexOf(item) === index);
}

function findResidentByEmail(email) {
  const normalized = normalizeEmail(email);
  return (store.state?.residents || []).find((resident) => normalizeEmail(resident.email || '') === normalized && (resident.status || 'approved') === 'approved') || null;
}

function findResidentById(id) {
  const needle = String(id || '').trim();
  if (!needle) return null;
  return (store.state?.residents || []).find((resident) => String(resident.id || '').trim() === needle && (resident.status || 'approved') === 'approved') || null;
}

function findStaffByEmail(email) {
  const normalized = normalizeEmail(email);
  return (store.state?.staff || []).find((person) => normalizeEmail(person.email || '') === normalized && person.active !== false) || null;
}

function findStaffById(id) {
  const needle = String(id || '').trim();
  if (!needle) return null;
  return (store.state?.staff || []).find((person) => String(person.id || '').trim() === needle && person.active !== false) || null;
}

function resolveAccountTarget(email, requestedRole = '', ids = {}) {
  const staff = findStaffById(ids.staffId) || findStaffByEmail(email);
  const resident = findResidentById(ids.residentId) || findResidentByEmail(email);
  if (staff) return { role: staffRoleToAppRole(staff), staff, resident, active: staffAvailable(staff), allowedTabs: normalizeAllowedTabs(staff.allowedTabs) };
  if (resident) return { role: 'morador', staff: null, resident, active: true, allowedTabs: [] };
  return { role: requestedRole || 'morador', staff: null, resident: null, active: false, allowedTabs: [] };
}

function fallbackTargetFromAdminReset(body = {}, email = '') {
  const targetType = String(body.targetType || '').trim().toLowerCase();
  const role = roleKey(body.role || '');
  const name = String(body.name || '').trim();
  const apartment = String(body.apartment || '').trim();
  const residentId = String(body.residentId || '').trim();
  const staffId = String(body.staffId || '').trim();
  if (targetType === 'staff' || staffId || ['sindico', 'subsindico', 'administrador', 'admin', 'porteiro', 'portaria'].includes(role)) {
    if (!name && !email) return null;
    const staff = {
      id: staffId || `staff-${crypto.createHash('sha1').update(email || name).digest('hex').slice(0, 10)}`,
      name: name || email,
      email,
      role: body.role || 'Colaborador',
      active: true,
      allowedTabs: normalizeAllowedTabs(body.allowedTabs),
      telegram: body.telegramChatId || body.telegram || body.chatId || '',
      telegramChatId: body.telegramChatId || body.telegram || body.chatId || '',
    };
    return { role: staffRoleToAppRole(staff), staff, resident: null, active: true, allowedTabs: normalizeAllowedTabs(staff.allowedTabs), fallback: true };
  }
  if (targetType === 'resident' || residentId || role === 'morador') {
    if (!email || (!name && !apartment && !residentId)) return null;
    const resident = {
      id: residentId || `resident-${crypto.createHash('sha1').update(email).digest('hex').slice(0, 10)}`,
      name: name || email,
      email,
      apartment,
      whatsapp: body.whatsapp || '',
      telegram: body.telegramChatId || body.telegram || body.chatId || '',
      telegramChatId: body.telegramChatId || body.telegram || body.chatId || '',
      cpfCnpj: body.cpfCnpj || '',
      status: 'approved',
    };
    return { role: 'morador', staff: null, resident, active: true, allowedTabs: [], fallback: true };
  }
  return null;
}

async function ensureAdminResetTargetInState(target = {}, email = '', body = {}) {
  if (!target || (!target.resident && !target.staff)) return target;
  const state = store.state || DEFAULT_STATE;
  if (target.resident) {
    const current = Array.isArray(state.residents) ? state.residents : [];
    const residentId = String(target.resident.id || body.residentId || '').trim();
    const index = current.findIndex((resident) => (residentId && String(resident.id || '').trim() === residentId) || normalizeEmail(resident.email || '') === email);
    const merged = {
      ...(index >= 0 ? current[index] : {}),
      ...target.resident,
      id: residentId || target.resident.id || `resident-${crypto.createHash('sha1').update(email).digest('hex').slice(0, 10)}`,
      name: target.resident.name || body.name || email,
      email,
      apartment: target.resident.apartment || body.apartment || '',
      whatsapp: target.resident.whatsapp || body.whatsapp || '',
      cpfCnpj: target.resident.cpfCnpj || body.cpfCnpj || '',
      status: 'approved',
      updatedAt: new Date().toISOString(),
    };
    const residents = index >= 0 ? current.map((item, i) => i === index ? merged : item) : [merged, ...current];
    target.resident = merged;
    if (databaseReady) {
      const savedState = await saveStatePatchToDatabase({ residents });
      store.state = savedState;
    } else {
      store.state = { ...state, residents };
      if (!REQUIRE_DATABASE) await saveStore(store);
    }
  }
  if (target.staff) {
    const current = Array.isArray(state.staff) ? state.staff : [];
    const staffId = String(target.staff.id || body.staffId || '').trim();
    const index = current.findIndex((person) => (staffId && String(person.id || '').trim() === staffId) || normalizeEmail(person.email || '') === email);
    const merged = {
      ...(index >= 0 ? current[index] : {}),
      ...target.staff,
      id: staffId || target.staff.id || `staff-${crypto.createHash('sha1').update(email).digest('hex').slice(0, 10)}`,
      name: target.staff.name || body.name || email,
      email,
      role: target.staff.role || body.role || 'Colaborador',
      active: target.staff.active !== false,
      allowedTabs: normalizeAllowedTabs(target.staff.allowedTabs || body.allowedTabs),
      updatedAt: new Date().toISOString(),
    };
    const staff = index >= 0 ? current.map((item, i) => i === index ? merged : item) : [merged, ...current];
    target.staff = merged;
    if (databaseReady) {
      const savedState = await saveStatePatchToDatabase({ staff });
      store.state = savedState;
    } else {
      store.state = { ...state, staff };
      if (!REQUIRE_DATABASE) await saveStore(store);
    }
  }
  return target;
}

async function sendTemporaryPassword(email, temp, name = 'usuário') {
  return sendEmailNotification({
    to: email,
    subject: 'Senha temporária — Condomínio Vitória Régia',
    message: `Olá, ${name}.\n\nFoi gerada uma senha temporária para acesso ao Sistema do Condomínio Vitória Régia.\n\nSenha temporária: ${temp}\n\nApós entrar, o sistema solicitará a criação de uma nova senha.\n\nSe você não solicitou esta alteração, informe imediatamente a administração do condomínio.`,
  });
}

function googleOAuthConfigured() {
  return Boolean(GOOGLE_AUTH_ENABLED && GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_CALLBACK_URL);
}

function redirectWithAuthError(res, message) {
  const url = new URL(APP_URL || '/');
  url.searchParams.set('authError', message || 'Não foi possível autenticar com Google.');
  return res.redirect(url.toString());
}

function makeOAuthState(req, data = {}) {
  const state = crypto.randomBytes(24).toString('hex');
  req.session.googleOAuth = {
    state,
    role: data.role || 'morador',
    apartment: data.apartment || '',
    createdAt: Date.now(),
  };
  return state;
}

function readOAuthState(req, receivedState) {
  const saved = req.session?.googleOAuth || null;
  delete req.session.googleOAuth;
  if (!saved || !receivedState || saved.state !== receivedState) return null;
  if (Date.now() - Number(saved.createdAt || 0) > 10 * 60 * 1000) return null;
  return saved;
}

async function exchangeGoogleCode(code) {
  const body = new URLSearchParams({
    code,
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    redirect_uri: GOOGLE_CALLBACK_URL,
    grant_type: 'authorization_code',
  });
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const tokenData = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok) throw new Error(tokenData.error_description || tokenData.error || 'Falha ao trocar código do Google.');
  if (!tokenData.access_token) throw new Error('Google não retornou access_token.');
  return tokenData;
}

async function fetchGoogleProfile(accessToken) {
  const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const profile = await profileResponse.json().catch(() => ({}));
  if (!profileResponse.ok) throw new Error(profile.error_description || profile.error || 'Falha ao obter perfil Google.');
  if (!profile.email) throw new Error('Conta Google não retornou e-mail.');
  if (profile.email_verified === false) throw new Error('O e-mail da Conta Google não está verificado.');
  return profile;
}

function buildUserFromGoogleProfile(profile, oauthState) {
  const requestedRole = oauthState?.role || 'morador';
  const email = normalizeEmail(profile.email || '');
  const name = profile.name || profile.given_name || email;
  const target = resolveAccountTarget(email, requestedRole);
  const role = target.role || allowedRole(email, requestedRole);

  if (requestedRole === 'sindico' && role !== 'sindico') {
    const error = new Error('E-mail Google não autorizado para acesso de síndico/administração.');
    error.statusCode = 403;
    throw error;
  }
  if (requestedRole === 'portaria' && role !== 'portaria') {
    const error = new Error('E-mail Google não autorizado para acesso de portaria.');
    error.statusCode = 403;
    throw error;
  }
  if (role === 'morador' && REQUIRE_APPROVED_RESIDENT && !target.resident) {
    const error = new Error('Cadastro de morador não aprovado ou não localizado para este e-mail Google.');
    error.statusCode = 403;
    throw error;
  }

  return {
    id: target.staff?.id || target.resident?.id || `google-${profile.sub || Date.now()}`,
    role,
    name: target.staff?.name || target.resident?.name || name,
    email: target.staff?.email || target.resident?.email || email,
    apartment: target.resident?.apartment || oauthState?.apartment || '',
    residentId: target.resident?.id || null,
    staffId: target.staff?.id || null,
    staffRole: target.staff?.role || '',
    originalRole: target.staff?.role || '',
    isAdmin: Boolean(target.staff && staffIsAdministrator(target.staff)),
    allowedTabs: normalizeAllowedTabs(target.staff?.allowedTabs),
    authProvider: 'google',
    googleSub: profile.sub || null,
    picture: profile.picture || null,
    bootstrap: false,
    demo: false,
  };
}

function matchesBootstrapAdmin(email, password) {
  return bootstrapAdminAvailable()
    && normalizeEmail(email) === normalizeEmail(BOOTSTRAP_ADMIN_EMAIL)
    && String(password || '') === BOOTSTRAP_ADMIN_PASSWORD;
}

function allowedRole(email, requestedRole) {
  const normalized = normalizeEmail(email);
  const staff = activeStaffByEmail(normalized);
  const staffRole = staffRoleToAppRole(staff || '');

  if (requestedRole === 'sindico') {
    if (normalized && adminEmails().includes(normalized)) return 'sindico';
    if (staffRole === 'sindico') return 'sindico';
    return 'morador';
  }
  if (requestedRole === 'portaria') {
    if (normalized && (adminEmails().includes(normalized) || portariaEmails().includes(normalized))) return 'portaria';
    if (staffRole === 'portaria') return 'portaria';
    return 'morador';
  }
  return 'morador';
}

function findApprovedResident(requested = {}) {
  const email = normalizeEmail(vrNormalizeLoginIdentifier(requested.email || ''));
  const apartment = String(requested.apartment || '').trim();
  const residentId = String(requested.residentId || '').trim();
  return (store.state?.residents || []).find((resident) => {
    const approved = (resident.status || 'approved') === 'approved';
    if (!approved) return false;
    if (residentId && resident.id === residentId) return true;
    const sameEmail = email && normalizeEmail(resident.email || '') === email;
    const sameApartment = apartment && String(resident.apartment || '').trim() === apartment;
    return sameEmail && (!apartment || sameApartment);
  });
}


function cleanStorageSecret(value = '') {
  return cleanIntegrationValue(value).replace(/^Bearer\s+/i, '').trim();
}

function normalizeSupabaseUrl(value = '') {
  return cleanIntegrationValue(value).replace(/\/+$/, '');
}

function boolFromInput(value, fallback = false) {
  if (value === undefined || value === null || value === '') return Boolean(fallback);
  return ['true', '1', 'yes', 'sim', 'on'].includes(String(value).toLowerCase());
}

function effectiveStorageConfig(config) {
  const saved = config || store.storageConfig || {};
  const savedTeraBox = saved.terabox || {};
  const savedSupabase = saved.supabase || {};
  const envEnabled = String(process.env.STORAGE_ENABLED || process.env.TERABOX_ENABLED || '').toLowerCase() === 'true';
  const accessToken = savedTeraBox.accessToken || process.env.TERABOX_ACCESS_TOKEN || '';
  const supabaseUrl = normalizeSupabaseUrl(savedSupabase.url || process.env.SUPABASE_URL || '');
  const supabaseServiceRoleKey = cleanStorageSecret(savedSupabase.serviceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '');
  const supabaseConfigured = Boolean(supabaseUrl && supabaseServiceRoleKey && (savedSupabase.bucket || process.env.SUPABASE_STORAGE_BUCKET || 'vitoria-regia'));
  const provider = String(process.env.STORAGE_PROVIDER || saved.provider || (supabaseConfigured ? 'supabase' : (accessToken ? 'terabox' : 'metadata-only'))).toLowerCase();
  const providerConfigured = provider === 'supabase' ? supabaseConfigured : (provider === 'terabox' ? Boolean(accessToken) : false);
  return {
    ...saved,
    enabled: Boolean(saved.enabled || (envEnabled && providerConfigured)),
    provider,
    maxUploadMb: Number(saved.maxUploadMb || process.env.STORAGE_MAX_UPLOAD_MB || process.env.UPLOAD_MAX_MB || 10),
    supabase: {
      ...savedSupabase,
      url: supabaseUrl,
      serviceRoleKey: supabaseServiceRoleKey,
      serviceRoleKeySource: savedSupabase.serviceRoleKey ? 'saved' : ((process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY) ? 'env' : 'none'),
      bucket: savedSupabase.bucket || process.env.SUPABASE_STORAGE_BUCKET || 'vitoria-regia',
      folder: savedSupabase.folder || process.env.SUPABASE_STORAGE_FOLDER || 'documentos',
      publicBucket: boolFromInput(savedSupabase.publicBucket, String(process.env.SUPABASE_STORAGE_PUBLIC || 'false').toLowerCase() === 'true'),
      signedUrlExpires: Number(savedSupabase.signedUrlExpires || process.env.SUPABASE_SIGNED_URL_EXPIRES || 3600),
    },
    terabox: {
      ...savedTeraBox,
      baseUrl: savedTeraBox.baseUrl || process.env.TERABOX_BASE_URL || 'https://www.terabox.com',
      uploadBaseUrl: savedTeraBox.uploadBaseUrl || process.env.TERABOX_UPLOAD_BASE_URL || '',
      accessToken,
      accessTokenSource: savedTeraBox.accessToken ? 'saved' : (process.env.TERABOX_ACCESS_TOKEN ? 'env' : 'none'),
      accessTokenParam: savedTeraBox.accessTokenParam || process.env.TERABOX_ACCESS_TOKEN_PARAM || 'access_tokens',
      folder: savedTeraBox.folder || process.env.TERABOX_FOLDER || '/vitoria-regia',
      rtype: Number(savedTeraBox.rtype || process.env.TERABOX_RTYPE || 1),
    },
  };
}

function sanitizeStorageConfig(config) {
  const effective = effectiveStorageConfig(config || {});
  const terabox = effective.terabox || {};
  const supabase = effective.supabase || {};
  return {
    ...effective,
    supabase: {
      ...supabase,
      serviceRoleKey: '',
      serviceRoleKeySaved: Boolean(supabase.serviceRoleKey),
      serviceRoleKeySource: supabase.serviceRoleKeySource || 'none',
    },
    terabox: {
      ...terabox,
      accessToken: '',
      accessTokenSaved: Boolean(terabox.accessToken),
      accessTokenSource: terabox.accessTokenSource || 'none',
    },
  };
}

function storageDiagnostics(config) {
  const effective = effectiveStorageConfig(config || store.storageConfig || {});
  const problems = [];
  if (!effective.enabled) problems.push('Armazenamento externo desativado.');
  if (!['supabase', 'terabox', 'metadata-only'].includes(effective.provider)) problems.push(`Provedor desconhecido: ${effective.provider}.`);
  if (effective.provider === 'supabase') {
    if (!effective.supabase?.url) problems.push('SUPABASE_URL ausente.');
    if (!effective.supabase?.serviceRoleKey) problems.push('SUPABASE_SERVICE_ROLE_KEY ausente.');
    if (!effective.supabase?.bucket) problems.push('SUPABASE_STORAGE_BUCKET ausente.');
  }
  if (effective.provider === 'terabox') {
    if (!effective.terabox?.accessToken) problems.push('TERABOX_ACCESS_TOKEN ausente.');
    if (!effective.terabox?.baseUrl) problems.push('TERABOX_BASE_URL ausente.');
    if (!effective.terabox?.folder) problems.push('TERABOX_FOLDER ausente.');
  }
  return { ok: problems.length === 0, provider: effective.provider, enabled: effective.enabled, problems, config: sanitizeStorageConfig(effective) };
}

async function saveStorageConfig(input = {}) {
  const current = store.storageConfig || DEFAULT_STORAGE_CONFIG;
  const currentTeraBox = current.terabox || {};
  const currentSupabase = current.supabase || {};
  const nextTeraBox = input.terabox || {};
  const nextSupabase = input.supabase || {};
  const config = deepMerge(current, {
    enabled: Boolean(input.enabled),
    provider: input.provider || current.provider || 'supabase',
    maxUploadMb: Number(input.maxUploadMb || current.maxUploadMb || 10),
    supabase: {
      url: normalizeSupabaseUrl(nextSupabase.url || currentSupabase.url || ''),
      serviceRoleKey: nextSupabase.serviceRoleKey ? cleanStorageSecret(nextSupabase.serviceRoleKey) : (currentSupabase.serviceRoleKey || ''),
      bucket: nextSupabase.bucket || currentSupabase.bucket || 'vitoria-regia',
      folder: nextSupabase.folder || currentSupabase.folder || 'documentos',
      publicBucket: boolFromInput(nextSupabase.publicBucket, currentSupabase.publicBucket),
      signedUrlExpires: Number(nextSupabase.signedUrlExpires || currentSupabase.signedUrlExpires || 3600),
    },
    terabox: {
      baseUrl: nextTeraBox.baseUrl || currentTeraBox.baseUrl || 'https://www.terabox.com',
      uploadBaseUrl: nextTeraBox.uploadBaseUrl || currentTeraBox.uploadBaseUrl || '',
      accessToken: nextTeraBox.accessToken || currentTeraBox.accessToken || '',
      accessTokenParam: nextTeraBox.accessTokenParam || currentTeraBox.accessTokenParam || 'access_tokens',
      folder: nextTeraBox.folder || currentTeraBox.folder || '/vitoria-regia',
      rtype: Number(nextTeraBox.rtype || currentTeraBox.rtype || 1),
    },
  });
  store.storageConfig = config;
  await saveStore(store);
  return effectiveStorageConfig(config);
}

function safeCloudFileName(name = 'arquivo') {
  const base = path.basename(String(name || 'arquivo')).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return base.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').slice(0, 120) || `arquivo-${Date.now()}`;
}

function normalizeCloudFolder(folder = '/vitoria-regia') {
  let value = String(folder || '/vitoria-regia').trim().replace(/\\/g, '/');
  if (!value.startsWith('/')) value = `/${value}`;
  return value.replace(/\/+/g, '/').replace(/\/$/, '') || '/vitoria-regia';
}

function bufferFromDataUrl(dataUrl = '') {
  const raw = String(dataUrl || '');
  const match = raw.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('Arquivo inválido. Envie como dataUrl base64.');
  return { contentType: match[1], buffer: Buffer.from(match[2], 'base64') };
}

function appendTokenParam(url, paramName, token) {
  const parsed = new URL(url);
  parsed.searchParams.set(paramName || 'access_tokens', token);
  return parsed.toString();
}

async function teraboxApiForm(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  const raw = await response.text().catch(() => '');
  let payload = {};
  try { payload = raw ? JSON.parse(raw) : {}; } catch (_) { payload = { raw }; }
  if (!response.ok || (payload.errno && Number(payload.errno) !== 0)) {
    throw new Error(payload.errmsg || payload.error_msg || payload.message || `Erro TeraBox HTTP ${response.status}`);
  }
  return payload;
}


function normalizeStorageFolder(folder = 'documentos') {
  let value = String(folder || 'documentos').trim().replace(/\\/g, '/');
  value = value.replace(/^\/+/, '').replace(/\/+$/, '').replace(/\/+/g, '/');
  return value || 'documentos';
}

function encodeStoragePath(value = '') {
  return String(value || '').split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

function supabaseObjectBaseUrl(config) {
  return `${normalizeSupabaseUrl(config.supabase.url)}/storage/v1/object`;
}

async function createSupabaseDownloadUrl({ path: objectPath, bucket }) {
  const config = effectiveStorageConfig(store.storageConfig || {});
  const sb = config.supabase || {};
  const finalBucket = bucket || sb.bucket;
  if (!sb.url || !sb.serviceRoleKey || !finalBucket || !objectPath) throw new Error('Supabase Storage incompleto para gerar download.');
  const encodedPath = encodeStoragePath(objectPath);
  const base = supabaseObjectBaseUrl(config);
  if (sb.publicBucket) return `${base}/public/${encodeURIComponent(finalBucket)}/${encodedPath}`;

  const expiresIn = Number(sb.signedUrlExpires || 3600);
  const response = await fetch(`${base}/sign/${encodeURIComponent(finalBucket)}/${encodedPath}`, {
    method: 'POST',
    headers: {
      apikey: sb.serviceRoleKey,
      Authorization: `Bearer ${sb.serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expiresIn }),
  });
  const raw = await response.text().catch(() => '');
  const payload = parseProviderPayload(raw);
  if (!response.ok || payload.error) throw new Error(payload.error || payload.message || `Erro Supabase signed URL HTTP ${response.status}`);
  const signed = payload.signedURL || payload.signedUrl || payload.url;
  if (!signed) throw new Error('Supabase não retornou signedURL.');
  return String(signed).startsWith('http') ? signed : `${normalizeSupabaseUrl(sb.url)}${signed}`;
}

async function uploadToSupabase({ filename, contentType, buffer, purpose = 'arquivos' }) {
  const config = effectiveStorageConfig(store.storageConfig || {});
  const sb = config.supabase || {};
  if (!config.enabled || config.provider !== 'supabase') throw new Error('Supabase Storage desativado.');
  if (!sb.url || !sb.serviceRoleKey || !sb.bucket) throw new Error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e SUPABASE_STORAGE_BUCKET são obrigatórios.');

  const month = new Date().toISOString().slice(0, 7);
  const safePurpose = normalizeStorageFolder(purpose || 'arquivos').replace(/\.+/g, '-');
  const folder = normalizeStorageFolder(sb.folder || 'documentos');
  const remotePath = `${folder}/${safePurpose}/${month}/${Date.now()}-${safeCloudFileName(filename)}`.replace(/\/+/g, '/');
  const endpoint = `${supabaseObjectBaseUrl(config)}/${encodeURIComponent(sb.bucket)}/${encodeStoragePath(remotePath)}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: sb.serviceRoleKey,
      Authorization: `Bearer ${sb.serviceRoleKey}`,
      'Content-Type': contentType || 'application/octet-stream',
      'x-upsert': 'false',
    },
    body: buffer,
  });
  const raw = await response.text().catch(() => '');
  const payload = parseProviderPayload(raw);
  if (!response.ok || payload.error) throw new Error(payload.error || payload.message || `Erro Supabase upload HTTP ${response.status}`);
  const downloadUrl = await createSupabaseDownloadUrl({ path: remotePath, bucket: sb.bucket }).catch((error) => null);
  return {
    storage: 'supabase',
    provider: 'supabase',
    name: filename,
    type: contentType,
    size: buffer.length,
    bucket: sb.bucket,
    path: remotePath,
    downloadUrl,
    url: downloadUrl,
    signedUrlExpires: sb.publicBucket ? null : Number(sb.signedUrlExpires || 3600),
    uploadedAt: new Date().toISOString(),
    note: sb.publicBucket ? 'Arquivo enviado para bucket público do Supabase Storage.' : 'Arquivo enviado para bucket privado do Supabase Storage; links de download são assinados e temporários.',
    providerResponse: { key: payload.Key || payload.key || null, id: payload.Id || payload.id || null },
  };
}

async function uploadToTeraBox({ filename, contentType, buffer, purpose = 'arquivos' }) {
  const config = effectiveStorageConfig(store.storageConfig || {});
  const tb = config.terabox || {};
  if (!config.enabled || config.provider !== 'terabox') throw new Error('Armazenamento TeraBox desativado.');
  if (!tb.accessToken) throw new Error('TERABOX_ACCESS_TOKEN não configurado.');

  const md5 = crypto.createHash('md5').update(buffer).digest('hex');
  const month = new Date().toISOString().slice(0, 7);
  const safePurpose = safeCloudFileName(purpose || 'arquivos').replace(/\./g, '-');
  const remotePath = `${normalizeCloudFolder(tb.folder)}/${safePurpose}/${month}/${Date.now()}-${safeCloudFileName(filename)}`;
  const blockList = JSON.stringify([md5]);
  const baseUrl = String(tb.baseUrl || 'https://www.terabox.com').replace(/\/+$/, '');
  const tokenParam = tb.accessTokenParam || 'access_tokens';

  const precreateUrl = appendTokenParam(`${baseUrl}/openapi/api/precreate`, tokenParam, tb.accessToken);
  const pre = await teraboxApiForm(precreateUrl, {
    path: remotePath,
    size: String(buffer.length),
    autoinit: '1',
    block_list: blockList,
    rtype: String(tb.rtype || 1),
  });

  const uploadBase = String(tb.uploadBaseUrl || baseUrl.replace('www.terabox.com', 'c-jp.terabox.com')).replace(/\/+$/, '');
  const uploadUrl = appendTokenParam(`${uploadBase}/rest/2.0/pcs/superfile2?method=upload&type=tmpfile&path=${encodeURIComponent(remotePath)}&uploadid=${encodeURIComponent(pre.uploadid || '')}&partseq=0`, tokenParam, tb.accessToken);
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: contentType || 'application/octet-stream' }), safeCloudFileName(filename));
  const uploadResponse = await fetch(uploadUrl, { method: 'POST', body: form });
  const uploadRaw = await uploadResponse.text().catch(() => '');
  let uploadPayload = {};
  try { uploadPayload = uploadRaw ? JSON.parse(uploadRaw) : {}; } catch (_) { uploadPayload = { raw: uploadRaw }; }
  if (!uploadResponse.ok || (uploadPayload.errno && Number(uploadPayload.errno) !== 0)) {
    throw new Error(uploadPayload.errmsg || uploadPayload.error_msg || uploadPayload.message || `Erro TeraBox upload HTTP ${uploadResponse.status}`);
  }

  const finalBlockList = JSON.stringify([uploadPayload.md5 || md5]);
  const createUrl = appendTokenParam(`${baseUrl}/openapi/api/create`, tokenParam, tb.accessToken);
  const created = await teraboxApiForm(createUrl, {
    path: remotePath,
    size: String(buffer.length),
    isdir: '0',
    rtype: String(tb.rtype || 1),
    uploadid: pre.uploadid || '',
    block_list: finalBlockList,
  });

  return {
    storage: 'terabox',
    provider: 'terabox',
    name: filename,
    type: contentType,
    size: buffer.length,
    path: created.path || remotePath,
    fsId: created.fs_id || null,
    md5: created.md5 || uploadPayload.md5 || md5,
    uploadedAt: new Date().toISOString(),
    note: 'Arquivo enviado para TeraBox; o banco salva apenas metadados e caminho externo.',
    providerResponse: { precreate: { uploadid: pre.uploadid, return_type: pre.return_type }, create: created },
  };
}

function sanitizeConfig(config) {
  const effective = effectiveNotificationConfig(config || {});
  const email = effective.email || {};
  const whatsapp = effective.whatsapp || {};
  const telegram = effective.telegram || {};
  return {
    ...effective,
    email: {
      ...email,
      password: '',
      passwordSaved: Boolean(email.password),
      passwordSource: email.passwordSource || 'none',
      mailersend: {
        ...(email.mailersend || {}),
        apiKey: '',
        apiKeySaved: Boolean(email.mailersend?.apiKey),
        apiKeySource: email.mailersend?.apiKeySource || 'none',
      },
    },
    whatsapp: {
      ...whatsapp,
      token: '',
      tokenSaved: Boolean(whatsapp.token),
      evolution: {
        ...(whatsapp.evolution || {}),
        apiKey: '',
        apiKeySaved: Boolean(whatsapp.evolution?.apiKey),
        apiKeySource: whatsapp.evolution?.apiKeySource || 'none',
      },
      periskope: {
        ...(whatsapp.periskope || {}),
        apiKey: '',
        apiKeySaved: Boolean(whatsapp.periskope?.apiKey),
        apiKeySource: whatsapp.periskope?.apiKeySource || 'none',
      },
    },
    telegram: {
      ...telegram,
      botToken: '',
      botTokenSaved: Boolean(telegram.botToken),
      botTokenSource: telegram.botTokenSource || 'none',
    },
  };
}

function effectiveWhatsAppConfig(merged = {}) {
  const saved = merged.whatsapp || {};
  const savedEvolution = saved.evolution || {};
  const savedPeriskope = saved.periskope || {};
  const envMetaToken = process.env.WHATSAPP_TOKEN || '';
  const envMetaPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  const envEvolutionKey = process.env.EVOLUTION_API_KEY || '';
  const envEvolutionUrl = process.env.EVOLUTION_API_URL || process.env.EVOLUTION_SERVER_URL || '';
  const envEvolutionInstance = process.env.EVOLUTION_INSTANCE || process.env.EVOLUTION_INSTANCE_NAME || '';
  const envPeriskopeKey = cleanBearerToken(process.env.PERISKOPE_API_KEY || '');
  const envPeriskopePhone = cleanIntegrationValue(process.env.PERISKOPE_PHONE || process.env.PERISKOPE_PHONE_ID || process.env.WHATSAPP_SENDER_PHONE || '');
  const envPeriskopeBaseUrl = normalizePeriskopeBaseUrl(process.env.PERISKOPE_BASE_URL || 'https://api.periskope.app/v1');

  let provider = cleanIntegrationValue(saved.provider || process.env.WHATSAPP_PROVIDER || '').toLowerCase();
  if (!['meta', 'evolution', 'periskope'].includes(provider)) {
    if (savedPeriskope.apiKey || envPeriskopeKey) provider = 'periskope';
    else if (savedEvolution.apiKey || envEvolutionKey) provider = 'evolution';
    else provider = 'meta';
  }

  const metaToken = saved.token || envMetaToken;
  const metaPhoneId = saved.phoneNumberId || envMetaPhoneId;
  const evolutionApiKey = savedEvolution.apiKey || envEvolutionKey;
  const evolutionServerUrl = savedEvolution.serverUrl || envEvolutionUrl;
  const evolutionInstanceName = savedEvolution.instanceName || envEvolutionInstance;
  const periskopeApiKey = cleanBearerToken(savedPeriskope.apiKey || envPeriskopeKey);
  const periskopePhone = cleanIntegrationValue(savedPeriskope.phone || envPeriskopePhone);
  const periskopeBaseUrl = normalizePeriskopeBaseUrl(savedPeriskope.baseUrl || envPeriskopeBaseUrl);
  const envEnabled = String(process.env.WHATSAPP_ENABLED || '').toLowerCase() === 'true';
  const evolutionConfigured = Boolean(evolutionApiKey && evolutionServerUrl && evolutionInstanceName);
  const periskopeConfigured = Boolean(periskopeApiKey && periskopePhone && periskopeBaseUrl);
  const metaConfigured = Boolean(metaToken && metaPhoneId);
  const providerConfigured = provider === 'periskope' ? periskopeConfigured : (provider === 'evolution' ? evolutionConfigured : metaConfigured);

  return {
    ...saved,
    provider,
    enabled: Boolean(saved.enabled || (envEnabled && providerConfigured)),
    apiVersion: saved.apiVersion || process.env.WHATSAPP_API_VERSION || 'v20.0',
    token: metaToken,
    tokenSource: saved.token ? 'saved' : (envMetaToken ? 'env' : 'none'),
    phoneNumberId: metaPhoneId,
    countryCode: saved.countryCode || process.env.WHATSAPP_COUNTRY_CODE || '55',
    testTo: saved.testTo || process.env.WHATSAPP_TEST_TO || process.env.EVOLUTION_TEST_TO || process.env.PERISKOPE_TEST_TO || '',
    evolution: {
      ...savedEvolution,
      serverUrl: evolutionServerUrl,
      apiKey: evolutionApiKey,
      apiKeySource: savedEvolution.apiKey ? 'saved' : (envEvolutionKey ? 'env' : 'none'),
      instanceName: evolutionInstanceName,
      countryCode: savedEvolution.countryCode || process.env.EVOLUTION_COUNTRY_CODE || saved.countryCode || process.env.WHATSAPP_COUNTRY_CODE || '55',
      testTo: savedEvolution.testTo || process.env.EVOLUTION_TEST_TO || saved.testTo || process.env.WHATSAPP_TEST_TO || '',
      linkPreview: typeof savedEvolution.linkPreview === 'boolean' ? savedEvolution.linkPreview : String(process.env.EVOLUTION_LINK_PREVIEW || 'false').toLowerCase() === 'true',
    },
    periskope: {
      ...savedPeriskope,
      baseUrl: normalizePeriskopeBaseUrl(periskopeBaseUrl),
      apiKey: periskopeApiKey,
      apiKeySource: savedPeriskope.apiKey ? 'saved' : (envPeriskopeKey ? 'env' : 'none'),
      phone: normalizePeriskopePhoneHeader(periskopePhone, savedPeriskope.countryCode || process.env.PERISKOPE_COUNTRY_CODE || saved.countryCode || process.env.WHATSAPP_COUNTRY_CODE || '55'),
      countryCode: savedPeriskope.countryCode || process.env.PERISKOPE_COUNTRY_CODE || saved.countryCode || process.env.WHATSAPP_COUNTRY_CODE || '55',
      testTo: savedPeriskope.testTo || process.env.PERISKOPE_TEST_TO || saved.testTo || process.env.WHATSAPP_TEST_TO || '',
      hideUrlPreview: typeof savedPeriskope.hideUrlPreview === 'boolean' ? savedPeriskope.hideUrlPreview : String(process.env.PERISKOPE_HIDE_URL_PREVIEW || 'true').toLowerCase() !== 'false',
    },
  };
}


function normalizeTelegramChatId(value = '') {
  return cleanIntegrationValue(value).replace(/\s+/g, '');
}

function effectiveTelegramConfig(merged = {}) {
  const saved = merged.telegram || {};
  const savedToken = cleanBearerToken(saved.botToken || '');
  const envToken = cleanBearerToken(process.env.TELEGRAM_BOT_TOKEN || '');
  const token = savedToken || envToken;
  const defaultChatId = normalizeTelegramChatId(saved.defaultChatId || process.env.TELEGRAM_DEFAULT_CHAT_ID || process.env.TELEGRAM_TEST_CHAT_ID || '');
  const testChatId = normalizeTelegramChatId(saved.testChatId || process.env.TELEGRAM_TEST_CHAT_ID || defaultChatId || '');
  const envEnabled = String(process.env.TELEGRAM_ENABLED || '').toLowerCase() === 'true';
  return {
    ...saved,
    enabled: Boolean(saved.enabled || (envEnabled && token && defaultChatId)),
    botToken: token,
    botTokenSource: savedToken ? 'saved' : (envToken ? 'env' : 'none'),
    botUsername: cleanIntegrationValue(saved.botUsername || process.env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, ''),
    defaultChatId,
    testChatId,
    parseMode: ['HTML', 'MarkdownV2', 'Markdown', ''].includes(String(saved.parseMode || 'HTML')) ? String(saved.parseMode || 'HTML') : 'HTML',
  };
}

function telegramDiagnostics(config = effectiveNotificationConfig()) {
  const telegram = config.telegram || {};
  const problems = [];
  if (!telegram.enabled) problems.push('Envio por Telegram desativado. Ative em Configurações > Notificações > Telegram.');
  if (!telegram.botToken) problems.push('TELEGRAM_BOT_TOKEN não configurado. Crie um bot no BotFather e salve o token no Render ou no painel.');
  if (!telegram.defaultChatId && !telegram.testChatId) problems.push('Chat ID padrão/teste não configurado. O usuário precisa iniciar conversa com o bot e o chat_id deve ser cadastrado.');
  return {
    ok: problems.length === 0,
    problems,
    config: {
      enabled: Boolean(telegram.enabled),
      botUsername: telegram.botUsername || null,
      defaultChatId: telegram.defaultChatId ? '<configurado>' : null,
      testChatId: telegram.testChatId ? '<configurado>' : null,
      botTokenSaved: Boolean(telegram.botToken),
      botTokenSource: telegram.botTokenSource || 'none',
    },
  };
}

function effectiveNotificationConfig(config = store.notificationConfig || DEFAULT_NOTIFICATION_CONFIG) {
  const merged = deepMerge(DEFAULT_NOTIFICATION_CONFIG, config || {});
  const envEmailPassword = process.env.SMTP_APP_PASSWORD || '';
  const envEmailUser = process.env.SMTP_USER || '';
  const envEmailEnabled = String(process.env.EMAIL_ENABLED || process.env.SMTP_ENABLED || '').toLowerCase() === 'true';
  const savedPassword = merged.email?.password || '';
  const effectivePassword = savedPassword || envEmailPassword;
  const effectiveUser = merged.email?.user || envEmailUser;

  const savedMailerSendKey = merged.email?.mailersend?.apiKey || '';
  const envMailerSendKey = process.env.MAILERSEND_API_KEY || '';
  const effectiveMailerSendKey = savedMailerSendKey || envMailerSendKey;

  let provider = String(merged.email?.provider || process.env.EMAIL_PROVIDER || '').toLowerCase();
  if (!['smtp', 'mailersend'].includes(provider)) provider = effectiveMailerSendKey ? 'mailersend' : 'smtp';

  // MailerSend exige que from.email seja um domínio/remetente verificado na conta.
  // Não usamos SMTP_USER/SMTP_FROM_EMAIL como fallback automático para evitar HTTP 422.
  const mailerSendFromEmail = normalizeMailAddress(merged.email?.mailersend?.fromEmail || process.env.MAILERSEND_FROM_EMAIL || '');
  const mailerSendFromName = merged.email?.mailersend?.fromName || process.env.MAILERSEND_FROM_NAME || merged.email?.fromName || process.env.SMTP_FROM_NAME || 'Condomínio Vitória Régia';
  const mailerSendTestTo = normalizeMailAddress(merged.email?.mailersend?.testTo || process.env.MAILERSEND_TEST_TO || merged.email?.testTo || process.env.SMTP_TEST_TO || effectiveUser || '');

  const smtpTestTo = merged.email?.testTo || process.env.SMTP_TEST_TO || effectiveUser || mailerSendTestTo;
  const enabledByEnv = envEmailEnabled || Boolean(process.env.MAILERSEND_API_KEY);

  const effectiveWhatsApp = effectiveWhatsAppConfig(merged);
  const effectiveTelegram = effectiveTelegramConfig(merged);

  return {
    ...merged,
    email: {
      ...(merged.email || {}),
      provider,
      enabled: Boolean((merged.email || {}).enabled || (enabledByEnv && (provider === 'mailersend' ? effectiveMailerSendKey : (effectiveUser && effectivePassword)))),
      host: merged.email?.host || process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(merged.email?.port || process.env.SMTP_PORT || 465),
      secure: typeof merged.email?.secure === 'boolean' ? merged.email.secure : String(process.env.SMTP_SECURE || 'true').toLowerCase() === 'true',
      user: effectiveUser,
      password: effectivePassword,
      passwordSource: savedPassword ? 'saved' : (envEmailPassword ? 'env' : 'none'),
      fromName: merged.email?.fromName || process.env.SMTP_FROM_NAME || mailerSendFromName || 'Condomínio Vitória Régia',
      fromEmail: merged.email?.fromEmail || process.env.SMTP_FROM_EMAIL || effectiveUser || mailerSendFromEmail,
      testTo: smtpTestTo,
      mailersend: {
        ...(merged.email?.mailersend || {}),
        apiKey: effectiveMailerSendKey,
        apiKeySource: savedMailerSendKey ? 'saved' : (envMailerSendKey ? 'env' : 'none'),
        fromName: mailerSendFromName,
        fromEmail: mailerSendFromEmail,
        testTo: mailerSendTestTo,
      },
    },
    whatsapp: effectiveWhatsApp,
    telegram: effectiveTelegram,
  };
}

function whatsappDiagnostics(config = effectiveNotificationConfig()) {
  const whatsapp = config.whatsapp || {};
  const provider = whatsapp.provider || 'meta';
  const problems = [];
  if (!whatsapp.enabled) problems.push('Envio automático por WhatsApp desativado. Ative no painel ou defina WHATSAPP_ENABLED=true.');
  if (provider === 'evolution') {
    const evolution = whatsapp.evolution || {};
    if (!evolution.serverUrl) problems.push('EVOLUTION_API_URL não configurado.');
    if (!evolution.instanceName) problems.push('EVOLUTION_INSTANCE não configurado.');
    if (!evolution.apiKey) problems.push('EVOLUTION_API_KEY não configurado.');
  } else if (provider === 'periskope') {
    const periskope = whatsapp.periskope || {};
    if (!periskope.baseUrl) problems.push('PERISKOPE_BASE_URL não configurado.');
    if (!periskope.apiKey) problems.push('PERISKOPE_API_KEY não configurado.');
    if (!periskope.phone) problems.push('PERISKOPE_PHONE não configurado. Informe o número conectado ao Periskope no formato 55DDDNUMERO.');
  } else {
    if (!whatsapp.token) problems.push('WHATSAPP_TOKEN não configurado para Meta Cloud API.');
    if (!whatsapp.phoneNumberId) problems.push('WHATSAPP_PHONE_NUMBER_ID não configurado para Meta Cloud API.');
  }
  return {
    ok: problems.length === 0,
    problems,
    config: {
      enabled: Boolean(whatsapp.enabled),
      provider,
      countryCode: provider === 'evolution' ? (whatsapp.evolution?.countryCode || whatsapp.countryCode || '55') : (provider === 'periskope' ? (whatsapp.periskope?.countryCode || whatsapp.countryCode || '55') : (whatsapp.countryCode || '55')),
      testTo: provider === 'evolution' ? (whatsapp.evolution?.testTo || whatsapp.testTo || '') : (provider === 'periskope' ? (whatsapp.periskope?.testTo || whatsapp.testTo || '') : (whatsapp.testTo || '')),
      metaTokenSaved: Boolean(whatsapp.token),
      metaTokenSource: whatsapp.tokenSource || 'none',
      metaPhoneNumberIdConfigured: Boolean(whatsapp.phoneNumberId),
      evolutionServerUrl: whatsapp.evolution?.serverUrl || null,
      evolutionInstanceName: whatsapp.evolution?.instanceName || null,
      evolutionApiKeySaved: Boolean(whatsapp.evolution?.apiKey),
      evolutionApiKeySource: whatsapp.evolution?.apiKeySource || 'none',
      periskopeBaseUrl: whatsapp.periskope?.baseUrl || null,
      periskopePhone: whatsapp.periskope?.phone || null,
      periskopeApiKeySaved: Boolean(whatsapp.periskope?.apiKey),
      periskopeApiKeySource: whatsapp.periskope?.apiKeySource || 'none',
      periskopeApiKeyLength: whatsapp.periskope?.apiKey ? cleanBearerToken(whatsapp.periskope.apiKey).length : 0,
      periskopeEndpoint: whatsapp.periskope?.baseUrl ? periskopeMessagesEndpoint(whatsapp.periskope.baseUrl) : null,
      periskopeAuthHeader: whatsapp.periskope?.apiKey ? 'Authorization: Bearer <oculto>' : null,
      periskopeXPhoneHeaderConfigured: Boolean(whatsapp.periskope?.phone),
    },
  };
}

function emailDiagnostics(config = effectiveNotificationConfig()) {
  const email = config.email || {};
  const provider = email.provider || 'smtp';
  const problems = [];
  if (!email.enabled) problems.push('Envio automático por e-mail desativado. Marque Ativar envio automático por e-mail ou defina EMAIL_ENABLED=true no Render.');
  if (provider === 'mailersend') {
    if (!email.mailersend?.apiKey) problems.push('MAILERSEND_API_KEY não configurado. Cole o token apenas no Render ou nas configurações do síndico.');
    if (!email.mailersend?.fromEmail) problems.push('MAILERSEND_FROM_EMAIL não configurado. Informe um remetente/domínio verificado no MailerSend.');
    else if (!isValidEmailAddress(email.mailersend.fromEmail)) problems.push('MAILERSEND_FROM_EMAIL inválido. Use um e-mail completo, por exemplo contato@seudominio.com.br.');
    if (email.mailersend?.testTo && !isValidEmailAddress(email.mailersend.testTo)) problems.push('MAILERSEND_TEST_TO inválido. Informe um e-mail de teste válido.');
  } else {
    if (!email.host) problems.push('SMTP_HOST não configurado.');
    if (!email.user) problems.push('SMTP_USER não configurado.');
    if (!email.password) problems.push('Senha de aplicativo não configurada.');
    if (!email.fromEmail) problems.push('SMTP_FROM_EMAIL não configurado; será usado SMTP_USER.');
  }
  return {
    ok: problems.length === 0,
    problems,
    config: {
      enabled: Boolean(email.enabled),
      provider,
      host: email.host || null,
      port: Number(email.port || 465),
      secure: Boolean(email.secure),
      user: email.user || null,
      fromEmail: provider === 'mailersend' ? (email.mailersend?.fromEmail || null) : (email.fromEmail || email.user || null),
      testTo: provider === 'mailersend' ? (email.mailersend?.testTo || null) : (email.testTo || email.user || null),
      passwordSaved: Boolean(email.password),
      passwordSource: email.passwordSource || 'none',
      mailersendApiKeySaved: Boolean(email.mailersend?.apiKey),
      mailersendApiKeySource: email.mailersend?.apiKeySource || 'none',
    },
  };
}

function envAsaasEnabled() {
  return String(process.env.ASAAS_ENABLED || 'false').toLowerCase() === 'true';
}

function effectiveAsaasConfig(config = store.asaasConfig || DEFAULT_ASAAS_CONFIG) {
  const merged = deepMerge(DEFAULT_ASAAS_CONFIG, config || {});
  const envKey = process.env.ASAAS_API_KEY || '';
  const key = merged.apiKey || envKey;
  return {
    ...merged,
    apiKey: key,
    enabled: Boolean(merged.enabled || (envAsaasEnabled() && key)),
    environment: ['production', 'sandbox'].includes(merged.environment) ? merged.environment : (process.env.ASAAS_ENVIRONMENT || 'sandbox'),
  };
}

function sanitizeAsaasConfig(config) {
  const asaas = effectiveAsaasConfig(config || DEFAULT_ASAAS_CONFIG);
  return {
    ...asaas,
    apiKey: '',
    apiKeySaved: Boolean(asaas.apiKey),
    apiKeySource: (config?.apiKey ? 'saved' : (process.env.ASAAS_API_KEY ? 'env' : 'none')),
  };
}

async function saveAsaasConfig(incoming = {}) {
  const existing = store.asaasConfig || DEFAULT_ASAAS_CONFIG;
  const clean = deepMerge(existing, incoming);
  if (incoming.apiKey === '') clean.apiKey = existing.apiKey || DEFAULT_ASAAS_CONFIG.apiKey || '';
  if (incoming.clearApiKey) clean.apiKey = '';
  clean.enabled = Boolean(clean.enabled);
  clean.environment = ['production', 'sandbox'].includes(clean.environment) ? clean.environment : 'sandbox';
  clean.dueDaysBeforeReservation = Number(clean.dueDaysBeforeReservation || 2);
  clean.fineValue = Number(clean.fineValue || 0);
  clean.interestValue = Number(clean.interestValue || 0);
  clean.notificationEnabled = Boolean(clean.notificationEnabled);
  store.asaasConfig = clean;
  await saveStore(store);
  return clean;
}

function asaasBaseUrl(config = store.asaasConfig || DEFAULT_ASAAS_CONFIG) {
  const effective = effectiveAsaasConfig(config);
  return effective.environment === 'production' ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3';
}

function onlyDigits(value = '') {
  return String(value || '').replace(/\D/g, '');
}

function asaasApiKey() {
  return effectiveAsaasConfig().apiKey || '';
}

async function asaasRequest(path, options = {}) {
  const config = effectiveAsaasConfig();
  if (!config.enabled) throw new Error('Integração Asaas desativada nas configurações ou variável ASAAS_ENABLED não definida.');
  const key = asaasApiKey();
  if (!key) throw new Error('API Key do Asaas não configurada.');
  const response = await fetch(`${asaasBaseUrl(config)}${path}`, {
    method: options.method || 'GET',
    headers: { access_token: key, 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(async () => ({ raw: await response.text().catch(() => '') }));
  if (!response.ok) {
    const error = payload.errors?.map((item) => item.description || item.message).filter(Boolean).join('; ') || payload.error?.message || response.statusText;
    throw new Error(`Asaas HTTP ${response.status}: ${error}`);
  }
  return payload;
}

function addDaysISO(dateValue, amount) {
  const d = dateValue ? new Date(`${dateValue}T12:00:00`) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  d.setDate(d.getDate() + amount);
  return d.toISOString().slice(0, 10);
}

function asaasDueDateForBooking(booking, config = effectiveAsaasConfig()) {
  const due = addDaysISO(booking.date, -Math.abs(Number(config.dueDaysBeforeReservation || 2)));
  const today = new Date().toISOString().slice(0, 10);
  return due < today ? today : due;
}

function bookingExternalReference(booking) {
  return `vitoria-regia-booking-${booking.id}`;
}

function residentExternalReference(booking, cpfCnpj) {
  return `vitoria-regia-unit-${booking.apartment}-${onlyDigits(cpfCnpj).slice(-6)}`;
}

function findResidentForBooking(booking) {
  const residents = (store.state?.residents || []).filter((r) => r.apartment === booking.apartment);
  return residents.find((r) => r.primaryBilling)
    || residents.find((r) => booking.residentEmail && r.email === booking.residentEmail)
    || residents[0]
    || {};
}

async function getOrCreateAsaasCustomer(booking, cpfCnpj) {
  const resident = findResidentForBooking(booking) || {};
  const document = onlyDigits(cpfCnpj || booking.residentCpfCnpj || resident.cpfCnpj || resident.document);
  if (!document || document.length < 11) throw new Error('Informe o CPF/CNPJ do morador para gerar boleto registrado no Asaas.');
  const externalReference = residentExternalReference(booking, document);
  const existing = await asaasRequest(`/customers?externalReference=${encodeURIComponent(externalReference)}&limit=1`);
  if (existing?.data?.[0]?.id) return existing.data[0];
  return asaasRequest('/customers', {
    method: 'POST',
    body: {
      name: resident.name || booking.residentName || `Unidade ${booking.apartment}`,
      cpfCnpj: document,
      email: resident.email || booking.residentEmail || undefined,
      mobilePhone: onlyDigits(resident.whatsapp || booking.residentWhatsapp || '' ) || undefined,
      notificationDisabled: false,
      externalReference,
      observations: `Cliente criado pelo Sistema Vitória Régia - unidade ${booking.apartment}`,
    },
  });
}

async function createAsaasBoletoForBooking(bookingId, cpfCnpj) {
  const config = effectiveAsaasConfig();
  const bookings = store.state?.bookings || [];
  const booking = bookings.find((item) => item.id === bookingId);
  if (!booking) throw new Error('Reserva não encontrada.');
  if (Number(booking.fee || 0) <= 0) throw new Error('Valor da taxa da reserva precisa ser maior que zero.');

  if (booking.boleto?.provider === 'asaas' && booking.boleto.paymentId) {
    return { booking, payment: booking.boleto, reused: true };
  }

  const resident = findResidentForBooking(booking) || {};
  const customer = await getOrCreateAsaasCustomer(booking, cpfCnpj);
  const dueDate = asaasDueDateForBooking(booking, config);
  const payment = await asaasRequest('/payments', {
    method: 'POST',
    body: {
      customer: customer.id,
      billingType: 'BOLETO',
      value: Number(booking.fee || 0),
      dueDate,
      description: `Reserva ${booking.spaceName} - unidade ${booking.apartment} - ${booking.date} (${booking.period})`,
      externalReference: bookingExternalReference(booking),
      fine: Number(config.fineValue || 0) > 0 ? { value: Number(config.fineValue || 0) } : undefined,
      interest: Number(config.interestValue || 0) > 0 ? { value: Number(config.interestValue || 0) } : undefined,
    },
  });

  const boleto = {
    provider: 'asaas',
    generatedAt: new Date().toISOString(),
    paymentId: payment.id,
    customerId: customer.id,
    status: payment.status || 'PENDING',
    amount: Number(payment.value || booking.fee || 0),
    dueDate: payment.dueDate || dueDate,
    invoiceUrl: payment.invoiceUrl || null,
    bankSlipUrl: payment.bankSlipUrl || null,
    line: payment.identificationField || payment.nossoNumero || 'Boleto Asaas gerado. Acesse o link para visualizar o boleto bancário.',
    externalReference: payment.externalReference || bookingExternalReference(booking),
    note: 'Boleto registrado gerado pela integração Asaas.',
    raw: payment,
  };

  const updated = { ...booking, boleto, asaasPaymentId: payment.id, residentName: resident.name || booking.residentName, residentEmail: resident.email || booking.residentEmail, residentWhatsapp: resident.whatsapp || booking.residentWhatsapp, residentCpfCnpj: onlyDigits(cpfCnpj || resident.cpfCnpj || booking.residentCpfCnpj || '') };
  store.state.bookings = bookings.map((item) => item.id === bookingId ? updated : item);
  await saveStore(store);
  await logNotification({ channel: 'asaas', recipient: booking.residentEmail || '', subject: 'Boleto Asaas gerado', message: boleto.invoiceUrl || boleto.bankSlipUrl || payment.id, status: 'sent', providerResponse: payment });
  return { booking: updated, payment: boleto, reused: false };
}

async function updateBookingByAsaasPayment(payment = {}, event = '') {
  const paymentId = payment.id;
  const external = payment.externalReference || '';
  let changed = false;
  const paidEvents = ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'];
  const canceledEvents = ['PAYMENT_DELETED', 'PAYMENT_BANK_SLIP_CANCELLED'];
  store.state.bookings = (store.state?.bookings || []).map((booking) => {
    const matches = booking.asaasPaymentId === paymentId || booking.boleto?.paymentId === paymentId || bookingExternalReference(booking) === external;
    if (!matches) return booking;
    changed = true;
    const nextBoleto = { ...(booking.boleto || {}), status: payment.status || booking.boleto?.status || event, raw: payment, updatedAt: new Date().toISOString() };
    let status = booking.status;
    if (paidEvents.includes(event) || ['RECEIVED', 'CONFIRMED'].includes(payment.status)) status = 'paid';
    if (canceledEvents.includes(event) || ['DELETED'].includes(payment.status)) status = 'canceled';
    return { ...booking, status, boleto: nextBoleto, paidAt: status === 'paid' ? new Date().toISOString() : booking.paidAt };
  });
  if (changed) await saveStore(store);
  return changed;
}

async function saveNotificationConfig(incoming = {}) {
  const existing = store.notificationConfig || DEFAULT_NOTIFICATION_CONFIG;
  const clean = deepMerge(existing, incoming);

  if (!incoming.email || incoming.email.password === '') clean.email.password = existing.email?.password || DEFAULT_NOTIFICATION_CONFIG.email.password || '';
  if (!clean.email.mailersend) clean.email.mailersend = {};
  if (!incoming.email?.mailersend || incoming.email.mailersend.apiKey === '') {
    clean.email.mailersend.apiKey = existing.email?.mailersend?.apiKey || DEFAULT_NOTIFICATION_CONFIG.email.mailersend.apiKey || '';
  }
  if (!clean.whatsapp) clean.whatsapp = {};
  if (!clean.whatsapp.evolution) clean.whatsapp.evolution = {};
  if (!clean.whatsapp.periskope) clean.whatsapp.periskope = {};
  if (!clean.telegram) clean.telegram = {};
  if (!incoming.whatsapp || incoming.whatsapp.token === '') clean.whatsapp.token = existing.whatsapp?.token || DEFAULT_NOTIFICATION_CONFIG.whatsapp.token || '';
  if (!incoming.whatsapp?.evolution || incoming.whatsapp.evolution.apiKey === '') {
    clean.whatsapp.evolution.apiKey = existing.whatsapp?.evolution?.apiKey || DEFAULT_NOTIFICATION_CONFIG.whatsapp.evolution.apiKey || '';
  }
  if (!incoming.whatsapp?.periskope || incoming.whatsapp.periskope.apiKey === '') {
    clean.whatsapp.periskope.apiKey = existing.whatsapp?.periskope?.apiKey || DEFAULT_NOTIFICATION_CONFIG.whatsapp.periskope.apiKey || '';
  }
  if (!incoming.telegram || incoming.telegram.botToken === '') {
    clean.telegram.botToken = existing.telegram?.botToken || DEFAULT_NOTIFICATION_CONFIG.telegram.botToken || '';
  }
  if (incoming.email?.clearPassword) clean.email.password = '';
  if (incoming.email?.mailersend?.clearApiKey) clean.email.mailersend.apiKey = '';
  if (incoming.whatsapp?.clearToken) clean.whatsapp.token = '';
  if (incoming.whatsapp?.evolution?.clearApiKey) clean.whatsapp.evolution.apiKey = '';
  if (incoming.whatsapp?.periskope?.clearApiKey) clean.whatsapp.periskope.apiKey = '';
  if (incoming.telegram?.clearBotToken) clean.telegram.botToken = '';

  clean.email.enabled = Boolean(clean.email.enabled);
  clean.email.provider = ['smtp', 'mailersend'].includes(String(clean.email.provider || '').toLowerCase()) ? String(clean.email.provider).toLowerCase() : 'smtp';
  clean.email.port = Number(clean.email.port || 465);
  clean.email.secure = Boolean(clean.email.secure);
  clean.email.testTo = clean.email.testTo || process.env.SMTP_TEST_TO || clean.email.user || process.env.SMTP_USER || '';
  clean.email.mailersend.apiKey = cleanBearerToken(clean.email.mailersend.apiKey || '');
  clean.email.mailersend.fromName = safeMailerName(clean.email.mailersend.fromName || process.env.MAILERSEND_FROM_NAME || clean.email.fromName || 'Condomínio Vitória Régia');
  clean.email.mailersend.fromEmail = normalizeMailAddress(clean.email.mailersend.fromEmail || process.env.MAILERSEND_FROM_EMAIL || '');
  clean.email.mailersend.testTo = normalizeMailAddress(clean.email.mailersend.testTo || clean.email.testTo || process.env.MAILERSEND_TEST_TO || '');
  clean.whatsapp.enabled = Boolean(clean.whatsapp.enabled);
  clean.whatsapp.provider = ['meta', 'evolution', 'periskope'].includes(cleanIntegrationValue(clean.whatsapp.provider || '').toLowerCase()) ? cleanIntegrationValue(clean.whatsapp.provider).toLowerCase() : 'meta';
  clean.whatsapp.countryCode = clean.whatsapp.countryCode || '55';
  clean.whatsapp.testTo = clean.whatsapp.testTo || clean.whatsapp.evolution.testTo || clean.whatsapp.periskope.testTo || process.env.WHATSAPP_TEST_TO || process.env.EVOLUTION_TEST_TO || process.env.PERISKOPE_TEST_TO || '';
  clean.whatsapp.evolution.serverUrl = String(clean.whatsapp.evolution.serverUrl || '').replace(/\/+$/, '');
  clean.whatsapp.evolution.instanceName = String(clean.whatsapp.evolution.instanceName || '').trim();
  clean.whatsapp.evolution.countryCode = clean.whatsapp.evolution.countryCode || clean.whatsapp.countryCode || '55';
  clean.whatsapp.evolution.testTo = clean.whatsapp.evolution.testTo || clean.whatsapp.testTo || '';
  clean.whatsapp.evolution.linkPreview = Boolean(clean.whatsapp.evolution.linkPreview);
  clean.whatsapp.periskope.baseUrl = normalizePeriskopeBaseUrl(clean.whatsapp.periskope.baseUrl || 'https://api.periskope.app/v1');
  clean.whatsapp.periskope.apiKey = cleanBearerToken(clean.whatsapp.periskope.apiKey || '');
  clean.whatsapp.periskope.phone = normalizePeriskopePhoneHeader(clean.whatsapp.periskope.phone || '', clean.whatsapp.periskope.countryCode || clean.whatsapp.countryCode || '55');
  clean.whatsapp.periskope.countryCode = clean.whatsapp.periskope.countryCode || clean.whatsapp.countryCode || '55';
  clean.whatsapp.periskope.testTo = clean.whatsapp.periskope.testTo || clean.whatsapp.testTo || '';
  clean.whatsapp.periskope.hideUrlPreview = Boolean(clean.whatsapp.periskope.hideUrlPreview);
  clean.telegram.enabled = Boolean(clean.telegram.enabled);
  clean.telegram.botToken = cleanBearerToken(clean.telegram.botToken || '');
  clean.telegram.botUsername = String(clean.telegram.botUsername || '').trim().replace(/^@/, '');
  clean.telegram.defaultChatId = normalizeTelegramChatId(clean.telegram.defaultChatId || clean.telegram.testChatId || '');
  clean.telegram.testChatId = normalizeTelegramChatId(clean.telegram.testChatId || clean.telegram.defaultChatId || '');
  clean.telegram.parseMode = ['HTML', 'MarkdownV2', 'Markdown', ''].includes(String(clean.telegram.parseMode || 'HTML')) ? String(clean.telegram.parseMode || 'HTML') : 'HTML';

  store.notificationConfig = clean;
  await saveStore(store);
  return clean;
}

function normalizeSmtpPassword(value = '') {
  return String(value || '').replace(/\s+/g, '');
}

function normalizeMailAddress(value = '') {
  return String(value || '')
    .trim()
    .replace(/^mailto:/i, '')
    .replace(/^<|>$/g, '')
    .toLowerCase();
}

function isValidEmailAddress(value = '') {
  const email = normalizeMailAddress(value);
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email);
}

function safeMailerName(value = '') {
  return String(value || '')
    .replace(/[;,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function escapeHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function collectProviderMessages(value, output = []) {
  if (!value) return output;
  if (typeof value === 'string') { output.push(value); return output; }
  if (Array.isArray(value)) {
    value.forEach((item) => collectProviderMessages(item, output));
    return output;
  }
  if (typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (['message', 'error', 'code'].includes(key) && typeof item === 'string') output.push(item);
      else collectProviderMessages(item, output);
    }
  }
  return output;
}

function mailerSendErrorMessage(status, payload = {}, fallback = '') {
  const messages = collectProviderMessages(payload)
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  const unique = [...new Set(messages)];
  const detail = unique.slice(0, 6).join(' | ') || fallback || 'Requisição recusada pelo MailerSend.';
  const tips = [];
  const combined = `${detail} ${JSON.stringify(payload)}`.toLowerCase();
  if (status === 422) {
    if (combined.includes('from.email') || combined.includes('verified') || combined.includes('domain')) {
      tips.push('confirme se MAILERSEND_FROM_EMAIL é um remetente/domínio verificado no MailerSend');
    }
    if (combined.includes('valid email') || combined.includes('to.') || combined.includes('email address')) {
      tips.push('confirme se o destinatário e o remetente são e-mails válidos');
    }
    if (combined.includes('subject')) tips.push('confirme se o assunto não está vazio');
    if (combined.includes('html') || combined.includes('text') || combined.includes('template')) {
      tips.push('confirme se há conteúdo em texto ou HTML');
    }
  }
  return `MailerSend HTTP ${status}: ${detail}${tips.length ? `. Verifique: ${tips.join('; ')}.` : ''}`;
}

async function logNotification(entry) {
  const log = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    ...entry,
  };

  store.notificationLogs = [log, ...(store.notificationLogs || [])].slice(0, 200);

  if (databaseReady) {
    try {
      await query(
        `insert into notification_logs (id, channel, recipient, subject, message, status, error, provider_response, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
        [log.id, log.channel || 'sistema', log.recipient || null, log.subject || null, log.message || null, log.status || 'info', log.error || null, toJson(log.providerResponse || {}), mysqlDateTime(log.createdAt)]
      );
    } catch (error) {
      console.error('Falha ao registrar log no banco:', error.message);
    }
  } else {
    await saveStore(store).catch(() => {});
  }
  return log;
}

async function sendMailerSendEmail({ apiKey, fromEmail, fromName, to, subject, message, html }) {
  const token = cleanBearerToken(apiKey || '');
  const finalFrom = normalizeMailAddress(fromEmail || '');
  const finalTo = normalizeMailAddress(to || '');
  const finalSubject = String(subject || 'Teste de e-mail - Condomínio Vitória Régia').trim();
  const finalMessage = String(message || 'Este é um e-mail automático de teste do Sistema Vitória Régia.').trim();

  if (!token) throw new Error('MAILERSEND_API_KEY não configurado. Informe o token no Render ou no painel do síndico.');
  if (!isValidEmailAddress(finalFrom)) throw new Error('MAILERSEND_FROM_EMAIL inválido ou ausente. Use um remetente/domínio verificado no MailerSend, por exemplo contato@seudominio.com.br.');
  if (!isValidEmailAddress(finalTo)) throw new Error('Destinatário inválido para envio de e-mail. Informe um e-mail completo e válido.');
  if (!finalSubject) throw new Error('Assunto do e-mail não pode ficar vazio.');
  if (!finalMessage && !html) throw new Error('Conteúdo do e-mail não pode ficar vazio.');

  const payload = {
    from: { email: finalFrom, name: safeMailerName(fromName || 'Condomínio Vitória Régia') || undefined },
    to: [{ email: finalTo }],
    subject: finalSubject,
    text: finalMessage || String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    html: html || `<p>${escapeHtml(finalMessage).replace(/\n/g, '<br>')}</p>`,
  };

  const response = await fetch('https://api.mailersend.com/v1/email', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const raw = await response.text().catch(() => '');
  const parsed = parseProviderPayload(raw);
  if (!response.ok) {
    throw new Error(mailerSendErrorMessage(response.status, parsed, response.statusText));
  }

  return {
    ok: true,
    provider: 'mailersend',
    status: response.status,
    messageId: response.headers.get('x-message-id') || parsed.message_id || parsed.id || null,
    response: parsed,
  };
}

async function sendEmailNotification({ to, subject, message, html }) {
  const config = effectiveNotificationConfig();
  const email = config.email || {};

  const diagnostics = emailDiagnostics(config);
  if (!diagnostics.ok) throw new Error(`E-mail incompleto: ${diagnostics.problems.join(' ')}`);

  const provider = email.provider || 'smtp';
  const finalSubject = subject || 'Teste de e-mail - Condomínio Vitória Régia';
  const finalMessage = message || 'Este é um e-mail automático de teste do Sistema Vitória Régia.';

  if (provider === 'mailersend') {
    const ms = email.mailersend || {};
    const finalTo = to || ms.testTo || email.testTo || email.user;
    if (!finalTo) throw new Error('E-mail destinatário não informado para teste/envio.');
    const result = await sendMailerSendEmail({
      apiKey: ms.apiKey,
      fromEmail: ms.fromEmail,
      fromName: ms.fromName || email.fromName,
      to: finalTo,
      subject: finalSubject,
      message: finalMessage,
      html,
    });
    await logNotification({
      channel: 'email', recipient: finalTo, subject: finalSubject, message: finalMessage, status: 'sent',
      providerResponse: { provider: 'mailersend', messageId: result.messageId, status: result.status, response: result.response },
    });
    return result;
  }

  const transporter = nodemailer.createTransport({
    host: email.host,
    port: Number(email.port || 465),
    secure: Boolean(email.secure),
    auth: { user: email.user, pass: normalizeSmtpPassword(email.password) },
  });

  try {
    await transporter.verify();
  } catch (error) {
    const code = error.code ? ` (${error.code})` : '';
    throw new Error(`Falha na autenticação/conexão SMTP${code}: ${error.message}`);
  }

  const fromAddress = email.fromEmail || email.user;
  const fromName = email.fromName || 'Condomínio Vitória Régia';
  const finalTo = to || email.testTo || email.user;
  if (!finalTo) throw new Error('E-mail destinatário não informado para teste/envio.');

  const info = await transporter.sendMail({
    from: `"${String(fromName).replace(/"/g, '')}" <${fromAddress}>`,
    to: finalTo,
    subject: finalSubject,
    text: finalMessage,
    html: html || `<p>${String(finalMessage).replace(/\n/g, '<br>')}</p>`,
  });

  await logNotification({
    channel: 'email', recipient: finalTo, subject: finalSubject, message: finalMessage, status: 'sent',
    providerResponse: { provider: 'smtp', messageId: info.messageId, accepted: info.accepted, rejected: info.rejected },
  });

  return { ok: true, provider: 'smtp', messageId: info.messageId, accepted: info.accepted, rejected: info.rejected };
}

function cleanIntegrationValue(value = '') {
  return String(value || '')
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .trim();
}

function normalizePhoneForWhatsApp(value = '', countryCode = '55') {
  const cleanCountry = String(countryCode || '55').replace(/\D/g, '') || '55';
  const digits = cleanIntegrationValue(value).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith(cleanCountry)) return digits;
  return `${cleanCountry}${digits}`;
}

function normalizePeriskopePhoneHeader(value = '', countryCode = '55') {
  const raw = cleanIntegrationValue(value).replace(/\s+/g, '');
  if (!raw) return '';
  // A Periskope aceita tanto telefone no formato 55DDDNUMERO quanto phone_id.
  if (/^phone-[A-Za-z0-9_-]+$/.test(raw)) return raw;
  return normalizePhoneForWhatsApp(raw, countryCode);
}

function normalizePeriskopeChatId(value = '', countryCode = '55') {
  const raw = cleanIntegrationValue(value).replace(/\s+/g, '');
  if (!raw) return '';
  if (/@(c|g)\.us$/i.test(raw)) return raw;
  const number = normalizePhoneForWhatsApp(raw, countryCode);
  return number ? `${number}@c.us` : '';
}

function normalizePeriskopeBaseUrl(value = '') {
  let base = cleanIntegrationValue(value || 'https://api.periskope.app/v1').replace(/\/+$/, '');
  if (!base) base = 'https://api.periskope.app/v1';
  // Corrige colagens comuns: domínio sem /v1, endpoint completo ou link da documentação.
  if (/^https?:\/\/docs\.periskope\.app/i.test(base)) base = 'https://api.periskope.app/v1';
  base = base.replace(/\/messages$/i, '').replace(/\/message\/send$/i, '');
  if (/^https?:\/\/api\.periskope\.app$/i.test(base)) base += '/v1';
  return base;
}

function periskopeMessagesEndpoint(baseUrl = '') {
  return `${normalizePeriskopeBaseUrl(baseUrl)}/messages`;
}

function cleanBearerToken(value = '') {
  return cleanIntegrationValue(value)
    .replace(/^Authorization\s*:\s*/i, '')
    .replace(/^Bearer\s+/i, '')
    .replace(/\s+/g, '');
}

function parseProviderPayload(responseText) {
  if (!responseText) return {};
  try { return JSON.parse(responseText); } catch (_) { return { raw: responseText }; }
}

async function sendWhatsAppNotification({ to, message }) {
  const config = effectiveNotificationConfig(store.notificationConfig || DEFAULT_NOTIFICATION_CONFIG);
  const whatsapp = config.whatsapp || {};

  if (!whatsapp.enabled) throw new Error('Envio por WhatsApp desativado nas configurações.');

  const provider = whatsapp.provider || 'meta';
  if (provider === 'evolution') {
    const evolution = whatsapp.evolution || {};
    const number = normalizePhoneForWhatsApp(to || evolution.testTo || whatsapp.testTo, evolution.countryCode || whatsapp.countryCode || '55');
    if (!number) throw new Error('Número de WhatsApp inválido.');
    if (!evolution.serverUrl || !evolution.instanceName || !evolution.apiKey) throw new Error('Evolution API incompleta. Configure URL, instância e API Key.');

    const baseUrl = String(evolution.serverUrl).replace(/\/+$/, '');
    const endpoint = `${baseUrl}/message/sendText/${encodeURIComponent(evolution.instanceName)}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { apikey: evolution.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        number,
        textMessage: { text: message || 'Teste automático do Sistema Vitória Régia.' },
        linkPreview: Boolean(evolution.linkPreview),
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errorMessage = payload?.response?.message || payload?.message || payload?.error || response.statusText;
      await logNotification({ channel: 'whatsapp', recipient: number, message, status: 'error', providerResponse: payload, error: errorMessage });
      throw new Error(errorMessage || `Erro Evolution API HTTP ${response.status}`);
    }

    await logNotification({ channel: 'whatsapp', recipient: number, message, status: 'sent', providerResponse: payload });
    return { ok: true, provider: 'evolution-api', response: payload };
  }

  if (provider === 'periskope') {
    const periskope = whatsapp.periskope || {};
    const number = normalizePhoneForWhatsApp(to || periskope.testTo || whatsapp.testTo, periskope.countryCode || whatsapp.countryCode || '55');
    const token = cleanBearerToken(periskope.apiKey);
    const phoneHeader = normalizePeriskopePhoneHeader(periskope.phone, periskope.countryCode || whatsapp.countryCode || '55');
    if (!number) throw new Error('Número de WhatsApp inválido.');
    if (!periskope.baseUrl || !token || !phoneHeader) throw new Error('Periskope API incompleta. Configure Base URL, API Key e telefone conectado.');

    const baseUrl = normalizePeriskopeBaseUrl(periskope.baseUrl || 'https://api.periskope.app/v1');
    const endpoint = periskopeMessagesEndpoint(baseUrl);
    const chatId = normalizePeriskopeChatId(to || periskope.testTo || whatsapp.testTo, periskope.countryCode || whatsapp.countryCode || '55');
    const response = await fetch(endpoint, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        // A documentação da Periskope exige Authorization: Bearer <apiKey> e x-phone.
        Authorization: `Bearer ${token}`,
        'x-phone': phoneHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        message: message || 'Teste automático do Sistema Vitória Régia.',
        options: { hide_url_preview: Boolean(periskope.hideUrlPreview) },
      }),
    });

    const responseText = await response.text().catch(() => '');
    const payload = parseProviderPayload(responseText);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location') || '';
      const redirectError = `A Periskope redirecionou a chamada para ${location || 'outra URL'}. Confira PERISKOPE_BASE_URL. Use exatamente https://api.periskope.app/v1`;
      await logNotification({ channel: 'whatsapp', recipient: number, message, status: 'error', providerResponse: { redirectTo: location, endpoint }, error: redirectError });
      throw new Error(redirectError);
    }
    if (!response.ok) {
      let errorMessage = payload?.message || payload?.error || payload?.detail || payload?.raw || response.statusText;
      if (/authorization header is missing/i.test(String(errorMessage))) {
        errorMessage = 'Periskope informou que o header Authorization está ausente. Confira se PERISKOPE_API_KEY foi salvo no Render ou no painel, sem aspas, sem quebras de linha e sem repetir a palavra Bearer. Depois faça Manual Deploy no Render.';
      }
      await logNotification({ channel: 'whatsapp', recipient: number, message, status: 'error', providerResponse: { ...payload, endpoint, chatId, hasAuthorizationHeader: Boolean(token), authorizationHeaderFormat: token ? 'Bearer <oculto>' : 'missing', hasXPhoneHeader: Boolean(phoneHeader), xPhoneHeader: phoneHeader ? '<configurado>' : 'missing' }, error: errorMessage });
      throw new Error(errorMessage || `Erro Periskope API HTTP ${response.status}`);
    }

    await logNotification({ channel: 'whatsapp', recipient: number, message, status: 'queued', providerResponse: payload });
    return { ok: true, provider: 'periskope-api', response: payload };
  }

  if (!whatsapp.token || !whatsapp.phoneNumberId) throw new Error('WhatsApp Cloud API incompleto. Configure token e Phone Number ID.');

  const number = normalizePhoneForWhatsApp(to || whatsapp.testTo, whatsapp.countryCode || '55');
  if (!number) throw new Error('Número de WhatsApp inválido.');

  const version = whatsapp.apiVersion || 'v20.0';
  const response = await fetch(`https://graph.facebook.com/${version}/${whatsapp.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${whatsapp.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: number, type: 'text', text: { preview_url: false, body: message || 'Teste automático do Sistema Vitória Régia.' } }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    await logNotification({ channel: 'whatsapp', recipient: number, message, status: 'error', providerResponse: payload, error: payload.error?.message || response.statusText });
    throw new Error(payload.error?.message || `Erro WhatsApp HTTP ${response.status}`);
  }

  await logNotification({ channel: 'whatsapp', recipient: number, message, status: 'sent', providerResponse: payload });
  return { ok: true, provider: 'meta-whatsapp', response: payload };
}



function telegramApiUrl(token, method) {
  return `https://api.telegram.org/bot${encodeURIComponent(token)}/${method}`;
}

async function sendTelegramNotification({ chatId, message, subject, buttons, photoUrl }) {
  const config = effectiveNotificationConfig(store.notificationConfig || DEFAULT_NOTIFICATION_CONFIG);
  const telegram = config.telegram || {};
  if (!telegram.enabled) throw new Error('Envio por Telegram desativado nas configurações.');
  if (!telegram.botToken) throw new Error('TELEGRAM_BOT_TOKEN não configurado.');
  const finalChatId = normalizeTelegramChatId(chatId || telegram.testChatId || telegram.defaultChatId || '');
  if (!finalChatId) throw new Error('Chat ID do Telegram não informado. Cadastre o chat do usuário ou um chat padrão nas configurações.');
  const textParts = [];
  if (subject) textParts.push(`<b>${escapeHtml(subject)}</b>`);
  textParts.push(escapeHtml(message || 'Mensagem automática do Sistema Vitória Régia.').replace(/\n/g, '\n'));
  const payload = {
    chat_id: finalChatId,
    text: textParts.join('\n\n'),
    disable_web_page_preview: true,
  };
  if (telegram.parseMode) payload.parse_mode = telegram.parseMode;
  if (Array.isArray(buttons) && buttons.length) {
    payload.reply_markup = { inline_keyboard: buttons.map((row) => Array.isArray(row) ? row : [row]).map((row) => row.map((btn) => ({ text: String(btn.text || 'Abrir'), url: btn.url, callback_data: btn.callback_data }))) };
  }

  const response = await fetch(telegramApiUrl(telegram.botToken, 'sendMessage'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const providerResponse = await response.json().catch(() => ({}));
  if (!response.ok || providerResponse.ok === false) {
    const errorMessage = providerResponse.description || response.statusText || `Telegram HTTP ${response.status}`;
    await logNotification({ channel: 'telegram', recipient: finalChatId, subject, message, status: 'error', providerResponse, error: errorMessage });
    throw new Error(errorMessage);
  }
  await logNotification({ channel: 'telegram', recipient: finalChatId, subject, message, status: 'sent', providerResponse });
  return { ok: true, provider: 'telegram-bot-api', response: providerResponse };
}

function readinessItem(ok, warning, title, detail) {
  return { status: ok ? 'ok' : (warning ? 'warning' : 'critical'), title, detail };
}
function calculateMarketReadiness() {
  const state = store.state || DEFAULT_STATE;
  const notification = effectiveNotificationConfig(store.notificationConfig || DEFAULT_NOTIFICATION_CONFIG);
  const storage = effectiveStorageConfig(store.storageConfig || DEFAULT_STORAGE_CONFIG);
  const asaas = effectiveAsaasConfig(store.asaasConfig || DEFAULT_ASAAS_CONFIG);
  const staff = Array.isArray(state.staff) ? state.staff : [];
  const residents = Array.isArray(state.residents) ? state.residents : [];
  const packages = Array.isArray(state.packages) ? state.packages : [];
  const bookings = Array.isArray(state.bookings) ? state.bookings : [];
  const cloudFiles = Array.isArray(state.cloudFiles) ? state.cloudFiles : [];
  const logs = Array.isArray(store.activityLogs) ? store.activityLogs : [];
  const openPackages = packages.filter((item) => item.status !== 'delivered').length;
  const pendingBookings = bookings.filter((item) => item.status === 'pending').length;
  const activeAdmins = staff.filter((person) => person.active !== false && staffIsAdministrator(person));
  const privateStorage = storage.provider === 'supabase' && storage.enabled && storage.supabase?.publicBucket === false && Boolean(storage.supabase?.serviceRoleKey);
  const emailConfigured = Boolean(notification.email?.enabled && ((notification.email.provider === 'mailersend' && notification.email.mailersend?.apiKey && notification.email.mailersend?.fromEmail) || (notification.email.provider !== 'mailersend' && notification.email.user && notification.email.password)));
  const whatsappConfigured = Boolean(notification.whatsapp?.enabled && notification.whatsapp?.provider === 'periskope' && notification.whatsapp?.periskope?.apiKey && notification.whatsapp?.periskope?.phone);
  const strongSession = Boolean(process.env.SESSION_SECRET && process.env.SESSION_SECRET !== 'troque-esta-chave-em-producao' && SESSION_COOKIE_SECURE && SESSION_COOKIE_SAME_SITE);
  const checklist = [
    readinessItem(databaseReady && hasDatabaseConfig(), false, 'Banco MySQL obrigatório ativo', databaseReady ? 'Banco operacional para persistência real de cadastros, encomendas e configurações.' : 'Configure DATABASE_URL ou MYSQL_* no Render e confirme /api/db/status.'),
    readinessItem(strongSession, Boolean(process.env.SESSION_SECRET), 'Sessão segura no Render', strongSession ? 'Cookie HTTP-only com configuração segura de produção.' : 'Defina SESSION_SECRET forte, TRUST_PROXY=true e SESSION_COOKIE_SECURE=true.'),
    readinessItem(activeAdmins.length > 0, false, 'Administrador definitivo cadastrado', activeAdmins.length ? `${activeAdmins.length} usuário(s) administrativo(s) ativo(s).` : 'Cadastre síndico/administrador real e desative login temporário.'),
    readinessItem(!bootstrapAdminAvailable(), false, 'Login temporário desativado', bootstrapAdminAvailable() ? 'Ainda existe login temporário disponível; use apenas para implantação inicial.' : 'Login temporário bloqueado após criação de administrador válido.'),
    readinessItem(privateStorage, storage.enabled, 'Storage privado para fotos e documentos', privateStorage ? 'Supabase configurado em modo privado com metadados leves no MySQL.' : 'Ative Supabase Storage privado para anexos, fotos de encomendas e documentos.'),
    readinessItem(whatsappConfigured, notification.whatsapp?.enabled, 'WhatsApp Periskope pronto', whatsappConfigured ? 'API Key e telefone conectado configurados.' : 'Configure PERISKOPE_API_KEY e PERISKOPE_PHONE para notificações automáticas.'),
    readinessItem(emailConfigured, notification.email?.enabled, 'E-mail transacional pronto', emailConfigured ? 'Provedor de e-mail configurado para senhas temporárias e avisos.' : 'Configure MailerSend com domínio/remetente verificado ou SMTP válido.'),
    readinessItem(Boolean(asaas.enabled && asaas.apiKey), Boolean(asaas.enabled), 'Cobrança de reservas integrada', asaas.enabled && asaas.apiKey ? `Asaas ${asaas.environment || 'sandbox'} configurado.` : 'Configure Asaas quando quiser boletos/links de pagamento automáticos.'),
    readinessItem(fs.existsSync(path.join(__dirname, '..', 'private', 'manual_usuario_sistema_vitoria_regia.pdf')), false, 'Manual administrativo incorporado', 'Manual protegido no perfil administrativo para padronizar treinamento e suporte.'),
    readinessItem(logs.length > 0, true, 'Auditoria operacional com histórico', logs.length ? `${logs.length} registro(s) recentes de auditoria.` : 'Os logs serão preenchidos conforme portaria e administração utilizarem ações sensíveis.'),
  ];
  const weights = checklist.map((item) => item.status === 'ok' ? 10 : (item.status === 'warning' ? 5 : 0));
  const score = Math.round(weights.reduce((sum, value) => sum + value, 0));
  const critical = checklist.filter((item) => item.status === 'critical').length;
  const warning = checklist.filter((item) => item.status === 'warning').length;
  const summary = score >= 85
    ? 'Sistema em padrão premium: pronto para operação profissional e apresentação a condomínios.'
    : score >= 70
      ? 'Sistema competitivo: faltam poucos ajustes para padrão premium completo.'
      : score >= 50
        ? 'Sistema funcional, mas ainda precisa fortalecer integrações e segurança de produção.'
        : 'Sistema ainda em implantação: priorize banco, sessão, administrador definitivo e canais de notificação.';
  const apartmentsWithResidents = new Set(residents.map((item) => String(item.apartment || '').trim()).filter(Boolean)).size;
  const roadmap = [];
  if (!databaseReady) roadmap.push({ title: 'Consolidar produção no Render + MySQL', detail: 'Sem banco ativo, não há persistência confiável. Prioridade máxima.' });
  if (bootstrapAdminAvailable()) roadmap.push({ title: 'Encerrar login temporário', detail: 'Crie o síndico/administrador definitivo e deixe o login temporário bloqueado automaticamente.' });
  if (!privateStorage) roadmap.push({ title: 'Blindar arquivos em bucket privado', detail: 'Use Supabase privado e links assinados para fotos de moradores, encomendas e documentos.' });
  if (!whatsappConfigured) roadmap.push({ title: 'Ativar WhatsApp operacional', detail: 'Conecte Periskope para avisos automáticos de encomendas, visitantes e comunicados importantes.' });
  if (!emailConfigured) roadmap.push({ title: 'Ativar e-mail transacional', detail: 'Use MailerSend com domínio/remetente verificado para reduzir erros 422 e melhorar entregabilidade.' });
  if (!asaas.enabled || !asaas.apiKey) roadmap.push({ title: 'Monetizar reservas e serviços', detail: 'Ative Asaas para cobrança automática de reservas e serviços extras.' });
  if (logs.length === 0) roadmap.push({ title: 'Treinar portaria com trilha de auditoria', detail: 'Use visitantes, encomendas e retirada para gerar histórico auditável desde o primeiro dia.' });
  if (!roadmap.length) roadmap.push({ title: 'Próxima fronteira: BI e app store', detail: 'Com a base pronta, avance para relatórios executivos, QR Code de acesso e publicação oficial dos apps.' });
  return {
    ok: true,
    score,
    critical,
    warning,
    summary,
    checklist,
    metrics: {
      residents: residents.length,
      apartmentsWithResidents,
      openPackages,
      pendingBookings,
      activityLogs: logs.length,
      cloudFiles: cloudFiles.length,
      staff: staff.length,
      admins: activeAdmins.length,
    },
    roadmap,
    generatedAt: new Date().toISOString(),
  };
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(morgan('tiny'));
app.use(express.json({ limit: process.env.JSON_LIMIT || '80mb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.JSON_LIMIT || '80mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'troque-esta-chave-em-producao',
  resave: false,
  saveUninitialized: false,
  proxy: RUNNING_BEHIND_PROXY,
  cookie: {
    httpOnly: true,
    sameSite: SESSION_COOKIE_SAME_SITE,
    secure: SESSION_COOKIE_SECURE,
  },
}));

app.get('/api/health', async (req, res) => {
  const email = effectiveNotificationConfig().email || DEFAULT_NOTIFICATION_CONFIG.email;
  let db = { configured: hasDatabaseConfig(), ready: databaseReady };
  if (databaseReady) {
    try { db = { ...db, ...(await testConnection()) }; } catch (error) { db.error = error.message; }
  }
  res.json({
    ok: true,
    service: 'vitoria-regia-backend-operacional',
    timestamp: new Date().toISOString(),
    database: db,
    demoMode: false,
    requireDatabase: REQUIRE_DATABASE,
    requireApprovedResident: REQUIRE_APPROVED_RESIDENT,
    frontendDir: FRONTEND_DIR,
    email: {
      enabled: Boolean(email.enabled),
      provider: email.provider || 'smtp',
      user: email.user || null,
      passwordSaved: Boolean(email.password),
      passwordSource: email.passwordSource || 'none',
      mailersendApiKeySaved: Boolean(email.mailersend?.apiKey),
      mailersendApiKeySource: email.mailersend?.apiKeySource || 'none',
      testTo: email.provider === 'mailersend' ? (email.mailersend?.testTo || null) : (email.testTo || null),
    },
    asaas: { enabled: Boolean(effectiveAsaasConfig().enabled), environment: effectiveAsaasConfig().environment, apiKeySaved: Boolean(effectiveAsaasConfig().apiKey), apiKeySource: (store.asaasConfig?.apiKey ? 'saved' : (process.env.ASAAS_API_KEY ? 'env' : 'none')) },
    bootstrapAdmin: {
      configured: Boolean(BOOTSTRAP_ADMIN_ENABLED && BOOTSTRAP_ADMIN_EMAIL && BOOTSTRAP_ADMIN_PASSWORD),
      available: bootstrapAdminAvailable(),
      email: BOOTSTRAP_ADMIN_EMAIL || null,
      disablesAfterFirstSindico: BOOTSTRAP_DISABLE_AFTER_FIRST_SINDICO,
      activeSindicoExists: hasActiveNonBootstrapSindico(),
    },
    googleOAuth: {
      enabled: GOOGLE_AUTH_ENABLED,
      configured: googleOAuthConfigured(),
      clientIdSaved: Boolean(GOOGLE_CLIENT_ID),
      clientSecretSaved: Boolean(GOOGLE_CLIENT_SECRET),
      callbackUrl: GOOGLE_CALLBACK_URL,
    },
  });
});

app.get('/api/db/status', async (req, res) => {
  const result = {
    configured: hasDatabaseConfig(),
    ready: databaseReady,
    requireDatabase: REQUIRE_DATABASE,
    mode: databaseReady ? 'mysql' : 'unavailable',
  };
  if (hasDatabaseConfig()) {
    try {
      result.connection = await testConnection();
      if (databaseReady) {
        const counts = {};
        for (const table of ['residents','pending_residents','bookings','packages','visitors','recurring_visitors','notices','staff','staff_schedules','services','service_requests','contact_messages','finance_records','activity_logs','notification_logs']) {
          try {
            const r = await query(`select count(*) as total from ${table}`);
            counts[table] = Number(rowsOf(r)[0]?.total || 0);
          } catch (_) { /* tabela opcional ainda não existe */ }
        }
        const meta = await query(`select updated_at as updatedAt from app_meta where ` + "`key`" + ` = 'state'`);
        result.persistedStateUpdatedAt = rowsOf(meta)[0]?.updatedAt || null;
        result.counts = counts;
      }
    }
    catch (error) { result.error = error.message; }
  }
  res.json({ ok: databaseReady, database: result });
});


app.get('/api/admin/market-readiness', requireDatabaseReady, requireSyndicUser, async (req, res) => {
  try {
    if (databaseReady) store = await loadStoreFromDatabase();
    res.json(calculateMarketReadiness());
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || 'Não foi possível gerar diagnóstico de mercado.' });
  }
});

app.post('/api/db/init', async (req, res) => {
  try {
    await initDatabase();
    databaseReady = true;
    store = await loadStoreFromDatabase();
    res.json({ ok: true, database: await testConnection() });
  } catch (error) {
    databaseReady = false;
    res.status(500).send(error.message);
  }
});

function requireDatabaseReady(req, res, next) {
  if (REQUIRE_DATABASE && !databaseReady) {
    return res.status(503).json({ ok: false, error: 'Banco obrigatório indisponível. O modo demo/local está desativado.' });
  }
  return next();
}

function isSyndicOrSubsyndicSession(user = {}) {
  const role = roleKey(user.role || '');
  const staffRole = roleKey(user.staffRole || user.originalRole || '');
  if (role === 'sindico') return true;
  if (['sindico', 'subsindico', 'administrador', 'admin'].includes(staffRole)) return true;
  if (user.isAdmin || user.systemAdmin) return true;
  const staff = user.email ? findStaffByEmail(user.email) : null;
  return Boolean(staff && staffAvailable(staff) && staffIsAdministrator(staff));
}

function requireAuthenticatedUser(req, res, next) {
  if (!req.session?.user?.role) {
    return res.status(401).json({ ok: false, error: 'Faça login para acessar arquivos.' });
  }
  return next();
}

function requireSyndicUser(req, res, next) {
  if (!isSyndicOrSubsyndicSession(req.session?.user)) {
    return res.status(403).json({ ok: false, error: 'Acesso permitido somente ao síndico/subsíndico. Faça login novamente no perfil Síndico/Administração.' });
  }
  return next();
}

function requirePortariaOrSyndicUser(req, res, next) {
  const role = req.session?.user?.role;
  if (!['portaria', 'sindico'].includes(role)) {
    return res.status(403).json({ ok: false, error: 'Acesso permitido somente para portaria ou administração.' });
  }
  return next();
}

async function recordActivityLog(entry = {}, user = {}) {
  const id = entry.id || `activity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const details = entry.details && typeof entry.details === 'object' ? entry.details : {};
  const actorName = entry.actorName || user.name || 'Usuário';
  const actorEmail = normalizeEmail(entry.actorEmail || user.email || '');
  const actorRole = entry.actorRole || user.role || '';
  const action = String(entry.action || 'Ação registrada').slice(0, 180);
  const entityType = String(entry.entityType || '').slice(0, 80);
  const entityId = String(entry.entityId || '').slice(0, 120);
  const apartment = String(entry.apartment || details.apartment || '').slice(0, 20);
  const summary = String(entry.summary || '').slice(0, 500);
  const log = { id, actorName, actorEmail, actorRole, action, entityType, entityId, apartment, summary, details, createdAt: new Date().toISOString() };
  if (!databaseReady) {
    if (!Array.isArray(store.activityLogs)) store.activityLogs = [];
    store.activityLogs = [log, ...store.activityLogs].slice(0, 1000);
    if (!REQUIRE_DATABASE) writeJsonFileFallback(store);
    return log;
  }
  await query(
    `insert into activity_logs (id, actor_name, actor_email, actor_role, action, entity_type, entity_id, apartment, summary, details, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,now())`,
    [id, actorName, actorEmail, actorRole, action, entityType, entityId, apartment, summary, toJson(details)]
  );
  return log;
}


// Vitória Régia v4.3.5 - normalização segura do identificador de login
function vrNormalizeLoginIdentifier(login = '') {
  const raw = String(login || '').trim();
  const key = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!raw.includes('@') && ['admin', 'administrador', 'proprietario', 'bruno'].includes(key) && BOOTSTRAP_ADMIN_EMAIL) {
    return BOOTSTRAP_ADMIN_EMAIL;
  }
  return raw;
}


async function handleLogin(req, res) {
  const requested = req.body || {};
  const requestedRole = requested.role || ''; // v3.7: perfil detectado automaticamente pelo usuário
  const email = normalizeEmail(requested.email || '');
  const password = String(requested.password || '');

  if (matchesBootstrapAdmin(email, password)) {
    const user = {
      id: 'bootstrap-admin',
      role: 'sindico',
      name: requested.name || BOOTSTRAP_ADMIN_NAME,
      email: BOOTSTRAP_ADMIN_EMAIL,
      apartment: '',
      residentId: null,
      staffId: null,
      staffRole: 'sindico',
      originalRole: 'sindico',
      isAdmin: true,
      allowedTabs: [],
      bootstrap: true,
      demo: false,
    };
    req.session.user = user;
    return res.json({ user, bootstrap: { active: true } });
  }

  if (!email || !password) return res.status(400).send('Informe e-mail e senha para acessar o sistema.');

  const account = await authAccountByEmail(email);
  if (!account || !account.active) {
    return res.status(403).send('Usuário sem senha ativa ou ainda não aprovado. Use “Esqueci minha senha” ou peça ao síndico para gerar uma senha temporária.');
  }
  if (!verifyPassword(password, account.passwordHash)) return res.status(401).send('E-mail ou senha inválidos.');

  const target = resolveAccountTarget(email, requestedRole || account.role || '');
  const role = target.role || account.role || allowedRole(email, requestedRole || account.role || '');
  // v3.7: não existe seleção pública de perfil. O tipo de acesso é definido pelo cadastro do usuário.
  if (role === 'morador' && REQUIRE_APPROVED_RESIDENT && !target.resident) return res.status(403).send('Cadastro de morador não aprovado ou não localizado para este e-mail.');
  if (target.staff && !staffAvailable(target.staff)) return res.status(403).send('Usuário de equipe indisponível, afastado, ausente ou de férias. O acesso/mensagens estão bloqueados enquanto durar a indisponibilidade.');

  const user = {
    id: target.staff?.id || target.resident?.id || `user-${Date.now()}`,
    role,
    name: target.staff?.name || target.resident?.name || requested.name || email,
    email,
    apartment: target.resident?.apartment || '',
    residentId: target.resident?.id || account.residentId || null,
    staffId: target.staff?.id || account.staffId || null,
    staffRole: target.staff?.role || '',
    originalRole: target.staff?.role || '',
    isAdmin: Boolean(target.staff && staffIsAdministrator(target.staff)),
    allowedTabs: normalizeAllowedTabs(target.staff?.allowedTabs),
    mustChangePassword: Boolean(account.mustChangePassword),
    bootstrap: false,
    demo: false,
  };
  await touchAuthLogin(email);
  req.session.user = user;
  res.json({ user });
}


app.post('/auth/signup', requireDatabaseReady, async (req, res) => {
  try {
    const data = req.body || {};
    const name = String(data.name || '').trim();
    const email = normalizeEmail(data.email || '');
    const whatsapp = String(data.whatsapp || '').trim();
    const telegram = String(data.telegramChatId || data.telegram || data.chatId || '').trim();
    const apartment = String(data.apartment || '').trim();
    const password = String(data.password || '');
    const confirm = String(data.passwordConfirm || data.confirmPassword || '');
    if (!name || !email || !whatsapp || !apartment) return res.status(400).send('Nome, e-mail, WhatsApp e apartamento são obrigatórios.');
    const policy = passwordPolicy(password);
    if (policy) return res.status(400).send(policy);
    if (password !== confirm) return res.status(400).send('A confirmação de senha não confere.');
    const alreadyResident = (store.state?.residents || []).some((item) => normalizeEmail(item.email || '') === email && String(item.apartment || '') === apartment);
    const alreadyPending = (store.state?.pendingResidents || []).some((item) => normalizeEmail(item.email || '') === email && String(item.apartment || '') === apartment && item.status === 'pending');
    if (alreadyResident) return res.status(409).send('Este e-mail já consta como aprovado para a unidade.');
    if (alreadyPending) return res.status(409).send('Já existe solicitação pendente para este e-mail nesta unidade.');
    const pending = {
      id: data.id || `pending-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      name,
      email,
      whatsapp,
      telegram,
      telegramChatId: telegram,
      chatId: telegram,
      cpfCnpj: onlyDigits(data.cpfCnpj || ''),
      apartment,
      residentType: data.residentType || 'Morador',
      relationship: data.relationship || data.relationshipDegree || '',
      hasPet: Boolean(data.hasPet),
      unitRented: Boolean(data.unitRented),
      primaryBilling: false,
      status: 'pending',
      createdAt: new Date().toISOString(),
      authAccountCreated: true,
    };
    store.state.pendingResidents = [pending, ...(store.state.pendingResidents || [])];
    await upsertAuthAccount({ email, role: 'morador', residentId: pending.id, password, active: false, mustChangePassword: false, metadata: { pendingId: pending.id, apartment, source: 'signup' } });
    await saveStore(store);
    res.json({ ok: true, pending: { ...pending, authAccountCreated: true } });
  } catch (error) { res.status(400).send(error.message); }
});

app.post('/auth/accounts/approve-resident', requireDatabaseReady, requireSyndicUser, async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email || '');
    const residentId = String(req.body?.residentId || '').trim();
    const apartment = String(req.body?.apartment || '').trim();
    if (!email || !residentId) return res.status(400).send('E-mail e ID do morador são obrigatórios.');
    const account = await authAccountByEmail(email);
    const staff = findStaffByEmail(email);
    const finalRole = staff ? staffRoleToAppRole(staff) : (account?.role || 'morador');
    const finalStaffId = staff?.id || account?.staffId || null;
    if (account) {
      if (!databaseReady) {
        await upsertAuthAccount({
          email,
          role: finalRole,
          residentId,
          staffId: finalStaffId,
          passwordHash: account.passwordHash,
          active: true,
          mustChangePassword: Boolean(account.mustChangePassword),
          metadata: { ...(account.metadata || {}), residentId, staffId: finalStaffId, apartment, approvedAt: new Date().toISOString(), preservedAdmin: Boolean(staff && staffIsAdministrator(staff)) },
        });
      } else {
        await query(`update auth_accounts set role=?, resident_id=?, staff_id=?, active=true, updated_at=now(), metadata=json_set(coalesce(metadata, json_object()), '$.apartment', ?, '$.residentId', ?, '$.staffId', ?) where email=?`, [finalRole, residentId, finalStaffId, apartment, residentId, finalStaffId, email]);
      }
    } else {
      const temp = temporaryPassword();
      await upsertAuthAccount({ email, role: finalRole, residentId, staffId: finalStaffId, password: temp, active: true, mustChangePassword: true, metadata: { residentId, staffId: finalStaffId, apartment, source: staff ? 'admin-resident-approval-temp' : 'admin-approval-temp' } });
      const resident = findResidentByEmail(email) || { name: req.body?.name || 'morador' };
      try { await sendTemporaryPassword(email, temp, resident.name); } catch (error) { console.warn('Não foi possível enviar senha temporária:', error.message); }
    }
    res.json({ ok: true });
  } catch (error) { res.status(400).send(error.message); }
});

app.post('/auth/password/admin-reset', requireDatabaseReady, requireSyndicUser, async (req, res) => {
  try {
    if (databaseReady) store = await loadStoreFromDatabase();
    const email = normalizeEmail(req.body?.email || '');
    if (!email) return res.status(400).send('Informe o e-mail do usuário.');
    let target = resolveAccountTarget(email, req.body?.role || '', { residentId: req.body?.residentId, staffId: req.body?.staffId });
    if (!target.resident && !target.staff) {
      target = fallbackTargetFromAdminReset(req.body || {}, email) || target;
    }
    if (!target.resident && !target.staff) {
      return res.status(404).send('Usuário não encontrado em moradores aprovados ou equipe ativa. Confira se o cadastro possui e-mail e se já foi salvo no banco.');
    }
    target = await ensureAdminResetTargetInState(target, email, req.body || {});
    const role = target.role;
    const temp = temporaryPassword();
    await upsertAuthAccount({
      email,
      role,
      residentId: target.resident?.id || null,
      staffId: target.staff?.id || null,
      password: temp,
      active: true,
      mustChangePassword: true,
      metadata: {
        source: target.fallback ? 'admin-reset-direct-target' : 'admin-reset',
        resetBy: req.session.user?.email || '',
        at: new Date().toISOString(),
        targetName: target.resident?.name || target.staff?.name || '',
        apartment: target.resident?.apartment || '',
      },
    });
    let emailSent = false, emailError = '';
    try { await sendTemporaryPassword(email, temp, target.resident?.name || target.staff?.name || 'usuário'); emailSent = true; }
    catch (error) { emailError = error.message; }
    res.json({ ok: true, email, role, temporaryPassword: temp, emailSent, emailError, fallback: Boolean(target.fallback) });
  } catch (error) { res.status(400).send(error.message); }
});

app.post('/auth/password/forgot', requireDatabaseReady, async (req, res) => {
  const genericMessage = 'Se o usuário estiver cadastrado e já tiver sido aprovado pelo síndico, enviaremos uma senha temporária por e-mail.';
  try {
    const email = normalizeEmail(req.body?.email || '');
    if (!email) return res.status(400).send('Informe o e-mail cadastrado.');

    // Segurança: só permite recuperação para conta já liberada/aprovada.
    // Cadastro pendente ou reprovado não recebe senha temporária.
    const account = await authAccountByEmail(email);
    if (!account || account.active !== true) {
      return res.json({ ok: true, message: genericMessage });
    }

    const target = resolveAccountTarget(email, req.body?.role || '', { residentId: account.residentId, staffId: account.staffId });
    if (!target.resident && !target.staff) {
      return res.json({ ok: true, message: genericMessage });
    }
    if (target.staff && !staffAvailable(target.staff)) {
      return res.json({ ok: true, message: genericMessage });
    }

    const temp = temporaryPassword();
    await upsertAuthAccount({
      email,
      role: target.role || account.role || 'morador',
      residentId: target.resident?.id || account.residentId || null,
      staffId: target.staff?.id || account.staffId || null,
      password: temp,
      active: true,
      mustChangePassword: true,
      metadata: { ...(account.metadata || {}), source: 'forgot-password', at: new Date().toISOString() },
    });

    await sendTemporaryPassword(email, temp, target.resident?.name || target.staff?.name || 'usuário');
    res.json({ ok: true, message: 'Senha temporária enviada para o e-mail cadastrado. Verifique sua caixa de entrada e spam.' });
  } catch (error) {
    console.warn('Falha ao processar esqueci minha senha:', error.message);
    res.status(400).send(error.message || 'Não foi possível enviar a senha temporária. Verifique as configurações de e-mail.');
  }
});

app.post('/auth/password/change', requireDatabaseReady, async (req, res) => {
  try {
    const user = req.session?.user;
    if (!user?.email) return res.status(401).send('Faça login para alterar a senha.');
    const newPassword = String(req.body?.newPassword || '');
    const confirm = String(req.body?.confirmPassword || '');
    const policy = passwordPolicy(newPassword);
    if (policy) return res.status(400).send(policy);
    if (newPassword !== confirm) return res.status(400).send('A confirmação de senha não confere.');
    const account = await authAccountByEmail(user.email);
    if (!account) return res.status(404).send('Conta de acesso não encontrada.');
    if (!user.mustChangePassword && req.body?.currentPassword && !verifyPassword(req.body.currentPassword, account.passwordHash)) return res.status(401).send('Senha atual inválida.');
    await upsertAuthAccount({ email: user.email, role: account.role, residentId: account.residentId, staffId: account.staffId, password: newPassword, active: true, mustChangePassword: false, metadata: { ...(account.metadata || {}), passwordChangedAt: new Date().toISOString() } });
    req.session.user = { ...user, mustChangePassword: false };
    res.json({ ok: true });
  } catch (error) { res.status(400).send(error.message); }
});

app.get('/auth/google', requireDatabaseReady, (req, res) => {
  return res.status(404).send('Login Google removido. Use e-mail e senha.');
});

app.get('/auth/google/callback', requireDatabaseReady, async (req, res) => {
  return res.status(404).send('Login Google removido. Use e-mail e senha.');
  try {
    if (req.query.error) return redirectWithAuthError(res, `Google recusou o login: ${req.query.error}`);
    const oauthState = readOAuthState(req, req.query.state);
    if (!oauthState) return redirectWithAuthError(res, 'Sessão de login Google expirada ou inválida. Tente novamente.');
    if (!req.query.code) return redirectWithAuthError(res, 'Google não retornou o código de autenticação.');
    const tokenData = await exchangeGoogleCode(String(req.query.code));
    const profile = await fetchGoogleProfile(tokenData.access_token);
    const user = buildUserFromGoogleProfile(profile, oauthState);
    req.session.user = user;
    const url = new URL(APP_URL || '/');
    url.searchParams.set('auth', 'google');
    return res.redirect(url.toString());
  } catch (error) {
    console.error('Falha no login Google:', error.message);
    return redirectWithAuthError(res, error.message || 'Falha no login Google.');
  }
});

app.post('/auth/login', requireDatabaseReady, (req, res) => handleLogin(req, res).catch((error) => res.status(400).send(error.message)));
app.post('/auth/demo', (req, res) => {
  if (!ALLOW_LEGACY_DEMO_LOGIN) return res.status(410).send('Login demo desativado nesta versão operacional. Use /auth/login.');
  return requireDatabaseReady(req, res, () => handleLogin(req, res));
});

app.post('/auth/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get('/api/me', (req, res) => res.json({ user: req.session.user || null }));

app.get('/api/state', requireDatabaseReady, async (req, res) => {
  try {
    if (databaseReady) store = await loadStoreFromDatabase();
    res.json({ ok: true, database: { ready: databaseReady }, state: store.state || DEFAULT_STATE });
  } catch (error) {
    res.status(500).send(`Erro ao carregar estado: ${error.message}`);
  }
});

app.post('/api/state/bulk', requireDatabaseReady, async (req, res) => {
  try {
    const incoming = req.body?.state || {};
    const patch = {};
    for (const key of Object.keys(incoming)) {
      if (ALLOWED_STATE_KEYS.has(key)) patch[key] = incoming[key];
    }

    if (databaseReady) {
      const state = await saveStatePatchToDatabase(patch);
      return res.json({ ok: true, database: { ready: databaseReady }, state });
    }

    const latest = await freshStoreForWrite();
    const nextState = { ...DEFAULT_STATE, ...(latest.state || {}), ...patch };
    store = normalizeStore({ ...latest, state: nextState });
    await saveStore(store);
    res.json({ ok: true, database: { ready: databaseReady }, state: store.state });
  } catch (error) {
    res.status(500).send(`Erro ao salvar no banco: ${error.message}`);
  }
});

app.post('/api/state/:key', requireDatabaseReady, async (req, res) => {
  try {
    const key = req.params.key;
    if (!ALLOWED_STATE_KEYS.has(key)) return res.status(400).send(`Chave de estado inválida: ${key}`);

    if (databaseReady) {
      const state = await saveStatePatchToDatabase({ [key]: req.body?.value });
      return res.json({ ok: true, database: { ready: databaseReady }, key, value: state[key] });
    }

    const latest = await freshStoreForWrite();
    const nextState = { ...DEFAULT_STATE, ...(latest.state || {}) };
    nextState[key] = req.body?.value;
    store = normalizeStore({ ...latest, state: nextState });
    await saveStore(store);
    res.json({ ok: true, database: { ready: databaseReady }, key, value: store.state[key] });
  } catch (error) {
    res.status(500).send(`Erro ao salvar item: ${error.message}`);
  }
});


app.get('/api/integrations/storage', (req, res) => {
  store.storageConfig = deepMerge(DEFAULT_STORAGE_CONFIG, store.storageConfig || {});
  res.json({ ok: true, config: sanitizeStorageConfig(store.storageConfig) });
});

app.get('/api/integrations/storage/debug', (req, res) => {
  res.json({ ok: true, storage: storageDiagnostics(), database: { configured: hasDatabaseConfig(), ready: databaseReady } });
});

app.post('/api/integrations/storage', requireDatabaseReady, requireSyndicUser, async (req, res) => {
  try {
    const config = await saveStorageConfig(req.body || {});
    res.json({ ok: true, config: sanitizeStorageConfig(config) });
  } catch (error) {
    res.status(400).send(error.message);
  }
});

app.post('/api/storage/upload', requireDatabaseReady, requireAuthenticatedUser, async (req, res) => {
  try {
    const config = effectiveStorageConfig(store.storageConfig || {});
    const { filename, dataUrl, purpose, entityId } = req.body || {};
    if (!filename || !dataUrl) throw new Error('Informe filename e dataUrl.');
    const parsed = bufferFromDataUrl(dataUrl);
    const limit = Number(config.maxUploadMb || 10) * 1024 * 1024;
    if (parsed.buffer.length > limit) throw new Error(`Arquivo maior que o limite de ${config.maxUploadMb || 10} MB.`);
    let result;
    if (config.provider === 'supabase') {
      result = await uploadToSupabase({ filename, contentType: parsed.contentType, buffer: parsed.buffer, purpose });
    } else if (config.provider === 'terabox') {
      result = await uploadToTeraBox({ filename, contentType: parsed.contentType, buffer: parsed.buffer, purpose });
    } else {
      result = { storage: 'metadata-only', name: filename, type: parsed.contentType, size: parsed.buffer.length, uploadedAt: new Date().toISOString(), note: 'Armazenamento externo desativado; arquivo não foi salvo.' };
    }
    await recordActivityLog({
      action: 'Upload de arquivo externo',
      entityType: 'storage',
      entityId: entityId || result.path || filename,
      summary: `${filename} enviado para ${result.storage}`,
      details: { purpose, storage: result.storage, path: result.path, size: result.size },
    }, req.session?.user || {});
    res.json({ ok: true, file: result });
  } catch (error) {
    res.status(400).send(error.message);
  }
});


app.get('/api/storage/download', requireDatabaseReady, requireAuthenticatedUser, async (req, res) => {
  try {
    const objectPath = req.query.path || req.query.objectPath;
    const bucket = req.query.bucket || undefined;
    if (!objectPath) return res.status(400).send('Informe path do arquivo.');
    const url = await createSupabaseDownloadUrl({ path: objectPath, bucket });
    if (String(req.query.json || '') === '1') return res.json({ ok: true, url });
    return res.redirect(url);
  } catch (error) {
    res.status(400).send(error.message);
  }
});

app.get('/api/integrations/notifications', (req, res) => {
  store.notificationConfig = deepMerge(DEFAULT_NOTIFICATION_CONFIG, store.notificationConfig || {});
  res.json({ ok: true, config: sanitizeConfig(store.notificationConfig) });
});

app.get('/api/integrations/email/debug', (req, res) => {
  res.json({ ok: true, email: emailDiagnostics(), database: { configured: hasDatabaseConfig(), ready: databaseReady } });
});

app.get('/api/integrations/whatsapp/debug', (req, res) => {
  res.json({ ok: true, whatsapp: whatsappDiagnostics(), database: { configured: hasDatabaseConfig(), ready: databaseReady } });
});

app.get('/api/integrations/telegram/debug', (req, res) => {
  res.json({ ok: true, telegram: telegramDiagnostics(), database: { configured: hasDatabaseConfig(), ready: databaseReady } });
});

app.get('/api/integrations/telegram/setup', (req, res) => {
  const cfg = effectiveNotificationConfig(store.notificationConfig || DEFAULT_NOTIFICATION_CONFIG).telegram || {};
  const botUsername = (cfg.botUsername || '').replace(/^@/, '');
  const botUrl = botUsername ? `https://t.me/${botUsername}` : '';
  res.json({
    ok: true,
    enabled: Boolean(cfg.enabled),
    botUsername: botUsername ? `@${botUsername}` : '',
    botUrl,
    androidUrl: 'https://play.google.com/store/apps/details?id=org.telegram.messenger',
    iosUrl: 'https://apps.apple.com/app/telegram-messenger/id686449807',
    appsUrl: 'https://telegram.org/apps?setln=pt-br',
    instructions: [
      'Baixe o Telegram pelo QR Code Android ou iPhone.',
      'Abra o Telegram e pesquise o bot do condomínio.',
      'Toque em Iniciar para liberar mensagens automáticas.',
      'Informe à portaria ou síndico o Chat ID quando solicitado.'
    ]
  });
});

app.post('/api/integrations/notifications', async (req, res) => {
  try {
    const config = await saveNotificationConfig(req.body || {});
    res.json({ ok: true, config: sanitizeConfig(config) });
  } catch (error) {
    res.status(400).send(error.message);
  }
});

app.post('/api/integrations/test-email', async (req, res) => {
  try {
    const result = await sendEmailNotification({
      to: req.body?.to || store.notificationConfig?.email?.testTo,
      subject: 'Teste de e-mail - Condomínio Vitória Régia',
      message: 'Este é um e-mail automático de teste enviado pelo backend operacional do Sistema Vitória Régia.',
    });
    res.json(result);
  } catch (error) {
    await logNotification({ channel: 'email', recipient: req.body?.to || '', subject: 'Teste de e-mail', message: '', status: 'error', error: error.message });
    res.status(400).send(error.message);
  }
});

app.post('/api/integrations/test-whatsapp', async (req, res) => {
  try {
    const result = await sendWhatsAppNotification({ to: req.body?.to, message: 'Teste automático do Sistema Vitória Régia.' });
    res.json(result);
  } catch (error) {
    res.status(400).send(error.message);
  }
});

app.post('/api/integrations/test-telegram', async (req, res) => {
  try {
    const result = await sendTelegramNotification({ chatId: req.body?.chatId, subject: 'Teste Telegram — Condomínio Vitória Régia', message: 'Esta é uma mensagem automática de teste enviada pelo sistema.' });
    res.json(result);
  } catch (error) {
    res.status(400).send(error.message);
  }
});

app.get('/api/integrations/asaas', (req, res) => {
  store.asaasConfig = deepMerge(DEFAULT_ASAAS_CONFIG, store.asaasConfig || {});
  res.json({ ok: true, config: sanitizeAsaasConfig(store.asaasConfig) });
});

app.post('/api/integrations/asaas', async (req, res) => {
  try {
    const config = await saveAsaasConfig(req.body || {});
    res.json({ ok: true, config: sanitizeAsaasConfig(config) });
  } catch (error) {
    res.status(400).send(error.message);
  }
});

app.post('/api/integrations/test-asaas', async (req, res) => {
  try {
    const result = await asaasRequest('/customers?limit=1');
    res.json({ ok: true, environment: effectiveAsaasConfig().environment, totalCount: result.totalCount ?? null });
  } catch (error) {
    await logNotification({ channel: 'asaas', recipient: '', subject: 'Teste Asaas', message: '', status: 'error', error: error.message });
    res.status(400).send(error.message);
  }
});
app.get('/api/integrations/asaas/debug', async (req, res) => {
  try {
    const config = effectiveAsaasConfig();
    res.json({
      ok: true,
      enabled: Boolean(config.enabled),
      environment: config.environment,
      apiKeySaved: Boolean(config.apiKey),
      apiKeySource: (store.asaasConfig?.apiKey ? 'saved' : (process.env.ASAAS_API_KEY ? 'env' : 'none')),
      baseUrl: asaasBaseUrl(config),
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});


app.post('/api/asaas/payments/booking/:id', async (req, res) => {
  try {
    const result = await createAsaasBoletoForBooking(req.params.id, req.body?.cpfCnpj);
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(400).send(error.message);
  }
});

app.post('/api/asaas/webhook', async (req, res) => {
  try {
    const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN || '';
    const receivedToken = req.query.token || req.headers['asaas-access-token'] || req.headers['x-asaas-token'] || req.headers['access_token'] || '';
    if (expectedToken && receivedToken !== expectedToken) return res.status(401).json({ ok: false, error: 'Token de webhook inválido.' });
    const event = req.body?.event || '';
    const payment = req.body?.payment || {};
    const changed = await updateBookingByAsaasPayment(payment, event);
    await logNotification({ channel: 'asaas-webhook', recipient: payment.customer || '', subject: event, message: payment.id || '', status: changed ? 'received' : 'ignored', providerResponse: req.body || {} });
    res.json({ ok: true, changed });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/notifications/send', async (req, res) => {
  const { channels = ['email'], email, whatsapp, telegram, telegramChatId, subject, message } = req.body || {};
  const results = [];

  if (channels.includes('email')) {
    try { results.push({ channel: 'email', ...(await sendEmailNotification({ to: email, subject, message })) }); }
    catch (error) { await logNotification({ channel: 'email', recipient: email || '', subject, message, status: 'error', error: error.message }); results.push({ channel: 'email', ok: false, error: error.message }); }
  }

  if (channels.includes('whatsapp')) {
    try { results.push({ channel: 'whatsapp', ...(await sendWhatsAppNotification({ to: whatsapp, message })) }); }
    catch (error) { results.push({ channel: 'whatsapp', ok: false, error: error.message }); }
  }

  if (channels.includes('telegram')) {
    try { results.push({ channel: 'telegram', ...(await sendTelegramNotification({ chatId: telegram || telegramChatId, subject, message })) }); }
    catch (error) { results.push({ channel: 'telegram', ok: false, error: error.message }); }
  }

  res.json({ ok: results.some((item) => item.ok), results });
});

app.get('/api/notifications/logs', async (req, res) => {
  try {
    if (databaseReady) {
      const result = await query(`select id, channel, recipient, subject, message, status, error, provider_response as "providerResponse", created_at as "createdAt" from notification_logs order by created_at desc limit 200`);
      return res.json({ ok: true, logs: rowsOf(result) });
    }
    res.json({ ok: true, logs: store.notificationLogs || [] });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.get('/api/activity-logs', requireDatabaseReady, requireSyndicUser, async (req, res) => {
  try {
    if (!databaseReady) {
      return res.json({ ok: true, logs: Array.isArray(store.activityLogs) ? store.activityLogs : [] });
    }
    const result = await query(`
      select id,
             actor_name as "actorName",
             actor_email as "actorEmail",
             actor_role as "actorRole",
             action,
             entity_type as "entityType",
             entity_id as "entityId",
             apartment,
             summary,
             details,
             created_at as "createdAt"
      from activity_logs
      order by created_at desc
      limit 500
    `);
    res.json({ ok: true, logs: rowsOf(result) });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.post('/api/activity-logs', requireDatabaseReady, requirePortariaOrSyndicUser, async (req, res) => {
  try {
    const saved = await recordActivityLog(req.body || {}, req.session.user || {});
    res.json({ ok: true, log: saved });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

async function rowsFromPayload(table) {
  const result = await query(`select payload from ${table} order by created_at desc`);
  return rowsOf(result).map((row) => row.payload);
}

app.get('/api/residents', async (req, res) => {
  try { res.json({ rows: databaseReady ? await rowsFromPayload('residents') : (store.state?.residents || []) }); }
  catch (error) { res.status(500).send(error.message); }
});
app.get('/api/reservations', async (req, res) => {
  try { res.json({ rows: databaseReady ? await rowsFromPayload('bookings') : (store.state?.bookings || []) }); }
  catch (error) { res.status(500).send(error.message); }
});
app.get('/api/calendar', requireDatabaseReady, async (req, res) => {
  try { res.json({ rows: await rowsFromPayload('bookings') }); }
  catch (error) { res.status(500).send(error.message); }
});
app.get('/api/admin/manual', requireDatabaseReady, requireSyndicUser, (req, res) => {
  const manualPath = path.join(__dirname, '..', 'private', 'manual_usuario_sistema_vitoria_regia.pdf');
  if (!fs.existsSync(manualPath)) return res.status(404).send('Manual não encontrado no servidor.');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="manual_usuario_sistema_vitoria_regia.pdf"');
  return res.sendFile(manualPath);
});

app.get('/api/admin/manual/download', requireDatabaseReady, requireSyndicUser, (req, res) => {
  const manualPath = path.join(__dirname, '..', 'private', 'manual_usuario_sistema_vitoria_regia.pdf');
  if (!fs.existsSync(manualPath)) return res.status(404).send('Manual não encontrado no servidor.');
  return res.download(manualPath, 'manual_usuario_sistema_vitoria_regia.pdf');
});

app.get('/api/spaces', (req, res) => res.json({ rows: store.state?.settings?.spaces || [] }));

// Endpoints API para futuras telas nativas/integrações. O front-end atual também sincroniza por /api/state/bulk.
app.post('/api/residents/request', requireDatabaseReady, async (req, res) => {
  const item = req.body || {};
  store.state.pendingResidents = [item, ...(store.state.pendingResidents || [])];
  await saveStore(store);
  res.json({ ok: true, data: item });
});
app.post('/api/reservations', requireDatabaseReady, async (req, res) => {
  const item = req.body || {};
  store.state.bookings = [item, ...(store.state.bookings || [])];
  await saveStore(store);
  res.json({ ok: true, data: item });
});
app.post('/api/visitors', requireDatabaseReady, async (req, res) => {
  const item = req.body || {};
  store.state.visitors = [item, ...(store.state.visitors || [])];
  await saveStore(store);
  res.json({ ok: true, data: item });
});
app.post('/api/packages', requireDatabaseReady, async (req, res) => {
  const item = req.body || {};
  store.state.packages = [item, ...(store.state.packages || [])];
  await saveStore(store);
  res.json({ ok: true, data: item });
});



// Central de emergência segura — v4.1.0
const VR_EMERGENCY_TYPES = {
  medical: { label: 'Emergência médica', critical: true },
  water: { label: 'Vazamento de água', critical: false },
  gas: { label: 'Vazamento de gás', critical: true },
  elevator: { label: 'Preso no elevador', critical: true },
  security: { label: 'Segurança / invasão', critical: true },
  other: { label: 'Outra emergência', critical: false },
};

function emergencyDefaultSettings() {
  return {
    elevatorCompany: '', elevatorPhone: '', elevatorWhatsapp: '', elevatorContract: '',
    elevatorInstructions: 'Mantenha a calma. Não tente abrir a porta à força. Avise portaria e síndico pelo sistema.',
    notifyResidentsAfterConfirm: true,
  };
}
function emergencySettings() { return { ...emergencyDefaultSettings(), ...(store.state?.emergencySettings || {}) }; }
function brazilParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).formatToParts(date);
  const o = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return { date: `${o.year}-${o.month}-${o.day}`, hour: Number(o.hour || 0) };
}
function emergencyShiftNow(date = new Date()) {
  const { hour } = brazilParts(date);
  if (hour >= 6 && hour < 14) return 'manha';
  if (hour >= 14 && hour < 22) return 'tarde';
  return 'noite';
}
function normalizeRoleText(value = '') { return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function staffIsPorter(person = {}) { const r = normalizeRoleText(`${person.role || ''} ${person.staffRole || ''} ${person.position || ''}`); return r.includes('port') || r.includes('porteiro') || r.includes('vigia') || r.includes('seguranca'); }
function staffIsSyndicAdmin(person = {}) { const r = normalizeRoleText(`${person.role || ''} ${person.staffRole || ''} ${person.position || ''}`); return r.includes('sindico') || r.includes('subsindico') || r.includes('admin'); }
function scheduleMatchesCurrentShift(schedule = {}, date = new Date()) {
  const { date: today } = brazilParts(date); const shift = emergencyShiftNow(date);
  if (String(schedule.date || '').slice(0, 10) !== today) return false;
  const raw = normalizeRoleText(`${schedule.shift || ''} ${schedule.turn || ''} ${schedule.period || ''}`);
  if (!raw) return true;
  if (shift === 'manha') return raw.includes('manha') || raw.includes('dia') || raw.includes('06') || raw.includes('7') || raw.includes('matut');
  if (shift === 'tarde') return raw.includes('tarde') || raw.includes('14') || raw.includes('vesp');
  return raw.includes('noite') || raw.includes('22') || raw.includes('notur') || raw.includes('madr');
}
function uniqueEmergencyRecipients(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const telegram = normalizeTelegramChatId(item.telegramChatId || item.telegram || item.chatId || '');
    const key = normalizeEmail(item.email || '') || telegram || String(item.whatsapp || item.id || item.name || '').trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function activePortersForEmergency(date = new Date()) {
  const staff = Array.isArray(store.state?.staff) ? store.state.staff.filter((p) => p.active !== false) : [];
  const schedules = Array.isArray(store.state?.staffSchedules) ? store.state.staffSchedules : [];
  const scheduled = schedules.filter((s) => scheduleMatchesCurrentShift(s, date)).map((s) => {
    const staffId = String(s.staffId || s.personId || '').trim();
    return staff.find((p) => String(p.id || '').trim() === staffId) || (s.email ? staff.find((p) => normalizeEmail(p.email) === normalizeEmail(s.email)) : null) || { id: s.staffId || s.id, name: s.staffName || s.name || 'Porteiro escalado', role: s.staffRole || s.role || 'portaria', email: s.email || '', whatsapp: s.whatsapp || '', telegram: s.telegramChatId || s.telegram || s.chatId || '', telegramChatId: s.telegramChatId || s.telegram || s.chatId || '' };
  }).filter(staffIsPorter);
  if (scheduled.length) return uniqueEmergencyRecipients(scheduled);
  return uniqueEmergencyRecipients(staff.filter(staffIsPorter));
}
function syndicsForEmergency() {
  const staff = Array.isArray(store.state?.staff) ? store.state.staff.filter((p) => p.active !== false) : [];
  return uniqueEmergencyRecipients(staff.filter(staffIsSyndicAdmin));
}
function residentsForEmergency() {
  const residents = Array.isArray(store.state?.residents) ? store.state.residents : [];
  return uniqueEmergencyRecipients(residents.filter((r) => r.active !== false && r.status !== 'pending'));
}
async function notifyEmergencyRecipients(recipients = [], event = {}, scope = 'initial') {
  const type = VR_EMERGENCY_TYPES[event.type] || VR_EMERGENCY_TYPES.other;
  const subject = scope === 'broadcast' ? `Alerta geral: ${type.label}` : `Emergência aguardando confirmação: ${type.label}`;
  const elevator = event.type === 'elevator' && event.elevatorAssistance
    ? `

Assistência elevador: ${event.elevatorAssistance.elevatorCompany || '-'} | Tel.: ${event.elevatorAssistance.elevatorPhone || '-'} | WhatsApp: ${event.elevatorAssistance.elevatorWhatsapp || '-'}`
    : '';
  const message = `${subject}

Usuário: ${event.userName || event.userEmail || '-'}
Perfil: ${event.userRole || '-'}
Unidade: ${event.apartment || '-'}
Observação: ${event.notes || '-'}${elevator}
Data: ${new Date(event.createdAt || Date.now()).toLocaleString('pt-BR')}

Sistema Vitória Régia.`;
  const results = [];
  const appUrl = (APP_URL || '').replace(/\/$/, '');
  const telegramButtons = appUrl ? [[{ text: scope === 'broadcast' ? 'Abrir sistema' : 'Ver emergência', url: `${appUrl}/#emergencias` }]] : undefined;
  for (const person of recipients.slice(0, 30)) {
    const telegramChat = normalizeTelegramChatId(person.telegramChatId || person.telegram || person.chatId || '');
    if (person.email) {
      try { results.push({ recipient: person.email, channel: 'email', ...(await sendEmailNotification({ to: person.email, subject, message })) }); }
      catch (error) { results.push({ recipient: person.email, channel: 'email', ok: false, error: error.message }); }
    }
    if (person.whatsapp) {
      try { results.push({ recipient: person.whatsapp, channel: 'whatsapp', ...(await sendWhatsAppNotification({ to: person.whatsapp, message })) }); }
      catch (error) { results.push({ recipient: person.whatsapp, channel: 'whatsapp', ok: false, error: error.message }); }
    }
    if (telegramChat) {
      try { results.push({ recipient: telegramChat, channel: 'telegram', ...(await sendTelegramNotification({ chatId: telegramChat, subject, message, buttons: telegramButtons })) }); }
      catch (error) { results.push({ recipient: telegramChat, channel: 'telegram', ok: false, error: error.message }); }
    }
  }
  await logNotification({ channel: 'in-app', recipient: `${recipients.length} destinatários`, subject, message, status: 'queued', providerResponse: { scope, results } }).catch(() => {});
  return results;
}

app.get('/api/emergency/settings', requireDatabaseReady, requireAuthenticatedUser, async (req, res) => {
  res.json({ ok: true, settings: emergencySettings() });
});
app.post('/api/emergency/settings', requireDatabaseReady, requireSyndicUser, async (req, res) => {
  try {
    const body = req.body || {};
    const current = emergencySettings();
    const next = {
      ...current,
      elevatorCompany: String(body.elevatorCompany || '').trim(),
      elevatorPhone: String(body.elevatorPhone || '').trim(),
      elevatorWhatsapp: String(body.elevatorWhatsapp || '').trim(),
      elevatorContract: String(body.elevatorContract || '').trim(),
      elevatorInstructions: String(body.elevatorInstructions || current.elevatorInstructions || '').trim(),
      notifyResidentsAfterConfirm: body.notifyResidentsAfterConfirm !== false,
    };
    store.state = { ...DEFAULT_STATE, ...(store.state || {}), emergencySettings: next };
    await saveStore(store);
    await recordActivityLog({ action: 'Atualizou configurações de emergência', entityType: 'emergency-settings', summary: 'Contato do elevador e regras de emergência atualizados.' }, req.session.user || {}).catch(() => {});
    res.json({ ok: true, settings: next });
  } catch (error) { res.status(500).json({ ok: false, error: error.message }); }
});
app.post('/api/emergency/request', requireDatabaseReady, requireAuthenticatedUser, async (req, res) => {
  try {
    const user = req.session.user || {};
    const type = String(req.body?.type || '').trim();
    if (!VR_EMERGENCY_TYPES[type]) return res.status(400).json({ ok: false, error: 'Escolha um tipo de emergência válido.' });
    const typeInfo = VR_EMERGENCY_TYPES[type];
    const initialRecipients = uniqueEmergencyRecipients([...syndicsForEmergency(), ...activePortersForEmergency(new Date())]);
    const event = {
      id: `emergency-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type, typeLabel: typeInfo.label, critical: Boolean(typeInfo.critical), status: 'pending-review',
      userName: user.name || user.email || 'Usuário', userEmail: user.email || '', userRole: user.role || user.staffRole || '',
      apartment: user.apartment || '', notes: String(req.body?.notes || '').trim(), createdAt: new Date().toISOString(),
      createdBy: user.email || user.name || 'sistema', initialRecipients: initialRecipients.map((p) => ({ id: p.id, name: p.name, role: p.role, email: p.email, whatsapp: p.whatsapp, telegram: p.telegramChatId || p.telegram || p.chatId || '', telegramChatId: p.telegramChatId || p.telegram || p.chatId || '' })),
      elevatorAssistance: type === 'elevator' ? emergencySettings() : null,
    };
    const state = { ...DEFAULT_STATE, ...(store.state || {}) };
    state.emergencyEvents = [event, ...(Array.isArray(state.emergencyEvents) ? state.emergencyEvents : [])].slice(0, 200);
    store.state = state; await saveStore(store);
    await recordActivityLog({ action: 'Emergência acionada', entityType: 'emergency', entityId: event.id, apartment: event.apartment, summary: `${typeInfo.label} acionada por ${event.userName}`, details: event }, user).catch(() => {});
    notifyEmergencyRecipients(initialRecipients, event, 'initial').catch((error) => console.error('Falha ao notificar emergência:', error.message));
    res.json({ ok: true, event, notified: { initialCount: initialRecipients.length, portersOnDuty: activePortersForEmergency(new Date()).length, residents: 0 } });
  } catch (error) { res.status(500).json({ ok: false, error: error.message }); }
});
app.get('/api/emergency/events', requireDatabaseReady, requireAuthenticatedUser, async (req, res) => {
  const user = req.session.user || {};
  const all = Array.isArray(store.state?.emergencyEvents) ? store.state.emergencyEvents : [];
  const allowed = ['sindico', 'portaria'].includes(user.role) || isSyndicOrSubsyndicSession(user);
  const events = allowed ? all : all.filter((e) => e.userEmail === user.email || (e.status === 'broadcasted' && e.critical));
  res.json({ ok: true, events: events.slice(0, 80) });
});
app.post('/api/emergency/events/:id/confirm', requireDatabaseReady, requirePortariaOrSyndicUser, async (req, res) => {
  try {
    const state = { ...DEFAULT_STATE, ...(store.state || {}) };
    const list = Array.isArray(state.emergencyEvents) ? state.emergencyEvents : [];
    const idx = list.findIndex((e) => e.id === req.params.id);
    if (idx < 0) return res.status(404).json({ ok: false, error: 'Emergência não encontrada.' });
    const event = { ...list[idx], status: 'broadcasted', confirmedAt: new Date().toISOString(), confirmedBy: req.session.user?.email || req.session.user?.name || '', confirmNote: String(req.body?.note || '').trim() };
    const residents = emergencySettings().notifyResidentsAfterConfirm === false ? [] : residentsForEmergency();
    event.broadcastRecipients = residents.map((p) => ({ id: p.id, name: p.name, email: p.email, whatsapp: p.whatsapp, telegram: p.telegramChatId || p.telegram || p.chatId || '', telegramChatId: p.telegramChatId || p.telegram || p.chatId || '', apartment: p.apartment }));
    list[idx] = event; state.emergencyEvents = list; store.state = state; await saveStore(store);
    await recordActivityLog({ action: 'Alerta geral confirmado', entityType: 'emergency', entityId: event.id, apartment: event.apartment, summary: `${event.typeLabel || event.type} confirmado para moradores`, details: event }, req.session.user || {}).catch(() => {});
    notifyEmergencyRecipients(residents, event, 'broadcast').catch((error) => console.error('Falha ao notificar moradores:', error.message));
    res.json({ ok: true, event, message: `Alerta geral confirmado. Moradores notificados: ${residents.length}.` });
  } catch (error) { res.status(500).json({ ok: false, error: error.message }); }
});
app.post('/api/emergency/events/:id/reset', requireDatabaseReady, requirePortariaOrSyndicUser, async (req, res) => {
  try {
    const state = { ...DEFAULT_STATE, ...(store.state || {}) };
    const list = Array.isArray(state.emergencyEvents) ? state.emergencyEvents : [];
    const idx = list.findIndex((e) => e.id === req.params.id);
    if (idx < 0) return res.status(404).json({ ok: false, error: 'Emergência não encontrada.' });
    const event = { ...list[idx], status: 'reset', resetAt: new Date().toISOString(), resetBy: req.session.user?.email || req.session.user?.name || '', resetNote: String(req.body?.note || '').trim() };
    list[idx] = event; state.emergencyEvents = list; store.state = state; await saveStore(store);
    await recordActivityLog({ action: 'Alarme de emergência resetado', entityType: 'emergency', entityId: event.id, apartment: event.apartment, summary: `${event.typeLabel || event.type} resetado`, details: event }, req.session.user || {}).catch(() => {});
    res.json({ ok: true, event, message: 'Alarme resetado pela portaria/síndico.' });
  } catch (error) { res.status(500).json({ ok: false, error: error.message }); }
});

if (fs.existsSync(path.join(FRONTEND_DIR, 'index.html'))) {
  app.use(express.static(FRONTEND_DIR));
  app.get('*', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')));
} else {
  app.get('/', (req, res) => res.type('html').send('<h1>Backend Vitória Régia online</h1><p>API ativa em <code>/api/health</code>.</p>'));
}

async function start() {
  store = await loadStore();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend Vitória Régia online na porta ${PORT}`);
    console.log(`Frontend: ${FRONTEND_DIR}`);
    console.log(`Banco configurado: ${hasDatabaseConfig() ? 'sim' : 'não'} | pronto: ${databaseReady ? 'sim' : 'não'}`);
    if (!databaseReady) console.log('Banco indisponível e modo demo/local desativado.');
  });
}

start().catch((error) => {
  console.error('Erro fatal ao iniciar backend:', error);
  process.exit(1);
});
