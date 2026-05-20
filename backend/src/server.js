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

const app = express();
const PORT = Number(process.env.PORT || 10000);
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
const DATA_FILE = process.env.DATA_FILE || path.join(os.tmpdir(), 'vitoria-regia-state.json');
const FRONTEND_DIR = process.env.FRONTEND_DIR
  ? path.resolve(process.env.FRONTEND_DIR)
  : path.resolve(__dirname, '../../');

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

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function loadStore() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return { state: DEFAULT_STATE, notificationConfig: DEFAULT_NOTIFICATION_CONFIG, notificationLogs: [] };
    }
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return {
      state: { ...DEFAULT_STATE, ...(parsed.state || {}) },
      notificationConfig: deepMerge(DEFAULT_NOTIFICATION_CONFIG, parsed.notificationConfig || {}),
      notificationLogs: Array.isArray(parsed.notificationLogs) ? parsed.notificationLogs : [],
    };
  } catch (error) {
    console.warn('Não foi possível ler DATA_FILE, usando memória temporária:', error.message);
    return { state: DEFAULT_STATE, notificationConfig: DEFAULT_NOTIFICATION_CONFIG, notificationLogs: [] };
  }
}

function saveStore(store) {
  ensureDir(DATA_FILE);
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}

let store = loadStore();

