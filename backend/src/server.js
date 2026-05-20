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

let databaseReady = false;

const DEFAULT_STATE = {
  session: null,
  pendingResidents: [],
  residents: [],
  bookings: [],
  packages: [],
  visitors: [],
  notices: [],
  settings: null,
};

const DEFAULT_NOTIFICATION_CONFIG = {
  email: {
    enabled: String(process.env.SMTP_ENABLED || 'false').toLowerCase() === 'true',
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true').toLowerCase() === 'true',
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_APP_PASSWORD || '',
    fromName: process.env.SMTP_FROM_NAME || 'Condomínio Vitória Régia',
    fromEmail: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || '',
    testTo: process.env.SMTP_TEST_TO || process.env.SMTP_USER || '',
  },
  whatsapp: {
    enabled: String(process.env.WHATSAPP_ENABLED || 'false').toLowerCase() === 'true',
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v20.0',
    token: process.env.WHATSAPP_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    countryCode: process.env.WHATSAPP_COUNTRY_CODE || '55',
    testTo: process.env.WHATSAPP_TEST_TO || '',
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
}

async function saveStoreToDatabase(nextStore) {
  const db = getPool();
  if (!db || !databaseReady) throw new Error('Banco de dados indisponível.');
  const client = await db.connect();
  try {
    await client.query('begin');
    await client.query(
      `insert into app_meta (key, value, updated_at) values ('state', $1::jsonb, now())
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [toJson(nextStore.state || DEFAULT_STATE)]
    );
    await client.query(
      `insert into notification_config (id, config, updated_at) values (1, $1::jsonb, now())
       on conflict (id) do update set config = excluded.config, updated_at = now()`,
      [toJson(nextStore.notificationConfig || DEFAULT_NOTIFICATION_CONFIG)]
    );
    await client.query(
      `insert into asaas_config (id, config, updated_at) values (1, $1::jsonb, now())
       on conflict (id) do update set config = excluded.config, updated_at = now()`,
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
    state: stateResult.rows[0]?.value || DEFAULT_STATE,
    notificationConfig: configResult.rows[0]?.config || DEFAULT_NOTIFICATION_CONFIG,
    asaasConfig: asaasConfigResult.rows[0]?.config || DEFAULT_ASAAS_CONFIG,
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
      console.error('Banco não ficou disponível. Usando arquivo temporário até corrigir:', error.message);
    }
  }
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

function allowedRole(email, requestedRole) {
  const normalized = normalizeEmail(email);
  if (requestedRole === 'sindico') return adminEmails().includes(normalized) || !normalized ? 'sindico' : 'morador';
  if (requestedRole === 'portaria') return adminEmails().includes(normalized) || portariaEmails().includes(normalized) || !normalized ? 'portaria' : 'morador';
  return 'morador';
}

function sanitizeConfig(config) {
  const email = config.email || {};
  const whatsapp = config.whatsapp || {};
  return {
    ...config,
    email: { ...email, password: '', passwordSaved: Boolean(email.password) },
    whatsapp: { ...whatsapp, token: '', tokenSaved: Boolean(whatsapp.token) },
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
  return (store.state?.residents || []).find((r) => r.apartment === booking.apartment && (!booking.residentEmail || r.email === booking.residentEmail))
    || (store.state?.residents || []).find((r) => r.apartment === booking.apartment)
    || null;
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
      name: booking.residentName || resident.name || `Unidade ${booking.apartment}`,
      cpfCnpj: document,
      email: booking.residentEmail || resident.email || undefined,
      mobilePhone: onlyDigits(booking.residentWhatsapp || resident.whatsapp || '' ) || undefined,
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

  const updated = { ...booking, boleto, asaasPaymentId: payment.id, residentCpfCnpj: onlyDigits(cpfCnpj || booking.residentCpfCnpj || findResidentForBooking(booking)?.cpfCnpj || '') };
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
  if (!incoming.whatsapp || incoming.whatsapp.token === '') clean.whatsapp.token = existing.whatsapp?.token || DEFAULT_NOTIFICATION_CONFIG.whatsapp.token || '';
  if (incoming.email?.clearPassword) clean.email.password = '';
  if (incoming.whatsapp?.clearToken) clean.whatsapp.token = '';

  clean.email.enabled = Boolean(clean.email.enabled);
  clean.email.port = Number(clean.email.port || 465);
  clean.email.secure = Boolean(clean.email.secure);
  clean.whatsapp.enabled = Boolean(clean.whatsapp.enabled);

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

async function sendEmailNotification({ to, subject, message, html }) {
  const config = store.notificationConfig || DEFAULT_NOTIFICATION_CONFIG;
  const email = config.email || {};

  if (!email.enabled) throw new Error('Envio de e-mail desativado nas configurações.');
  if (!email.host || !email.user || !email.password) throw new Error('SMTP incompleto. Configure host, usuário e senha de aplicativo.');

  const transporter = nodemailer.createTransport({
    host: email.host,
    port: Number(email.port || 465),
    secure: Boolean(email.secure),
    auth: { user: email.user, pass: normalizeSmtpPassword(email.password) },
  });

  const fromAddress = email.fromEmail || email.user;
  const fromName = email.fromName || 'Condomínio Vitória Régia';
  const finalTo = to || email.testTo || email.user;
  const finalSubject = subject || 'Teste de e-mail - Condomínio Vitória Régia';
  const finalMessage = message || 'Este é um e-mail automático de teste do Sistema Vitória Régia.';

  const info = await transporter.sendMail({
    from: `"${String(fromName).replace(/"/g, '')}" <${fromAddress}>`,
    to: finalTo,
    subject: finalSubject,
    text: finalMessage,
    html: html || `<p>${String(finalMessage).replace(/\n/g, '<br>')}</p>`,
  });

  await logNotification({
    channel: 'email', recipient: finalTo, subject: finalSubject, message: finalMessage, status: 'sent',
    providerResponse: { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected },
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
  const config = store.notificationConfig || DEFAULT_NOTIFICATION_CONFIG;
  const whatsapp = config.whatsapp || {};

  if (!whatsapp.enabled) throw new Error('Envio por WhatsApp desativado nas configurações.');
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
  const email = store.notificationConfig?.email || DEFAULT_NOTIFICATION_CONFIG.email;
  let db = { configured: hasDatabaseConfig(), ready: databaseReady };
  if (databaseReady) {
    try { db = { ...db, ...(await testConnection()) }; } catch (error) { db.error = error.message; }
  }
  res.json({
    ok: true,
    service: 'vitoria-regia-backend-operacional',
    timestamp: new Date().toISOString(),
    database: db,
    frontendDir: FRONTEND_DIR,
    email: { enabled: Boolean(email.enabled), user: email.user || null, passwordSaved: Boolean(email.password) },
    asaas: { enabled: Boolean(effectiveAsaasConfig().enabled), environment: effectiveAsaasConfig().environment, apiKeySaved: Boolean(effectiveAsaasConfig().apiKey), apiKeySource: (store.asaasConfig?.apiKey ? 'saved' : (process.env.ASAAS_API_KEY ? 'env' : 'none')) },
  });
});

