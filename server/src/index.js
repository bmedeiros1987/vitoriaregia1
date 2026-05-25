import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import AdmZip from 'adm-zip';
import multer from 'multer';
import fs from 'node:fs/promises';
import nodemailer from 'nodemailer';
import sgMail from '@sendgrid/mail';
import webpush from 'web-push';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash, verify as cryptoVerify } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const APP_VERSION = process.env.APP_VERSION || 'Vitória Régia Pro v9.9';
const JWT_SECRET = process.env.JWT_SECRET || 'troque-este-segredo-em-producao';
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://localhost/vitoriaregia';
const DB_SSL_MODE = String(process.env.DATABASE_SSL_MODE || process.env.DATABASE_SSL || 'auto').trim().toLowerCase();
const UPDATE_PUBLIC_KEY = process.env.UPDATE_PUBLIC_KEY || `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA6Ui7QnjAh3WEmD25Bqj6
FTX8BFJSrben3wZ1R/MpL/6NtG1xRc8bhKDq+1HwoDPfvrvmngEAZ6Gb6nljOGvO
o9l1IPXwgUJjUksHyhz3U9nRO0v/A0ET7RuLdONcccmEz5JFM0I7SfBMs0fiLdLI
xP4CBEDu+3Zq607xlVOMTEvk4H9lfQ5UjhrvDLU3P3VQHXpWYb9OsGK7BtuqfyyC
Kt6QhjAsQR2nEBsI/0moFBhauklbzKrdB4ji+NR5Z3ulFbpFujArAgcQrjdfa0uR
RVAivIuGC5L9ra8ofila26ZLod3Gu28WSK4yijSe3icRPcCbyT/SwuINcziJmpBj
FQIDAQAB
-----END PUBLIC KEY-----
`;
const uploadUpdateZip = multer({ storage: multer.memoryStorage(), limits: { fileSize: Number(process.env.UPDATE_UPLOAD_LIMIT_MB || 30) * 1024 * 1024 } });
let pool;

const ALL_PERMISSIONS = [
  'dashboard.view','residents.view','residents.manage','users.manage','employees.manage','shifts.manage','messages.view','messages.manage',
  'packages.view','packages.manage','visitors.view','visitors.manage','invoices.view','invoices.manage','finance.view','finance.manage',
  'reservations.view','reservations.manage','notices.view','notices.manage','incidents.view','incidents.manage','maintenance.view','maintenance.manage',
  'emergency.use','emergency.approve','settings.manage','platform.manage','bank.manage','system.update','audit.view','apps.view','boletos.manage'
];

function rolePermissions(role='morador') {
  const all = Object.fromEntries(ALL_PERMISSIONS.map(p => [p, true]));
  if (role === 'master' || role === 'admin') return all;
  if (role === 'sindico') return { ...all, 'platform.manage': false, 'bank.manage': false, 'system.update': false };
  if (role === 'portaria') return {
    'dashboard.view': true, 'residents.view': true, 'packages.view': true, 'packages.manage': true,
    'visitors.view': true, 'visitors.manage': true, 'reservations.view': true, 'messages.view': true, 'messages.manage': true,
    'incidents.view': true, 'incidents.manage': true, 'emergency.use': true, 'emergency.approve': true, 'apps.view': true
  };
  if (role === 'funcionario') return {
    'dashboard.view': true, 'messages.view': true, 'messages.manage': true, 'incidents.view': true,
    'maintenance.view': true, 'emergency.use': true, 'apps.view': true
  };
  if (role === 'financeiro') return {
    'dashboard.view': true, 'finance.view': true, 'finance.manage': true, 'boletos.manage': true,
    'reservations.view': true, 'notices.view': true, 'apps.view': true
  };
  return {
    'dashboard.view': true, 'packages.view': true, 'visitors.view': true, 'reservations.view': true, 'reservations.manage': true,
    'finance.view': true, 'notices.view': true, 'messages.manage': true, 'emergency.use': true, 'apps.view': true
  };
}
function parseJson(value, fallback={}) { if (!value) return fallback; if (typeof value === 'object') return value; try { return JSON.parse(value); } catch { return fallback; } }
function normalizePermissions(value, role) { const parsed = parseJson(value, null); const base = rolePermissions(role); return (!parsed || Object.keys(parsed).length === 0) ? base : { ...base, ...parsed }; }
function maskDatabaseUrl(value='') { try { const u = new URL(value); if (u.password) u.password = '***'; return u.toString(); } catch { return value.replace(/:\/\/([^:\/\s]+):([^@\s]+)@/, '://$1:***@'); } }
function removeSslQueryParams(value='') { try { const u = new URL(value); ['sslmode','sslcert','sslkey','sslrootcert'].forEach(k=>u.searchParams.delete(k)); return u.toString(); } catch { return value.replace(/[?&](sslmode|sslcert|sslkey|sslrootcert)=[^&]*/gi,'').replace(/\?&/,'?').replace(/[?&]$/,''); } }
function urlSslMode(value='') { try { return new URL(value).searchParams.get('sslmode')?.toLowerCase() || ''; } catch { const m = value.match(/[?&]sslmode=([^&]+)/i); return m ? decodeURIComponent(m[1]).toLowerCase() : ''; } }
function looksLikeExternalCloudDb(value='') { try { const host = new URL(value).hostname; return /render\.com|neon\.tech|supabase\.co|railway\.app|amazonaws\.com|azure\.com|googleusercontent\.com|aivencloud\.com/i.test(host); } catch { return /render\.com|neon\.tech|supabase\.co|railway\.app|amazonaws\.com|azure\.com|googleusercontent\.com|aivencloud\.com/i.test(value); } }
function preferredSslAttempts() { const sslMode = urlSslMode(DATABASE_URL); const noSslFirst=[false,true]; const sslFirst=[true,false]; if (['0','false','no','off','disable','disabled'].includes(DB_SSL_MODE)) return noSslFirst; if (['1','true','yes','on','require','required'].includes(DB_SSL_MODE)) return sslFirst; if (sslMode === 'disable') return noSslFirst; if (['require','prefer','verify-ca','verify-full','no-verify'].includes(sslMode)) return sslFirst; return looksLikeExternalCloudDb(DATABASE_URL) ? sslFirst : noSslFirst; }
function poolConfig(sslEnabled) { return { connectionString: removeSslQueryParams(DATABASE_URL), ssl: sslEnabled ? { rejectUnauthorized: false } : false, max: Number(process.env.PG_POOL_MAX || 10), idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT || 30000), connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT || 15000) }; }
function isRetryableSslError(error) { return /ssl|tls|certificate|self[- ]signed|handshake|no pg_hba\.conf entry|encryption/i.test(String(error?.message || error || '')); }
async function createConnectedPool() { const attempts=[...new Set(preferredSslAttempts())]; let lastError; for (const sslEnabled of attempts) { const candidate = new Pool(poolConfig(sslEnabled)); try { await candidate.query('SELECT 1'); console.log(`Banco conectado ${sslEnabled ? 'com SSL/TLS' : 'sem SSL/TLS'}: ${maskDatabaseUrl(DATABASE_URL)}`); return candidate; } catch(error) { lastError=error; await candidate.end().catch(()=>null); console.warn(`Tentativa de banco ${sslEnabled?'com SSL/TLS':'sem SSL/TLS'} falhou: ${error.message}`); if (!isRetryableSslError(error)) break; } } throw lastError; }

