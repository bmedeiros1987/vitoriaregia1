require('dotenv').config();

const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const nodemailer = require('nodemailer');

const { getPool, hasDatabaseConfig, query, testConnection } = require('./db');
const { initDatabase } = require('./schema');

const app = express();
const PORT = Number(process.env.PORT || 10000);
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
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
  visitors: [],
  notices: [],
  staff: [],
  staffSchedules: [],
  services: [],
  serviceRequests: [],
  contactMessages: [],
  settings: null,
};

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
      fromEmail: process.env.MAILERSEND_FROM_EMAIL || process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || '',
      testTo: process.env.MAILERSEND_TEST_TO || process.env.SMTP_TEST_TO || process.env.SMTP_USER || '',
    },
  },
  whatsapp: {
    enabled: String(process.env.WHATSAPP_ENABLED || 'false').toLowerCase() === 'true',
    provider: process.env.WHATSAPP_PROVIDER || (process.env.EVOLUTION_API_KEY ? 'evolution' : 'meta'),
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v20.0',
    token: process.env.WHATSAPP_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    countryCode: process.env.WHATSAPP_COUNTRY_CODE || '55',
    testTo: process.env.WHATSAPP_TEST_TO || process.env.EVOLUTION_TEST_TO || '',
    evolution: {
      serverUrl: process.env.EVOLUTION_API_URL || process.env.EVOLUTION_SERVER_URL || '',
      apiKey: process.env.EVOLUTION_API_KEY || '',
      instanceName: process.env.EVOLUTION_INSTANCE || process.env.EVOLUTION_INSTANCE_NAME || '',
      countryCode: process.env.EVOLUTION_COUNTRY_CODE || process.env.WHATSAPP_COUNTRY_CODE || '55',
      testTo: process.env.EVOLUTION_TEST_TO || process.env.WHATSAPP_TEST_TO || '',
      linkPreview: String(process.env.EVOLUTION_LINK_PREVIEW || 'false').toLowerCase() === 'true',
    },
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
      return { state: DEFAULT_STATE, notificationConfig: DEFAULT_NOTIFICATION_CONFIG, asaasConfig: DEFAULT_ASAAS_CONFIG, notificationLogs: [] };
    }
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return {
      state: { ...DEFAULT_STATE, ...(parsed.state || {}) },
      notificationConfig: deepMerge(DEFAULT_NOTIFICATION_CONFIG, parsed.notificationConfig || {}),
      asaasConfig: deepMerge(DEFAULT_ASAAS_CONFIG, parsed.asaasConfig || {}),
      notificationLogs: Array.isArray(parsed.notificationLogs) ? parsed.notificationLogs : [],
    };
  } catch (error) {
    console.warn('Não foi possível ler arquivo local, usando estado vazio:', error.message);
    return { state: DEFAULT_STATE, notificationConfig: DEFAULT_NOTIFICATION_CONFIG, asaasConfig: DEFAULT_ASAAS_CONFIG, notificationLogs: [] };
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
    notificationLogs: Array.isArray(raw.notificationLogs) ? raw.notificationLogs : [],
  };
}

function toJson(value) {
  return JSON.stringify(value || {});
}