app.post('/auth/demo', (req, res) => {
  const requested = req.body || {};
  const role = allowedRole(requested.email, requested.role || 'morador');
  const user = {
    id: requested.id || `user-${Date.now()}`,
    role,
    name: requested.name || role,
    email: requested.email || '',
    apartment: requested.apartment || '',
    residentId: requested.residentId || null,
    demo: false,
  };
  req.session.user = user;
  res.json({ user });
});

app.post('/auth/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get('/api/me', (req, res) => res.json({ user: req.session.user || null }));

app.get('/api/state', async (req, res) => {
  try {
    if (databaseReady) store = await loadStoreFromDatabase();
    res.json({ ok: true, database: { ready: databaseReady }, state: store.state || DEFAULT_STATE });
  } catch (error) {
    res.status(500).send(`Erro ao carregar estado: ${error.message}`);
  }
});

app.post('/api/state/bulk', async (req, res) => {
  try {
    const incoming = req.body?.state || {};
    store.state = { ...DEFAULT_STATE, ...incoming };
    await saveStore(store);
    res.json({ ok: true, database: { ready: databaseReady }, state: store.state });
  } catch (error) {
    res.status(500).send(`Erro ao salvar no banco: ${error.message}`);
  }
});

app.post('/api/state/:key', async (req, res) => {
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
app.get('/api/calendar', async (req, res) => {
  try { res.json({ rows: databaseReady ? await rowsFromPayload('bookings') : (store.state?.bookings || []) }); }
  catch (error) { res.status(500).send(error.message); }
});
app.get('/api/spaces', (req, res) => res.json({ rows: store.state?.settings?.spaces || [] }));

// Endpoints API para futuras telas nativas/integrações. O front-end atual também sincroniza por /api/state/bulk.
app.post('/api/residents/request', async (req, res) => {
  const item = req.body || {};
  store.state.pendingResidents = [item, ...(store.state.pendingResidents || [])];
  await saveStore(store);
  res.json({ ok: true, data: item });
});
app.post('/api/reservations', async (req, res) => {
  const item = req.body || {};
  store.state.bookings = [item, ...(store.state.bookings || [])];
  await saveStore(store);
  res.json({ ok: true, data: item });
});
app.post('/api/visitors', async (req, res) => {
  const item = req.body || {};
  store.state.visitors = [item, ...(store.state.visitors || [])];
  await saveStore(store);
  res.json({ ok: true, data: item });
});
app.post('/api/packages', async (req, res) => {
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
    if (!databaseReady) console.log(`Fallback temporário: ${DATA_FILE}`);
  });
}

start().catch((error) => {
  console.error('Erro fatal ao iniciar backend:', error);
  process.exit(1);
});
