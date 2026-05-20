require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const multer = require('multer');
const nodemailer = require('nodemailer');
const { pool } = require('./db');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const PORT = process.env.PORT || 3000;
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
const FRONTEND_DIR = path.resolve(__dirname, '../../');
const REQUIRE_AUTH_FOR_STATE = String(process.env.REQUIRE_AUTH_FOR_STATE || 'false').toLowerCase() === 'true';
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map((v) => v.trim().toLowerCase()).filter(Boolean);
const PORTARIA_EMAILS = (process.env.PORTARIA_EMAILS || '').split(',').map((v) => v.trim().toLowerCase()).filter(Boolean);


const NOTIFICATION_CONFIG_KEY = 'notification_config';
const DEFAULT_NOTIFICATION_CONFIG = {
  email: {
    enabled: String(process.env.SMTP_USER || '').length > 0,
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true').toLowerCase() === 'true',
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_APP_PASSWORD || '',
    fromName: process.env.SMTP_FROM_NAME || 'Condomínio Vitória Régia',
    fromEmail: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || '',
  },
  whatsapp: {
    enabled: String(process.env.WHATSAPP_TOKEN || '').length > 0 && String(process.env.WHATSAPP_PHONE_NUMBER_ID || '').length > 0,
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v20.0',
    token: process.env.WHATSAPP_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    countryCode: process.env.WHATSAPP_COUNTRY_CODE || '55',
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

function stripSecret(value = '') {
  return value ? '••••••••' : '';
}

function sanitizeNotificationConfig(config) {
  return {
    ...config,
    email: {
      ...(config.email || {}),
      password: '',
      passwordSaved: Boolean(config.email?.password),
    },
    whatsapp: {
      ...(config.whatsapp || {}),
      token: '',
      tokenSaved: Boolean(config.whatsapp?.token),
    },
  };
}

async function getNotificationConfig() {
  try {
    const { rows } = await pool.query('SELECT value FROM app_settings WHERE key=$1', [NOTIFICATION_CONFIG_KEY]);
    return deepMerge(DEFAULT_NOTIFICATION_CONFIG, rows[0]?.value || {});
  } catch (error) {
    return DEFAULT_NOTIFICATION_CONFIG;
  }
}

async function saveNotificationConfig(incoming = {}) {
  const existing = await getNotificationConfig();
  const clean = deepMerge(existing, incoming);
  if (!incoming.email || incoming.email.password === '') clean.email.password = existing.email.password || DEFAULT_NOTIFICATION_CONFIG.email.password || '';
  if (!incoming.whatsapp || incoming.whatsapp.token === '') clean.whatsapp.token = existing.whatsapp.token || DEFAULT_NOTIFICATION_CONFIG.whatsapp.token || '';
  if (incoming.email?.clearPassword) clean.email.password = '';
  if (incoming.whatsapp?.clearToken) clean.whatsapp.token = '';
  clean.email.port = Number(clean.email.port || 465);
  clean.email.secure = Boolean(clean.email.secure);
  await pool.query(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()`,
    [NOTIFICATION_CONFIG_KEY, JSON.stringify(clean)]
  );
  return clean;
}

function normalizePhoneForWhatsApp(value = '', countryCode = '55') {
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith(countryCode)) return digits;
  return `${countryCode}${digits}`;
}

async function logNotification({ channel, recipient, subject = '', message, status, providerResponse = null, error = null }) {
  try {
    await pool.query(
      `INSERT INTO notification_logs (channel, recipient, subject, message, status, provider_response, error, sent_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,CASE WHEN $5='sent' THEN NOW() ELSE NULL END)`,
      [channel, recipient, subject, message, status, JSON.stringify(providerResponse), error]
    );
  } catch (logError) {
    console.warn('Não foi possível registrar log da notificação:', logError.message);
  }
}

async function sendEmailNotification({ to, subject, message, html }) {
  const config = await getNotificationConfig();
  const email = config.email || {};
  if (!email.enabled) throw new Error('Envio de e-mail desativado nas configurações.');
  if (!email.host || !email.user || !email.password) throw new Error('SMTP incompleto. Configure host, usuário e senha de aplicativo.');
  const transporter = nodemailer.createTransport({
    host: email.host,
    port: Number(email.port || 465),
    secure: Boolean(email.secure),
    auth: { user: email.user, pass: email.password },
  });
  const fromAddress = email.fromEmail || email.user;
  const fromName = email.fromName || 'Condomínio Vitória Régia';
  const info = await transporter.sendMail({
    from: `"${String(fromName).replaceAll('"', '')}" <${fromAddress}>`,
    to,
    subject,
    text: message,
    html: html || `<p>${String(message).replaceAll('\n', '<br>')}</p>`,
  });
  await logNotification({ channel: 'email', recipient: to, subject, message, status: 'sent', providerResponse: { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected } });
  return { ok: true, provider: 'smtp', messageId: info.messageId };
}

async function sendWhatsAppNotification({ to, message }) {
  const config = await getNotificationConfig();
  const whatsapp = config.whatsapp || {};
  if (!whatsapp.enabled) throw new Error('Envio por WhatsApp desativado nas configurações.');
  if (!whatsapp.token || !whatsapp.phoneNumberId) throw new Error('WhatsApp Cloud API incompleto. Configure token e Phone Number ID.');
  const number = normalizePhoneForWhatsApp(to, whatsapp.countryCode || '55');
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
      text: { preview_url: false, body: message },
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
app.use(cors({ origin: APP_URL, credentials: true }));
app.use(morgan('tiny'));
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '8mb' }));