app.use(cors({ origin: process.env.CORS_ORIGIN || true, credentials: true }));
app.use(express.json({ limit: '35mb' }));
async function q(sql, params=[]) { if (!pool) throw new Error('Banco ainda não inicializado.'); return pool.query(sql, params); }
function quoteIdent(name) { return '"' + String(name).replace(/"/g, '""') + '"'; }
async function addColumn(table, columnSql) { await q(`ALTER TABLE ${quoteIdent(table)} ADD COLUMN IF NOT EXISTS ${columnSql}`).catch(e => console.warn('Migração ignorada:', table, columnSql, e.message)); }
async function addColumnStrict(table, columnSql) { await q(`ALTER TABLE ${quoteIdent(table)} ADD COLUMN IF NOT EXISTS ${columnSql}`); }
async function hasColumn(table, column) {
  const r = await q(`SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2 LIMIT 1`, [table, column]);
  return r.rowCount > 0;
}
async function ensureCriticalLegacySchema() {
  // Esta função roda antes de qualquer INSERT/SELECT que use colunas novas.
  // Bancos criados por versões antigas já possuem a tabela users, mas sem permissions.
  // CREATE TABLE IF NOT EXISTS não altera tabelas existentes, por isso o ALTER precisa ser explícito e obrigatório.
  const critical = [
    ['users','name TEXT'],
    ['users','email TEXT'],
    ['users','password_hash TEXT'],
    ['users','role TEXT DEFAULT \'morador\''],
    ['users','user_type TEXT DEFAULT \'morador\''],
    ['users','is_outsourced BOOLEAN DEFAULT false'],
    ['users','unit TEXT'],
    ['users','permissions JSONB DEFAULT \'{}\'::jsonb'],
    ['users','resident_id INTEGER'],
    ['users','employee_id INTEGER'],
    ['users','phone TEXT'],
    ['users','whatsapp_phone TEXT'],
    ['users','telegram_chat_id TEXT'],
    ['users','notification_preferences JSONB DEFAULT \'{"app":true,"email":true,"telegram":false,"whatsapp":false,"browser":true}\'::jsonb'],
    ['users','active BOOLEAN DEFAULT true'],
    ['users','force_password_change BOOLEAN DEFAULT false'],
    ['users','last_login TIMESTAMP'],
    ['users','created_at TIMESTAMP DEFAULT now()'],
    ['residents','access_permissions JSONB DEFAULT \'{}\'::jsonb'],
    ['residents',"resident_tags JSONB DEFAULT '{}'::jsonb"],
    ['residents','notification_preferences JSONB DEFAULT \'{"app":true,"email":true,"telegram":false,"whatsapp":false,"browser":true}\'::jsonb'],
    ['residents','whatsapp_phone TEXT'],
    ['residents','telegram_chat_id TEXT'],
    ['residents','active BOOLEAN DEFAULT true'],
    ['residents','deleted_at TIMESTAMP']
  ];
  for (const [table, col] of critical) await addColumnStrict(table, col);
  await q(`UPDATE users SET permissions = '{}'::jsonb WHERE permissions IS NULL`);
  await q(`UPDATE users SET role = COALESCE(NULLIF(role,''), 'morador') WHERE role IS NULL OR role = ''`);
  await q(`UPDATE users SET user_type = COALESCE(NULLIF(user_type,''), role, 'morador') WHERE user_type IS NULL OR user_type = ''`);
  await q(`UPDATE users SET active = true WHERE active IS NULL`);
  await q(`UPDATE users SET notification_preferences = '{"app":true,"email":true,"telegram":false,"whatsapp":false,"browser":true}'::jsonb WHERE notification_preferences IS NULL`);
  await q(`ALTER TABLE users ALTER COLUMN permissions SET DEFAULT '{}'::jsonb`);
  await q(`ALTER TABLE users ALTER COLUMN notification_preferences SET DEFAULT '{"app":true,"email":true,"telegram":false,"whatsapp":false,"browser":true}'::jsonb`).catch(()=>null);
  if (!(await hasColumn('users', 'permissions'))) throw new Error('Migração crítica falhou: coluna users.permissions não foi criada. Verifique permissões do usuário do banco.');
  console.log('Migração crítica OK: users.permissions e colunas essenciais conferidas.');
}
async function audit(actor, action, entity='') { await q('INSERT INTO audit(actor,action,entity) VALUES($1,$2,$3)', [actor || 'sistema', action, entity]).catch(()=>null); }
function randomCode(len=6) { return randomBytes(12).toString('hex').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0, len); }
function onlyDigits(v='') { return String(v||'').replace(/\D/g,''); }
function requireFields(body, fields) { const missing = fields.filter(f => !String(body[f] ?? '').trim()); if (missing.length) { const err = new Error('Preencha: ' + missing.join(', ')); err.status = 400; throw err; } }
function splitList(value='') { if (Array.isArray(value)) return value.filter(Boolean); return String(value||'').split(/[;,\n]/).map(x=>x.trim()).filter(Boolean); }
function isResident(user) { return user?.role === 'morador'; }
function isStaff(user) { return ['master','sindico','admin','portaria','funcionario','financeiro'].includes(user?.role); }

async function init() {
  await q(`
CREATE TABLE IF NOT EXISTS residents(
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  unit TEXT,
  phone TEXT,
  whatsapp_phone TEXT,
  email TEXT,
  document TEXT,
  vehicle TEXT,
  notes TEXT,
  access_profile TEXT DEFAULT 'morador',
  access_permissions JSONB DEFAULT '{}'::jsonb,
  telegram_chat_id TEXT,
  resident_tags JSONB DEFAULT '{}'::jsonb,
  notification_preferences JSONB DEFAULT '{"app":true,"email":true,"telegram":false,"whatsapp":false,"browser":true}'::jsonb,
  created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS users(
  id SERIAL PRIMARY KEY,
  name TEXT,
  email TEXT UNIQUE,
  password_hash TEXT,
  role TEXT DEFAULT 'morador',
  user_type TEXT DEFAULT 'morador',
  is_outsourced BOOLEAN DEFAULT false,
  unit TEXT,
  permissions JSONB DEFAULT '{}'::jsonb,
  resident_id INTEGER REFERENCES residents(id) ON DELETE SET NULL,
  employee_id INTEGER,
  phone TEXT,
  whatsapp_phone TEXT,
  telegram_chat_id TEXT,
  notification_preferences JSONB DEFAULT '{"app":true,"email":true,"telegram":false,"whatsapp":false,"browser":true}'::jsonb,
  active BOOLEAN DEFAULT true,
  force_password_change BOOLEAN DEFAULT false,
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS employees(
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'portaria',
  phone TEXT,
  email TEXT,
  active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS shifts(
  id SERIAL PRIMARY KEY,
  employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'portaria',
  starts_at TIMESTAMP NOT NULL,
  ends_at TIMESTAMP NOT NULL,
  status TEXT DEFAULT 'programada',
  notes TEXT,
  created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS messages(
  id SERIAL PRIMARY KEY,
  resident_id INTEGER REFERENCES residents(id) ON DELETE SET NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  unit TEXT,
  subject TEXT,
  body TEXT,
  assigned_employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'nova',
  response TEXT,
  responded_by TEXT,
  created_at TIMESTAMP DEFAULT now(),
  responded_at TIMESTAMP
);
CREATE TABLE IF NOT EXISTS packages(
  id SERIAL PRIMARY KEY,
  tracking TEXT,
  recipient TEXT,
  unit TEXT,
  resident_id INTEGER REFERENCES residents(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pendente',
  label TEXT,
  photo_url TEXT,
  notes TEXT,
  extracted_text TEXT,
  pickup_code TEXT,
  delivery_preference TEXT DEFAULT 'nao_informado',
  notification_channels JSONB DEFAULT '{}'::jsonb,
  notification_status TEXT DEFAULT 'pendente',
  created_at TIMESTAMP DEFAULT now(),
  delivered_at TIMESTAMP,
  resident_response_at TIMESTAMP
);
CREATE TABLE IF NOT EXISTS visitors(
  id SERIAL PRIMARY KEY,
  name TEXT,
  document TEXT,
  unit TEXT,
  authorized_by TEXT,
  status TEXT DEFAULT 'autorizado',
  plate TEXT,
  phone TEXT,
  recurring BOOLEAN DEFAULT false,
  weekdays JSONB DEFAULT '[]'::jsonb,
  valid_from DATE,
  valid_until DATE,
  announce_required BOOLEAN DEFAULT true,
  announcement_channel TEXT DEFAULT 'interfone',
  notification_channels JSONB DEFAULT '{}'::jsonb,
  photo_data TEXT,
  reservation_id INTEGER,
  notes TEXT,
  created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS common_areas(
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE,
  fee_amount NUMERIC(12,2) DEFAULT 0,
  rules_document TEXT,
  active BOOLEAN DEFAULT true,
  requires_approval BOOLEAN DEFAULT true,
  max_guests INTEGER DEFAULT 30,
  count_children BOOLEAN DEFAULT true,
  count_infants BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS reservations(
  id SERIAL PRIMARY KEY,
  area TEXT,
  area_id INTEGER REFERENCES common_areas(id) ON DELETE SET NULL,
  unit TEXT,
  resident TEXT,
  resident_id INTEGER REFERENCES residents(id) ON DELETE SET NULL,
  reserved_for DATE,
  start_time TEXT DEFAULT '19:00',
  end_time TEXT DEFAULT '23:00',
  shift TEXT,
  status TEXT DEFAULT 'pre_agendada',
  fee_amount NUMERIC(12,2) DEFAULT 0,
  boleto_id INTEGER,
  document_text TEXT,
  terms_accepted BOOLEAN DEFAULT false,
  cancel_reason TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT now(),
  approved_at TIMESTAMP,
  canceled_at TIMESTAMP
);
CREATE TABLE IF NOT EXISTS reservation_visitors(
  id SERIAL PRIMARY KEY,
  reservation_id INTEGER REFERENCES reservations(id) ON DELETE CASCADE,
  name TEXT,
  document TEXT,
  phone TEXT,
  plate TEXT,
  visitor_type TEXT DEFAULT 'convidado',
  age_group TEXT DEFAULT 'adulto',
  counts_as_guest BOOLEAN DEFAULT true,
  notes TEXT,
  photo_data TEXT,
  created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS boletos(
  id SERIAL PRIMARY KEY,
  unit TEXT,
  resident_id INTEGER REFERENCES residents(id) ON DELETE SET NULL,
  title TEXT,
  amount NUMERIC(12,2) DEFAULT 0,
  due_date DATE,
  status TEXT DEFAULT 'pendente',
  bank_name TEXT,
  barcode TEXT,
  digitable_line TEXT,
  pdf_url TEXT,
  payment_link TEXT,
  provider TEXT DEFAULT 'manual',
  external_id TEXT,
  source_type TEXT,
  source_id INTEGER,
  created_at TIMESTAMP DEFAULT now(),
  paid_at TIMESTAMP
);
CREATE TABLE IF NOT EXISTS finance(
  id SERIAL PRIMARY KEY,
  title TEXT,
  amount NUMERIC(12,2),
  type TEXT,
  status TEXT DEFAULT 'pendente',
  due_date DATE,
  unit TEXT,
  resident_id INTEGER REFERENCES residents(id) ON DELETE SET NULL,
  category TEXT DEFAULT 'geral',
  boleto_id INTEGER REFERENCES boletos(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS notices(
  id SERIAL PRIMARY KEY,
  title TEXT,
  body TEXT,
  channel TEXT DEFAULT 'app',
  priority TEXT DEFAULT 'normal',
  target_role TEXT DEFAULT 'todos',
  target_criteria JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS invoices(
  id SERIAL PRIMARY KEY,
  supplier TEXT,
  document_number TEXT,
  access_key TEXT,
  amount NUMERIC(12,2) DEFAULT 0,
  issue_date DATE,
  due_date DATE,
  unit TEXT,
  resident_id INTEGER REFERENCES residents(id) ON DELETE SET NULL,
  category TEXT DEFAULT 'nota fiscal',
  status TEXT DEFAULT 'registrada',
  extracted_text TEXT,
  file_name TEXT,
  created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS notifications(
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resident_id INTEGER REFERENCES residents(id) ON DELETE SET NULL,
  title TEXT,
  body TEXT,
  channel TEXT DEFAULT 'app',
  channels JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'nova',
  action_url TEXT,
  payload JSONB DEFAULT '{}'::jsonb,
  read_at TIMESTAMP,
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
CREATE TABLE IF NOT EXISTS emergency_requests(
  id SERIAL PRIMARY KEY,
  type_code TEXT,
  type_label TEXT,
  unit TEXT,
  message TEXT,
  requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  requested_role TEXT,
  status TEXT DEFAULT 'pendente',
  notify_all BOOLEAN DEFAULT false,
  approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decision_note TEXT,
  created_at TIMESTAMP DEFAULT now(),
  decided_at TIMESTAMP
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
CREATE TABLE IF NOT EXISTS emergency_types(
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  phone TEXT,
  supplier TEXT,
  instructions TEXT,
  notify_all BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  updated_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS registration_requests(
  id SERIAL PRIMARY KEY,
  name TEXT,
  email TEXT,
  phone TEXT,
  whatsapp_phone TEXT,
  telegram_chat_id TEXT,
  preferred_channels JSONB DEFAULT '{"email":true,"whatsapp":false,"telegram":false}'::jsonb,
  unit TEXT,
  document TEXT,
  role TEXT DEFAULT 'morador',
  status TEXT DEFAULT 'pendente',
  notes TEXT,
  created_at TIMESTAMP DEFAULT now(),
  approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP
);
CREATE TABLE IF NOT EXISTS password_resets(
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  token TEXT,
  temp_password TEXT,
  used BOOLEAN DEFAULT false,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS push_subscriptions(
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT UNIQUE,
  payload JSONB,
  created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS system_updates(
  id SERIAL PRIMARY KEY,
  update_code TEXT UNIQUE NOT NULL,
  version TEXT,
  title TEXT,
  notes TEXT,
  from_version TEXT,
  to_version TEXT,
  status TEXT DEFAULT 'disponivel',
  validation_token_hash TEXT,
  payload_sha256 TEXT,
  manifest JSONB DEFAULT '{}'::jsonb,
  package_data BYTEA,
  announced_at TIMESTAMP,
  validated_at TIMESTAMP,
  applied_at TIMESTAMP,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  applied_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  error TEXT,
  created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS manuals(
  id SERIAL PRIMARY KEY,
  title TEXT,
  audience TEXT DEFAULT 'geral',
  file_name TEXT,
  mime_type TEXT DEFAULT 'application/pdf',
  file_size INTEGER DEFAULT 0,
  file_data BYTEA,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit(
  id SERIAL PRIMARY KEY,
  actor TEXT,
  action TEXT,
  entity TEXT,
  created_at TIMESTAMP DEFAULT now()
);
`);

  await ensureCriticalLegacySchema();

  // Migração segura para bancos já existentes.
  // Observação: CREATE TABLE IF NOT EXISTS não altera tabelas antigas. Por isso,
  // adicionamos explicitamente todas as colunas usadas pelas versões Pro recentes.
  const columns = [
    // users: migração completa para bancos criados por versões antigas
    ['users','name TEXT'], ['users','email TEXT'], ['users','password_hash TEXT'], ['users','role TEXT DEFAULT \'morador\''],
    ['users','user_type TEXT DEFAULT \'morador\''], ['users','is_outsourced BOOLEAN DEFAULT false'], ['users','unit TEXT'],
    ['users','permissions JSONB DEFAULT \'{}\'::jsonb'], ['users','resident_id INTEGER'], ['users','employee_id INTEGER'],
    ['users','phone TEXT'], ['users','whatsapp_phone TEXT'], ['users','telegram_chat_id TEXT'],
    ['users','notification_preferences JSONB DEFAULT \'{"app":true,"email":true,"telegram":false,"whatsapp":false,"browser":true}\'::jsonb'],
    ['users','active BOOLEAN DEFAULT true'], ['users','force_password_change BOOLEAN DEFAULT false'], ['users','last_login TIMESTAMP'], ['users','created_at TIMESTAMP DEFAULT now()'],

    // residents
    ['residents','name TEXT'], ['residents','unit TEXT'], ['residents','phone TEXT'], ['residents','whatsapp_phone TEXT'], ['residents','email TEXT'],
    ['residents','document TEXT'], ['residents','vehicle TEXT'], ['residents','notes TEXT'], ['residents','access_profile TEXT DEFAULT \'morador\''],
    ['residents','access_permissions JSONB DEFAULT \'{}\'::jsonb'], ['residents','telegram_chat_id TEXT'],
    ['residents',"resident_tags JSONB DEFAULT '{}'::jsonb"],
    ['residents','notification_preferences JSONB DEFAULT \'{"app":true,"email":true,"telegram":false,"whatsapp":false,"browser":true}\'::jsonb'], ['residents','created_at TIMESTAMP DEFAULT now()'], ['residents','active BOOLEAN DEFAULT true'], ['residents','deleted_at TIMESTAMP'],

    // employees / shifts / messages
    ['employees','name TEXT'], ['employees','role TEXT DEFAULT \'portaria\''], ['employees','phone TEXT'], ['employees','email TEXT'], ['employees','active BOOLEAN DEFAULT true'], ['employees','notes TEXT'], ['employees','created_at TIMESTAMP DEFAULT now()'],
    ['shifts','employee_id INTEGER'], ['shifts','role TEXT DEFAULT \'portaria\''], ['shifts','starts_at TIMESTAMP'], ['shifts','ends_at TIMESTAMP'], ['shifts','status TEXT DEFAULT \'programada\''], ['shifts','notes TEXT'], ['shifts','created_at TIMESTAMP DEFAULT now()'],
    ['messages','resident_id INTEGER'], ['messages','user_id INTEGER'], ['messages','unit TEXT'], ['messages','subject TEXT'], ['messages','body TEXT'], ['messages','assigned_employee_id INTEGER'], ['messages','status TEXT DEFAULT \'nova\''], ['messages','response TEXT'], ['messages','responded_by TEXT'], ['messages','created_at TIMESTAMP DEFAULT now()'], ['messages','responded_at TIMESTAMP'],

    // packages / visitors
    ['packages','tracking TEXT'], ['packages','recipient TEXT'], ['packages','unit TEXT'], ['packages','resident_id INTEGER'], ['packages','status TEXT DEFAULT \'pendente\''], ['packages','label TEXT'], ['packages','photo_url TEXT'], ['packages','notes TEXT'], ['packages','extracted_text TEXT'], ['packages','pickup_code TEXT'], ['packages','delivery_preference TEXT DEFAULT \'nao_informado\''], ['packages','notification_channels JSONB DEFAULT \'{}\'::jsonb'], ['packages','notification_status TEXT DEFAULT \'pendente\''], ['packages','created_at TIMESTAMP DEFAULT now()'], ['packages','delivered_at TIMESTAMP'], ['packages','resident_response_at TIMESTAMP'], ['packages','deleted_at TIMESTAMP'],
    ['visitors','name TEXT'], ['visitors','document TEXT'], ['visitors','unit TEXT'], ['visitors','authorized_by TEXT'], ['visitors','status TEXT DEFAULT \'autorizado\''], ['visitors','plate TEXT'], ['visitors','phone TEXT'], ['visitors','recurring BOOLEAN DEFAULT false'], ['visitors','weekdays JSONB DEFAULT \'[]\'::jsonb'], ['visitors','valid_from DATE'], ['visitors','valid_until DATE'], ['visitors','announce_required BOOLEAN DEFAULT true'], ['visitors','announcement_channel TEXT DEFAULT \'interfone\''], ['visitors','notification_channels JSONB DEFAULT \'{}\'::jsonb'], ['visitors','photo_data TEXT'], ['visitors','reservation_id INTEGER'], ['visitors','notes TEXT'], ['visitors','deleted_at TIMESTAMP'], ['visitors','created_at TIMESTAMP DEFAULT now()'],

    // reservations / common areas / boletos / finance
    ['common_areas','name TEXT'], ['common_areas','fee_amount NUMERIC(12,2) DEFAULT 0'], ['common_areas','rules_document TEXT'], ['common_areas','active BOOLEAN DEFAULT true'], ['common_areas','requires_approval BOOLEAN DEFAULT true'], ['common_areas','max_guests INTEGER DEFAULT 30'], ['common_areas','count_children BOOLEAN DEFAULT true'], ['common_areas','count_infants BOOLEAN DEFAULT false'], ['common_areas','created_at TIMESTAMP DEFAULT now()'],
    ['reservations','area TEXT'], ['reservations','area_id INTEGER'], ['reservations','unit TEXT'], ['reservations','resident TEXT'], ['reservations','resident_id INTEGER'], ['reservations','reserved_for DATE'], ['reservations','start_time TEXT DEFAULT \'19:00\''], ['reservations','end_time TEXT DEFAULT \'23:00\''], ['reservations','shift TEXT'], ['reservations','status TEXT DEFAULT \'pre_agendada\''], ['reservations','fee_amount NUMERIC(12,2) DEFAULT 0'], ['reservations','boleto_id INTEGER'], ['reservations','document_text TEXT'], ['reservations','terms_accepted BOOLEAN DEFAULT false'], ['reservations','cancel_reason TEXT'], ['reservations','created_by INTEGER'], ['reservations','approved_by INTEGER'], ['reservations','created_at TIMESTAMP DEFAULT now()'], ['reservations','approved_at TIMESTAMP'], ['reservations','canceled_at TIMESTAMP'], ['reservations','deleted_at TIMESTAMP'],
    ['reservation_visitors','reservation_id INTEGER'], ['reservation_visitors','name TEXT'], ['reservation_visitors','document TEXT'], ['reservation_visitors','phone TEXT'], ['reservation_visitors','plate TEXT'], ['reservation_visitors',"visitor_type TEXT DEFAULT 'convidado'"], ['reservation_visitors',"age_group TEXT DEFAULT 'adulto'"], ['reservation_visitors','counts_as_guest BOOLEAN DEFAULT true'], ['reservation_visitors','notes TEXT'], ['reservation_visitors','photo_data TEXT'], ['reservation_visitors','created_at TIMESTAMP DEFAULT now()'],
    ['boletos','unit TEXT'], ['boletos','resident_id INTEGER'], ['boletos','title TEXT'], ['boletos','amount NUMERIC(12,2) DEFAULT 0'], ['boletos','due_date DATE'], ['boletos','status TEXT DEFAULT \'pendente\''], ['boletos','bank_name TEXT'], ['boletos','barcode TEXT'], ['boletos','digitable_line TEXT'], ['boletos','pdf_url TEXT'], ['boletos','payment_link TEXT'], ['boletos','provider TEXT DEFAULT \'manual\''], ['boletos','external_id TEXT'], ['boletos','source_type TEXT'], ['boletos','source_id INTEGER'], ['boletos','created_at TIMESTAMP DEFAULT now()'], ['boletos','paid_at TIMESTAMP'], ['boletos','deleted_at TIMESTAMP'],
    ['finance','title TEXT'], ['finance','amount NUMERIC(12,2)'], ['finance','type TEXT'], ['finance','status TEXT DEFAULT \'pendente\''], ['finance','due_date DATE'], ['finance','unit TEXT'], ['finance','resident_id INTEGER'], ['finance','category TEXT DEFAULT \'geral\''], ['finance','boleto_id INTEGER'], ['finance','created_at TIMESTAMP DEFAULT now()'], ['finance','deleted_at TIMESTAMP'],

    // notices / invoices / notifications / incidents / emergency
    ['notices','title TEXT'], ['notices','body TEXT'], ['notices','channel TEXT DEFAULT \'app\''], ['notices','priority TEXT DEFAULT \'normal\''], ['notices','target_role TEXT DEFAULT \'todos\''], ['notices',"target_criteria JSONB DEFAULT '{}'::jsonb"], ['notices','created_at TIMESTAMP DEFAULT now()'],
    ['invoices','supplier TEXT'], ['invoices','document_number TEXT'], ['invoices','access_key TEXT'], ['invoices','amount NUMERIC(12,2) DEFAULT 0'], ['invoices','issue_date DATE'], ['invoices','due_date DATE'], ['invoices','unit TEXT'], ['invoices','resident_id INTEGER'], ['invoices','category TEXT DEFAULT \'nota fiscal\''], ['invoices','status TEXT DEFAULT \'registrada\''], ['invoices','extracted_text TEXT'], ['invoices','file_name TEXT'], ['invoices','created_at TIMESTAMP DEFAULT now()'],
    ['notifications','user_id INTEGER'], ['notifications','resident_id INTEGER'], ['notifications','title TEXT'], ['notifications','body TEXT'], ['notifications','channel TEXT DEFAULT \'app\''], ['notifications','channels JSONB DEFAULT \'{}\'::jsonb'], ['notifications','status TEXT DEFAULT \'nova\''], ['notifications','action_url TEXT'], ['notifications','payload JSONB DEFAULT \'{}\'::jsonb'], ['notifications','read_at TIMESTAMP'], ['notifications','created_at TIMESTAMP DEFAULT now()'],
    ['incidents','title TEXT'], ['incidents','description TEXT'], ['incidents','unit TEXT'], ['incidents','severity TEXT DEFAULT \'normal\''], ['incidents','status TEXT DEFAULT \'aberta\''], ['incidents','created_at TIMESTAMP DEFAULT now()'], ['incidents','closed_at TIMESTAMP'],
    ['emergency_requests','type_code TEXT'], ['emergency_requests','type_label TEXT'], ['emergency_requests','unit TEXT'], ['emergency_requests','message TEXT'], ['emergency_requests','requested_by INTEGER'], ['emergency_requests','requested_role TEXT'], ['emergency_requests','status TEXT DEFAULT \'pendente\''], ['emergency_requests','notify_all BOOLEAN DEFAULT false'], ['emergency_requests','approved_by INTEGER'], ['emergency_requests','decision_note TEXT'], ['emergency_requests','created_at TIMESTAMP DEFAULT now()'], ['emergency_requests','decided_at TIMESTAMP'],
    ['maintenance','title TEXT'], ['maintenance','supplier TEXT'], ['maintenance','scheduled_for DATE'], ['maintenance','status TEXT DEFAULT \'planejada\''], ['maintenance','cost NUMERIC(12,2) DEFAULT 0'], ['maintenance','notes TEXT'], ['maintenance','created_at TIMESTAMP DEFAULT now()'],

    // settings / workflows / updates / audit
    ['settings','value TEXT'], ['settings','updated_at TIMESTAMP DEFAULT now()'],
    ['emergency_types','label TEXT'], ['emergency_types','phone TEXT'], ['emergency_types','supplier TEXT'], ['emergency_types','instructions TEXT'], ['emergency_types','notify_all BOOLEAN DEFAULT false'], ['emergency_types','active BOOLEAN DEFAULT true'], ['emergency_types','sort_order INTEGER DEFAULT 0'], ['emergency_types','updated_at TIMESTAMP DEFAULT now()'],
    ['registration_requests','name TEXT'], ['registration_requests','email TEXT'], ['registration_requests','phone TEXT'], ['registration_requests','whatsapp_phone TEXT'], ['registration_requests','telegram_chat_id TEXT'], ['registration_requests','preferred_channels JSONB DEFAULT \'{"email":true,"whatsapp":false,"telegram":false}\'::jsonb'], ['registration_requests','unit TEXT'], ['registration_requests','document TEXT'], ['registration_requests','role TEXT DEFAULT \'morador\''], ['registration_requests','status TEXT DEFAULT \'pendente\''], ['registration_requests','notes TEXT'], ['registration_requests','created_at TIMESTAMP DEFAULT now()'], ['registration_requests','approved_by INTEGER'], ['registration_requests','approved_at TIMESTAMP'],
    ['password_resets','user_id INTEGER'], ['password_resets','token TEXT'], ['password_resets','temp_password TEXT'], ['password_resets','used BOOLEAN DEFAULT false'], ['password_resets','expires_at TIMESTAMP'], ['password_resets','created_at TIMESTAMP DEFAULT now()'],
    ['push_subscriptions','user_id INTEGER'], ['push_subscriptions','endpoint TEXT'], ['push_subscriptions','payload JSONB'], ['push_subscriptions','created_at TIMESTAMP DEFAULT now()'],
    ['system_updates','update_code TEXT'], ['system_updates','version TEXT'], ['system_updates','title TEXT'], ['system_updates','notes TEXT'], ['system_updates','from_version TEXT'], ['system_updates','to_version TEXT'], ['system_updates','status TEXT DEFAULT \'disponivel\''], ['system_updates','validation_token_hash TEXT'], ['system_updates','payload_sha256 TEXT'], ['system_updates','manifest JSONB DEFAULT \'{}\'::jsonb'], ['system_updates','package_data BYTEA'], ['system_updates','announced_at TIMESTAMP'], ['system_updates','validated_at TIMESTAMP'], ['system_updates','applied_at TIMESTAMP'], ['system_updates','created_by INTEGER'], ['system_updates','applied_by INTEGER'], ['system_updates','error TEXT'], ['system_updates','created_at TIMESTAMP DEFAULT now()'],
    ['manuals','title TEXT'], ['manuals',"audience TEXT DEFAULT 'geral'"], ['manuals','file_name TEXT'], ['manuals',"mime_type TEXT DEFAULT 'application/pdf'"], ['manuals','file_size INTEGER DEFAULT 0'], ['manuals','file_data BYTEA'], ['manuals','uploaded_by INTEGER'], ['manuals','created_at TIMESTAMP DEFAULT now()'],
    ['audit','actor TEXT'], ['audit','action TEXT'], ['audit','entity TEXT'], ['audit','created_at TIMESTAMP DEFAULT now()']
  ];
  for (const [table, col] of columns) await addColumn(table, col);

  // Normalização pós-migração: evita erro em bancos já existentes de versões antigas.
  await q("UPDATE users SET role=COALESCE(NULLIF(role,''),'morador'), user_type=COALESCE(NULLIF(user_type,''),COALESCE(NULLIF(role,''),'morador')), permissions=COALESCE(permissions,'{}'::jsonb), active=COALESCE(active,true), notification_preferences=COALESCE(notification_preferences,'{\"app\":true,\"email\":true,\"telegram\":false,\"whatsapp\":false,\"browser\":true}'::jsonb) WHERE true").catch(e => console.warn('Normalização de usuários ignorada:', e.message));
  await q("UPDATE residents SET notification_preferences=COALESCE(notification_preferences,'{\"app\":true,\"email\":true,\"telegram\":false,\"whatsapp\":false,\"browser\":true}'::jsonb), access_permissions=COALESCE(access_permissions,'{}'::jsonb), resident_tags=COALESCE(resident_tags,'{}'::jsonb) WHERE true").catch(e => console.warn('Normalização de moradores ignorada:', e.message));
  await q("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email) WHERE email IS NOT NULL").catch(e => console.warn('Índice único de usuários ignorado:', e.message));
  await q("CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_key_unique ON settings(key) WHERE key IS NOT NULL").catch(e => console.warn('Índice de configurações ignorado:', e.message));
  await q("CREATE UNIQUE INDEX IF NOT EXISTS idx_emergency_types_code_unique ON emergency_types(code) WHERE code IS NOT NULL").catch(e => console.warn('Índice de emergências ignorado:', e.message));
  await q("CREATE UNIQUE INDEX IF NOT EXISTS idx_common_areas_name_unique ON common_areas(name) WHERE name IS NOT NULL").catch(e => console.warn('Índice de áreas comuns ignorado:', e.message));
  await q("CREATE UNIQUE INDEX IF NOT EXISTS idx_system_updates_code_unique ON system_updates(update_code) WHERE update_code IS NOT NULL").catch(e => console.warn('Índice de atualizações ignorado:', e.message));
  await q("CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint_unique ON push_subscriptions(endpoint) WHERE endpoint IS NOT NULL").catch(e => console.warn('Índice de push ignorado:', e.message));

  await q("CREATE UNIQUE INDEX IF NOT EXISTS idx_reservation_slot ON reservations(area, reserved_for, start_time, end_time) WHERE status <> 'cancelada'").catch(e => console.warn('Índice de reservas ignorado:', e.message));

  const defaultSettings = {
    THEME_ACCENT: '#126b5f', THEME_TEXT_SIZE: 'comfort', MENU_ORIENTATION: 'vertical', UI_DENSITY: 'comfort', APPEARANCE: 'light',
    CONDO_NAME: 'Condomínio Vitória Régia', DEVELOPED_BY: 'CrewCheck', CREWCHECK_SITE: 'https://www.crewcheck.online/', CREWCHECK_FOOTER: 'Desenvolvido por CrewCheck - todos os direitos reservados', CONDO_ADDRESS: '', WEATHER_CITY: 'João Pessoa', WEATHER_LAT: '-7.1195', WEATHER_LON: '-34.8450',
    ELEVATOR_OPERATOR_NAME: 'Operadora do elevador', ELEVATOR_EMERGENCY_PHONE: '', EMERGENCY_EMAILS: process.env.SENDGRID_TO_DEFAULT || '',
    EMERGENCY_APPROVAL_REQUIRED: 'true', FOOTER_MODE: 'minimal', EMAIL_PROVIDER: process.env.MAIL_PROVIDER || 'sendgrid',
    SENDGRID_FROM_EMAIL: process.env.SENDGRID_FROM_EMAIL || '', SENDGRID_FROM_NAME: process.env.SENDGRID_FROM_NAME || 'Condomínio Vitória Régia', SENDGRID_REPLY_TO: process.env.SENDGRID_REPLY_TO || '', EMAIL_SIGNATURE: 'Condomínio Vitória Régia',
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '', TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '', TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME || 'vitoriaregia_bot', TELEGRAM_START_URL: process.env.TELEGRAM_START_URL || 'https://t.me/vitoriaregia_bot', TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET || '', TELEGRAM_ENABLED: process.env.TELEGRAM_ENABLED || process.env.ENABLE_TELEGRAM || 'false', TELEGRAM_PARSE_MODE: process.env.TELEGRAM_PARSE_MODE || '', WHATSAPP_PHONE_NUMBER_ID: '', WHATSAPP_ACCESS_TOKEN: '', WHATSAPP_API_VERSION: 'v19.0',
    DELIVERY_DEFAULT_CHANNELS: '{"app":true,"browser":true,"email":true,"telegram":false,"whatsapp":false}',
    ALLOW_MULTIPLE_RESIDENTS_PER_UNIT: 'false', SHOW_UPDATES_TO_SINDICO: 'false',
    RESERVATION_DEFAULT_RULES: 'Declaro que li e aceito as normas de uso do espaço comum, incluindo horários, limpeza, ruído, convidados e responsabilidade por danos.',
    RESERVATION_MAX_GUESTS_DEFAULT: '30', RESERVATION_COUNT_CHILDREN: 'true', RESERVATION_COUNT_INFANTS: 'false',
    BOLETO_PROVIDER: 'manual', APK_BASE_URL: process.env.PUBLIC_APP_URL || 'https://vitoriaregia1.onrender.com', APK_PORTARIA_URL: '', APK_SINDICO_URL: '', APK_MORADOR_URL: '',
    ENABLE_EMAIL: 'true', ENABLE_TELEGRAM: 'false', ENABLE_WHATSAPP: 'false', ENABLE_BROWSER_PUSH: 'true',
    ENABLE_APP_PORTARIA: 'true', ENABLE_APP_SINDICO: 'true', ENABLE_APP_MORADOR: 'true',
    REGISTRATION_REQUIRE_EMAIL: 'true', REGISTRATION_REQUIRE_WHATSAPP: 'false', REGISTRATION_REQUIRE_TELEGRAM: 'false',
    BANK_PROVIDER: 'manual', BANK_API_BASE_URL: '', BANK_CLIENT_ID: '', BANK_CLIENT_SECRET: '', BANK_API_TOKEN: '', BANK_CERT_PATH: '', BANK_KEY_PATH: '', BANK_ACCOUNT: '', BANK_AGENCY: '', BANK_WALLET: '', BANK_CONTRACT: '', BANK_PIX_KEY: '', BOLETO_AUTO_GENERATE: 'false',
    RESIDENT_CRITERIA: '[{"key":"possui_pet","label":"Possui pet"},{"key":"imovel_alugado","label":"Imóvel alugado"},{"key":"possui_carro","label":"Possui carro"},{"key":"idoso_ou_pcd","label":"Idoso ou pessoa com deficiência"}]', EMERGENCY_CRITICAL_ALERTS: 'true',
    EMAIL_PROVIDER: process.env.SENDGRID_API_KEY ? 'sendgrid' : 'smtp', SENDGRID_FROM_EMAIL: process.env.SENDGRID_FROM_EMAIL || '', SENDGRID_FROM_NAME: process.env.SENDGRID_FROM_NAME || 'Condomínio Vitória Régia', SENDGRID_REPLY_TO: process.env.SENDGRID_REPLY_TO || '', SENDGRID_TO_DEFAULT: process.env.SENDGRID_TO_DEFAULT || '', SENDGRID_DATA_RESIDENCY: process.env.SENDGRID_DATA_RESIDENCY || 'global', SMTP_HOST: '', SMTP_PORT: '587', SMTP_USER: '', SMTP_PASS: '', SMTP_SECURE: 'false', MAIL_FROM: '',
    TELEGRAM_ENABLED: process.env.TELEGRAM_ENABLED || process.env.ENABLE_TELEGRAM || 'false', TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '', TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '', TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET || '', TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME || 'vitoriaregia_bot', TELEGRAM_START_URL: process.env.TELEGRAM_START_URL || 'https://t.me/vitoriaregia_bot', TELEGRAM_PARSE_MODE: process.env.TELEGRAM_PARSE_MODE || '',
    WHATSAPP_API_VERSION: 'v19.0', WHATSAPP_PHONE_NUMBER_ID: '', WHATSAPP_BUSINESS_ACCOUNT_ID: '', WHATSAPP_ACCESS_TOKEN: '', WHATSAPP_TEMPLATE_PACKAGE: '', WHATSAPP_TEMPLATE_RESERVATION: '',
    VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', VAPID_SUBJECT: '',
    ENABLE_SYSTEM_UPDATES: 'true', UPDATE_CHANNEL: 'stable', UPDATE_FEED_URL: '', UPDATE_APPLY_MODE: 'github', UPDATE_GITHUB_REPO: process.env.UPDATE_GITHUB_REPO || 'bmedeiros1987/vitoriaregia1', UPDATE_GITHUB_BRANCH: process.env.UPDATE_GITHUB_BRANCH || 'main'
  };
  for (const [key, value] of Object.entries(defaultSettings)) await q('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO NOTHING', [key, value]);

  const defaults = [
    ['elevador','Preso no elevador',process.env.ELEVATOR_EMERGENCY_PHONE || '',process.env.ELEVATOR_OPERATOR_NAME || 'Operadora do elevador','Mantenha a calma, acione o alarme interno e ligue para a operadora cadastrada pelo síndico.',false,1],
    ['incendio','Fogo / fumaça','193','Corpo de Bombeiros','Acione 193, deixe o local com segurança e aguarde orientação da portaria.',true,2],
    ['invasao','Invasão do prédio','190','Polícia Militar','Evite confronto, procure local seguro e comunique a portaria.',true,3],
    ['saude','Emergência médica','192','SAMU','Acione 192 e informe bloco, unidade e ponto de referência.',false,4],
    ['hidraulica','Vazamento grave','','Manutenção predial','Feche o registro se possível e informe imediatamente a administração.',false,5],
    ['energia','Queda de energia','','Concessionária / manutenção','Verifique áreas comuns e aguarde orientação da portaria.',false,6]
  ];
  for (const row of defaults) await q('INSERT INTO emergency_types(code,label,phone,supplier,instructions,notify_all,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(code) DO UPDATE SET notify_all=EXCLUDED.notify_all, sort_order=EXCLUDED.sort_order', row);

  const areas = [
    ['Salão de festas', 250, true], ['Churrasqueira', 120, true], ['Espaço gourmet', 180, true], ['Quadra', 0, false], ['Piscina', 0, false]
  ];
  for (const [name, fee, approval] of areas) await q('INSERT INTO common_areas(name, fee_amount, requires_approval, rules_document) VALUES($1,$2,$3,$4) ON CONFLICT(name) DO NOTHING', [name, fee, approval, defaultSettings.RESERVATION_DEFAULT_RULES]);

  const masterEmail = process.env.BRUNO_EMAIL || process.env.MASTER_EMAIL || 'bruno@vitoriaregia.local';
  const masterPassword = process.env.BRUNO_PASSWORD || process.env.MASTER_PASSWORD || process.env.ADMIN_PASSWORD || '123456';
  const masterExists = await q('SELECT id FROM users WHERE lower(email)=lower($1)', [masterEmail]);
  if (!masterExists.rowCount) {
    await q('INSERT INTO users(name,email,password_hash,role,user_type,permissions,active) VALUES($1,$2,$3,$4,$5,$6,$7)', ['Bruno', masterEmail, await bcrypt.hash(masterPassword, 10), 'master', 'master', JSON.stringify(rolePermissions('master')), true]);
  }
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@vitoriaregia.local';
  const adminPassword = process.env.ADMIN_PASSWORD || '123456';
  const exists = await q('SELECT id, permissions FROM users WHERE lower(email)=lower($1)', [adminEmail]);
  if (!exists.rowCount) {
    await q('INSERT INTO users(name,email,password_hash,role,user_type,permissions,active) VALUES($1,$2,$3,$4,$5,$6,$7)', ['Síndico', adminEmail, await bcrypt.hash(adminPassword, 10), 'sindico', 'sindico', JSON.stringify(rolePermissions('sindico')), true]);
  }
}

function sanitizeUser(row) {
  const role = row.role || 'morador';
  return { id: row.id, name: row.name, email: row.email, role, user_type: row.user_type || role, is_outsourced: row.is_outsourced === true, unit: row.unit || '', phone: row.phone || '', whatsapp_phone: row.whatsapp_phone || row.phone || '', telegram_chat_id: row.telegram_chat_id || '', notification_preferences: parseJson(row.notification_preferences, {}), active: row.active !== false, resident_id: row.resident_id || null, employee_id: row.employee_id || null, permissions: normalizePermissions(row.permissions, role), force_password_change: row.force_password_change === true, last_login: row.last_login || null, created_at: row.created_at || null };
}
function auth(req, res, next) { try { const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,''); const payload=jwt.verify(token, JWT_SECRET); payload.permissions=normalizePermissions(payload.permissions, payload.role); req.user=payload; next(); } catch { res.status(401).json({ error: 'Não autorizado' }); } }
function hasPermission(user, permission) { if (!permission) return true; if (user?.role === 'master' || user?.role === 'admin') return true; if (user?.role === 'sindico') return !['platform.manage','bank.manage','system.update'].includes(permission); return Boolean(user?.permissions?.[permission]); }
function can(permission) { return (req,res,next) => hasPermission(req.user, permission) ? next() : res.status(403).json({ error: 'Acesso não permitido para este usuário.' }); }
const SECRET_SETTING_KEYS = new Set(['SENDGRID_API_KEY','SMTP_PASS','TELEGRAM_BOT_TOKEN','TELEGRAM_WEBHOOK_SECRET','WHATSAPP_ACCESS_TOKEN','WHATSAPP_API_TOKEN','UPDATE_GITHUB_TOKEN','DATABASE_URL','JWT_SECRET','BANK_CLIENT_SECRET','BANK_API_TOKEN','VAPID_PRIVATE_KEY','BANK_CERT_PATH','BANK_KEY_PATH']);
function isSecretSetting(key='') { return SECRET_SETTING_KEYS.has(String(key).toUpperCase()) || /TOKEN|SECRET|PASSWORD|PASS|PRIVATE_KEY|DATABASE_URL/i.test(String(key)); }
function maskSecretSetting(value='') { const s=String(value || ''); if (!s) return ''; if (s.includes('***')) return s; return s.length < 9 ? 'configurado' : `${s.slice(0,3)}***${s.slice(-3)}`; }
async function getSettingsObject({ maskSecrets=false }={}) { const rows=(await q('SELECT key,value FROM settings ORDER BY key')).rows; return rows.reduce((acc,r)=>{ acc[r.key] = maskSecrets && isSecretSetting(r.key) ? maskSecretSetting(r.value) : r.value; return acc; }, {}); }
async function getSetting(key, fallback='') { const r=await q('SELECT value FROM settings WHERE key=$1',[key]); const dbValue=r.rowCount ? String(r.rows[0].value ?? '') : ''; return dbValue !== '' ? dbValue : (process.env[key] || fallback); }