function deepMerge(baseValue, patchValue) {
  const result = { ...(baseValue || {}) };
  for (const [key, value] of Object.entries(patchValue || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = deepMerge(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

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
  if (requestedRole === 'sindico') {
    return adminEmails().includes(normalized) || !normalized ? 'sindico' : 'morador';
  }
  if (requestedRole === 'portaria') {
    return adminEmails().includes(normalized) || portariaEmails().includes(normalized) || !normalized ? 'portaria' : 'morador';
  }
  return 'morador';
}

function sanitizeConfig(config) {
  const email = config.email || {};
  const whatsapp = config.whatsapp || {};
  return {
    ...config,
    email: {
      ...email,
      password: '',
      passwordSaved: Boolean(email.password),
    },
    whatsapp: {
      ...whatsapp,
      token: '',
      tokenSaved: Boolean(whatsapp.token),
    },
  };
}

function saveNotificationConfig(incoming = {}) {
  const existing = store.notificationConfig || DEFAULT_NOTIFICATION_CONFIG;
  const clean = deepMerge(existing, incoming);

  if (!incoming.email || incoming.email.password === '') {
    clean.email.password = existing.email?.password || DEFAULT_NOTIFICATION_CONFIG.email.password || '';
  }
  if (!incoming.whatsapp || incoming.whatsapp.token === '') {
    clean.whatsapp.token = existing.whatsapp?.token || DEFAULT_NOTIFICATION_CONFIG.whatsapp.token || '';
  }
  if (incoming.email?.clearPassword) clean.email.password = '';
  if (incoming.whatsapp?.clearToken) clean.whatsapp.token = '';

  clean.email.enabled = Boolean(clean.email.enabled);
  clean.email.port = Number(clean.email.port || 465);
  clean.email.secure = Boolean(clean.email.secure);
  clean.whatsapp.enabled = Boolean(clean.whatsapp.enabled);

  store.notificationConfig = clean;
  saveStore(store);
  return clean;
}

function normalizeSmtpPassword(value = '') {
  // Senhas de app do Google aparecem com espaços por grupo. Para SMTP, use sem espaços.
  return String(value || '').replace(/\s+/g, '');
}

async function logNotification(entry) {
  const log = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    ...entry,
  };
  store.notificationLogs = [log, ...(store.notificationLogs || [])].slice(0, 200);
  saveStore(store);
  return log;
}

async function sendEmailNotification({ to, subject, message, html }) {
  const config = store.notificationConfig || DEFAULT_NOTIFICATION_CONFIG;
  const email = config.email || {};

  if (!email.enabled) throw new Error('Envio de e-mail desativado nas configurações.');
  if (!email.host || !email.user || !email.password) {
    throw new Error('SMTP incompleto. Configure host, usuário e senha de aplicativo.');
  }

  const transporter = nodemailer.createTransport({
    host: email.host,
    port: Number(email.port || 465),
    secure: Boolean(email.secure),
    auth: {
      user: email.user,
      pass: normalizeSmtpPassword(email.password),
    },
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
    channel: 'email',
    recipient: finalTo,
    subject: finalSubject,
    message: finalMessage,
    status: 'sent',
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
  if (!whatsapp.token || !whatsapp.phoneNumberId) {
    throw new Error('WhatsApp Cloud API incompleto. Configure token e Phone Number ID.');
  }

  const number = normalizePhoneForWhatsApp(to || whatsapp.testTo, whatsapp.countryCode || '55');
  if (!number) throw new Error('Número de WhatsApp inválido.');

  const version = whatsapp.apiVersion || 'v20.0';
  const response = await fetch(`https://graph.facebook.com/${version}/${whatsapp.phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${whatsapp.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: number,
      type: 'text',
      text: { preview_url: false, body: message || 'Teste automático do Sistema Vitória Régia.' },
    }),
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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'troque-esta-chave-em-producao',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: APP_URL.startsWith('https://') },
}));

app.get('/api/health', (req, res) => {
  const email = store.notificationConfig?.email || DEFAULT_NOTIFICATION_CONFIG.email;
  res.json({
    ok: true,
    service: 'vitoria-regia-backend-email',
    timestamp: new Date().toISOString(),
    dataFile: DATA_FILE,
    frontendDir: FRONTEND_DIR,
    email: {
      enabled: Boolean(email.enabled),
      user: email.user || null,
      passwordSaved: Boolean(email.password),
    },
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
    demo: true,
  };
  req.session.user = user;
  res.json({ user });
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => res.json({ user: req.session.user || null }));

app.get('/api/state', (req, res) => {
  res.json({ ok: true, state: store.state || DEFAULT_STATE });
});

app.post('/api/state/bulk', (req, res) => {
  const incoming = req.body?.state || {};
  store.state = { ...DEFAULT_STATE, ...incoming };
  saveStore(store);
  res.json({ ok: true, state: store.state });
});

app.post('/api/state/:key', (req, res) => {
  const key = req.params.key;
  store.state = { ...DEFAULT_STATE, ...(store.state || {}) };
  store.state[key] = req.body?.value;
  saveStore(store);
  res.json({ ok: true, key, value: store.state[key] });
});

app.get('/api/integrations/notifications', (req, res) => {
  store.notificationConfig = deepMerge(DEFAULT_NOTIFICATION_CONFIG, store.notificationConfig || {});
  saveStore(store);
  res.json({ ok: true, config: sanitizeConfig(store.notificationConfig) });
});

app.post('/api/integrations/notifications', (req, res) => {
  try {
    const config = saveNotificationConfig(req.body || {});
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
      message: 'Este é um e-mail automático de teste enviado pelo backend do Sistema Vitória Régia.',
    });
    res.json(result);
  } catch (error) {
    await logNotification({ channel: 'email', recipient: req.body?.to || '', subject: 'Teste de e-mail', message: '', status: 'error', error: error.message });
    res.status(400).send(error.message);
  }
});

app.post('/api/integrations/test-whatsapp', async (req, res) => {
  try {
    const result = await sendWhatsAppNotification({
      to: req.body?.to,
      message: 'Teste automático do Sistema Vitória Régia.',
    });
    res.json(result);
  } catch (error) {
    res.status(400).send(error.message);
  }
});

app.post('/api/notifications/send', async (req, res) => {
  const { channels = ['email'], email, whatsapp, subject, message } = req.body || {};
  const results = [];

  if (channels.includes('email')) {
    try {
      const result = await sendEmailNotification({ to: email, subject, message });
      results.push({ channel: 'email', ...result });
    } catch (error) {
      await logNotification({ channel: 'email', recipient: email || '', subject, message, status: 'error', error: error.message });
      results.push({ channel: 'email', ok: false, error: error.message });
    }
  }

  if (channels.includes('whatsapp')) {
    try {
      const result = await sendWhatsAppNotification({ to: whatsapp, message });
      results.push({ channel: 'whatsapp', ...result });
    } catch (error) {
      results.push({ channel: 'whatsapp', ok: false, error: error.message });
    }
  }

  res.json({ ok: results.some((item) => item.ok), results });
});

app.get('/api/notifications/logs', (req, res) => {
  res.json({ ok: true, logs: store.notificationLogs || [] });
});

// Endpoints auxiliares para evitar erro se o front-end chamar módulos futuros.
app.get('/api/residents', (req, res) => res.json({ rows: store.state?.residents || [] }));
app.get('/api/reservations', (req, res) => res.json({ rows: store.state?.bookings || [] }));
app.get('/api/calendar', (req, res) => res.json({ rows: store.state?.bookings || [] }));
app.get('/api/spaces', (req, res) => res.json({ rows: store.state?.settings?.spaces || [] }));
app.post('/api/residents/request', (req, res) => res.json({ ok: true, data: req.body || {} }));
app.post('/api/reservations', (req, res) => res.json({ ok: true, data: req.body || {} }));
app.post('/api/visitors', (req, res) => res.json({ ok: true, data: req.body || {} }));
app.post('/api/packages', (req, res) => res.json({ ok: true, data: req.body || {} }));

if (fs.existsSync(path.join(FRONTEND_DIR, 'index.html'))) {
  app.use(express.static(FRONTEND_DIR));
  app.get('*', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')));
} else {
  app.get('/', (req, res) => {
    res.type('html').send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Vitória Régia Backend</title></head><body><h1>Backend Vitória Régia online</h1><p>API ativa em <code>/api/health</code>.</p></body></html>`);
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend Vitória Régia online na porta ${PORT}`);
  console.log(`Frontend: ${FRONTEND_DIR}`);
  console.log(`Data file: ${DATA_FILE}`);
});