function fromJson(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

function isoOrNow(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
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
    [item.id || `visitor-${Date.now()}`, item.name || 'Visitante', item.document || null, item.phone || null, item.apartment || null, item.type || null, item.photo || null, toJson(item), isoOrNow(item.createdAt)]
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
    await mirrorStateToTables(client, nextStore.state || DEFAULT_STATE);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function loadStoreFromDatabase() {
  const stateResult = await query(`select value from app_meta where key = 'state'`);
  const configResult = await query(`select config from notification_config where id = 1`);
  const asaasConfigResult = await query(`select config from asaas_config where id = 1`);
  const logsResult = await query(`
    select id, channel, recipient, subject, message, status, error, provider_response as "providerResponse", created_at as "createdAt"
    from notification_logs
    order by created_at desc
    limit 200
  `);

  return normalizeStore({
    state: fromJson(stateResult.rows[0]?.value, DEFAULT_STATE),
    notificationConfig: fromJson(configResult.rows[0]?.config, DEFAULT_NOTIFICATION_CONFIG),
    asaasConfig: fromJson(asaasConfigResult.rows[0]?.config, DEFAULT_ASAAS_CONFIG),
    notificationLogs: logsResult.rows || [],
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
    if (!['sindico', 'subsindico'].includes(String(person.role || '').toLowerCase())) return false;
    const email = normalizeEmail(person.email || '');
    return email && email !== bootstrapEmail;
  });
}

function bootstrapAdminAvailable() {
  if (!BOOTSTRAP_ADMIN_ENABLED || !BOOTSTRAP_ADMIN_EMAIL || !BOOTSTRAP_ADMIN_PASSWORD) return false;
  if (BOOTSTRAP_DISABLE_AFTER_FIRST_SINDICO && hasActiveNonBootstrapSindico()) return false;
  return true;
}

function matchesBootstrapAdmin(email, password) {
  return bootstrapAdminAvailable()
    && normalizeEmail(email) === normalizeEmail(BOOTSTRAP_ADMIN_EMAIL)
    && String(password || '') === BOOTSTRAP_ADMIN_PASSWORD;
}

function allowedRole(email, requestedRole) {
  const normalized = normalizeEmail(email);
  const staff = activeStaffByEmail(normalized);
  const staffRole = String(staff?.role || '').toLowerCase();

  if (requestedRole === 'sindico') {
    if (normalized && adminEmails().includes(normalized)) return 'sindico';
    if (['sindico', 'subsindico'].includes(staffRole)) return 'sindico';
    return 'morador';
  }
  if (requestedRole === 'portaria') {
    if (normalized && (adminEmails().includes(normalized) || portariaEmails().includes(normalized))) return 'portaria';
    if (staffRole === 'porteiro') return 'portaria';
    return 'morador';
  }
  return 'morador';
}

function findApprovedResident(requested = {}) {
  const email = normalizeEmail(requested.email || '');
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

function sanitizeConfig(config) {
  const effective = effectiveNotificationConfig(config || {});
  const email = effective.email || {};
  const whatsapp = effective.whatsapp || {};
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
    },
  };
}

function effectiveWhatsAppConfig(merged = {}) {
  const saved = merged.whatsapp || {};
  const savedEvolution = saved.evolution || {};
  const envMetaToken = process.env.WHATSAPP_TOKEN || '';
  const envMetaPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  const envEvolutionKey = process.env.EVOLUTION_API_KEY || '';
  const envEvolutionUrl = process.env.EVOLUTION_API_URL || process.env.EVOLUTION_SERVER_URL || '';
  const envEvolutionInstance = process.env.EVOLUTION_INSTANCE || process.env.EVOLUTION_INSTANCE_NAME || '';

  let provider = String(saved.provider || process.env.WHATSAPP_PROVIDER || '').toLowerCase();
  if (!['meta', 'evolution'].includes(provider)) provider = (savedEvolution.apiKey || envEvolutionKey) ? 'evolution' : 'meta';

  const metaToken = saved.token || envMetaToken;
  const metaPhoneId = saved.phoneNumberId || envMetaPhoneId;
  const evolutionApiKey = savedEvolution.apiKey || envEvolutionKey;
  const evolutionServerUrl = savedEvolution.serverUrl || envEvolutionUrl;
  const evolutionInstanceName = savedEvolution.instanceName || envEvolutionInstance;
  const envEnabled = String(process.env.WHATSAPP_ENABLED || '').toLowerCase() === 'true';
  const evolutionConfigured = Boolean(evolutionApiKey && evolutionServerUrl && evolutionInstanceName);
  const metaConfigured = Boolean(metaToken && metaPhoneId);

  return {
    ...saved,
    provider,
    enabled: Boolean(saved.enabled || (envEnabled && (provider === 'evolution' ? evolutionConfigured : metaConfigured))),
    apiVersion: saved.apiVersion || process.env.WHATSAPP_API_VERSION || 'v20.0',
    token: metaToken,
    tokenSource: saved.token ? 'saved' : (envMetaToken ? 'env' : 'none'),
    phoneNumberId: metaPhoneId,
    countryCode: saved.countryCode || process.env.WHATSAPP_COUNTRY_CODE || '55',
    testTo: saved.testTo || process.env.WHATSAPP_TEST_TO || process.env.EVOLUTION_TEST_TO || '',
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

  const mailerSendFromEmail = merged.email?.mailersend?.fromEmail || process.env.MAILERSEND_FROM_EMAIL || merged.email?.fromEmail || process.env.SMTP_FROM_EMAIL || effectiveUser;
  const mailerSendFromName = merged.email?.mailersend?.fromName || process.env.MAILERSEND_FROM_NAME || merged.email?.fromName || process.env.SMTP_FROM_NAME || 'Condomínio Vitória Régia';
  const mailerSendTestTo = merged.email?.mailersend?.testTo || process.env.MAILERSEND_TEST_TO || merged.email?.testTo || process.env.SMTP_TEST_TO || effectiveUser;

  const smtpTestTo = merged.email?.testTo || process.env.SMTP_TEST_TO || effectiveUser || mailerSendTestTo;
  const enabledByEnv = envEmailEnabled || Boolean(process.env.MAILERSEND_API_KEY);

  const effectiveWhatsApp = effectiveWhatsAppConfig(merged);

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
      countryCode: provider === 'evolution' ? (whatsapp.evolution?.countryCode || whatsapp.countryCode || '55') : (whatsapp.countryCode || '55'),
      testTo: provider === 'evolution' ? (whatsapp.evolution?.testTo || whatsapp.testTo || '') : (whatsapp.testTo || ''),
      metaTokenSaved: Boolean(whatsapp.token),
      metaTokenSource: whatsapp.tokenSource || 'none',
      metaPhoneNumberIdConfigured: Boolean(whatsapp.phoneNumberId),
      evolutionServerUrl: whatsapp.evolution?.serverUrl || null,
      evolutionInstanceName: whatsapp.evolution?.instanceName || null,
      evolutionApiKeySaved: Boolean(whatsapp.evolution?.apiKey),
      evolutionApiKeySource: whatsapp.evolution?.apiKeySource || 'none',
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
    if (!email.mailersend?.fromEmail) problems.push('MAILERSEND_FROM_EMAIL não configurado. Informe um remetente validado no MailerSend.');
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
  if (!incoming.whatsapp || incoming.whatsapp.token === '') clean.whatsapp.token = existing.whatsapp?.token || DEFAULT_NOTIFICATION_CONFIG.whatsapp.token || '';
  if (!incoming.whatsapp?.evolution || incoming.whatsapp.evolution.apiKey === '') {
    clean.whatsapp.evolution.apiKey = existing.whatsapp?.evolution?.apiKey || DEFAULT_NOTIFICATION_CONFIG.whatsapp.evolution.apiKey || '';
  }
  if (incoming.email?.clearPassword) clean.email.password = '';
  if (incoming.email?.mailersend?.clearApiKey) clean.email.mailersend.apiKey = '';
  if (incoming.whatsapp?.clearToken) clean.whatsapp.token = '';
  if (incoming.whatsapp?.evolution?.clearApiKey) clean.whatsapp.evolution.apiKey = '';

  clean.email.enabled = Boolean(clean.email.enabled);
  clean.email.provider = ['smtp', 'mailersend'].includes(String(clean.email.provider || '').toLowerCase()) ? String(clean.email.provider).toLowerCase() : 'smtp';
  clean.email.port = Number(clean.email.port || 465);
  clean.email.secure = Boolean(clean.email.secure);
  clean.email.testTo = clean.email.testTo || process.env.SMTP_TEST_TO || clean.email.user || process.env.SMTP_USER || '';
  clean.email.mailersend.fromName = clean.email.mailersend.fromName || clean.email.fromName || 'Condomínio Vitória Régia';
  clean.email.mailersend.fromEmail = clean.email.mailersend.fromEmail || process.env.MAILERSEND_FROM_EMAIL || clean.email.fromEmail || '';
  clean.email.mailersend.testTo = clean.email.mailersend.testTo || clean.email.testTo || process.env.MAILERSEND_TEST_TO || '';
  clean.whatsapp.enabled = Boolean(clean.whatsapp.enabled);
  clean.whatsapp.provider = ['meta', 'evolution'].includes(String(clean.whatsapp.provider || '').toLowerCase()) ? String(clean.whatsapp.provider).toLowerCase() : 'meta';
  clean.whatsapp.countryCode = clean.whatsapp.countryCode || '55';
  clean.whatsapp.testTo = clean.whatsapp.testTo || clean.whatsapp.evolution.testTo || process.env.WHATSAPP_TEST_TO || process.env.EVOLUTION_TEST_TO || '';
  clean.whatsapp.evolution.serverUrl = String(clean.whatsapp.evolution.serverUrl || '').replace(/\/+$/, '');
  clean.whatsapp.evolution.instanceName = String(clean.whatsapp.evolution.instanceName || '').trim();
  clean.whatsapp.evolution.countryCode = clean.whatsapp.evolution.countryCode || clean.whatsapp.countryCode || '55';
  clean.whatsapp.evolution.testTo = clean.whatsapp.evolution.testTo || clean.whatsapp.testTo || '';
  clean.whatsapp.evolution.linkPreview = Boolean(clean.whatsapp.evolution.linkPreview);

  store.notificationConfig = clean;
  await saveStore(store);
  return clean;
}

function normalizeSmtpPassword(value = '') {
  return String(value || '').replace(/\s+/g, '');
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
        [log.id, log.channel || 'sistema', log.recipient || null, log.subject || null, log.message || null, log.status || 'info', log.error || null, toJson(log.providerResponse || {}), log.createdAt]
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
  const finalTo = to;
  const finalSubject = subject || 'Teste de e-mail - Condomínio Vitória Régia';
  const finalMessage = message || 'Este é um e-mail automático de teste do Sistema Vitória Régia.';

  const response = await fetch('https://api.mailersend.com/v1/email', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      from: { email: fromEmail, name: fromName || 'Condomínio Vitória Régia' },
      to: [{ email: finalTo }],
      subject: finalSubject,
      text: finalMessage,
      html: html || `<p>${String(finalMessage).replace(/\n/g, '<br>')}</p>`,
    }),
  });

  const raw = await response.text().catch(() => '');
  let payload = {};
  try { payload = raw ? JSON.parse(raw) : {}; } catch (_) { payload = { raw }; }
  if (!response.ok) {
    const detail = payload.message || payload.error || payload.errors?.email?.[0] || payload.errors?.from?.[0] || response.statusText;
    throw new Error(`MailerSend HTTP ${response.status}: ${detail}`);
  }

  return {
    ok: true,
    provider: 'mailersend',
    status: response.status,
    messageId: response.headers.get('x-message-id') || payload.message_id || payload.id || null,
    response: payload,
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

function normalizePhoneForWhatsApp(value = '', countryCode = '55') {
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith(countryCode)) return digits;
  return `${countryCode}${digits}`;
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

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(morgan('tiny'));
app.use(express.json({ limit: process.env.JSON_LIMIT || '12mb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.JSON_LIMIT || '12mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'troque-esta-chave-em-producao',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: APP_URL.startsWith('https://') },
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
  });
});