function isMaster(user) { return user?.role === 'master' || user?.role === 'admin'; }
function masterOnly(req, res, next) { return isMaster(req.user) ? next() : res.status(403).json({ error: 'Apenas Bruno pode alterar funcionalidades liberadas, apps, banco e atualizações.' }); }
async function canViewUpdates(req, res, next) {
  if (isMaster(req.user)) return next();
  if (req.user?.role === 'sindico' && boolValue(await getSetting('SHOW_UPDATES_TO_SINDICO','false'), false)) return next();
  return res.status(403).json({ error:'Menu de atualização não liberado para este perfil.' });
}

function boolValue(v, fallback=false) { if (v === undefined || v === null || v === '') return fallback; return ['1','true','sim','yes','on','ativo','liberado'].includes(String(v).trim().toLowerCase()); }
async function featureEnabled(channel) {
  const map = { email:'ENABLE_EMAIL', telegram:'ENABLE_TELEGRAM', whatsapp:'ENABLE_WHATSAPP', browser:'ENABLE_BROWSER_PUSH', app:'ENABLE_APP' };
  if (channel === 'app') return true;
  if (channel === 'telegram') {
    const enabledPrimary = await getSetting('ENABLE_TELEGRAM', process.env.ENABLE_TELEGRAM || '');
    const enabledLegacy = await getSetting('TELEGRAM_ENABLED', process.env.TELEGRAM_ENABLED || '');
    return boolValue(enabledPrimary, false) || boolValue(enabledLegacy, false);
  }
  return boolValue(await getSetting(map[channel] || channel, channel === 'email' || channel === 'browser'), channel === 'email' || channel === 'browser');
}
async function filterChannelsByPlan(channels={}) {
  const out = { ...channels };
  out.app = true;
  out.email = Boolean(out.email) && await featureEnabled('email');
  out.telegram = Boolean(out.telegram) && await featureEnabled('telegram');
  out.whatsapp = Boolean(out.whatsapp) && await featureEnabled('whatsapp');
  out.browser = Boolean(out.browser) && await featureEnabled('browser');
  return out;
}
const PLATFORM_SETTING_KEYS = new Set(['ENABLE_EMAIL','ENABLE_TELEGRAM','ENABLE_WHATSAPP','ENABLE_BROWSER_PUSH','ENABLE_APP_PORTARIA','ENABLE_APP_SINDICO','ENABLE_APP_MORADOR','REGISTRATION_REQUIRE_EMAIL','REGISTRATION_REQUIRE_WHATSAPP','REGISTRATION_REQUIRE_TELEGRAM','BANK_PROVIDER','BANK_API_BASE_URL','BANK_CLIENT_ID','BANK_ACCOUNT','BANK_AGENCY','BANK_WALLET','BANK_CONTRACT','BANK_PIX_KEY','BOLETO_AUTO_GENERATE','BOLETO_PROVIDER','ENABLE_SYSTEM_UPDATES','UPDATE_CHANNEL','UPDATE_FEED_URL','UPDATE_APPLY_MODE','UPDATE_GITHUB_REPO','UPDATE_GITHUB_BRANCH','APK_PORTARIA_URL','APK_SINDICO_URL','APK_MORADOR_URL','RESERVATION_MAX_GUESTS_DEFAULT','RESERVATION_COUNT_CHILDREN','RESERVATION_COUNT_INFANTS','RESIDENT_CRITERIA','EMERGENCY_CRITICAL_ALERTS','ALLOW_MULTIPLE_RESIDENTS_PER_UNIT','SHOW_UPDATES_TO_SINDICO','EMAIL_PROVIDER','SENDGRID_FROM_EMAIL','SENDGRID_FROM_NAME','SENDGRID_REPLY_TO','SENDGRID_TO_DEFAULT','SENDGRID_DATA_RESIDENCY','SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASS','SMTP_SECURE','MAIL_FROM','TELEGRAM_ENABLED','TELEGRAM_BOT_TOKEN','TELEGRAM_CHAT_ID','TELEGRAM_WEBHOOK_SECRET','TELEGRAM_BOT_USERNAME','TELEGRAM_START_URL','TELEGRAM_PARSE_MODE','WHATSAPP_API_VERSION','WHATSAPP_PHONE_NUMBER_ID','WHATSAPP_BUSINESS_ACCOUNT_ID','WHATSAPP_ACCESS_TOKEN','WHATSAPP_TEMPLATE_PACKAGE','WHATSAPP_TEMPLATE_RESERVATION','VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','VAPID_SUBJECT']);
function containsProtectedSettings(body={}) { return Object.keys(body || {}).some(k => PLATFORM_SETTING_KEYS.has(k)); }
async function publicSettingsObject() {
  const s = await getSettingsObject();
  const keys = ['CONDO_NAME','APPEARANCE','THEME_ACCENT','ENABLE_EMAIL','ENABLE_TELEGRAM','ENABLE_WHATSAPP','ENABLE_BROWSER_PUSH','ENABLE_APP_PORTARIA','ENABLE_APP_SINDICO','ENABLE_APP_MORADOR','REGISTRATION_REQUIRE_EMAIL','REGISTRATION_REQUIRE_WHATSAPP','REGISTRATION_REQUIRE_TELEGRAM','APK_PORTARIA_URL','APK_SINDICO_URL','APK_MORADOR_URL','RESERVATION_MAX_GUESTS_DEFAULT','RESERVATION_COUNT_CHILDREN','RESERVATION_COUNT_INFANTS','RESIDENT_CRITERIA','EMERGENCY_CRITICAL_ALERTS','ALLOW_MULTIPLE_RESIDENTS_PER_UNIT','SHOW_UPDATES_TO_SINDICO','CREWCHECK_SITE','DEVELOPED_BY','THEME_TEXT_SIZE'];
  return Object.fromEntries(keys.map(k => [k, s[k] ?? '']));
}
function loginEmailFromChannels(body={}) {
  const email = String(body.email || '').trim(); if (email) return email.toLowerCase();
  const wa = onlyDigits(body.whatsapp_phone || body.phone || ''); if (wa) return `whatsapp_${wa}@vitoriaregia.local`;
  const tg = onlyDigits(body.telegram_chat_id || ''); if (tg) return `telegram_${tg}@vitoriaregia.local`;
  return `usuario_${randomCode(10).toLowerCase()}@vitoriaregia.local`;
}

function normalizeUnit(unit='') { return String(unit || '').trim().replace(/\s+/g,'').toUpperCase(); }
function normalizeEmail(email='') { return String(email || '').trim().toLowerCase(); }
function hasDuplicateMessage(kind) { return `${kind} já cadastrado. Confira o cadastro existente antes de gravar novamente.`; }
async function residentDuplicate(body={}, excludeId=null) {
  const unit = normalizeUnit(body.unit); const email = normalizeEmail(body.email); const doc = onlyDigits(body.document || '');
  const allowMultiple = boolValue(await getSetting('ALLOW_MULTIPLE_RESIDENTS_PER_UNIT','false'), false);
  const clauses=[]; const params=[];
  if (!allowMultiple && unit) { params.push(unit); clauses.push(`upper(replace(coalesce(unit,''),' ',''))=$${params.length}`); }
  if (email) { params.push(email); clauses.push(`lower(coalesce(email,''))=$${params.length}`); }
  if (doc) { params.push(doc); clauses.push(`regexp_replace(coalesce(document,''),'\D','','g')=$${params.length}`); }
  if (!clauses.length) return null;
  if (excludeId) { params.push(excludeId); }
  const sql = `SELECT * FROM residents WHERE COALESCE(active,true)=true AND (${clauses.join(' OR ')}) ${excludeId ? `AND id <> $${params.length}` : ''} ORDER BY id DESC LIMIT 1`;
  const r=await q(sql, params); return r.rows[0] || null;
}
async function userDuplicate(body={}, excludeId=null) {
  const email = normalizeEmail(loginEmailFromChannels(body)); if (!email) return null;
  const params=[email]; if (excludeId) params.push(excludeId);
  const r=await q(`SELECT * FROM users WHERE lower(coalesce(email,''))=$1 AND COALESCE(active,true)=true ${excludeId?'AND id <> $2':''} LIMIT 1`, params);
  return r.rows[0] || null;
}
async function packageDuplicate(body={}) {
  const tracking=String(body.tracking || '').trim(); const unit=normalizeUnit(body.unit);
  if (!tracking || !unit) return null;
  const r=await q(`SELECT * FROM packages WHERE deleted_at IS NULL AND lower(coalesce(tracking,''))=lower($1) AND upper(replace(coalesce(unit,''),' ',''))=$2 AND COALESCE(status,'') <> 'entregue' ORDER BY id DESC LIMIT 1`, [tracking, unit]);
  return r.rows[0] || null;
}
async function reservationDuplicate(body={}, excludeId=null) {
  const params=[String(body.area||''), String(body.reserved_for||''), String(body.start_time||'19:00'), String(body.end_time||'23:00')];
  if (excludeId) params.push(excludeId);
  const r=await q(`SELECT * FROM reservations WHERE deleted_at IS NULL AND COALESCE(status,'') <> 'cancelada' AND lower(area)=lower($1) AND reserved_for=$2::date AND start_time=$3 AND end_time=$4 ${excludeId?'AND id <> $5':''} ORDER BY id DESC LIMIT 1`, params);
  return r.rows[0] || null;
}
async function requireNoDuplicate(kind, record) { if (record) { const err=new Error(hasDuplicateMessage(kind)); err.status=409; err.existing=record; throw err; } }
async function lookupResidentsForUnit({ unit='', recipient='' }={}) {
  const params=[]; let where=`COALESCE(active,true)=true`;
  if (unit) { params.push(normalizeUnit(unit)); where += ` AND upper(replace(coalesce(unit,''),' ',''))=$${params.length}`; }
  if (recipient) { params.push(`%${String(recipient).trim()}%`); where += ` AND lower(name) LIKE lower($${params.length})`; }
  const rows=(await q(`SELECT id,name,unit,phone,whatsapp_phone,email,telegram_chat_id,document,vehicle,resident_tags,notification_preferences FROM residents WHERE ${where} ORDER BY name LIMIT 20`, params)).rows;
  return rows;
}