app.use(session({
  store: new PgSession({ pool, createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'troque-esta-chave',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: APP_URL.startsWith('https://') }
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

function normalizeEmail(value = '') { return String(value).trim().toLowerCase(); }
function allowedRole(email, requestedRole) {
  const normalized = normalizeEmail(email);
  if (requestedRole === 'sindico') return ADMIN_EMAILS.includes(normalized) ? 'sindico' : 'morador';
  if (requestedRole === 'portaria') return (ADMIN_EMAILS.includes(normalized) || PORTARIA_EMAILS.includes(normalized)) ? 'portaria' : 'morador';
  return 'morador';
}

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || `${APP_URL}/auth/google/callback`,
    passReqToCallback: true,
  }, async (req, accessToken, refreshToken, profile, done) => {
    try {
      const email = normalizeEmail(profile.emails?.[0]?.value);
      const name = profile.displayName || email;
      if (!email) return done(new Error('Google não retornou e-mail.'));

      const requestedRole = req.session.requestedRole || 'morador';
      const role = allowedRole(email, requestedRole);
      const approved = role !== 'morador' || ADMIN_EMAILS.includes(email);

      const existing = await pool.query('SELECT * FROM users WHERE email=$1 OR google_id=$2 LIMIT 1', [email, profile.id]);
      let user;
      if (existing.rows[0]) {
        const current = existing.rows[0];
        const finalRole = current.role === 'sindico' || current.role === 'portaria' ? current.role : role;
        const updated = await pool.query(
          'UPDATE users SET google_id=$1, name=$2, role=$3, approved=$4, updated_at=NOW() WHERE id=$5 RETURNING *',
          [profile.id, name, finalRole, current.approved || approved, current.id]
        );
        user = updated.rows[0];
      } else {
        const created = await pool.query(
          'INSERT INTO users (google_id, name, email, role, approved) VALUES ($1,$2,$3,$4,$5) RETURNING *',
          [profile.id, name, email, role, approved]
        );
        user = created.rows[0];
      }
      return done(null, { id: user.id, name: user.name, email: user.email, role: user.role, apartment: user.apartment, approved: user.approved });
    } catch (error) { return done(error); }
  }));
}

app.use(passport.initialize());
app.use(passport.session());

function requireAuth(req, res, next) {
  if (req.isAuthenticated?.() || req.user) return next();
  return res.status(401).json({ error: 'Não autenticado.' });
}
function requireSyndic(req, res, next) {
  if (req.user?.role === 'sindico') return next();
  return res.status(403).json({ error: 'Acesso restrito ao síndico.' });
}
function requireStaff(req, res, next) {
  if (['sindico', 'portaria'].includes(req.user?.role)) return next();
  return res.status(403).json({ error: 'Acesso restrito.' });
}
function maybeRequireAuth(req, res, next) {
  return REQUIRE_AUTH_FOR_STATE ? requireAuth(req, res, next) : next();
}

app.get('/api/health', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT NOW() AS now');
    res.json({ ok: true, database: 'connected', now: rows[0].now });
  } catch (error) {
    res.status(500).json({ ok: false, database: 'error', error: error.message });
  }
});

app.get('/auth/google', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(500).send('Google OAuth não configurado no .env.');
  req.session.requestedRole = req.query.role || 'morador';
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/?login=erro' }), (req, res) => {
  res.redirect('/?login=google#dashboard');
});