app.get('/api/db/status', async (req, res) => {
  const result = {
    configured: hasDatabaseConfig(),
    ready: databaseReady,
    requireDatabase: REQUIRE_DATABASE,
    mode: databaseReady ? 'postgresql' : 'unavailable',
  };
  if (hasDatabaseConfig()) {
    try { result.connection = await testConnection(); }
    catch (error) { result.error = error.message; }
  }
  res.json({ ok: databaseReady, database: result });
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

function requireSyndicUser(req, res, next) {
  if (req.session?.user?.role !== 'sindico') {
    return res.status(403).json({ ok: false, error: 'Acesso permitido somente ao síndico/subsíndico.' });
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
  await query(
    `insert into activity_logs (id, actor_name, actor_email, actor_role, action, entity_type, entity_id, apartment, summary, details, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,now())`,
    [id, actorName, actorEmail, actorRole, action, entityType, entityId, apartment, summary, toJson(details)]
  );
  return { id, actorName, actorEmail, actorRole, action, entityType, entityId, apartment, summary, details, createdAt: new Date().toISOString() };
}

function handleLogin(req, res) {
  const requested = req.body || {};
  const requestedRole = requested.role || 'morador';

  if (requestedRole === 'sindico' && matchesBootstrapAdmin(requested.email, requested.password)) {
    const user = {
      id: 'bootstrap-admin',
      role: 'sindico',
      name: requested.name || BOOTSTRAP_ADMIN_NAME,
      email: BOOTSTRAP_ADMIN_EMAIL,
      apartment: '',
      residentId: null,
      bootstrap: true,
      demo: false,
    };
    req.session.user = user;
    return res.json({ user, bootstrap: { active: true, message: 'Acesso temporário liberado. Cadastre o síndico oficial em Equipe para desativar este usuário automaticamente.' } });
  }

  const role = allowedRole(requested.email, requestedRole);

  if (requestedRole === 'sindico' && role !== 'sindico') {
    return res.status(403).send('E-mail não autorizado para acesso de síndico/administração. Caso esteja usando o usuário temporário, informe a senha temporária configurada no Render.');
  }
  if (requestedRole === 'portaria' && role !== 'portaria') {
    return res.status(403).send('E-mail não autorizado para acesso de portaria.');
  }

  let resident = null;
  if (role === 'morador' && REQUIRE_APPROVED_RESIDENT) {
    resident = findApprovedResident(requested);
    if (!resident) return res.status(403).send('Cadastro de morador não aprovado ou não localizado para esta unidade.');
  }

  const staff = activeStaffByEmail(requested.email);
  const user = {
    id: requested.id || resident?.id || staff?.id || `user-${Date.now()}`,
    role,
    name: resident?.name || staff?.name || requested.name || role,
    email: resident?.email || staff?.email || requested.email || '',
    apartment: resident?.apartment || requested.apartment || '',
    residentId: resident?.id || requested.residentId || null,
    staffId: staff?.id || null,
    bootstrap: false,
    demo: false,
  };
  req.session.user = user;
  res.json({ user });
}
app.post('/auth/login', requireDatabaseReady, handleLogin);
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
    store.state = { ...DEFAULT_STATE, ...incoming };
    await saveStore(store);
    res.json({ ok: true, database: { ready: databaseReady }, state: store.state });
  } catch (error) {
    res.status(500).send(`Erro ao salvar no banco: ${error.message}`);
  }
});