function escapeHtml(v='') { return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
function textToHtml(v='') { return `<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.55;color:#111827">${escapeHtml(v).replace(/\n/g,'<br>')}</div>`; }
async function professionalEmailHtml({ subject='', text='', html='' }={}) {
  const base = (await getSetting('PUBLIC_APP_URL', process.env.PUBLIC_APP_URL || process.env.RENDER_EXTERNAL_URL || '')).replace(/\/$/, '');
  const logo = base ? `${base}/logo-vitoria-regia.svg` : '';
  const crew = base ? `${base}/crewcheck-logo.svg` : '';
  const content = html || textToHtml(text);
  return `<div style="margin:0;padding:24px;background:#eef5f2;font-family:Arial,Helvetica,sans-serif;color:#13231f"><div style="max-width:640px;margin:auto;background:#fff;border-radius:20px;overflow:hidden;border:1px solid #dbe7e3"><div style="padding:24px;background:linear-gradient(135deg,#0f5f55,#35b5a2);color:white;display:flex;align-items:center;gap:14px">${logo?`<img src="${logo}" alt="Vitória Régia" style="width:54px;height:54px;border-radius:14px;background:white;padding:6px"/>`:''}<div><h1 style="margin:0;font-size:20px">Condomínio Vitória Régia</h1><p style="margin:4px 0 0;font-size:14px;opacity:.9">${escapeHtml(subject)}</p></div></div><div style="padding:28px;font-size:15px;line-height:1.6">${content}</div><div style="padding:18px 24px;background:#f7faf9;font-size:12px;color:#64746f;border-top:1px solid #e5eeeb;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap"><span>Desenvolvido por CrewCheck - todos os direitos reservados.</span>${crew?`<img src="${crew}" alt="CrewCheck" style="height:24px"/>`:''}</div></div></div>`;
}
function maskEmailList(value='') { return splitList(value).map(email => email.replace(/(^.).*(@.*$)/, '$1***$2')); }

async function sendEmailSmart({ to, subject, text, html }) {
  if (!(await featureEnabled('email'))) return { ok:false, skipped:true, reason:'Canal de e-mail não liberado por Bruno.' };
  const destination = splitList(to); if (!destination.length) { const err = new Error('Informe ao menos um destinatário de e-mail.'); err.status=400; throw err; }
  const provider = String(await getSetting('EMAIL_PROVIDER', process.env.SENDGRID_API_KEY ? 'sendgrid' : 'smtp')).toLowerCase();
  const sendgridKey = process.env.SENDGRID_API_KEY;
  const fromEmail = await getSetting('SENDGRID_FROM_EMAIL', process.env.SENDGRID_FROM_EMAIL || process.env.MAIL_FROM || '');
  const fromName = await getSetting('SENDGRID_FROM_NAME', process.env.SENDGRID_FROM_NAME || 'Vitória Régia');
  const replyTo = await getSetting('SENDGRID_REPLY_TO', process.env.SENDGRID_REPLY_TO || '');
  const bodyText=String(text||'').trim(); const bodyHtml=await professionalEmailHtml({ subject, text:bodyText, html });
  if ((provider === 'sendgrid' || provider === 'auto') && sendgridKey) {
    if (!fromEmail) { const err = new Error('Configure SENDGRID_FROM_EMAIL no Render com remetente verificado.'); err.status=400; throw err; }
    sgMail.setApiKey(sendgridKey);
    if (/^eu/i.test(process.env.SENDGRID_DATA_RESIDENCY || '') && typeof sgMail.setDataResidency === 'function') sgMail.setDataResidency('eu');
    await sgMail.send({ to: destination, from: { email: fromEmail, name: fromName || 'Vitória Régia' }, replyTo: replyTo || undefined, subject, text: bodyText, html: bodyHtml });
    return { ok:true, provider:'sendgrid', to: maskEmailList(destination.join(',')) };
  }
  const host = await getSetting('SMTP_HOST'); const user = await getSetting('SMTP_USER'); const pass = await getSetting('SMTP_PASS'); const port = Number(await getSetting('SMTP_PORT','587'));
  if (!host || !user || !pass) { const err = new Error('Configure SendGrid ou SMTP em Configurações.'); err.status=400; throw err; }
  const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  await transporter.sendMail({ from: await getSetting('MAIL_FROM', user), to: destination.join(','), subject, text: bodyText, html: bodyHtml });
  return { ok:true, provider:'smtp', to: maskEmailList(destination.join(',')) };
}

let webPushReady = false;
function configureWebPush() {
  if (webPushReady) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY || '';
  const privateKey = process.env.VAPID_PRIVATE_KEY || '';
  const mail = process.env.VAPID_SUBJECT || process.env.SENDGRID_REPLY_TO || process.env.SENDGRID_FROM_EMAIL || 'admin@vitoriaregia.local';
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(mail.startsWith('mailto:') ? mail : `mailto:${mail}`, publicKey, privateKey);
  webPushReady = true;
  return true;
}
async function sendBrowserPushToResident(residentId, title, body, url='/', payloadExtra={}) {
  if (!(await featureEnabled('browser'))) return { ok:false, skipped:true, reason:'Notificação do navegador não liberada por Bruno.' };
  if (!residentId || !configureWebPush()) return { ok:false, skipped:true, reason:'VAPID não configurado' };
  const subs = await q('SELECT ps.* FROM push_subscriptions ps JOIN users u ON u.id=ps.user_id WHERE u.resident_id=$1', [residentId]).catch(()=>({ rows:[] }));
  const payload = JSON.stringify({ title, body, url, icon:'/logo-vitoria-regia.svg', ...payloadExtra });
  const results = [];
  for (const sub of subs.rows) {
    try {
      results.push(await webpush.sendNotification(parseJson(sub.payload, {}), payload));
    } catch (e) {
      if ([404,410].includes(e.statusCode)) await q('DELETE FROM push_subscriptions WHERE id=$1',[sub.id]).catch(()=>null);
      results.push({ ok:false, error:e.message });
    }
  }
  return { ok:true, sent:results.length };
}
async function telegramApi(method, body={}) {
  const token = await getSetting('TELEGRAM_BOT_TOKEN', process.env.TELEGRAM_BOT_TOKEN || '');
  if (!token) return { ok:false, skipped:true, reason:'Token do Telegram não configurado.' };
  const base = (await getSetting('TELEGRAM_API_BASE_URL', process.env.TELEGRAM_API_BASE_URL || 'https://api.telegram.org')).replace(/\/$/, '');
  const r = await fetch(`${base}/bot${token}/${method}`, { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(()=>({}));
  return { ok:r.ok && data.ok !== false, data, description:data.description || '' };
}
async function sendTelegramMessage(chatId, text, options={}) {
  if (!(await featureEnabled('telegram'))) return { ok:false, skipped:true, reason:'Telegram não liberado em Configurações.' };
  const chat = chatId || await getSetting('TELEGRAM_CHAT_ID', process.env.TELEGRAM_CHAT_ID || '');
  if (!chat) return { ok:false, skipped:true, reason:'Chat ID do Telegram não configurado.' };
  const parseMode = await getSetting('TELEGRAM_PARSE_MODE', process.env.TELEGRAM_PARSE_MODE || '');
  const payload = { chat_id: chat, text, ...(parseMode ? { parse_mode: parseMode } : {}), ...(options || {}) };
  return telegramApi('sendMessage', payload);
}
async function sendWhatsAppText(phone, text) { if (!(await featureEnabled('whatsapp'))) return { ok:false, skipped:true, reason:'WhatsApp não liberado por Bruno.' }; const phoneId=await getSetting('WHATSAPP_PHONE_NUMBER_ID', process.env.WHATSAPP_PHONE_NUMBER_ID || ''); const token=await getSetting('WHATSAPP_ACCESS_TOKEN', process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_API_TOKEN || ''); const version=await getSetting('WHATSAPP_API_VERSION', process.env.WHATSAPP_API_VERSION || 'v19.0'); const to = onlyDigits(phone); if (!phoneId || !token || !to) return { ok:false, skipped:true }; const r = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, { method:'POST', headers:{ 'content-type':'application/json', authorization:`Bearer ${token}` }, body: JSON.stringify({ messaging_product:'whatsapp', to, type:'text', text:{ body:text } }) }); return { ok:r.ok, data: await r.json().catch(()=>({})) }; }
async function findResident({ unit='', recipient='', resident_id=null, user_id=null }={}) { if (resident_id) { const r=await q('SELECT * FROM residents WHERE id=$1 AND COALESCE(active,true)=true',[resident_id]); if (r.rowCount) return r.rows[0]; } if (user_id) { const r=await q('SELECT r.* FROM users u JOIN residents r ON r.id=u.resident_id WHERE u.id=$1',[user_id]); if (r.rowCount) return r.rows[0]; } if (unit) { const r=await q('SELECT * FROM residents WHERE lower(coalesce(unit,\'\'))=lower($1) ORDER BY id DESC LIMIT 1',[String(unit).trim()]); if (r.rowCount) return r.rows[0]; } if (recipient) { const r=await q('SELECT * FROM residents WHERE COALESCE(active,true)=true AND lower(name) LIKE lower($1) ORDER BY id DESC LIMIT 1',[`%${String(recipient).trim()}%`]); if (r.rowCount) return r.rows[0]; } return null; }
async function createNotification({ resident_id=null, user_id=null, title, body, channel='app', channels={}, action_url='', payload={} }) { const r=await q('INSERT INTO notifications(user_id,resident_id,title,body,channel,channels,action_url,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[user_id,resident_id,title,body,channel,JSON.stringify(channels || {}),action_url,JSON.stringify(payload || {})]); return r.rows[0]; }
async function notifyResident(resident, { title, body, channels={}, action_url='', payload={} }) {
  const prefs = await filterChannelsByPlan({ app:true, browser:true, email:true, telegram:false, whatsapp:false, ...parseJson(resident?.notification_preferences, {}) , ...channels });
  await createNotification({ resident_id: resident?.id || null, title, body, channel:'app', channels:prefs, action_url, payload }).catch(()=>null);
  const jobs=[];
  if (prefs.email && resident?.email) jobs.push(sendEmailSmart({ to: resident.email, subject:title, text:body }).catch(e=>({ ok:false, error:e.message })));
  if (prefs.browser && resident?.id) jobs.push(sendBrowserPushToResident(resident.id, title, body, action_url || '/', payload).catch(e=>({ ok:false, error:e.message })));
  if (prefs.telegram && resident?.telegram_chat_id) jobs.push(sendTelegramMessage(resident.telegram_chat_id, body, payload?.telegram_reply_markup ? { reply_markup: payload.telegram_reply_markup } : {}).catch(e=>({ ok:false, error:e.message })));
  if (prefs.whatsapp && (resident?.whatsapp_phone || resident?.phone)) jobs.push(sendWhatsAppText(resident.whatsapp_phone || resident.phone, body).catch(e=>({ ok:false, error:e.message })));
  const results = await Promise.all(jobs);
  return { ok:true, results };
}
async function notifyStaff({ title, body, action_url='', channels={} }) {
  const staff = (await q("SELECT * FROM users WHERE role IN ('master','sindico','admin','portaria') AND active=true")).rows;
  for (const user of staff) await createNotification({ user_id:user.id, title, body, channel:'app', channels:{ app:true, browser:true, ...channels }, action_url }).catch(()=>null);
  const emails = staff.map(u=>u.email).filter(Boolean);
  if (emails.length && await featureEnabled('email')) await sendEmailSmart({ to: emails.join(','), subject:title, text:body }).catch(()=>null);
}
async function notifyAllResidents({ title, body, channels={}, action_url='', payload={} }) { const residents=(await q('SELECT * FROM residents WHERE email IS NOT NULL OR phone IS NOT NULL')).rows; for (const r of residents) await notifyResident(r, { title, body, channels:{ app:true, browser:true, ...channels }, action_url, payload }).catch(()=>null); }

async function sendTemporaryPasswordToUser(user, temp, title='Senha temporária - Vitória Régia') {
  const prefs = await filterChannelsByPlan({ app:true, browser:true, email:true, telegram:false, whatsapp:false, ...parseJson(user.notification_preferences, {}) });
  const body = `Sua senha temporária é: ${temp}\nAcesse o sistema e altere sua senha.`;
  await createNotification({ user_id:user.id, title:'Senha temporária gerada', body:'Uma senha temporária foi enviada pelos seus canais cadastrados.', channel:'app', channels:prefs }).catch(()=>null);
  const jobs=[];
  if (prefs.email && user.email) jobs.push(sendEmailSmart({ to:user.email, subject:title, text:body }).catch(e=>({ ok:false, error:e.message })));
  if (prefs.telegram && user.telegram_chat_id) jobs.push(sendTelegramMessage(user.telegram_chat_id, body).catch(e=>({ ok:false, error:e.message })));
  if (prefs.whatsapp && (user.whatsapp_phone || user.phone)) jobs.push(sendWhatsAppText(user.whatsapp_phone || user.phone, body).catch(e=>({ ok:false, error:e.message })));
  return Promise.all(jobs);
}

async function currentOnDuty(role='portaria') { const r = await q("SELECT s.*, e.name employee_name, e.email employee_email, e.phone employee_phone FROM shifts s JOIN employees e ON e.id=s.employee_id WHERE e.active=true AND s.status <> 'cancelada' AND now() BETWEEN s.starts_at AND s.ends_at AND ($1='' OR s.role=$1 OR e.role=$1) ORDER BY s.starts_at DESC LIMIT 1", [role || '']); return r.rows[0] || null; }
function normalizeDate(value='') { const s=String(value||''); const m=s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/); if (!m) return null; const year=m[3].length===2?'20'+m[3]:m[3]; return `${year}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; }
function parseCurrency(value='') { const matches=[...String(value||'').matchAll(/(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/g)].map(m=>m[1]); if (!matches.length) return ''; const nums=matches.map(x=>Number(x.replace(/\./g,'').replace(',','.'))).filter(Number.isFinite); return nums.length ? String(Math.max(...nums).toFixed(2)) : ''; }
function parsePackageText(text='') { const clean=String(text||'').replace(/\r/g,'\n'); const lines=clean.split('\n').map(l=>l.trim()).filter(Boolean); const tracking=(clean.match(/\b([A-Z]{2}\d{9}[A-Z]{2})\b/i)?.[1] || clean.match(/\b(\d{10,18})\b/)?.[1] || '').toUpperCase(); const unit=(clean.match(/(?:apto|apartamento|unidade|unid\.?|ap\.?|bloco)\s*[:\-]?\s*([A-Z0-9\- ]{1,12})/i)?.[1] || '').trim(); const recipient=(clean.match(/(?:destinat[aá]rio|recebedor|morador|nome)\s*[:\-]\s*([^\n]+)/i)?.[1] || lines.find(l => /^[A-ZÀ-Ú][A-ZÀ-Ú\s]{5,}$/.test(l)) || '').trim(); const carrier=(clean.match(/(correios|jadlog|loggi|total express|mercado livre|amazon|shopee|magalu)/i)?.[1] || '').trim(); return { tracking, recipient, unit, label: carrier || tracking || lines[0] || '', notes:'', raw:clean.slice(0,5000) }; }
function parseInvoiceText(text='') { const clean=String(text||'').replace(/\r/g,'\n'); const lines=clean.split('\n').map(l=>l.trim()).filter(Boolean); const access_key=(clean.match(/\b(\d{44})\b/)?.[1] || '').trim(); const document_number=(clean.match(/(?:NF\-?e|NFS\-?e|nota fiscal|n[úu]mero|nº|no\.)\s*[:\-]?\s*(\d{3,12})/i)?.[1] || clean.match(/\b(\d{6,12})\b/)?.[1] || '').trim(); const supplier=(clean.match(/(?:emitente|fornecedor|prestador)\s*[:\-]\s*([^\n]+)/i)?.[1] || lines.find(l => /LTDA|S\.A|MEI|EIRELI|SERVI|COMERC/i.test(l)) || lines[0] || '').trim(); const amount=parseCurrency(clean); const issue_date=normalizeDate(clean.match(/(?:emiss[aã]o|emitida em|data)\s*[:\-]?\s*([0-9\/\-.]+)/i)?.[1] || clean); const due_date=normalizeDate(clean.match(/(?:vencimento|venc\.?|pagar at[eé])\s*[:\-]?\s*([0-9\/\-.]+)/i)?.[1] || ''); return { supplier, document_number, access_key, amount, issue_date, due_date, category:'nota fiscal', raw:clean.slice(0,8000) }; }
function googleCalendarUrl(res) { const date = String(res.reserved_for || '').replace(/-/g,''); const start = (res.start_time || '19:00').replace(':','') + '00'; const end = (res.end_time || '23:00').replace(':','') + '00'; const title=encodeURIComponent(`Reserva ${res.area || ''} - Unidade ${res.unit || ''}`); const details=encodeURIComponent(`Reserva Vitória Régia\nMorador: ${res.resident || ''}\nStatus: ${res.status || ''}`); return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${date}T${start}/${date}T${end}&details=${details}&location=${encodeURIComponent(res.area || '')}`; }
function icsContent(res) { const date=String(res.reserved_for||'').replace(/-/g,''); const start=(res.start_time||'19:00').replace(':','')+'00'; const end=(res.end_time||'23:00').replace(':','')+'00'; const uid=`reserva-${res.id}@vitoriaregia`; return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Vitoria Regia Pro//Reservas//PT-BR','BEGIN:VEVENT',`UID:${uid}`,`DTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'')}`,`DTSTART:${date}T${start}`,`DTEND:${date}T${end}`,`SUMMARY:Reserva ${res.area || ''} - Unidade ${res.unit || ''}`,`DESCRIPTION:Morador ${res.resident || ''} - Status ${res.status || ''}`,`LOCATION:${res.area || ''}`,'END:VEVENT','END:VCALENDAR'].join('\r\n'); }

function reservationStatusInfo(status='pre_agendada', res={}) {
  const label = ({ pre_agendada:'pré-agendada', pendente_pagamento:'pendente pagamento', pendente_aceite_regras:'pendente aceite das regras de utilização', confirmada:'confirmada', cancelada:'cancelada' }[status] || status || 'atualizada');
  const when = res.reserved_for ? new Date(res.reserved_for).toLocaleDateString('pt-BR', { timeZone:'UTC' }) : 'data informada';
  const base = `Reserva do espaço ${res.area || ''} para ${when}, das ${res.start_time || '--'} às ${res.end_time || '--'}, unidade ${res.unit || '-'}.`;
  const messages = {
    pre_agendada: `Sua reserva está pré-agendada. ${base} A data está bloqueada enquanto a administração confere pagamento, aceite das regras e disponibilidade operacional.`,
    pendente_pagamento: `Sua reserva está pendente de pagamento. ${base} Acesse Financeiro/Boletos para conferir a cobrança ou aguarde o envio pelo condomínio.`,
    pendente_aceite_regras: `Sua reserva está pendente de aceite das regras de utilização do espaço. ${base} Leia o documento digital e confirme que está de acordo com as normas.`,
    confirmada: `Sua reserva foi confirmada. ${base} Apresente-se conforme as normas do condomínio e mantenha a lista de convidados atualizada.`,
    cancelada: `Sua reserva foi cancelada. ${base}${res.cancel_reason ? ' Motivo: ' + res.cancel_reason : ''}`
  };
  return { label, title:`Reserva ${label} - Vitória Régia`, body: messages[status] || `Sua reserva foi atualizada. ${base}` };
}
async function residentForReservation(res={}) {
  return await findResident({ resident_id:res.resident_id, unit:res.unit, recipient:res.resident });
}
async function notifyReservationUpdate(res, status=res.status, extra={}) {
  const resident = await residentForReservation(res);
  if (!resident) return { ok:false, skipped:true, reason:'Morador não localizado para a reserva.' };
  const info = reservationStatusInfo(status, { ...res, ...extra });
  return notifyResident(resident, { title:info.title, body:info.body, channels:{ app:true,browser:true,email:true,telegram:true,whatsapp:true }, action_url:'/#/reservas', payload:{ reservation_id:res.id, status } });
}
function guestCountsInLimit(v={}, settings={}) {
  const age = String(v.age_group || 'adulto').toLowerCase();
  if (age === 'bebe') return boolValue(settings.RESERVATION_COUNT_INFANTS, false) && v.counts_as_guest !== false;
  if (age === 'crianca') return boolValue(settings.RESERVATION_COUNT_CHILDREN, true) && v.counts_as_guest !== false;
  return v.counts_as_guest !== false;
}

async function createBoleto({ unit, resident_id, title, amount, due_date, source_type, source_id, provider='auto', bank_name='', digitable_line='', barcode='', pdf_url='', payment_link='' }) {
  let providerToUse = provider && provider !== 'auto' ? provider : await getSetting('BOLETO_PROVIDER', 'manual');
  const bankProvider = await getSetting('BANK_PROVIDER', providerToUse || 'manual');
  if ((!providerToUse || providerToUse === 'manual') && bankProvider && bankProvider !== 'manual') providerToUse = bankProvider;
  const generatedCode = `VR${String(Date.now()).slice(-8)}${randomCode(6)}`;
  let line = digitable_line || generatedCode;
  let link = payment_link || '';
  let external_id = '';
  if (providerToUse !== 'manual' && !digitable_line && !barcode && !payment_link) {
    external_id = `${providerToUse}_${generatedCode}`;
    line = `${providerToUse.toUpperCase()}-${generatedCode}`;
    const base = await getSetting('BANK_API_BASE_URL', '');
    link = base ? `${base.replace(/\/$/,'')}/boleto/${external_id}` : '';
  }
  const r = await q('INSERT INTO boletos(unit,resident_id,title,amount,due_date,source_type,source_id,provider,bank_name,digitable_line,barcode,pdf_url,payment_link,external_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *', [unit || '', resident_id || null, title, amount || 0, due_date || null, source_type || '', source_id || null, providerToUse || 'manual', bank_name || await getSetting('BANK_PROVIDER','manual'), line, barcode, pdf_url, link, external_id]);
  return r.rows[0];
}

function sha256Hex(data) { return createHash('sha256').update(data).digest('hex'); }
function safeUpdatePath(name='') {
  const clean = String(name || '').replace(/\\/g,'/').replace(/^\/+/, '');
  if (!clean || clean.includes('\0') || clean.split('/').includes('..') || clean.startsWith('../')) throw new Error(`Caminho inválido no pacote: ${name}`);
  const isEnv = /(^|\/)\.env($|\.)/i.test(clean);
  const allowedEnvExample = /(^|\/)\.env\.example$/i.test(clean);
  if (isEnv && !allowedEnvExample) throw new Error(`Arquivo de ambiente proibido em atualização: ${clean}`);
  if (/(^|\/)(node_modules|\.git|dist|build|certs|server\/public)(\/|$)|\.(pem|key|crt|p12|pfx|jks|keystore|sqlite|sqlite3|db|log)$/i.test(clean)) throw new Error(`Arquivo proibido em atualização: ${clean}`);
  return clean;
}
function canonicalUpdateManifest(m={}) {
  return JSON.stringify({
    system: m.system || 'vitoria-regia-pro',
    update_code: m.update_code || '',
    version: m.version || m.to_version || '',
    from_version: m.from_version || '',
    to_version: m.to_version || m.version || '',
    created_at: m.created_at || '',
    payload_file: m.payload_file || 'payload.zip',
    payload_sha256: m.payload_sha256 || '',
    validation_token_hash: m.validation_token_hash || '',
    min_version: m.min_version || '',
    channel: m.channel || 'stable'
  });
}
function verifyManifestSignature(manifest) {
  const required = ['1','true','sim','yes','on'].includes(String(process.env.UPDATE_REQUIRE_SIGNATURE || 'true').toLowerCase());
  if (!manifest.signature) { if (required) throw new Error('Pacote sem assinatura digital.'); return true; }
  const ok = cryptoVerify('RSA-SHA256', Buffer.from(canonicalUpdateManifest(manifest)), UPDATE_PUBLIC_KEY, Buffer.from(String(manifest.signature), 'base64'));
  if (!ok) throw new Error('Assinatura digital inválida.');
  return true;
}
function validateUpdatePackage(buffer, validationCode='') {
  const zip = new AdmZip(buffer);
  const manifestEntry = zip.getEntry('vr-update.json') || zip.getEntry('vitoria-regia-update.json') || zip.getEntry('manifest.json');
  if (!manifestEntry) throw new Error('Pacote sem vr-update.json.');
  const manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
  if (manifest.system !== 'vitoria-regia-pro') throw new Error('Pacote não pertence ao Sistema Vitória Régia Pro.');
  if (!manifest.update_code || !manifest.payload_sha256) throw new Error('Manifesto de atualização incompleto.');
  const payloadEntry = zip.getEntry(manifest.payload_file || 'payload.zip');
  if (!payloadEntry) throw new Error('Pacote sem payload.zip.');
  const payloadBuffer = payloadEntry.getData();
  const payloadHash = sha256Hex(payloadBuffer);
  if (payloadHash !== String(manifest.payload_sha256).toLowerCase()) throw new Error('Hash do payload não confere. O ZIP pode estar corrompido.');
  const token = String(validationCode || manifest.validation_token || '').trim();
  if (!token) throw new Error('Código/token de validação não informado no pacote.');
  const expectedTokenHash = sha256Hex(Buffer.from(`${token}:${manifest.update_code}:${payloadHash}`));
  if (manifest.validation_token_hash && expectedTokenHash !== String(manifest.validation_token_hash).toLowerCase()) throw new Error('Código/token de validação inválido para este pacote.');
  verifyManifestSignature(manifest);
  const payloadZip = new AdmZip(payloadBuffer);
  const files = payloadZip.getEntries().filter(e => !e.isDirectory).map(e => safeUpdatePath(e.entryName));
  if (!files.length) throw new Error('Payload sem arquivos de atualização.');
  return { manifest, payloadBuffer, payloadHash, files };
}
async function notifyUpdateAvailable(manifest, actor='sistema') {
  const title = `Atualização disponível: ${manifest.version || manifest.to_version || manifest.update_code}`;
  const body = `${manifest.title || 'Nova atualização do Vitória Régia'} — código ${manifest.update_code}. Acesse Atualizações para validar e aplicar.`;
  const masters = (await q("SELECT id,email FROM users WHERE role IN ('master','admin') AND active=true")).rows;
  for (const user of masters) await createNotification({ user_id:user.id, title, body, channel:'app', channels:{ app:true,browser:true,email:false }, action_url:'/#/atualizacoes', payload:{ update_code:manifest.update_code } }).catch(()=>null);
  await audit(actor, 'notificou atualização', manifest.update_code).catch(()=>null);
  return masters.length;
}
function updateRowValues(manifest, payloadHash, packageBuffer=null, userId=null, status='validado') {
  return [manifest.update_code, manifest.version || manifest.to_version || '', manifest.title || 'Atualização Vitória Régia', manifest.notes || '', manifest.from_version || '', manifest.to_version || manifest.version || '', status, manifest.validation_token_hash || '', payloadHash || manifest.payload_sha256 || '', JSON.stringify(manifest), packageBuffer, userId];
}
async function githubApi(repo, endpoint, options={}) {
  const token = process.env.UPDATE_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) throw new Error('Configure UPDATE_GITHUB_TOKEN no Render para aplicar atualizações automaticamente pelo GitHub.');
  const response = await fetch(`https://api.github.com/repos/${repo}${endpoint}`, { ...options, headers:{ 'Accept':'application/vnd.github+json', 'Authorization':`Bearer ${token}`, 'X-GitHub-Api-Version':'2022-11-28', ...(options.headers || {}) } });
  const text = await response.text();
  let data = {}; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw:text }; }
  if (!response.ok) throw new Error(data.message || text || `Erro GitHub ${response.status}`);
  return data;
}
async function applyUpdateViaGithub(payloadBuffer, manifest) {
  const repo = process.env.UPDATE_GITHUB_REPO || await getSetting('UPDATE_GITHUB_REPO','bmedeiros1987/vitoriaregia1');
  const branch = process.env.UPDATE_GITHUB_BRANCH || await getSetting('UPDATE_GITHUB_BRANCH','main');
  const ref = await githubApi(repo, `/git/ref/heads/${encodeURIComponent(branch)}`);
  const headSha = ref.object.sha;
  const baseCommit = await githubApi(repo, `/git/commits/${headSha}`);
  const payloadZip = new AdmZip(payloadBuffer);
  const tree = [];
  for (const entry of payloadZip.getEntries()) {
    if (entry.isDirectory) continue;
    const filePath = safeUpdatePath(entry.entryName);
    const blob = await githubApi(repo, '/git/blobs', { method:'POST', body: JSON.stringify({ content: entry.getData().toString('base64'), encoding:'base64' }) });
    tree.push({ path:filePath, mode:'100644', type:'blob', sha:blob.sha });
  }
  for (const del of Array.isArray(manifest.deletes) ? manifest.deletes : []) tree.push({ path:safeUpdatePath(del), mode:'100644', type:'blob', sha:null });
  const newTree = await githubApi(repo, '/git/trees', { method:'POST', body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree }) });
  const newCommit = await githubApi(repo, '/git/commits', { method:'POST', body: JSON.stringify({ message:`Atualização Vitória Régia ${manifest.version || manifest.update_code}`, tree:newTree.sha, parents:[headSha] }) });
  await githubApi(repo, `/git/refs/heads/${encodeURIComponent(branch)}`, { method:'PATCH', body: JSON.stringify({ sha:newCommit.sha, force:false }) });
  if (process.env.RENDER_DEPLOY_HOOK_URL) await fetch(process.env.RENDER_DEPLOY_HOOK_URL, { method:'POST' }).catch(()=>null);
  return { repo, branch, commit:newCommit.sha, files:tree.length, deployHook:Boolean(process.env.RENDER_DEPLOY_HOOK_URL) };
}
async function applyUpdateLocally(payloadBuffer) {
  if (process.env.ALLOW_RUNTIME_UPDATE !== 'true') throw new Error('Aplicação local bloqueada. Para VPS/PC, defina ALLOW_RUNTIME_UPDATE=true. No Render, use modo GitHub.');
  const target = path.resolve(process.env.UPDATE_TARGET_DIR || path.join(__dirname, '../../'));
  const payloadZip = new AdmZip(payloadBuffer);
  let written = 0;
  for (const entry of payloadZip.getEntries()) {
    if (entry.isDirectory) continue;
    const filePath = safeUpdatePath(entry.entryName);
    const dest = path.resolve(target, filePath);
    if (!dest.startsWith(target)) throw new Error('Caminho fora do sistema bloqueado.');
    await fs.mkdir(path.dirname(dest), { recursive:true });
    await fs.writeFile(dest, entry.getData());
    written++;
  }
  return { target, files:written };
}