app.post('/auth/demo', async (req, res) => {
  const { role = 'morador', name = 'Usuário', email = '', apartment = '' } = req.body || {};
  const user = {
    id: `demo-${normalizeEmail(email) || role}`,
    role: ['morador', 'sindico', 'portaria'].includes(role) ? role : 'morador',
    name,
    email: normalizeEmail(email),
    apartment,
    approved: true,
    demo: true,
  };
  req.login(user, (error) => {
    if (error) return res.status(500).json({ error: error.message });
    res.json({ user });
  });
});

app.post('/auth/logout', (req, res) => {
  req.logout(() => req.session.destroy(() => res.json({ ok: true })));
});

app.get('/api/me', (req, res) => res.json({ user: req.user || null }));

app.get('/api/state', maybeRequireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT key, value FROM client_state ORDER BY key');
  const state = {};
  for (const row of rows) state[row.key] = row.value;
  res.json({ state });
});

app.post('/api/state/bulk', maybeRequireAuth, async (req, res) => {
  const state = req.body?.state || {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [key, value] of Object.entries(state)) {
      await client.query(
        `INSERT INTO client_state (key, value, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()`,
        [key, JSON.stringify(value)]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.post('/api/state/:key', maybeRequireAuth, async (req, res) => {
  await pool.query(
    `INSERT INTO client_state (key, value, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()`,
    [req.params.key, JSON.stringify(req.body?.value ?? null)]
  );
  res.json({ ok: true });
});

app.post('/api/residents/request', async (req, res) => {
  const { name, email, whatsapp, apartment } = req.body;
  if (!name || !email || !whatsapp || !apartment) return res.status(400).json({ error: 'Dados obrigatórios ausentes.' });
  const { rows } = await pool.query(
    'INSERT INTO residents (name, email, whatsapp, apartment, status) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [name, email, whatsapp, apartment, 'pending']
  );
  res.status(201).json(rows[0]);
});

app.get('/api/residents', requireSyndic, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM residents ORDER BY created_at DESC');
  res.json(rows);
});

app.patch('/api/residents/:id/approve', requireSyndic, async (req, res) => {
  const { rows } = await pool.query('UPDATE residents SET status=$2, approved_at=NOW() WHERE id=$1 RETURNING *', [req.params.id, 'approved']);
  res.json(rows[0]);
});

app.patch('/api/residents/:id/reject', requireSyndic, async (req, res) => {
  const { rows } = await pool.query('UPDATE residents SET status=$2, rejected_at=NOW() WHERE id=$1 RETURNING *', [req.params.id, 'rejected']);
  res.json(rows[0]);
});

app.get('/api/spaces', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM spaces WHERE active=true ORDER BY name');
  res.json(rows);
});

app.post('/api/spaces', requireSyndic, async (req, res) => {
  const { name, fee } = req.body;
  const { rows } = await pool.query('INSERT INTO spaces (name, fee) VALUES ($1,$2) RETURNING *', [name, fee || 0]);
  res.status(201).json(rows[0]);
});

app.get('/api/reservations', requireAuth, async (req, res) => {
  const params = [];
  let sql = 'SELECT * FROM reservations';
  if (req.user.role === 'morador') {
    params.push(req.user.apartment || '');
    sql += ' WHERE apartment=$1';
  }
  sql += ' ORDER BY reservation_date DESC, created_at DESC';
  const { rows } = await pool.query(sql, params);
  res.json(rows);
});

app.post('/api/reservations', requireAuth, upload.single('residentDocument'), async (req, res) => {
  const body = req.body;
  const doc = req.file ? { name: req.file.originalname, type: req.file.mimetype, size: req.file.size } : null;
  const { rows } = await pool.query(
    `INSERT INTO reservations (space_name, apartment, resident_name, resident_email, resident_whatsapp, reservation_date, period, fee, notes, signed, signed_at, signature_text, resident_document)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),$11,$12) RETURNING *`,
    [body.spaceName, body.apartment, body.residentName, body.residentEmail, body.residentWhatsapp, body.date, body.period, body.fee || 0, body.notes, body.signed === 'true', body.signatureText, doc]
  );
  res.status(201).json(rows[0]);
});

app.patch('/api/reservations/:id/status', requireSyndic, async (req, res) => {
  const allowed = ['pending', 'approved', 'paid', 'canceled', 'rejected'];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: 'Status inválido.' });
  const { rows } = await pool.query('UPDATE reservations SET status=$2, updated_at=NOW() WHERE id=$1 RETURNING *', [req.params.id, req.body.status]);
  res.json(rows[0]);
});