app.post('/api/state/:key', requireDatabaseReady, async (req, res) => {
  try {
    const key = req.params.key;
    store.state = { ...DEFAULT_STATE, ...(store.state || {}) };
    store.state[key] = req.body?.value;
    await saveStore(store);
    res.json({ ok: true, key, value: store.state[key] });
  } catch (error) {
    res.status(500).send(`Erro ao salvar item: ${error.message}`);
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
  const { channels = ['email'], email, whatsapp, subject, message } = req.body || {};
  const results = [];

  if (channels.includes('email')) {
    try { results.push({ channel: 'email', ...(await sendEmailNotification({ to: email, subject, message })) }); }
    catch (error) { await logNotification({ channel: 'email', recipient: email || '', subject, message, status: 'error', error: error.message }); results.push({ channel: 'email', ok: false, error: error.message }); }
  }

  if (channels.includes('whatsapp')) {
    try { results.push({ channel: 'whatsapp', ...(await sendWhatsAppNotification({ to: whatsapp, message })) }); }
    catch (error) { results.push({ channel: 'whatsapp', ok: false, error: error.message }); }
  }

  res.json({ ok: results.some((item) => item.ok), results });
});

app.get('/api/notifications/logs', async (req, res) => {
  try {
    if (databaseReady) {
      const result = await query(`select id, channel, recipient, subject, message, status, error, provider_response as "providerResponse", created_at as "createdAt" from notification_logs order by created_at desc limit 200`);
      return res.json({ ok: true, logs: result.rows });
    }
    res.json({ ok: true, logs: store.notificationLogs || [] });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.get('/api/activity-logs', requireDatabaseReady, requireSyndicUser, async (req, res) => {
  try {
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
    res.json({ ok: true, logs: result.rows });
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
  return result.rows.map((row) => row.payload);
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