app.get('/api/health', (_req,res)=>res.json({ ok:true, version:APP_VERSION }));
app.get('/api/public-config', async (_req,res,next)=>{ try { res.json(await publicSettingsObject()); } catch(e){ next(e); } });
app.post('/api/login', async (req,res,next)=>{ try { requireFields(req.body,['email','password']); const r=await q('SELECT * FROM users WHERE lower(email)=lower($1)',[req.body.email]); const user=r.rows[0]; if (!user || user.active === false) return res.status(401).json({ error:'Usuário não encontrado ou inativo.' }); const ok=await bcrypt.compare(req.body.password, user.password_hash || ''); if (!ok) return res.status(401).json({ error:'Senha inválida.' }); const clean=sanitizeUser(user); await q('UPDATE users SET last_login=now() WHERE id=$1',[clean.id]).catch(()=>null); const token=jwt.sign(clean, JWT_SECRET, { expiresIn:'12h' }); res.json({ token, user:clean, version:APP_VERSION }); } catch(e){ next(e); } });
app.post('/api/register', async (req,res,next)=>{ try {
  requireFields(req.body,['name','unit']);
  const emailEnabled = await featureEnabled('email'); const whatsappEnabled = await featureEnabled('whatsapp'); const telegramEnabled = await featureEnabled('telegram');
  const hasEmail = Boolean(String(req.body.email || '').trim()); const hasWhats = Boolean(onlyDigits(req.body.whatsapp_phone || req.body.phone || '')); const hasTelegram = Boolean(String(req.body.telegram_chat_id || '').trim());
  if (boolValue(await getSetting('REGISTRATION_REQUIRE_EMAIL','true'), true) && emailEnabled && !hasEmail) { const err=new Error('Informe o e-mail para solicitar cadastro.'); err.status=400; throw err; }
  if (!hasEmail && !hasWhats && !hasTelegram) { const err=new Error('Informe ao menos um contato liberado: e-mail, WhatsApp ou Telegram.'); err.status=400; throw err; }
  if (hasEmail) await requireNoDuplicate('Usuário', (await q('SELECT id,email FROM users WHERE lower(email)=lower($1) AND COALESCE(active,true)=true LIMIT 1',[req.body.email])).rows[0]);
  if (hasEmail) await requireNoDuplicate('Solicitação de cadastro', (await q("SELECT id,email,status FROM registration_requests WHERE lower(email)=lower($1) AND status='pendente' LIMIT 1",[req.body.email])).rows[0]);
  if (req.body.document) await requireNoDuplicate('Morador', (await q("SELECT id,name,unit FROM residents WHERE regexp_replace(coalesce(document,''),'\D','','g')=$1 AND COALESCE(active,true)=true LIMIT 1",[onlyDigits(req.body.document)])).rows[0]);
  if (hasWhats && !whatsappEnabled) { const err=new Error('Cadastro por WhatsApp ainda não está liberado neste condomínio.'); err.status=400; throw err; }
  if (hasTelegram && !telegramEnabled) { const err=new Error('Cadastro por Telegram ainda não está liberado neste condomínio.'); err.status=400; throw err; }
  const channels = await filterChannelsByPlan({ email:hasEmail, whatsapp:hasWhats, telegram:hasTelegram, app:true, browser:true });
  const r=await q('INSERT INTO registration_requests(name,email,phone,whatsapp_phone,telegram_chat_id,preferred_channels,unit,document,role,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,status', [req.body.name, req.body.email || '', req.body.phone || req.body.whatsapp_phone || '', req.body.whatsapp_phone || req.body.phone || '', req.body.telegram_chat_id || '', JSON.stringify(channels), req.body.unit || '', req.body.document || '', req.body.role || 'morador', req.body.notes || '']);
  await audit(req.body.email || req.body.phone || req.body.telegram_chat_id || 'cadastro', 'solicitou cadastro', req.body.unit || '');
  res.json({ ok:true, message:'Solicitação enviada para aprovação do síndico.', request:r.rows[0] });
} catch(e){ next(e); } });
app.post('/api/forgot-password', async (req,res,next)=>{ try {
  requireFields(req.body,['email']);
  const r=await q('SELECT * FROM users WHERE lower(email)=lower($1)',[req.body.email]);
  if (r.rowCount) {
    const user=r.rows[0];
    const temp=randomCode(8);
    await q('UPDATE users SET password_hash=$1, force_password_change=true WHERE id=$2',[await bcrypt.hash(temp,10), user.id]);
    await q("INSERT INTO password_resets(user_id,token,temp_password,expires_at) VALUES($1,$2,$3,now()+interval '24 hours')",[user.id, randomCode(24), temp]);
    await sendTemporaryPasswordToUser(user, temp, 'Senha temporária - Vitória Régia').catch(()=>null);
  }
  res.json({ ok:true, message:'Se o e-mail existir, uma senha temporária será enviada pelos canais configurados.' });
} catch(e){ next(e); } });
app.get('/api/me', auth, (req,res)=>res.json({ user:req.user, permissions:ALL_PERMISSIONS, version:APP_VERSION }));

app.get('/api/profile', auth, async (req,res,next)=>{ try {
  const user=(await q('SELECT * FROM users WHERE id=$1',[req.user.id])).rows[0];
  const resident=user?.resident_id ? (await q('SELECT * FROM residents WHERE id=$1 AND COALESCE(active,true)=true',[user.resident_id])).rows[0] : null;
  res.json({ user:sanitizeUser(user || req.user), resident });
} catch(e){ next(e); } });
app.put('/api/profile', auth, async (req,res,next)=>{ try {
  const body=req.body || {};
  const user=(await q('SELECT * FROM users WHERE id=$1',[req.user.id])).rows[0];
  if (!user) return res.status(404).json({ error:'Usuário não encontrado.' });
  const prefs=await filterChannelsByPlan(body.notification_preferences || parseJson(user.notification_preferences, {}));
  await q("UPDATE users SET name=$1,email=COALESCE(NULLIF($2,''),email),phone=$3,whatsapp_phone=$4,telegram_chat_id=$5,notification_preferences=$6 WHERE id=$7",[body.name||user.name, body.email||user.email, body.phone||'', body.whatsapp_phone||body.phone||'', body.telegram_chat_id||'', JSON.stringify(prefs), user.id]);
  if (user.resident_id) await q("UPDATE residents SET name=$1,email=COALESCE(NULLIF($2,''),email),phone=$3,whatsapp_phone=$4,telegram_chat_id=$5,unit=COALESCE(NULLIF($6,''),unit),vehicle=$7,document=COALESCE(NULLIF($8,''),document),notification_preferences=$9 WHERE id=$10",[body.name||user.name, body.email||user.email, body.phone||'', body.whatsapp_phone||body.phone||'', body.telegram_chat_id||'', body.unit||'', body.vehicle||'', body.document||'', JSON.stringify(prefs), user.resident_id]);
  await audit(req.user.email,'atualizou perfil','próprio');
  res.json({ ok:true });
} catch(e){ next(e); } });


app.get('/api/dashboard', auth, can('dashboard.view'), async (req,res,next)=>{ try { const own = isResident(req.user) && req.user.resident_id; const [residents, packagesTotal, packagesPending, visitorsToday, reservationsPending, messagesNew, emergencyPending, boletosPending, weather] = await Promise.all([
  q('SELECT COUNT(*)::int count FROM residents WHERE COALESCE(active,true)=true'), q(own?'SELECT COUNT(*)::int count FROM packages WHERE resident_id=$1 AND deleted_at IS NULL':'SELECT COUNT(*)::int count FROM packages WHERE deleted_at IS NULL', own?[req.user.resident_id]:[]), q(own?"SELECT COUNT(*)::int count FROM packages WHERE resident_id=$1 AND deleted_at IS NULL AND status <> 'entregue'":"SELECT COUNT(*)::int count FROM packages WHERE deleted_at IS NULL AND status <> 'entregue'", own?[req.user.resident_id]:[]), q("SELECT COUNT(*)::int count FROM visitors WHERE deleted_at IS NULL AND created_at::date=current_date"), q("SELECT COUNT(*)::int count FROM reservations WHERE deleted_at IS NULL AND status='pre_agendada'"), q(own?"SELECT COUNT(*)::int count FROM messages WHERE resident_id=$1 AND status <> 'fechada'":"SELECT COUNT(*)::int count FROM messages WHERE status='nova'", own?[req.user.resident_id]:[]), q("SELECT COUNT(*)::int count FROM emergency_requests WHERE status='pendente'"), q(own?"SELECT COUNT(*)::int count FROM boletos WHERE resident_id=$1 AND deleted_at IS NULL AND status <> 'pago'":"SELECT COUNT(*)::int count FROM boletos WHERE deleted_at IS NULL AND status <> 'pago'", own?[req.user.resident_id]:[]), getWeatherSafe()
]);
  res.json({ version:APP_VERSION, metrics:{ residents:residents.rows[0].count, packages:packagesTotal.rows[0].count, pendingPackages:packagesPending.rows[0].count, visitorsToday:visitorsToday.rows[0].count, reservationsPending:reservationsPending.rows[0].count, messagesNew:messagesNew.rows[0].count, emergencyPending:emergencyPending.rows[0].count, boletosPending:boletosPending.rows[0].count }, weather }); } catch(e){ next(e); } });


app.get('/api/residents/lookup', auth, can('residents.view'), async (req,res,next)=>{ try {
  const unit=req.query.unit || ''; const recipient=req.query.recipient || req.query.name || '';
  const residents=await lookupResidentsForUnit({ unit, recipient });
  let primary=residents[0] || null;
  if (!primary && unit) primary=await findResident({ unit, recipient });
  res.json({ residents, primary, allowMultipleResidentsPerUnit: boolValue(await getSetting('ALLOW_MULTIPLE_RESIDENTS_PER_UNIT','false'), false) });
} catch(e){ next(e); } });
app.get('/api/residents', auth, can('residents.view'), async (req,res,next)=>{ try {
  if (isResident(req.user) && req.user.resident_id) return res.json((await q('SELECT * FROM residents WHERE id=$1 AND COALESCE(active,true)=true',[req.user.resident_id])).rows);
  res.json((await q('SELECT * FROM residents WHERE COALESCE(active,true)=true ORDER BY id DESC')).rows);
} catch(e){ next(e); } });
app.post('/api/residents', auth, can('residents.manage'), async (req,res,next)=>{ try {
  requireFields(req.body,['name','unit']);
  await requireNoDuplicate('Morador', await residentDuplicate(req.body));
  const prefs = await filterChannelsByPlan(req.body.notification_preferences || { app:true, browser:true, email:Boolean(req.body.email), telegram:Boolean(req.body.telegram_chat_id), whatsapp:Boolean(req.body.whatsapp_phone || req.body.phone) });
  const r=await q('INSERT INTO residents(name,unit,phone,whatsapp_phone,email,document,vehicle,notes,access_profile,access_permissions,telegram_chat_id,notification_preferences,resident_tags) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *', [req.body.name, req.body.unit, req.body.phone||'', req.body.whatsapp_phone||req.body.phone||'', req.body.email||'', req.body.document||'', req.body.vehicle||'', req.body.notes||'', req.body.access_profile||'morador', JSON.stringify(req.body.access_permissions || rolePermissions('morador')), req.body.telegram_chat_id||'', JSON.stringify(prefs), JSON.stringify(req.body.resident_tags || {})]);
  await audit(req.user.email,'criou morador',req.body.name);
  res.json(r.rows[0]);
} catch(e){ next(e); } });
app.put('/api/residents/:id', auth, can('residents.manage'), async (req,res,next)=>{ try {
  requireFields(req.body,['name','unit']);
  await requireNoDuplicate('Morador', await residentDuplicate(req.body, req.params.id));
  const prefs = await filterChannelsByPlan(req.body.notification_preferences || { app:true, browser:true, email:Boolean(req.body.email), telegram:Boolean(req.body.telegram_chat_id), whatsapp:Boolean(req.body.whatsapp_phone || req.body.phone) });
  const r=await q('UPDATE residents SET name=$1,unit=$2,phone=$3,whatsapp_phone=$4,email=$5,document=$6,vehicle=$7,notes=$8,access_profile=$9,access_permissions=$10,telegram_chat_id=$11,notification_preferences=$12,resident_tags=$13 WHERE id=$14 RETURNING *', [req.body.name, req.body.unit, req.body.phone||'', req.body.whatsapp_phone||req.body.phone||'', req.body.email||'', req.body.document||'', req.body.vehicle||'', req.body.notes||'', req.body.access_profile||'morador', JSON.stringify(req.body.access_permissions || {}), req.body.telegram_chat_id||'', JSON.stringify(prefs), JSON.stringify(req.body.resident_tags || {}), req.params.id]);
  res.json(r.rows[0]||{});
} catch(e){ next(e); } });
app.delete('/api/residents/:id', auth, can('residents.manage'), async (req,res,next)=>{ try { await q('UPDATE residents SET active=false,deleted_at=now() WHERE id=$1',[req.params.id]); await audit(req.user.email,'removeu morador',req.params.id); res.json({ ok:true }); } catch(e){ next(e); } });

app.get('/api/users', auth, can('users.manage'), async (req,res,next)=>{ try { const sql=isMaster(req.user) ? 'SELECT * FROM users WHERE COALESCE(active,true)=true ORDER BY id DESC' : "SELECT * FROM users WHERE role <> 'master' AND COALESCE(active,true)=true ORDER BY id DESC"; res.json((await q(sql)).rows.map(sanitizeUser)); } catch(e){ next(e); } });
app.post('/api/users', auth, can('users.manage'), async (req,res,next)=>{ try {
  requireFields(req.body,['name','role']);
  const role=req.body.role || 'morador';
  if (role === 'master' && !isMaster(req.user)) return res.status(403).json({ error:'Somente Bruno pode criar outro administrador técnico.' });
  const userType=req.body.user_type || role; const password=req.body.password || randomCode(8);
  const resident_id = ['funcionario','portaria','financeiro'].includes(role) ? null : (req.body.resident_id || null);
  const unit = (role === 'sindico' && req.body.is_outsourced) || ['funcionario','portaria','financeiro'].includes(role) ? '' : (req.body.unit || '');
  const perms=normalizePermissions(req.body.permissions || {}, role);
  const email = loginEmailFromChannels(req.body);
  await requireNoDuplicate('Usuário', await userDuplicate({ ...req.body, email }));
  const prefs = await filterChannelsByPlan(req.body.notification_preferences || { app:true,browser:true,email:Boolean(req.body.email),telegram:Boolean(req.body.telegram_chat_id),whatsapp:Boolean(req.body.whatsapp_phone || req.body.phone) });
  const r=await q('INSERT INTO users(name,email,password_hash,role,user_type,is_outsourced,unit,permissions,resident_id,employee_id,phone,whatsapp_phone,telegram_chat_id,notification_preferences,active,force_password_change) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *', [req.body.name, email, await bcrypt.hash(password,10), role, userType, req.body.is_outsourced===true, unit, JSON.stringify(perms), resident_id, req.body.employee_id || null, req.body.phone||req.body.whatsapp_phone||'', req.body.whatsapp_phone||req.body.phone||'', req.body.telegram_chat_id||'', JSON.stringify(prefs), req.body.active !== false, Boolean(!req.body.password)]);
  await audit(req.user.email,'criou usuário',email);
  if (!req.body.password) {
    if (req.body.email) await sendEmailSmart({ to:req.body.email, subject:'Acesso Vitória Régia', text:`Seu acesso foi criado. Usuário: ${email}. Senha temporária: ${password}` }).catch(()=>null);
    if (req.body.telegram_chat_id) await sendTelegramMessage(req.body.telegram_chat_id, `Seu acesso Vitória Régia foi criado. Usuário: ${email}. Senha temporária: ${password}`).catch(()=>null);
    if (req.body.whatsapp_phone || req.body.phone) await sendWhatsAppText(req.body.whatsapp_phone || req.body.phone, `Seu acesso Vitória Régia foi criado. Usuário: ${email}. Senha temporária: ${password}`).catch(()=>null);
  }
  res.json({ user:sanitizeUser(r.rows[0]), temp_password_sent: !req.body.password });
} catch(e){ next(e); } });
app.put('/api/users/:id', auth, can('users.manage'), async (req,res,next)=>{ try { const role=req.body.role||'morador'; if (role === 'master' && !isMaster(req.user)) return res.status(403).json({ error:'Somente Bruno pode alterar administrador técnico.' }); const perms=normalizePermissions(req.body.permissions||{},role); const resident_id=['funcionario','portaria','financeiro'].includes(role) ? null : (req.body.resident_id || null); const unit=(role==='sindico' && req.body.is_outsourced) || ['funcionario','portaria','financeiro'].includes(role) ? '' : (req.body.unit || ''); await requireNoDuplicate('Usuário', await userDuplicate(req.body, req.params.id)); const prefs=await filterChannelsByPlan(req.body.notification_preferences || {}); let sql='UPDATE users SET name=$1,email=$2,role=$3,user_type=$4,is_outsourced=$5,unit=$6,permissions=$7,resident_id=$8,employee_id=$9,phone=$10,whatsapp_phone=$11,telegram_chat_id=$12,notification_preferences=$13,active=$14'; const params=[req.body.name,loginEmailFromChannels(req.body),role,req.body.user_type||role,req.body.is_outsourced===true,unit,JSON.stringify(perms),resident_id,req.body.employee_id||null,req.body.phone||req.body.whatsapp_phone||'',req.body.whatsapp_phone||req.body.phone||'',req.body.telegram_chat_id||'',JSON.stringify(prefs),req.body.active!==false]; if (req.body.password) { params.push(await bcrypt.hash(req.body.password,10)); sql += `,password_hash=$${params.length},force_password_change=false`; } params.push(req.params.id); sql += ` WHERE id=$${params.length} RETURNING *`; const r=await q(sql,params); await audit(req.user.email,'alterou usuário',req.body.email||req.body.phone||req.params.id); res.json(sanitizeUser(r.rows[0])); } catch(e){ next(e); } });