app.post('/api/reservations/:id/manager-document', requireSyndic, upload.single('document'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado.' });
  const doc = { name: req.file.originalname, type: req.file.mimetype, size: req.file.size, uploadedAt: new Date().toISOString() };
  const { rows } = await pool.query('UPDATE reservations SET manager_document=$2, updated_at=NOW() WHERE id=$1 RETURNING *', [req.params.id, doc]);
  res.json(rows[0]);
});

app.get('/api/calendar', requireAuth, async (req, res) => {
  const { rows } = await pool.query("SELECT reservation_date, period, space_name, status, CASE WHEN $1='sindico' THEN apartment ELSE NULL END AS apartment FROM reservations WHERE status NOT IN ('canceled','rejected') ORDER BY reservation_date", [req.user.role]);
  res.json(rows);
});

app.post('/api/visitors', requireStaff, async (req, res) => {
  const { name, document, phone, apartment, type, notes } = req.body;
  const { rows } = await pool.query('INSERT INTO visitors (name, document, phone, apartment, type, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [name, document, phone, apartment, type, notes]);
  res.status(201).json(rows[0]);
});

app.post('/api/packages', requireStaff, async (req, res) => {
  const { apartment, recipient, carrier, code, notes } = req.body;
  const { rows } = await pool.query('INSERT INTO packages (apartment, recipient, carrier, code, notes) VALUES ($1,$2,$3,$4,$5) RETURNING *', [apartment, recipient, carrier, code, notes]);
  res.status(201).json(rows[0]);
});



app.get('/api/integrations/notifications', requireSyndic, async (req, res) => {
  try {
    const config = await getNotificationConfig();
    res.json({ config: sanitizeNotificationConfig(config) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/integrations/notifications', requireSyndic, async (req, res) => {
  try {
    const config = await saveNotificationConfig(req.body || {});
    res.json({ ok: true, config: sanitizeNotificationConfig(config) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/integrations/test-email', requireSyndic, async (req, res) => {
  try {
    const to = req.body?.to;
    if (!to) return res.status(400).json({ error: 'Informe o e-mail de teste.' });
    const result = await sendEmailNotification({
      to,
      subject: 'Teste de e-mail automático — Vitória Régia',
      message: 'Este é um teste de envio automático do Sistema Condominial Vitória Régia.',
    });
    res.json(result);
  } catch (error) {
    await logNotification({ channel: 'email', recipient: req.body?.to || '', subject: 'Teste de e-mail automático — Vitória Régia', message: 'Teste de envio automático.', status: 'error', error: error.message });
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/integrations/test-whatsapp', requireSyndic, async (req, res) => {
  try {
    const to = req.body?.to;
    if (!to) return res.status(400).json({ error: 'Informe o WhatsApp de teste.' });
    const result = await sendWhatsAppNotification({
      to,
      message: 'Teste de WhatsApp automático do Sistema Condominial Vitória Régia.',
    });
    res.json(result);
  } catch (error) {
    await logNotification({ channel: 'whatsapp', recipient: req.body?.to || '', message: 'Teste de WhatsApp automático.', status: 'error', error: error.message });
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/notifications/send', requireStaff, async (req, res) => {
  const { channels = [], email, whatsapp, subject = 'Condomínio Vitória Régia', message = '' } = req.body || {};
  if (!message) return res.status(400).json({ error: 'Mensagem obrigatória.' });
  const wanted = Array.isArray(channels) && channels.length ? channels : ['email', 'whatsapp'];
  const results = [];
  for (const channel of wanted) {
    try {
      if (channel === 'email') {
        if (!email) throw new Error('E-mail do destinatário não informado.');
        results.push({ channel, ...(await sendEmailNotification({ to: email, subject, message })) });
      }
      if (channel === 'whatsapp') {
        if (!whatsapp) throw new Error('WhatsApp do destinatário não informado.');
        results.push({ channel, ...(await sendWhatsAppNotification({ to: whatsapp, message })) });
      }
    } catch (error) {
      results.push({ channel, ok: false, error: error.message });
    }
  }
  res.json({ ok: results.some((item) => item.ok), results });
});

app.get('/api/notifications/logs', requireSyndic, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM notification_logs ORDER BY created_at DESC LIMIT 50');
  res.json(rows);
});

app.use(express.static(FRONTEND_DIR));
app.get('*', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')));

app.listen(PORT, () => console.log(`Vitória Régia backend em ${APP_URL}`));