app.delete('/api/users/:id', auth, can('users.manage'), async (req,res,next)=>{ try {
  const existing=(await q('SELECT * FROM users WHERE id=$1',[req.params.id])).rows[0];
  if (!existing) return res.status(404).json({ error:'Usuário não encontrado.' });
  if ((existing.role === 'master' || existing.role === 'admin') && !isMaster(req.user)) return res.status(403).json({ error:'Somente Bruno pode remover este usuário.' });
  await q('UPDATE users SET active=false WHERE id=$1',[req.params.id]);
  await audit(req.user.email,'removeu usuário',existing.email || req.params.id);
  res.json({ ok:true });
} catch(e){ next(e); } });
app.post('/api/users/:id/reset-password', auth, can('users.manage'), async (req,res,next)=>{ try {
  const temp=randomCode(8);
  const r=await q('SELECT * FROM users WHERE id=$1',[req.params.id]);
  if (!r.rowCount) return res.status(404).json({ error:'Usuário não encontrado.' });
  const user=r.rows[0];
  await q('UPDATE users SET password_hash=$1,force_password_change=true WHERE id=$2',[await bcrypt.hash(temp,10), user.id]);
  await q("INSERT INTO password_resets(user_id,token,temp_password,expires_at) VALUES($1,$2,$3,now()+interval '24 hours')",[user.id, randomCode(24), temp]);
  await sendTemporaryPasswordToUser(user, temp, 'Senha temporária - Vitória Régia').catch(()=>null);
  await createNotification({ user_id:user.id, title:'Senha temporária criada', body:'Uma senha temporária foi enviada pelos canais configurados.', channel:'app' }).catch(()=>null);
  await audit(req.user.email,'resetou senha',user.email || user.phone || String(user.id));
  res.json({ ok:true, message:'Senha temporária gerada e enviada somente ao usuário.' });
} catch(e){ next(e); } });

app.get('/api/registration-requests', auth, can('users.manage'), async (_req,res,next)=>{ try { res.json((await q('SELECT * FROM registration_requests ORDER BY id DESC')).rows); } catch(e){ next(e); } });
app.post('/api/registration-requests/:id/approve', auth, can('users.manage'), async (req,res,next)=>{ try { const rr=(await q('SELECT * FROM registration_requests WHERE id=$1',[req.params.id])).rows[0]; if (!rr) return res.status(404).json({ error:'Solicitação não encontrada.' }); let resident=await findResident({ unit: rr.unit, recipient: rr.name }); const prefs=await filterChannelsByPlan(parseJson(rr.preferred_channels,{ email:Boolean(rr.email), whatsapp:Boolean(rr.whatsapp_phone || rr.phone), telegram:Boolean(rr.telegram_chat_id), app:true, browser:true })); if (!resident) resident=(await q('INSERT INTO residents(name,unit,phone,whatsapp_phone,email,document,telegram_chat_id,notification_preferences) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[rr.name,rr.unit,rr.phone||rr.whatsapp_phone||'',rr.whatsapp_phone||rr.phone||'',rr.email||'',rr.document,rr.telegram_chat_id||'',JSON.stringify(prefs)])).rows[0]; const temp=randomCode(8); const email=loginEmailFromChannels(rr); const user=(await q('INSERT INTO users(name,email,password_hash,role,user_type,unit,resident_id,phone,whatsapp_phone,telegram_chat_id,notification_preferences,permissions,active,force_password_change) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,true) ON CONFLICT(email) DO UPDATE SET active=true,resident_id=EXCLUDED.resident_id RETURNING *',[rr.name,email,await bcrypt.hash(temp,10),rr.role||'morador',rr.role||'morador',rr.unit,resident.id,rr.phone||rr.whatsapp_phone||'',rr.whatsapp_phone||rr.phone||'',rr.telegram_chat_id||'',JSON.stringify(prefs),JSON.stringify(rolePermissions(rr.role||'morador'))])).rows[0]; await q("UPDATE registration_requests SET status='aprovada',approved_by=$1,approved_at=now() WHERE id=$2",[req.user.id,rr.id]); if (prefs.email && rr.email) await sendEmailSmart({ to:rr.email, subject:'Cadastro aprovado - Vitória Régia', text:`Seu cadastro foi aprovado. Usuário: ${email}. Senha temporária: ${temp}` }).catch(()=>null); if (prefs.telegram && rr.telegram_chat_id) await sendTelegramMessage(rr.telegram_chat_id, `Cadastro aprovado no Vitória Régia. Usuário: ${email}. Senha temporária: ${temp}`).catch(()=>null); if (prefs.whatsapp && (rr.whatsapp_phone || rr.phone)) await sendWhatsAppText(rr.whatsapp_phone || rr.phone, `Cadastro aprovado no Vitória Régia. Usuário: ${email}. Senha temporária: ${temp}`).catch(()=>null); await audit(req.user.email,'aprovou cadastro',email); res.json({ ok:true, user:sanitizeUser(user) }); } catch(e){ next(e); } });
app.post('/api/registration-requests/:id/reject', auth, can('users.manage'), async (req,res,next)=>{ try { await q("UPDATE registration_requests SET status='rejeitada',approved_by=$1,approved_at=now(),notes=COALESCE(notes,'') || $2 WHERE id=$3",[req.user.id, `\nRejeitada: ${req.body.note||''}`, req.params.id]); res.json({ ok:true }); } catch(e){ next(e); } });

app.get('/api/employees', auth, can('employees.manage'), async (_req,res,next)=>{ try { res.json((await q('SELECT * FROM employees ORDER BY active DESC,name')).rows); } catch(e){ next(e); } });
app.post('/api/employees', auth, can('employees.manage'), async (req,res,next)=>{ try { requireFields(req.body,['name']); const r=await q('INSERT INTO employees(name,role,phone,email,active,notes) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[req.body.name,req.body.role||'portaria',req.body.phone||'',req.body.email||'',req.body.active!==false,req.body.notes||'']); res.json(r.rows[0]); } catch(e){ next(e); } });
app.get('/api/shifts', auth, can('shifts.manage'), async (_req,res,next)=>{ try { res.json((await q('SELECT s.*, e.name employee_name FROM shifts s LEFT JOIN employees e ON e.id=s.employee_id ORDER BY starts_at DESC LIMIT 200')).rows); } catch(e){ next(e); } });
app.post('/api/shifts', auth, can('shifts.manage'), async (req,res,next)=>{ try { requireFields(req.body,['employee_id','starts_at','ends_at']); const r=await q('INSERT INTO shifts(employee_id,role,starts_at,ends_at,status,notes) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[req.body.employee_id,req.body.role||'portaria',req.body.starts_at,req.body.ends_at,req.body.status||'programada',req.body.notes||'']); res.json(r.rows[0]); } catch(e){ next(e); } });
app.get('/api/shifts/on-duty', auth, async (req,res,next)=>{ try { res.json(await currentOnDuty(req.query.role || 'portaria') || {}); } catch(e){ next(e); } });

app.get('/api/messages', auth, async (req,res,next)=>{ try { if (isResident(req.user) && req.user.resident_id) return res.json((await q('SELECT m.*, e.name employee_name FROM messages m LEFT JOIN employees e ON e.id=m.assigned_employee_id WHERE m.resident_id=$1 ORDER BY m.id DESC',[req.user.resident_id])).rows); res.json((await q('SELECT m.*, e.name employee_name, r.name resident_name FROM messages m LEFT JOIN employees e ON e.id=m.assigned_employee_id LEFT JOIN residents r ON r.id=m.resident_id ORDER BY m.id DESC LIMIT 200')).rows); } catch(e){ next(e); } });
app.post('/api/messages', auth, async (req,res,next)=>{ try { requireFields(req.body,['subject','body']); const resident=await findResident({ resident_id:req.user.resident_id, unit:req.body.unit, user_id:req.user.id }); const duty=await currentOnDuty('portaria'); const r=await q('INSERT INTO messages(resident_id,user_id,unit,subject,body,assigned_employee_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[resident?.id||req.user.resident_id||null,req.user.id,req.body.unit||resident?.unit||'',req.body.subject,req.body.body,duty?.employee_id||null]); if (duty?.employee_email) await sendEmailSmart({ to:duty.employee_email, subject:`Mensagem do morador - ${req.body.subject}`, text:req.body.body }).catch(()=>null); await createNotification({ title:'Nova mensagem de morador', body:`${req.body.subject} - Unidade ${req.body.unit || resident?.unit || '-'}`, user_id:null, channel:'app', payload:{ message_id:r.rows[0].id, employee_id:duty?.employee_id||null } }).catch(()=>null); res.json({ ...r.rows[0], assigned_employee:duty?.employee_name||null }); } catch(e){ next(e); } });
app.post('/api/messages/:id/respond', auth, can('messages.manage'), async (req,res,next)=>{ try {
  requireFields(req.body,['response']);
  const r=await q("UPDATE messages SET status='respondida',response=$1,responded_by=$2,responded_at=now() WHERE id=$3 RETURNING *",[req.body.response,req.user.email,req.params.id]);
  const msg=r.rows[0];
  if (msg?.resident_id) {
    const resident=(await q('SELECT * FROM residents WHERE id=$1 AND COALESCE(active,true)=true',[msg.resident_id])).rows[0];
    const baseUrl=String(process.env.APP_PUBLIC_URL || process.env.PUBLIC_APP_URL || '').replace(/\/$/,'');
    await notifyResident(resident,{ title:'Resposta da portaria', body:req.body.response, channels:{ app:true,browser:true,telegram:true,email:false,whatsapp:false }, action_url:'/#/comunicacao', payload:{ message_id:msg.id, telegram_reply_markup:{ inline_keyboard:[[ { text:'Confirmar recebimento', callback_data:`msg:${msg.id}:recebido` }, ...(baseUrl ? [{ text:'Responder no sistema', url:`${baseUrl}/#/comunicacao` }] : []) ]] } } }).catch(()=>null);
  }
  res.json(msg || {});
} catch(e){ next(e); } });

app.get('/api/packages', auth, can('packages.view'), async (req,res,next)=>{ try { if (isResident(req.user) && req.user.resident_id) return res.json((await q('SELECT * FROM packages WHERE resident_id=$1 AND deleted_at IS NULL ORDER BY id DESC',[req.user.resident_id])).rows); res.json((await q('SELECT p.*, r.name resident_name, r.email resident_email, r.whatsapp_phone FROM packages p LEFT JOIN residents r ON r.id=p.resident_id WHERE p.deleted_at IS NULL ORDER BY p.id DESC')).rows); } catch(e){ next(e); } });
app.post('/api/packages', auth, can('packages.manage'), async (req,res,next)=>{ try { requireFields(req.body,['tracking','recipient','unit']); await requireNoDuplicate('Encomenda', await packageDuplicate(req.body)); const resident=await findResident(req.body); const pickup=randomCode(6); const channels={ app:true, browser:true, ...parseJson(await getSetting('DELIVERY_DEFAULT_CHANNELS','{}'),{}), ...(req.body.notification_channels || {}) }; const r=await q('INSERT INTO packages(tracking,recipient,unit,resident_id,label,notes,extracted_text,pickup_code,notification_channels,notification_status,photo_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',[req.body.tracking,req.body.recipient,req.body.unit,resident?.id||null,req.body.label||req.body.tracking,req.body.notes||'',req.body.extracted_text||'',pickup,JSON.stringify(channels),resident?'enviando':'sem_vinculo',req.body.photo_url||'']); const pack=r.rows[0]; const action_url=`/#/encomendas?package=${pack.id}`; const body=`Sua encomenda ${pack.tracking} chegou na portaria. Código de retirada: ${pickup}. Responda no app se deseja receber pelo elevador ou retirar na portaria.`; if (resident) await notifyResident(resident,{ title:'Encomenda chegou', body, channels, action_url, payload:{ package_id:pack.id, pickup_code:pickup, telegram_reply_markup:{ inline_keyboard:[[ { text:'Receber pelo elevador', callback_data:`pkg:${pack.id}:receber_elevador` }, { text:'Buscar na portaria', callback_data:`pkg:${pack.id}:retirar_portaria` } ]] } } }).catch(()=>null); await audit(req.user.email,'registrou encomenda',`${pack.tracking} ${resident?'vinculada':'sem vínculo'}`); await q("UPDATE packages SET notification_status='enviada' WHERE id=$1",[pack.id]).catch(()=>null); res.json({ ...pack, resident, linked:Boolean(resident) }); } catch(e){ next(e); } });
app.post('/api/packages/:id/preference', auth, async (req,res,next)=>{ try { const preference=req.body.delivery_preference || req.body.preference || 'retirar_portaria'; const r=await q('UPDATE packages SET delivery_preference=$1,resident_response_at=now() WHERE id=$2 RETURNING *',[preference,req.params.id]); await notifyStaff({ title:'Preferência de entrega informada', body:`Encomenda ${r.rows[0]?.tracking || req.params.id}: ${preference}`, action_url:`/#/encomendas` }).catch(()=>null); res.json(r.rows[0]||{}); } catch(e){ next(e); } });
app.post('/api/packages/:id/deliver', auth, can('packages.manage'), async (req,res,next)=>{ try { const r=await q("UPDATE packages SET status='entregue',delivered_at=now() WHERE id=$1 RETURNING *",[req.params.id]); await audit(req.user.email,'entregou encomenda',req.params.id); res.json(r.rows[0]||{}); } catch(e){ next(e); } });
app.delete('/api/packages/:id', auth, can('packages.manage'), async (req,res,next)=>{ try { await q("UPDATE packages SET status='removida',deleted_at=now() WHERE id=$1",[req.params.id]); await audit(req.user.email,'removeu encomenda',req.params.id); res.json({ ok:true }); } catch(e){ next(e); } });
app.post('/api/ocr/parse-package', auth, can('packages.manage'), async (req,res)=>res.json(parsePackageText(req.body.text || '')));
app.post('/api/ocr/parse-invoice', auth, can('invoices.manage'), async (req,res)=>res.json(parseInvoiceText(req.body.text || '')));

app.get('/api/visitors', auth, can('visitors.view'), async (req,res,next)=>{ try { const unit=req.query.unit || ''; const params=[]; let where='WHERE deleted_at IS NULL'; if (unit) { params.push(unit); where+=' AND lower(unit)=lower($1)'; } res.json((await q(`SELECT * FROM visitors ${where} ORDER BY id DESC LIMIT 300`, params)).rows); } catch(e){ next(e); } });
app.post('/api/visitors', auth, can('visitors.manage'), async (req,res,next)=>{ try { requireFields(req.body,['name','unit']); const r=await q('INSERT INTO visitors(name,document,unit,authorized_by,status,plate,phone,recurring,weekdays,valid_from,valid_until,announce_required,announcement_channel,notification_channels,photo_data,reservation_id,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *',[req.body.name,req.body.document||'',req.body.unit,req.body.authorized_by||'',req.body.status||'autorizado',req.body.plate||'',req.body.phone||'',req.body.recurring===true,JSON.stringify(req.body.weekdays||[]),req.body.valid_from||null,req.body.valid_until||null,req.body.announce_required!==false,req.body.announcement_channel||'interfone',JSON.stringify(req.body.notification_channels||{}),req.body.photo_data||'',req.body.reservation_id||null,req.body.notes||'']); await audit(req.user.email,'autorizou visitante',req.body.name); res.json(r.rows[0]); } catch(e){ next(e); } });
app.delete('/api/visitors/:id', auth, can('visitors.manage'), async (req,res,next)=>{ try { await q("UPDATE visitors SET deleted_at=now(), status='removido' WHERE id=$1",[req.params.id]); res.json({ ok:true }); } catch(e){ next(e); } });

app.get('/api/common-areas', auth, async (_req,res,next)=>{ try { res.json((await q('SELECT * FROM common_areas WHERE active=true ORDER BY name')).rows); } catch(e){ next(e); } });
app.post('/api/common-areas', auth, can('settings.manage'), async (req,res,next)=>{ try { requireFields(req.body,['name']); const r=await q('INSERT INTO common_areas(name,fee_amount,rules_document,active,requires_approval,max_guests,count_children,count_infants) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(name) DO UPDATE SET fee_amount=$2,rules_document=$3,active=$4,requires_approval=$5,max_guests=$6,count_children=$7,count_infants=$8 RETURNING *',[req.body.name,req.body.fee_amount||0,req.body.rules_document||'',req.body.active!==false,req.body.requires_approval!==false,req.body.max_guests||30,req.body.count_children!==false,req.body.count_infants===true]); res.json(r.rows[0]); } catch(e){ next(e); } });
app.delete('/api/common-areas/:id', auth, can('settings.manage'), async (req,res,next)=>{ try { await q('UPDATE common_areas SET active=false WHERE id=$1',[req.params.id]); await audit(req.user.email,'removeu área de lazer',req.params.id); res.json({ ok:true }); } catch(e){ next(e); } });

app.get('/api/reservations', auth, can('reservations.view'), async (req,res,next)=>{ try {
  const own = isResident(req.user) && req.user.resident_id;
  const rows = own
    ? (await q('SELECT r.*, b.digitable_line, b.payment_link FROM reservations r LEFT JOIN boletos b ON b.id=r.boleto_id WHERE r.resident_id=$1 AND r.deleted_at IS NULL ORDER BY reserved_for DESC NULLS LAST,id DESC',[req.user.resident_id])).rows
    : (await q('SELECT r.*, b.digitable_line, b.payment_link FROM reservations r LEFT JOIN boletos b ON b.id=r.boleto_id WHERE r.deleted_at IS NULL ORDER BY reserved_for DESC NULLS LAST,id DESC')).rows;
  const ids = rows.map(r=>r.id);
  let visitorsBy = {};
  if (ids.length) {
    const visitors = (await q('SELECT * FROM reservation_visitors WHERE reservation_id = ANY($1::int[]) ORDER BY id DESC',[ids])).rows;
    visitorsBy = visitors.reduce((acc,v)=>{ (acc[v.reservation_id] ||= []).push(v); return acc; }, {});
  }
  res.json(rows.map(r => ({ ...r, visitors: visitorsBy[r.id] || [] })));
} catch(e){ next(e); } });
app.post('/api/reservations', auth, can('reservations.manage'), async (req,res,next)=>{ try {
  requireFields(req.body,['area','unit','resident','reserved_for','start_time','end_time']);
  await requireNoDuplicate('Reserva', await reservationDuplicate(req.body));
  const resident=await findResident({ resident_id:req.user.resident_id, unit:req.body.unit, recipient:req.body.resident });
  const area=(await q('SELECT * FROM common_areas WHERE lower(name)=lower($1) LIMIT 1',[req.body.area])).rows[0];
  const start=req.body.start_time || '19:00'; const end=req.body.end_time || '23:00';
  const fee=Number(req.body.fee_amount ?? area?.fee_amount ?? 0);
  const termsAccepted=req.body.terms_accepted===true;
  let status = req.body.status || 'pre_agendada';
  if (!termsAccepted) status='pendente_aceite_regras';
  else if (fee > 0) status='pendente_pagamento';
  const r=await q('INSERT INTO reservations(area,area_id,unit,resident,resident_id,reserved_for,start_time,end_time,shift,status,fee_amount,document_text,terms_accepted,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *',[req.body.area,area?.id||null,req.body.unit,req.body.resident||resident?.name||req.user.name,resident?.id||req.user.resident_id||null,req.body.reserved_for,start,end,req.body.shift||'noite',status,fee,req.body.document_text || area?.rules_document || await getSetting('RESERVATION_DEFAULT_RULES'),termsAccepted,req.user.id]);
  let reserva=r.rows[0];
  if (fee > 0) {
    const boleto=await createBoleto({ unit:reserva.unit, resident_id:reserva.resident_id, title:`Taxa de reserva - ${reserva.area}`, amount:fee, due_date:req.body.due_date || reserva.reserved_for, source_type:'reservation', source_id:reserva.id });
    await q('UPDATE reservations SET boleto_id=$1 WHERE id=$2',[boleto.id,reserva.id]);
    await q('INSERT INTO finance(title,amount,type,status,due_date,unit,resident_id,category,boleto_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [`Taxa de reserva - ${reserva.area}`, fee, 'receita', 'pendente', boleto.due_date, reserva.unit, reserva.resident_id, 'reserva', boleto.id]);
    reserva={...reserva,boleto_id:boleto.id,digitable_line:boleto.digitable_line,payment_link:boleto.payment_link};
  }
  await notifyReservationUpdate(reserva,'pre_agendada').catch(()=>null);
  if (status === 'pendente_aceite_regras') await notifyReservationUpdate(reserva,'pendente_aceite_regras').catch(()=>null);
  if (status === 'pendente_pagamento') await notifyReservationUpdate(reserva,'pendente_pagamento').catch(()=>null);
  await audit(req.user.email,'criou reserva',req.body.area);
  res.json({ ...reserva, google_calendar_url: googleCalendarUrl(reserva) });
} catch(e){ if (/idx_reservation_slot|duplicate key/i.test(String(e.message))) return res.status(409).json({ error:'Essa data e horário já estão bloqueados para o espaço selecionado.' }); next(e); } });
app.post('/api/reservations/:id/status', auth, can('reservations.manage'), async (req,res,next)=>{ try {
  const status = String(req.body.status || '').trim();
  if (!['pre_agendada','pendente_pagamento','pendente_aceite_regras','confirmada','cancelada'].includes(status)) return res.status(400).json({ error:'Status inválido para reserva.' });
  const r=await q('UPDATE reservations SET status=$1, cancel_reason=CASE WHEN $1=$2 THEN $3 ELSE cancel_reason END, canceled_at=CASE WHEN $1=$2 THEN now() ELSE canceled_at END, approved_by=CASE WHEN $1=$4 THEN $5 ELSE approved_by END, approved_at=CASE WHEN $1=$4 THEN now() ELSE approved_at END WHERE id=$6 RETURNING *',[status,'cancelada',req.body.reason||'', 'confirmada', req.user.id, req.params.id]);
  const reserva=r.rows[0]; if (!reserva) return res.status(404).json({ error:'Reserva não encontrada.' });
  await notifyReservationUpdate(reserva,status,{ cancel_reason:req.body.reason||reserva.cancel_reason }).catch(()=>null);
  await audit(req.user.email,'atualizou reserva',`${req.params.id}:${status}`);
  res.json(reserva);
} catch(e){ next(e); } });
app.post('/api/reservations/:id/cancel', auth, can('reservations.manage'), async (req,res,next)=>{ try {
  const r=await q("UPDATE reservations SET status='cancelada',cancel_reason=$1,canceled_at=now() WHERE id=$2 RETURNING *",[req.body.reason||'',req.params.id]);
  const reserva=r.rows[0]; if (reserva) await notifyReservationUpdate(reserva,'cancelada',{ cancel_reason:req.body.reason||'' }).catch(()=>null);
  await audit(req.user.email,'cancelou reserva',req.params.id); res.json(reserva||{});
} catch(e){ next(e); } });
app.delete('/api/reservations/:id', auth, can('reservations.manage'), async (req,res,next)=>{ try { await q("UPDATE reservations SET status='cancelada',deleted_at=now(),cancel_reason=COALESCE(NULLIF($1,''),cancel_reason),canceled_at=now() WHERE id=$2",[req.body?.reason||'Removida pelo sistema',req.params.id]); await audit(req.user.email,'removeu reserva',req.params.id); res.json({ ok:true }); } catch(e){ next(e); } });
app.post('/api/reservations/:id/approve', auth, can('reservations.manage'), async (req,res,next)=>{ try {
  const r=await q("UPDATE reservations SET status='confirmada',approved_by=$1,approved_at=now() WHERE id=$2 RETURNING *",[req.user.id,req.params.id]);
  const reserva=r.rows[0]; if (reserva) await notifyReservationUpdate(reserva,'confirmada').catch(()=>null);
  res.json(reserva || {});
} catch(e){ next(e); } });
app.get('/api/reservations/:id/google', auth, can('reservations.view'), async (req,res,next)=>{ try { const r=(await q('SELECT * FROM reservations WHERE id=$1',[req.params.id])).rows[0]; if (!r) return res.status(404).json({ error:'Reserva não encontrada.' }); res.json({ url: googleCalendarUrl(r) }); } catch(e){ next(e); } });
app.get('/api/reservations/:id/ics', auth, can('reservations.view'), async (req,res,next)=>{ try { const r=(await q('SELECT * FROM reservations WHERE id=$1',[req.params.id])).rows[0]; if (!r) return res.status(404).send('Reserva não encontrada.'); res.setHeader('Content-Type','text/calendar; charset=utf-8'); res.setHeader('Content-Disposition',`attachment; filename="reserva-${r.id}.ics"`); res.send(icsContent(r)); } catch(e){ next(e); } });
app.get('/api/reservations/:id/visitors', auth, can('reservations.view'), async (req,res,next)=>{ try { res.json((await q('SELECT * FROM reservation_visitors WHERE reservation_id=$1 ORDER BY id DESC',[req.params.id])).rows); } catch(e){ next(e); } });
app.post('/api/reservations/:id/visitors', auth, can('reservations.manage'), async (req,res,next)=>{ try {
  const reservation=(await q('SELECT r.*, ca.max_guests, ca.count_children, ca.count_infants FROM reservations r LEFT JOIN common_areas ca ON ca.id=r.area_id WHERE r.id=$1',[req.params.id])).rows[0];
  if (!reservation) return res.status(404).json({ error:'Reserva não encontrada.' });
  const settings=await getSettingsObject();
  const maxGuests=Number(reservation.max_guests || settings.RESERVATION_MAX_GUESTS_DEFAULT || 30);
  const existing=(await q('SELECT * FROM reservation_visitors WHERE reservation_id=$1',[req.params.id])).rows;
  let count=existing.filter(v => guestCountsInLimit(v, settings)).length;
  const list=Array.isArray(req.body.visitors) ? req.body.visitors : String(req.body.bulk||'').split('\n').map(line=>{ const [name,document,phone,plate,age_group='adulto']=line.split(/[;,]/).map(x=>x?.trim()||''); return { name, document, phone, plate, age_group, visitor_type:'convidado' }; }).filter(x=>x.name);
  const created=[];
  for (const v of list) {
    const normalized={ ...v, age_group:v.age_group || 'adulto', visitor_type:v.visitor_type || 'convidado' };
    if (guestCountsInLimit(normalized, settings)) count += 1;
    if (count > maxGuests) return res.status(400).json({ error:`Limite de ${maxGuests} convidados excedido para esta reserva.` });
    const r=await q('INSERT INTO reservation_visitors(reservation_id,name,document,phone,plate,visitor_type,age_group,counts_as_guest,notes,photo_data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',[req.params.id,normalized.name,normalized.document||'',normalized.phone||'',normalized.plate||'',normalized.visitor_type||'convidado',normalized.age_group||'adulto',normalized.counts_as_guest!==false,normalized.notes||'',normalized.photo_data||'']);
    created.push(r.rows[0]);
  }
  res.json(created);
} catch(e){ next(e); } });

app.get('/api/finance', auth, can('finance.view'), async (req,res,next)=>{ try { if (isResident(req.user) && req.user.resident_id) return res.json((await q('SELECT f.*, b.digitable_line, b.payment_link FROM finance f LEFT JOIN boletos b ON b.id=f.boleto_id WHERE f.deleted_at IS NULL AND (f.resident_id=$1 OR f.unit=(SELECT unit FROM residents WHERE id=$1)) ORDER BY f.due_date DESC NULLS LAST,f.id DESC',[req.user.resident_id])).rows); res.json((await q('SELECT f.*, b.digitable_line, b.payment_link FROM finance f LEFT JOIN boletos b ON b.id=f.boleto_id WHERE f.deleted_at IS NULL ORDER BY f.due_date DESC NULLS LAST,f.id DESC')).rows); } catch(e){ next(e); } });
app.post('/api/finance', auth, can('finance.manage'), async (req,res,next)=>{ try { requireFields(req.body,['title','amount','type']); const resident=await findResident(req.body); let boleto_id=req.body.boleto_id||null; if (req.body.generate_boleto) { const boleto=await createBoleto({ unit:req.body.unit, resident_id:resident?.id||null, title:req.body.title, amount:req.body.amount, due_date:req.body.due_date, bank_name:req.body.bank_name||'', digitable_line:req.body.digitable_line||'', pdf_url:req.body.pdf_url||'', payment_link:req.body.payment_link||'', source_type:'finance' }); boleto_id=boleto.id; } const r=await q('INSERT INTO finance(title,amount,type,status,due_date,unit,resident_id,category,boleto_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[req.body.title,req.body.amount,req.body.type,req.body.status||'pendente',req.body.due_date||null,req.body.unit||'',resident?.id||null,req.body.category||'geral',boleto_id]); await audit(req.user.email,'lançou financeiro',req.body.title); res.json(r.rows[0]); } catch(e){ next(e); } });
app.post('/api/finance/:id/pay', auth, can('finance.manage'), async (req,res,next)=>{ try { const r=await q("UPDATE finance SET status='pago' WHERE id=$1 RETURNING *",[req.params.id]); if (r.rows[0]?.boleto_id) await q("UPDATE boletos SET status='pago',paid_at=now() WHERE id=$1",[r.rows[0].boleto_id]); res.json(r.rows[0]||{}); } catch(e){ next(e); } });
app.get('/api/boletos', auth, can('finance.view'), async (req,res,next)=>{ try { if (isResident(req.user) && req.user.resident_id) return res.json((await q('SELECT * FROM boletos WHERE deleted_at IS NULL AND (resident_id=$1 OR unit=(SELECT unit FROM residents WHERE id=$1)) ORDER BY id DESC',[req.user.resident_id])).rows); res.json((await q('SELECT * FROM boletos WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 300')).rows); } catch(e){ next(e); } });
app.post('/api/boletos', auth, can('boletos.manage'), async (req,res,next)=>{ try { requireFields(req.body,['title','amount']); const resident=await findResident(req.body); const boleto=await createBoleto({ unit:req.body.unit, resident_id:resident?.id||null, title:req.body.title, amount:req.body.amount, due_date:req.body.due_date, bank_name:req.body.bank_name||'', digitable_line:req.body.digitable_line||'', barcode:req.body.barcode||'', pdf_url:req.body.pdf_url||'', payment_link:req.body.payment_link||'', provider:req.body.provider||'manual', source_type:req.body.source_type||'manual' }); res.json(boleto); } catch(e){ next(e); } });

app.get('/api/notices', auth, can('notices.view'), async (req,res,next)=>{ try { res.json((await q("SELECT * FROM notices WHERE target_role IN ('todos',$1) OR $1 IN ('sindico','admin') ORDER BY id DESC",[req.user.role])).rows); } catch(e){ next(e); } });
app.post('/api/notices', auth, can('notices.manage'), async (req,res,next)=>{ try { requireFields(req.body,['title','body']); const criteria=req.body.target_criteria || {}; const r=await q('INSERT INTO notices(title,body,channel,priority,target_role,target_criteria) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[req.body.title,req.body.body,req.body.channel||'app',req.body.priority||'normal',req.body.target_role||'todos',JSON.stringify(criteria)]); await audit(req.user.email,'criou comunicado',req.body.title); const selectedKeys=Object.keys(criteria).filter(k => criteria[k]); if ((req.body.target_role || 'todos') === 'morador' || (req.body.target_role || 'todos') === 'todos') { let residents=(await q('SELECT * FROM residents WHERE COALESCE(active,true)=true ORDER BY id DESC')).rows; if (selectedKeys.length) residents=residents.filter(r => selectedKeys.every(k => parseJson(r.resident_tags, {})[k] === true)); for (const resident of residents) await notifyResident(resident,{ title:req.body.title, body:req.body.body, channels:{ app:true,browser:true,email:req.body.priority==='critica' }, action_url:'/#/comunicacao', payload:{ notice_id:r.rows[0].id, criteria:selectedKeys } }).catch(()=>null); } res.json(r.rows[0]); } catch(e){ next(e); } });
app.get('/api/invoices', auth, can('invoices.view'), async (_req,res,next)=>{ try { res.json((await q('SELECT i.*, r.name resident_name FROM invoices i LEFT JOIN residents r ON r.id=i.resident_id ORDER BY i.id DESC')).rows); } catch(e){ next(e); } });
app.post('/api/invoices', auth, can('invoices.manage'), async (req,res,next)=>{ try { requireFields(req.body,['supplier']); const resident=await findResident(req.body); const r=await q('INSERT INTO invoices(supplier,document_number,access_key,amount,issue_date,due_date,unit,resident_id,category,status,extracted_text,file_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *',[req.body.supplier,req.body.document_number||'',req.body.access_key||'',req.body.amount||0,req.body.issue_date||null,req.body.due_date||null,req.body.unit||'',resident?.id||null,req.body.category||'nota fiscal',req.body.status||'registrada',req.body.extracted_text||'',req.body.file_name||'']); res.json(r.rows[0]); } catch(e){ next(e); } });
app.get('/api/incidents', auth, can('incidents.view'), async (_req,res,next)=>{ try { res.json((await q('SELECT * FROM incidents ORDER BY id DESC')).rows); } catch(e){ next(e); } });
app.post('/api/incidents', auth, can('incidents.manage'), async (req,res,next)=>{ try { requireFields(req.body,['title']); const r=await q('INSERT INTO incidents(title,description,unit,severity) VALUES($1,$2,$3,$4) RETURNING *',[req.body.title,req.body.description||'',req.body.unit||'',req.body.severity||'normal']); res.json(r.rows[0]); } catch(e){ next(e); } });
app.post('/api/incidents/:id/close', auth, can('incidents.manage'), async (req,res,next)=>{ try { const r=await q("UPDATE incidents SET status='fechada',closed_at=now() WHERE id=$1 RETURNING *",[req.params.id]); res.json(r.rows[0]||{}); } catch(e){ next(e); } });
app.get('/api/maintenance', auth, can('maintenance.view'), async (_req,res,next)=>{ try { res.json((await q('SELECT * FROM maintenance ORDER BY scheduled_for DESC NULLS LAST,id DESC')).rows); } catch(e){ next(e); } });
app.post('/api/maintenance', auth, can('maintenance.manage'), async (req,res,next)=>{ try { requireFields(req.body,['title']); const r=await q('INSERT INTO maintenance(title,supplier,scheduled_for,status,cost,notes) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[req.body.title,req.body.supplier||'',req.body.scheduled_for||null,req.body.status||'planejada',req.body.cost||0,req.body.notes||'']); res.json(r.rows[0]); } catch(e){ next(e); } });

app.get('/api/emergency-types', auth, async (_req,res,next)=>{ try { res.json((await q('SELECT * FROM emergency_types WHERE active=true ORDER BY sort_order,label')).rows); } catch(e){ next(e); } });
app.post('/api/emergency-types', auth, can('settings.manage'), async (req,res,next)=>{ try { requireFields(req.body,['code','label']); const r=await q('INSERT INTO emergency_types(code,label,phone,supplier,instructions,notify_all,active,sort_order,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()) ON CONFLICT(code) DO UPDATE SET label=$2,phone=$3,supplier=$4,instructions=$5,notify_all=$6,active=$7,sort_order=$8,updated_at=now() RETURNING *',[req.body.code,req.body.label,req.body.phone||'',req.body.supplier||'',req.body.instructions||'',req.body.notify_all===true,req.body.active!==false,req.body.sort_order||99]); res.json(r.rows[0]); } catch(e){ next(e); } });
async function handleEmergencyRequest(req,res,next){ try { const code=req.body.type || req.body.code || 'geral'; const type=(await q('SELECT * FROM emergency_types WHERE code=$1',[code])).rows[0] || { code, label:'Emergência', notify_all:false, phone:'', supplier:'', instructions:'' }; const unit=req.body.unit || ''; const message=req.body.message || ''; const notify_all=Boolean(type.notify_all); const r=await q('INSERT INTO emergency_requests(type_code,type_label,unit,message,requested_by,requested_role,status,notify_all) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[code,type.label,unit,message,req.user.id,req.user.role,'pendente',notify_all]); const body=`${type.label} solicitada${unit ? ' - unidade ' + unit : ''}. ${message}`; await notifyStaff({ title:'Emergência aguardando aprovação', body, action_url:'/#/emergencia' }).catch(()=>null); await q('INSERT INTO incidents(title,description,unit,severity,status) VALUES($1,$2,$3,$4,$5)', [`Emergência pendente: ${type.label}`, `${body}\nContato: ${type.supplier || '-'} ${type.phone || ''}\nOrientação: ${type.instructions || '-'}`, unit, 'critica', 'aberta']).catch(()=>null); res.json({ ok:true, request:r.rows[0], message:'Solicitação enviada para aprovação da portaria/síndico.', emergency:type }); } catch(e){ next(e); } }
app.post('/api/emergency', auth, can('emergency.use'), handleEmergencyRequest);
app.post('/api/emergency-requests', auth, can('emergency.use'), handleEmergencyRequest);
app.get('/api/emergency-requests', auth, can('emergency.approve'), async (_req,res,next)=>{ try { res.json((await q('SELECT er.*, u.email requested_email FROM emergency_requests er LEFT JOIN users u ON u.id=er.requested_by ORDER BY er.id DESC LIMIT 200')).rows); } catch(e){ next(e); } });
app.post('/api/emergency-requests/:id/approve', auth, can('emergency.approve'), async (req,res,next)=>{ try { const r=await q("UPDATE emergency_requests SET status='aprovada',approved_by=$1,decision_note=$2,decided_at=now() WHERE id=$3 RETURNING *",[req.user.id,req.body.note||'',req.params.id]); const er=r.rows[0]; if (!er) return res.status(404).json({ error:'Solicitação não encontrada.' }); const body=`Emergência aprovada: ${er.type_label}${er.unit ? ' - unidade ' + er.unit : ''}. ${er.message || ''}`; if (er.notify_all) await notifyAllResidents({ title:`Emergência: ${er.type_label}`, body, channels:{ app:true,browser:true,email:true,telegram:true,whatsapp:true }, action_url:'/#/emergencia', payload:{ emergency:true, critical:true, type:er.type_code } }); else await notifyStaff({ title:`Emergência aprovada: ${er.type_label}`, body, action_url:'/#/emergencia' }); await audit(req.user.email,'aprovou emergência',er.type_label); res.json(er); } catch(e){ next(e); } });
app.post('/api/emergency-requests/:id/reject', auth, can('emergency.approve'), async (req,res,next)=>{ try { const r=await q("UPDATE emergency_requests SET status='rejeitada',approved_by=$1,decision_note=$2,decided_at=now() WHERE id=$3 RETURNING *",[req.user.id,req.body.note||'',req.params.id]); res.json(r.rows[0]||{}); } catch(e){ next(e); } });

app.get('/api/notifications', auth, async (req,res,next)=>{ try { const rows = isResident(req.user) && req.user.resident_id ? (await q('SELECT * FROM notifications WHERE resident_id=$1 OR user_id=$2 ORDER BY id DESC LIMIT 150',[req.user.resident_id,req.user.id])).rows : (await q('SELECT * FROM notifications WHERE user_id IS NULL OR user_id=$1 ORDER BY id DESC LIMIT 150',[req.user.id])).rows; res.json(rows); } catch(e){ next(e); } });
app.post('/api/notifications/:id/read', auth, async (req,res,next)=>{ try { const r=await q("UPDATE notifications SET status='lida',read_at=now() WHERE id=$1 RETURNING *",[req.params.id]); res.json(r.rows[0]||{}); } catch(e){ next(e); } });
app.get('/api/push/vapid-public-key', auth, async (_req,res)=>res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || '' }));
app.post('/api/push/subscribe', auth, async (req,res,next)=>{ try { if (!req.body.endpoint) return res.status(400).json({ error:'Endpoint não informado.' }); await q('INSERT INTO push_subscriptions(user_id,endpoint,payload) VALUES($1,$2,$3) ON CONFLICT(endpoint) DO UPDATE SET payload=$3',[req.user.id,req.body.endpoint,JSON.stringify(req.body)]); res.json({ ok:true }); } catch(e){ next(e); } });


app.get('/api/apps/download/:kind', auth, async (req,res,next)=>{ try {
  const kind=String(req.params.kind||'').toLowerCase();
  const allowed={ portaria:'ENABLE_APP_PORTARIA', sindico:'ENABLE_APP_SINDICO', morador:'ENABLE_APP_MORADOR' };
  if (!allowed[kind]) return res.status(404).send('Aplicativo não encontrado.');
  if (!(isMaster(req.user) || boolValue(await getSetting(allowed[kind], 'true'), true))) return res.status(403).send('Aplicativo bloqueado por Bruno.');
  const configured=await getSetting(`APK_${kind.toUpperCase()}_URL`, '');
  if (configured) return res.redirect(configured);
  const file=path.join(__dirname,'..','apks',`vitoria-regia-${kind}.apk`);
  try { await fs.access(file); } catch { return res.status(404).send('APK ainda não foi gerado. Gere pelo GitHub Actions ou configure a URL do APK em Configurações → Apps.'); }
  res.download(file, `vitoria-regia-${kind}.apk`);
} catch(e){ next(e); } });

app.get('/api/settings', auth, async (_req,res,next)=>{ try { res.json(await getSettingsObject({ maskSecrets:true })); } catch(e){ next(e); } });
app.post('/api/settings', auth, can('settings.manage'), async (req,res,next)=>{ try {
  if (containsProtectedSettings(req.body) && !isMaster(req.user)) return res.status(403).json({ error:'Funcionalidades liberadas, apps e banco só podem ser alterados por Bruno.' });
  for (const [key,value] of Object.entries(req.body||{})) { const val=String(value ?? ''); if (isSecretSetting(key) && (!val || val.includes('***') || val === 'configurado')) continue; await q('INSERT INTO settings(key,value,updated_at) VALUES($1,$2,now()) ON CONFLICT(key) DO UPDATE SET value=$2,updated_at=now()',[key,val]); }
  if ('ELEVATOR_EMERGENCY_PHONE' in req.body || 'ELEVATOR_OPERATOR_NAME' in req.body) await q(`UPDATE emergency_types SET phone=COALESCE(NULLIF($1,''), phone), supplier=COALESCE(NULLIF($2,''), supplier), updated_at=now() WHERE code=$3`, [req.body.ELEVATOR_EMERGENCY_PHONE||'',req.body.ELEVATOR_OPERATOR_NAME||'','elevador']);
  await audit(req.user.email,'alterou configurações',Object.keys(req.body||{}).join(',')); res.json({ ok:true });
} catch(e){ next(e); } });
app.get('/api/platform-settings', auth, masterOnly, async (_req,res,next)=>{ try { res.json(await getSettingsObject({ maskSecrets:true })); } catch(e){ next(e); } });
app.post('/api/platform-settings', auth, masterOnly, async (req,res,next)=>{ try { for (const [key,value] of Object.entries(req.body||{})) { const val=String(value ?? ''); if (isSecretSetting(key) && (!val || val.includes('***') || val === 'configurado')) continue; await q('INSERT INTO settings(key,value,updated_at) VALUES($1,$2,now()) ON CONFLICT(key) DO UPDATE SET value=$2,updated_at=now()',[key,val]); } await audit(req.user.email,'alterou liberações comerciais',Object.keys(req.body||{}).join(',')); res.json({ ok:true }); } catch(e){ next(e); } });
app.post('/api/bank/test', auth, masterOnly, async (_req,res,next)=>{ try { const provider=await getSetting('BANK_PROVIDER','manual'); const ready = provider === 'manual' || Boolean(await getSetting('BANK_CLIENT_ID','') || process.env.BANK_CLIENT_SECRET || process.env.BANK_API_TOKEN); res.json({ ok:ready, provider, mode: provider === 'manual' ? 'vinculação manual' : 'conector preparado', message: provider === 'manual' ? 'Boletos serão vinculados manualmente.' : 'Banco configurado. A emissão real depende das credenciais/API do banco no Render.' }); } catch(e){ next(e); } });

app.get('/api/system-updates/config', auth, canViewUpdates, async (_req,res,next)=>{ try {
  res.json({
    currentVersion: APP_VERSION,
    mode: await getSetting('UPDATE_APPLY_MODE', process.env.UPDATE_APPLY_MODE || 'github'),
    githubRepo: await getSetting('UPDATE_GITHUB_REPO', process.env.UPDATE_GITHUB_REPO || 'bmedeiros1987/vitoriaregia1'),
    githubBranch: await getSetting('UPDATE_GITHUB_BRANCH', process.env.UPDATE_GITHUB_BRANCH || 'main'),
    githubTokenConfigured: Boolean(process.env.UPDATE_GITHUB_TOKEN || process.env.GITHUB_TOKEN),
    renderDeployHookConfigured: Boolean(process.env.RENDER_DEPLOY_HOOK_URL),
    feedUrl: await getSetting('UPDATE_FEED_URL', process.env.UPDATE_FEED_URL || ''),
    signatureRequired: ['1','true','sim','yes','on'].includes(String(process.env.UPDATE_REQUIRE_SIGNATURE || 'true').toLowerCase())
  });
} catch(e){ next(e); } });
app.get('/api/system-updates', auth, canViewUpdates, async (_req,res,next)=>{ try { res.json((await q("SELECT id,update_code,version,title,notes,from_version,to_version,status,validation_token_hash,payload_sha256,manifest,announced_at,validated_at,applied_at,error,created_at FROM system_updates ORDER BY id DESC LIMIT 100")).rows); } catch(e){ next(e); } });
app.post('/api/system-updates/upload', auth, masterOnly, uploadUpdateZip.single('update_zip'), async (req,res,next)=>{ try {
  if (!boolValue(await getSetting('ENABLE_SYSTEM_UPDATES','true'), true)) return res.status(403).json({ error:'Central de atualizações bloqueada por Bruno.' });
  let packageBuffer = req.file?.buffer || null;
  if (!packageBuffer && req.body?.zip_base64) {
    const raw = String(req.body.zip_base64).includes(',') ? String(req.body.zip_base64).split(',').pop() : String(req.body.zip_base64);
    packageBuffer = Buffer.from(raw, 'base64');
  }
  if (!packageBuffer) return res.status(400).json({ error:'Envie o arquivo ZIP da atualização.' });
  const validation = validateUpdatePackage(packageBuffer, req.body?.validation_code || '');
  validation.manifest.source_filename = req.file?.originalname || req.body?.fileName || validation.manifest.source_filename || '';
  validation.manifest.file_count = validation.files.length;
  validation.manifest.payload_size = validation.payloadBuffer.length;
  await q(`INSERT INTO system_updates(update_code,version,title,notes,from_version,to_version,status,validation_token_hash,payload_sha256,manifest,package_data,created_by,validated_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now())
           ON CONFLICT(update_code) DO UPDATE SET version=$2,title=$3,notes=$4,from_version=$5,to_version=$6,status=$7,validation_token_hash=$8,payload_sha256=$9,manifest=$10,package_data=$11,created_by=$12,validated_at=now(),error=NULL`, updateRowValues(validation.manifest, validation.payloadHash, packageBuffer, req.user.id, 'validado'));
  await notifyUpdateAvailable(validation.manifest, req.user.email).catch(()=>null);
  res.json({ ok:true, message:'Atualização validada com assinatura, token e hash.', update:validation.manifest, files:validation.files });
} catch(e){ next(e); } });
app.post('/api/system-updates/:id/notify', auth, masterOnly, async (req,res,next)=>{ try {
  const row = (await q('SELECT * FROM system_updates WHERE id=$1',[req.params.id])).rows[0];
  if (!row) return res.status(404).json({ error:'Atualização não encontrada.' });
  const manifest = parseJson(row.manifest, { update_code:row.update_code, version:row.version, title:row.title, notes:row.notes });
  const notified = await notifyUpdateAvailable(manifest, req.user.email);
  res.json({ ok:true, notified, message:'Aviso de atualização reenviado.' });
} catch(e){ next(e); } });
app.post('/api/system-updates/:id/apply', auth, masterOnly, async (req,res,next)=>{ try {
  const row = (await q('SELECT * FROM system_updates WHERE id=$1',[req.params.id])).rows[0];
  if (!row) return res.status(404).json({ error:'Atualização não encontrada.' });
  if (!row.package_data) return res.status(400).json({ error:'Esta atualização foi apenas anunciada. Envie o ZIP validado antes de aplicar.' });
  const validation = validateUpdatePackage(row.package_data, req.body?.validation_code || parseJson(row.manifest, {}).validation_token || '');
  const mode = String(req.body?.mode || await getSetting('UPDATE_APPLY_MODE', process.env.UPDATE_APPLY_MODE || 'github')).toLowerCase();
  let result;
  if (mode === 'github') result = await applyUpdateViaGithub(validation.payloadBuffer, validation.manifest);
  else if (mode === 'local') result = await applyUpdateLocally(validation.payloadBuffer);
  else result = { manual:true, message:'Atualização validada. Modo manual selecionado; publique o payload pelo GitHub.' };
  await q("UPDATE system_updates SET status=$1, applied_by=$2, applied_at=now(), error=NULL WHERE id=$3", [mode === 'manual' ? 'validado' : 'aplicado', req.user.id, req.params.id]);
  await notifyUpdateAvailable({ ...validation.manifest, title:`Atualização ${validation.manifest.version || validation.manifest.update_code} aplicada` }, req.user.email).catch(()=>null);
  await audit(req.user.email, 'aplicou atualização', validation.manifest.update_code);
  res.json({ ok:true, mode, result, message: mode === 'github' ? 'Atualização enviada ao GitHub. O Render fará novo deploy pelo repositório/deploy hook.' : 'Atualização processada.' });
} catch(e){ await q('UPDATE system_updates SET status=$1,error=$2 WHERE id=$3',['erro',e.message,req.params.id]).catch(()=>null); next(e); } });
app.post('/api/system-updates/check-feed', auth, masterOnly, async (req,res,next)=>{ try {
  const feedUrl = req.body?.feed_url || await getSetting('UPDATE_FEED_URL','');
  if (!feedUrl) return res.json({ ok:false, message:'Configure UPDATE_FEED_URL para consulta automática.' });
  const response = await fetch(feedUrl, { signal: AbortSignal.timeout(7000) });
  if (!response.ok) throw new Error('Feed de atualização indisponível.');
  const feed = await response.json();
  const updates = Array.isArray(feed.updates) ? feed.updates : [feed.latest || feed].filter(Boolean);
  let count = 0;
  for (const m of updates) {
    if (!m.update_code) continue;
    await q(`INSERT INTO system_updates(update_code,version,title,notes,from_version,to_version,status,payload_sha256,manifest,announced_at)
             VALUES($1,$2,$3,$4,$5,$6,'disponivel',$7,$8,now())
             ON CONFLICT(update_code) DO UPDATE SET version=$2,title=$3,notes=$4,status='disponivel',manifest=$8,announced_at=now()`, [m.update_code, m.version || m.to_version || '', m.title || 'Atualização disponível', m.notes || '', m.from_version || '', m.to_version || m.version || '', m.payload_sha256 || '', JSON.stringify(m)]);
    await notifyUpdateAvailable(m, req.user.email).catch(()=>null);
    count++;
  }
  res.json({ ok:true, found:count });
} catch(e){ next(e); } });
app.post('/api/system-updates/announce', async (req,res,next)=>{ try {
  const expected = process.env.UPDATE_ANNOUNCE_TOKEN || await getSetting('UPDATE_ANNOUNCE_TOKEN','');
  const got = req.headers['x-update-token'] || req.query.token || req.body?.token;
  if (!expected || got !== expected) return res.status(401).json({ error:'Token de anúncio inválido.' });
  const m = req.body || {};
  if (!m.update_code) return res.status(400).json({ error:'Informe update_code.' });
  await q(`INSERT INTO system_updates(update_code,version,title,notes,from_version,to_version,status,payload_sha256,manifest,announced_at)
           VALUES($1,$2,$3,$4,$5,$6,'disponivel',$7,$8,now())
           ON CONFLICT(update_code) DO UPDATE SET version=$2,title=$3,notes=$4,status='disponivel',manifest=$8,announced_at=now()`, [m.update_code, m.version || m.to_version || '', m.title || 'Nova atualização disponível', m.notes || '', m.from_version || '', m.to_version || m.version || '', m.payload_sha256 || '', JSON.stringify(m)]);
  const notified = await notifyUpdateAvailable(m, 'canal externo');
  res.json({ ok:true, notified });
} catch(e){ next(e); } });

async function getWeatherSafe() { try { const lat=Number(await getSetting('WEATHER_LAT','-7.1195')); const lon=Number(await getSetting('WEATHER_LON','-34.8450')); const city=await getSetting('WEATHER_CITY','João Pessoa'); const url=`https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m`; const r=await fetch(url, { signal: AbortSignal.timeout(4500) }); const data=await r.json(); return { city, temperature:data?.current?.temperature_2m, humidity:data?.current?.relative_humidity_2m, wind:data?.current?.wind_speed_10m, code:data?.current?.weather_code, updated_at:data?.current?.time, source:'servidor' }; } catch { return { city: await getSetting('WEATHER_CITY','João Pessoa'), temperature:null, source:'indisponível' }; } }
app.get('/api/weather', auth, async (_req,res,next)=>{ try { res.json(await getWeatherSafe()); } catch(e){ next(e); } });

function safeBool(v) { return Boolean(v && String(v).trim()); }
app.get('/api/notify/config', auth, can('settings.manage'), async (_req,res,next)=>{ try {
  const telegramToken = await getSetting('TELEGRAM_BOT_TOKEN', process.env.TELEGRAM_BOT_TOKEN || '');
  const whatsToken = await getSetting('WHATSAPP_ACCESS_TOKEN', process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_API_TOKEN || '');
  const smtpPass = await getSetting('SMTP_PASS', process.env.SMTP_PASS || '');
  res.json({
    email: { provider: await getSetting('EMAIL_PROVIDER', process.env.SENDGRID_API_KEY ? 'sendgrid' : 'smtp'), sendgridApiKeyConfigured: safeBool(process.env.SENDGRID_API_KEY || await getSetting('SENDGRID_API_KEY','')), sendgridFromEmail: await getSetting('SENDGRID_FROM_EMAIL', process.env.SENDGRID_FROM_EMAIL || ''), sendgridFromName: await getSetting('SENDGRID_FROM_NAME', 'Condomínio Vitória Régia'), smtpHost: await getSetting('SMTP_HOST',''), smtpPort: await getSetting('SMTP_PORT','587'), smtpUser: await getSetting('SMTP_USER',''), smtpPassConfigured: safeBool(smtpPass), mailFrom: await getSetting('MAIL_FROM','') },
    telegram: { configured: safeBool(telegramToken), enabled: await featureEnabled('telegram'), token: maskSecretSetting(telegramToken), chatDefaultConfigured: safeBool(await getSetting('TELEGRAM_CHAT_ID', process.env.TELEGRAM_CHAT_ID || '')), botUsername: await getSetting('TELEGRAM_BOT_USERNAME', process.env.TELEGRAM_BOT_USERNAME || ''), startUrl: await getSetting('TELEGRAM_START_URL', process.env.TELEGRAM_START_URL || ''), webhookSecretConfigured: safeBool(await getSetting('TELEGRAM_WEBHOOK_SECRET', process.env.TELEGRAM_WEBHOOK_SECRET || '')) },
    whatsapp: { configured: safeBool(await getSetting('WHATSAPP_PHONE_NUMBER_ID', process.env.WHATSAPP_PHONE_NUMBER_ID || '')) && safeBool(whatsToken), token: maskSecretSetting(whatsToken), phoneNumberId: await getSetting('WHATSAPP_PHONE_NUMBER_ID',''), businessAccountId: await getSetting('WHATSAPP_BUSINESS_ACCOUNT_ID',''), apiVersion: await getSetting('WHATSAPP_API_VERSION','v19.0') },
    browser: { configured: safeBool(await getSetting('VAPID_PUBLIC_KEY', process.env.VAPID_PUBLIC_KEY || '')) && safeBool(await getSetting('VAPID_PRIVATE_KEY', process.env.VAPID_PRIVATE_KEY || '')), publicKeyConfigured: safeBool(await getSetting('VAPID_PUBLIC_KEY', process.env.VAPID_PUBLIC_KEY || '')) },
    enabled: { email: await featureEnabled('email'), telegram: await featureEnabled('telegram'), whatsapp: await featureEnabled('whatsapp'), browser: await featureEnabled('browser') }
  });
} catch(e){ next(e); } });
app.post('/api/notify/test', auth, can('settings.manage'), async (req,res,next)=>{ try {
  const channel=String(req.body.channel || 'email'); const msg=req.body.message || 'Mensagem de teste Vitória Régia';
  if (channel === 'email') return res.json(await sendEmailSmart({ to:req.body.to || req.body.email || await getSetting('SENDGRID_TO_DEFAULT',''), subject:req.body.subject || 'Teste Vitória Régia', text:msg }));
  if (channel === 'telegram') return res.json(await sendTelegramMessage(req.body.chat_id || req.body.to || '', msg));
  if (channel === 'whatsapp') return res.json(await sendWhatsAppText(req.body.phone || req.body.to || '', msg));
  if (channel === 'browser') { await createNotification({ user_id:req.user.id, title:req.body.subject || 'Teste Vitória Régia', body:msg, channel:'app', channels:{ app:true,browser:true }, payload:{ test:true } }); return res.json({ ok:true, channel:'browser' }); }
  res.status(400).json({ error:'Canal inválido.' });
} catch(e){ next(e); } });
const uploadManual = multer({ storage: multer.memoryStorage(), limits:{ fileSize: 20 * 1024 * 1024 } });
app.get('/api/manuals', auth, async (_req,res,next)=>{ try { res.json((await q('SELECT id,title,audience,file_name,mime_type,file_size,created_at FROM manuals ORDER BY id DESC')).rows); } catch(e){ next(e); } });
app.post('/api/manuals/upload', auth, masterOnly, uploadManual.single('manual'), async (req,res,next)=>{ try { if (!req.file) return res.status(400).json({ error:'Envie um arquivo PDF.' }); if (!/pdf/i.test(req.file.mimetype) && !/\.pdf$/i.test(req.file.originalname)) return res.status(400).json({ error:'Apenas PDF é permitido.' }); const r=await q('INSERT INTO manuals(title,audience,file_name,mime_type,file_size,file_data,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,title,audience,file_name,file_size,created_at',[req.body.title || req.file.originalname, req.body.audience || 'geral', req.file.originalname, req.file.mimetype || 'application/pdf', req.file.size, req.file.buffer, req.user.id]); await audit(req.user.email,'enviou manual',r.rows[0].title); res.json(r.rows[0]); } catch(e){ next(e); } });
app.get('/api/manuals/:id/download', auth, async (req,res,next)=>{ try { const r=(await q('SELECT * FROM manuals WHERE id=$1',[req.params.id])).rows[0]; if (!r) return res.status(404).send('Manual não encontrado.'); res.setHeader('Content-Type', r.mime_type || 'application/pdf'); res.setHeader('Content-Disposition', `inline; filename="${String(r.file_name || 'manual.pdf').replace(/"/g,'')}"`); res.send(r.file_data); } catch(e){ next(e); } });

app.post('/api/telegram/get-me', auth, can('settings.manage'), async (_req,res,next)=>{ try { res.json(await telegramApi('getMe', {})); } catch(e){ next(e); } });
app.post('/api/telegram/webhook-info', auth, can('settings.manage'), async (_req,res,next)=>{ try { res.json(await telegramApi('getWebhookInfo', {})); } catch(e){ next(e); } });
app.post('/api/telegram/set-webhook', auth, can('settings.manage'), async (req,res,next)=>{ try {
  const base = String(req.body?.base_url || await getSetting('PUBLIC_APP_URL', process.env.PUBLIC_APP_URL || process.env.RENDER_EXTERNAL_URL || '') || '').replace(/\/$/, '');
  if (!base || !/^https:\/\//i.test(base)) return res.status(400).json({ error:'Informe PUBLIC_APP_URL com HTTPS. Ex.: https://vitoriaregia-pro.onrender.com' });
  const secret = await getSetting('TELEGRAM_WEBHOOK_SECRET', process.env.TELEGRAM_WEBHOOK_SECRET || '');
  const payload = { url:`${base}/api/telegram/webhook`, allowed_updates:['message','callback_query'], drop_pending_updates:false, ...(secret ? { secret_token: secret } : {}) };
  const result = await telegramApi('setWebhook', payload);
  await audit(req.user.email,'configurou webhook Telegram', base).catch(()=>null);
  res.json({ ok:result.ok, webhook:`${base}/api/telegram/webhook`, result });
} catch(e){ next(e); } });
app.post('/api/telegram/test', auth, can('settings.manage'), async (req,res,next)=>{ try {
  const msg=req.body?.message || 'Teste do Telegram - Sistema Vitória Régia';
  res.json(await sendTelegramMessage(req.body?.chat_id || req.body?.to || '', msg));
} catch(e){ next(e); } });
app.post('/api/telegram/webhook', async (req,res,next)=>{ try {
  const cb=req.body?.callback_query;
  if (cb?.data && /^pkg:\d+:(receber_elevador|retirar_portaria)$/.test(cb.data)) {
    const [,id,pref]=cb.data.split(':');
    const r=await q('UPDATE packages SET delivery_preference=$1,resident_response_at=now() WHERE id=$2 RETURNING *',[pref,id]);
    await notifyStaff({ title:'Preferência de entrega informada', body:`Encomenda ${r.rows[0]?.tracking || id}: ${pref}`, action_url:'/#/encomendas' }).catch(()=>null);
    await telegramApi('answerCallbackQuery',{ callback_query_id:cb.id, text:'Preferência registrada.' }).catch(()=>null);
  }
  if (cb?.data && /^msg:\d+:recebido$/.test(cb.data)) {
    const [,id]=cb.data.split(':');
    const r=await q("UPDATE messages SET status='recebida_pelo_morador' WHERE id=$1 RETURNING *",[id]);
    await notifyStaff({ title:'Morador confirmou recebimento', body:`Mensagem ${id} confirmada pelo Telegram.`, action_url:'/#/comunicacao' }).catch(()=>null);
    await telegramApi('answerCallbackQuery',{ callback_query_id:cb.id, text:'Confirmação registrada.' }).catch(()=>null);
  }
  res.json({ ok:true });
} catch(e){ next(e); } });

app.delete('/api/finance/:id', auth, can('finance.manage'), async (req,res,next)=>{ try { await q("UPDATE finance SET deleted_at=now(), status='removido' WHERE id=$1",[req.params.id]); await audit(req.user.email,'removeu financeiro',req.params.id); res.json({ ok:true }); } catch(e){ next(e); } });
app.delete('/api/boletos/:id', auth, can('finance.manage'), async (req,res,next)=>{ try { await q("UPDATE boletos SET deleted_at=now(), status='removido' WHERE id=$1",[req.params.id]); await audit(req.user.email,'removeu boleto',req.params.id); res.json({ ok:true }); } catch(e){ next(e); } });
app.post('/api/notify/email', auth, can('notices.manage'), async (req,res,next)=>{ try { requireFields(req.body,['to','subject','body']); const result=await sendEmailSmart({ to:req.body.to, subject:req.body.subject, text:`${req.body.body}\n\n${await getSetting('EMAIL_SIGNATURE','Condomínio Vitória Régia')}` }); res.json(result); } catch(e){ next(e); } });
app.post('/api/notify/telegram', auth, can('notices.manage'), async (req,res,next)=>{ try { requireFields(req.body,['message']); res.json(await sendTelegramMessage(req.body.chat_id || '', req.body.message)); } catch(e){ next(e); } });
app.post('/api/notify/whatsapp', auth, can('notices.manage'), async (req,res,next)=>{ try { requireFields(req.body,['phone','message']); res.json(await sendWhatsAppText(req.body.phone, req.body.message)); } catch(e){ next(e); } });
app.get('/api/audit', auth, can('audit.view'), async (_req,res,next)=>{ try { res.json((await q('SELECT * FROM audit ORDER BY id DESC LIMIT 150')).rows); } catch(e){ next(e); } });
app.get('/api/export', auth, can('audit.view'), async (_req,res,next)=>{ try { const tables=['residents','users','employees','shifts','messages','packages','visitors','common_areas','reservations','reservation_visitors','finance','boletos','notices','invoices','incidents','emergency_requests','maintenance','settings','emergency_types','system_updates','manuals']; const out={}; for (const t of tables) out[t]=(await q(`SELECT * FROM ${t} ORDER BY 1 DESC LIMIT 1000`)).rows; res.json(out); } catch(e){ next(e); } });
app.post('/api/seed-demo', auth, can('settings.manage'), async (req,res,next)=>{ try { await q("INSERT INTO residents(name,unit,phone,whatsapp_phone,email,document,vehicle,notes) VALUES('Maria Oliveira','101','83999990000','5583999990000','morador@example.com','000.000.000-00','ABC1D23','Cadastro demo') ON CONFLICT DO NOTHING"); await q("INSERT INTO employees(name,role,phone,email) VALUES('Carlos Portaria','portaria','83988880000','portaria@example.com') ON CONFLICT DO NOTHING"); await q("INSERT INTO notices(title,body,priority,target_role) VALUES('Assembleia geral','Reunião no salão às 19h.','alta','todos')"); await audit(req.user.email,'carregou demonstração','seed-demo'); res.json({ ok:true }); } catch(e){ next(e); } });

const staticDir = path.join(__dirname, '../public');
const fallbackStatic = path.join(__dirname, '../../client/dist');
app.use(express.static(staticDir));
app.use(express.static(fallbackStatic));
app.get(/.*/, (_req,res)=>{ const file = path.join(staticDir,'index.html'); res.sendFile(file, err => { if (err) res.sendFile(path.join(fallbackStatic,'index.html')); }); });
app.use((err,_req,res,_next)=>{ console.error(err); res.status(err.status || 500).json({ error: err.message || 'Erro interno' }); });
createConnectedPool().then(p=>{ pool=p; return init(); }).then(()=>app.listen(process.env.PORT || 3000,()=>console.log(`${APP_VERSION} online na porta ${process.env.PORT || 3000}`))).catch(error=>{ console.error('Falha ao iniciar:', error); process.exit(1); });
