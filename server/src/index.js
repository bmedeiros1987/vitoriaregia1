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
const APP_VERSION = process.env.APP_VERSION || 'Vitória Régia Pro v12.6.4';
const DEFAULT_TELEGRAM_CHAT_ID = '8188648317';
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
  'emergency.use','emergency.approve','settings.manage','platform.manage','bank.manage','system.update','audit.view','apps.view','boletos.manage','occurrences.view','occurrences.manage','documents.view','documents.manage','support.view','support.manage'
];

function rolePermissions(role='morador') {
  const all = Object.fromEntries(ALL_PERMISSIONS.map(p => [p, true]));
  if (role === 'master' || role === 'admin') return all;
  if (role === 'sindico') return { ...all, 'platform.manage': false, 'bank.manage': false, 'system.update': false };
  if (role === 'subsindico') return { ...all, 'platform.manage': false, 'bank.manage': false, 'system.update': false, 'settings.manage': false, 'users.manage': false };
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
    'finance.view': true, 'notices.view': true, 'messages.manage': true, 'emergency.use': true, 'apps.view': true, 'occurrences.view': true, 'documents.view': true, 'support.view': true
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
    ['users','telegram_username TEXT'],
    ['users','notification_preferences JSONB DEFAULT \'{"app":true,"email":true,"telegram":true,"whatsapp":false,"browser":true}\'::jsonb'],
    ['users','active BOOLEAN DEFAULT true'],
    ['users','force_password_change BOOLEAN DEFAULT false'],
    ['users','last_login TIMESTAMP'],
    ['users','created_at TIMESTAMP DEFAULT now()'],
    ['residents','access_permissions JSONB DEFAULT \'{}\'::jsonb'],
    ['residents',"resident_tags JSONB DEFAULT '{}'::jsonb"],
    ['residents','notification_preferences JSONB DEFAULT \'{"app":true,"email":true,"telegram":true,"whatsapp":false,"browser":true}\'::jsonb'],
    ['residents','whatsapp_phone TEXT'],
    ['residents','telegram_chat_id TEXT'],
    ['residents','telegram_username TEXT'],
    ['residents','active BOOLEAN DEFAULT true'],
    ['residents','pet_name TEXT'],
    ['residents','vehicle_model TEXT'],
    ['residents','vehicle_plate TEXT'],
    ['residents','deleted_at TIMESTAMP']
  ];
  for (const [table, col] of critical) await addColumnStrict(table, col);
  await q(`UPDATE users SET permissions = '{}'::jsonb WHERE permissions IS NULL`);
  await q(`UPDATE users SET role = COALESCE(NULLIF(role,''), 'morador') WHERE role IS NULL OR role = ''`);
  await q(`UPDATE users SET user_type = COALESCE(NULLIF(user_type,''), role, 'morador') WHERE user_type IS NULL OR user_type = ''`);
  await q(`UPDATE users SET active = true WHERE active IS NULL`);
  await q(`UPDATE users SET notification_preferences = '{"app":true,"email":true,"telegram":true,"whatsapp":false,"browser":true}'::jsonb WHERE notification_preferences IS NULL`);
  await q(`ALTER TABLE users ALTER COLUMN permissions SET DEFAULT '{}'::jsonb`);
  await q(`ALTER TABLE users ALTER COLUMN notification_preferences SET DEFAULT '{"app":true,"email":true,"telegram":true,"whatsapp":false,"browser":true}'::jsonb`).catch(()=>null);
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
  telegram_username TEXT,
  resident_tags JSONB DEFAULT '{}'::jsonb,
  notification_preferences JSONB DEFAULT '{"app":true,"email":true,"telegram":true,"whatsapp":false,"browser":true}'::jsonb,
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
  telegram_username TEXT,
  notification_preferences JSONB DEFAULT '{"app":true,"email":true,"telegram":true,"whatsapp":false,"browser":true}'::jsonb,
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
  shift_type TEXT DEFAULT 'custom',
  recurrence_type TEXT DEFAULT 'single',
  weekdays JSONB DEFAULT '[]'::jsonb,
  month_days TEXT,
  start_time TEXT,
  end_time TEXT,
  temporary_for_employee_id INTEGER,
  allow_employee_edit BOOLEAN DEFAULT false,
  substitution_reason TEXT DEFAULT '',
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
  resident_response_at TIMESTAMP,
  staff_delivered_at TIMESTAMP,
  resident_delivered_at TIMESTAMP,
  delivered_by_staff INTEGER,
  delivered_by_resident INTEGER
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
  reservation_periods TEXT DEFAULT 'dia_todo,manha,tarde,noite,horario',
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
  reservation_mode TEXT DEFAULT 'horario',
  period_label TEXT,
  all_day BOOLEAN DEFAULT false,
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
  delivery_status JSONB DEFAULT '{}'::jsonb,
  delivery_started_at TIMESTAMP,
  delivery_finished_at TIMESTAMP,
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
  occurrence_location TEXT,
  location_type TEXT,
  neighbor_unit TEXT,
  floor TEXT,
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
  telegram_username TEXT,
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

CREATE TABLE IF NOT EXISTS error_logs(
  id SERIAL PRIMARY KEY,
  actor TEXT,
  method TEXT,
  path TEXT,
  message TEXT,
  stack TEXT,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS occurrence_book(
  id SERIAL PRIMARY KEY,
  title TEXT,
  description TEXT,
  unit TEXT,
  category TEXT DEFAULT 'queixa',
  priority TEXT DEFAULT 'normal',
  status TEXT DEFAULT 'aberta',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  response TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  closed_at TIMESTAMP
);
CREATE TABLE IF NOT EXISTS support_tickets(
  id SERIAL PRIMARY KEY,
  subject TEXT,
  body TEXT,
  priority TEXT DEFAULT 'normal',
  target TEXT DEFAULT 'suporte',
  status TEXT DEFAULT 'aberto',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  response TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS faqs(
  id SERIAL PRIMARY KEY,
  question TEXT,
  answer TEXT,
  active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
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
    ['users','telegram_username TEXT'],
    ['users','notification_preferences JSONB DEFAULT \'{"app":true,"email":true,"telegram":true,"whatsapp":false,"browser":true}\'::jsonb'],
    ['users','active BOOLEAN DEFAULT true'], ['users','force_password_change BOOLEAN DEFAULT false'], ['users','last_login TIMESTAMP'], ['users','created_at TIMESTAMP DEFAULT now()'],

    // residents
    ['residents','name TEXT'], ['residents','unit TEXT'], ['residents','phone TEXT'], ['residents','whatsapp_phone TEXT'], ['residents','email TEXT'],
    ['residents','document TEXT'], ['residents','vehicle TEXT'], ['residents','vehicle_model TEXT'], ['residents','vehicle_plate TEXT'], ['residents','pet_name TEXT'], ['residents','notes TEXT'], ['residents','access_profile TEXT DEFAULT \'morador\''],
    ['residents','access_permissions JSONB DEFAULT \'{}\'::jsonb'], ['residents','telegram_chat_id TEXT'],
    ['residents','telegram_username TEXT'],
    ['residents',"resident_tags JSONB DEFAULT '{}'::jsonb"],
    ['residents','notification_preferences JSONB DEFAULT \'{"app":true,"email":true,"telegram":true,"whatsapp":false,"browser":true}\'::jsonb'], ['residents','created_at TIMESTAMP DEFAULT now()'], ['residents','active BOOLEAN DEFAULT true'], ['residents','deleted_at TIMESTAMP'],

    // employees / shifts / messages
    ['employees','name TEXT'], ['employees','role TEXT DEFAULT \'portaria\''], ['employees','phone TEXT'], ['employees','email TEXT'], ['employees','active BOOLEAN DEFAULT true'], ['employees','notes TEXT'], ['employees','created_at TIMESTAMP DEFAULT now()'],
    ['shifts','employee_id INTEGER'], ['shifts','role TEXT DEFAULT \'portaria\''], ['shifts','starts_at TIMESTAMP'], ['shifts','ends_at TIMESTAMP'], ['shifts','status TEXT DEFAULT \'programada\''], ['shifts','notes TEXT'], ['shifts','created_at TIMESTAMP DEFAULT now()'], ['shifts','shift_type TEXT DEFAULT \'custom\''], ['shifts','recurrence_type TEXT DEFAULT \'single\''], ['shifts','weekdays JSONB DEFAULT \'[]\'::jsonb'], ['shifts','month_days TEXT'], ['shifts','start_time TEXT'], ['shifts','end_time TEXT'], ['shifts','temporary_for_employee_id INTEGER'], ['shifts','allow_employee_edit BOOLEAN DEFAULT false'], ['shifts',"substitution_reason TEXT DEFAULT ''"],
    ['messages','resident_id INTEGER'], ['messages','user_id INTEGER'], ['messages','unit TEXT'], ['messages','subject TEXT'], ['messages','body TEXT'], ['messages','assigned_employee_id INTEGER'], ['messages','status TEXT DEFAULT \'nova\''], ['messages','response TEXT'], ['messages','responded_by TEXT'], ['messages','created_at TIMESTAMP DEFAULT now()'], ['messages','responded_at TIMESTAMP'],

    // packages / visitors
    ['packages','tracking TEXT'], ['packages','recipient TEXT'], ['packages','unit TEXT'], ['packages','resident_id INTEGER'], ['packages','status TEXT DEFAULT \'pendente\''], ['packages','label TEXT'], ['packages','photo_url TEXT'], ['packages','notes TEXT'], ['packages','extracted_text TEXT'], ['packages','pickup_code TEXT'], ['packages','delivery_preference TEXT DEFAULT \'nao_informado\''], ['packages','notification_channels JSONB DEFAULT \'{}\'::jsonb'], ['packages','notification_status TEXT DEFAULT \'pendente\''], ['packages','created_at TIMESTAMP DEFAULT now()'], ['packages','delivered_at TIMESTAMP'], ['packages','resident_response_at TIMESTAMP'], ['packages','staff_delivered_at TIMESTAMP'], ['packages','resident_delivered_at TIMESTAMP'], ['packages','delivered_by_staff INTEGER'], ['packages','delivered_by_resident INTEGER'], ['packages','deleted_at TIMESTAMP'],
    ['visitors','name TEXT'], ['visitors','document TEXT'], ['visitors','unit TEXT'], ['visitors','authorized_by TEXT'], ['visitors','status TEXT DEFAULT \'autorizado\''], ['visitors','plate TEXT'], ['visitors','phone TEXT'], ['visitors','recurring BOOLEAN DEFAULT false'], ['visitors','weekdays JSONB DEFAULT \'[]\'::jsonb'], ['visitors','valid_from DATE'], ['visitors','valid_until DATE'], ['visitors','announce_required BOOLEAN DEFAULT true'], ['visitors','announcement_channel TEXT DEFAULT \'interfone\''], ['visitors','notification_channels JSONB DEFAULT \'{}\'::jsonb'], ['visitors','photo_data TEXT'], ['visitors','reservation_id INTEGER'], ['visitors','notes TEXT'], ['visitors','deleted_at TIMESTAMP'], ['visitors','created_at TIMESTAMP DEFAULT now()'],

    // reservations / common areas / boletos / finance
    ['common_areas','name TEXT'], ['common_areas','fee_amount NUMERIC(12,2) DEFAULT 0'], ['common_areas','rules_document TEXT'], ['common_areas','active BOOLEAN DEFAULT true'], ['common_areas','requires_approval BOOLEAN DEFAULT true'], ['common_areas','max_guests INTEGER DEFAULT 30'], ['common_areas','count_children BOOLEAN DEFAULT true'], ['common_areas','count_infants BOOLEAN DEFAULT false'], ['common_areas',"reservation_periods TEXT DEFAULT 'dia_todo,manha,tarde,noite,horario'"], ['common_areas','created_at TIMESTAMP DEFAULT now()'],
    ['reservations','area TEXT'], ['reservations','area_id INTEGER'], ['reservations','unit TEXT'], ['reservations','resident TEXT'], ['reservations','resident_id INTEGER'], ['reservations','reserved_for DATE'], ['reservations','start_time TEXT DEFAULT \'19:00\''], ['reservations','end_time TEXT DEFAULT \'23:00\''], ['reservations','shift TEXT'], ['reservations','reservation_mode TEXT DEFAULT \'horario\''], ['reservations','period_label TEXT'], ['reservations','all_day BOOLEAN DEFAULT false'], ['reservations','status TEXT DEFAULT \'pre_agendada\''], ['reservations','fee_amount NUMERIC(12,2) DEFAULT 0'], ['reservations','boleto_id INTEGER'], ['reservations','document_text TEXT'], ['reservations','terms_accepted BOOLEAN DEFAULT false'], ['reservations','cancel_reason TEXT'], ['reservations','created_by INTEGER'], ['reservations','approved_by INTEGER'], ['reservations','created_at TIMESTAMP DEFAULT now()'], ['reservations','approved_at TIMESTAMP'], ['reservations','canceled_at TIMESTAMP'], ['reservations','deleted_at TIMESTAMP'],
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
    ['registration_requests','name TEXT'], ['registration_requests','email TEXT'], ['registration_requests','phone TEXT'], ['registration_requests','whatsapp_phone TEXT'], ['registration_requests','telegram_chat_id TEXT'], ['registration_requests','telegram_username TEXT'], ['registration_requests','preferred_channels JSONB DEFAULT \'{"email":true,"whatsapp":false,"telegram":false}\'::jsonb'], ['registration_requests','unit TEXT'], ['registration_requests','document TEXT'], ['registration_requests','role TEXT DEFAULT \'morador\''], ['registration_requests','status TEXT DEFAULT \'pendente\''], ['registration_requests','notes TEXT'], ['registration_requests','created_at TIMESTAMP DEFAULT now()'], ['registration_requests','approved_by INTEGER'], ['registration_requests','approved_at TIMESTAMP'],
    ['password_resets','user_id INTEGER'], ['password_resets','token TEXT'], ['password_resets','temp_password TEXT'], ['password_resets','used BOOLEAN DEFAULT false'], ['password_resets','expires_at TIMESTAMP'], ['password_resets','created_at TIMESTAMP DEFAULT now()'],
    ['push_subscriptions','user_id INTEGER'], ['push_subscriptions','endpoint TEXT'], ['push_subscriptions','payload JSONB'], ['push_subscriptions','created_at TIMESTAMP DEFAULT now()'],
    ['system_updates','update_code TEXT'], ['system_updates','version TEXT'], ['system_updates','title TEXT'], ['system_updates','notes TEXT'], ['system_updates','from_version TEXT'], ['system_updates','to_version TEXT'], ['system_updates','status TEXT DEFAULT \'disponivel\''], ['system_updates','validation_token_hash TEXT'], ['system_updates','payload_sha256 TEXT'], ['system_updates','manifest JSONB DEFAULT \'{}\'::jsonb'], ['system_updates','package_data BYTEA'], ['system_updates','announced_at TIMESTAMP'], ['system_updates','validated_at TIMESTAMP'], ['system_updates','applied_at TIMESTAMP'], ['system_updates','created_by INTEGER'], ['system_updates','applied_by INTEGER'], ['system_updates','error TEXT'], ['system_updates','created_at TIMESTAMP DEFAULT now()'],
    ['manuals','title TEXT'], ['manuals',"audience TEXT DEFAULT 'geral'"], ['manuals','file_name TEXT'], ['manuals',"mime_type TEXT DEFAULT 'application/pdf'"], ['manuals','file_size INTEGER DEFAULT 0'], ['manuals','file_data BYTEA'], ['manuals','uploaded_by INTEGER'], ['manuals','created_at TIMESTAMP DEFAULT now()'],
    ['documents','description TEXT'], ['documents',"audience TEXT DEFAULT 'publico'"], ['documents','is_public BOOLEAN DEFAULT true'], ['documents','file_name TEXT'], ['documents',"mime_type TEXT DEFAULT 'application/octet-stream'"], ['documents','file_size INTEGER DEFAULT 0'], ['documents','file_data BYTEA'], ['documents','uploaded_by INTEGER'], ['documents','created_at TIMESTAMP DEFAULT now()'],
    ['occurrence_book','title TEXT'], ['occurrence_book','description TEXT'], ['occurrence_book','unit TEXT'], ['occurrence_book',"category TEXT DEFAULT 'queixa'"], ['occurrence_book',"priority TEXT DEFAULT 'normal'"], ['occurrence_book',"status TEXT DEFAULT 'aberta'"], ['occurrence_book','created_by INTEGER'], ['occurrence_book','assigned_to INTEGER'], ['occurrence_book','response TEXT'], ['occurrence_book','created_at TIMESTAMP DEFAULT now()'], ['occurrence_book','updated_at TIMESTAMP DEFAULT now()'], ['occurrence_book','closed_at TIMESTAMP'],
    ['support_tickets','subject TEXT'], ['support_tickets','body TEXT'], ['support_tickets',"priority TEXT DEFAULT 'normal'"], ['support_tickets',"target TEXT DEFAULT 'suporte'"], ['support_tickets',"status TEXT DEFAULT 'aberto'"], ['support_tickets','created_by INTEGER'], ['support_tickets','response TEXT'], ['support_tickets','created_at TIMESTAMP DEFAULT now()'], ['support_tickets','updated_at TIMESTAMP DEFAULT now()'],
    ['faqs','question TEXT'], ['faqs','answer TEXT'], ['faqs','active BOOLEAN DEFAULT true'], ['faqs','sort_order INTEGER DEFAULT 0'], ['faqs','created_at TIMESTAMP DEFAULT now()'],
    ['audit','actor TEXT'], ['audit','action TEXT'], ['audit','entity TEXT'], ['audit','created_at TIMESTAMP DEFAULT now()']
  ];
  for (const [table, col] of columns) await addColumn(table, col);

  // Normalização pós-migração: evita erro em bancos já existentes de versões antigas.
  await q("UPDATE users SET role=COALESCE(NULLIF(role,''),'morador'), user_type=COALESCE(NULLIF(user_type,''),COALESCE(NULLIF(role,''),'morador')), permissions=COALESCE(permissions,'{}'::jsonb), active=COALESCE(active,true), notification_preferences=COALESCE(notification_preferences,'{\"app\":true,\"email\":true,\"telegram\":true,\"whatsapp\":false,\"browser\":true}'::jsonb) WHERE true").catch(e => console.warn('Normalização de usuários ignorada:', e.message));
  await q("UPDATE residents SET notification_preferences=COALESCE(notification_preferences,'{\"app\":true,\"email\":true,\"telegram\":true,\"whatsapp\":false,\"browser\":true}'::jsonb), access_permissions=COALESCE(access_permissions,'{}'::jsonb), resident_tags=COALESCE(resident_tags,'{}'::jsonb) WHERE true").catch(e => console.warn('Normalização de moradores ignorada:', e.message));
  await q("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email) WHERE email IS NOT NULL").catch(e => console.warn('Índice único de usuários ignorado:', e.message));
  await q("CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_key_unique ON settings(key) WHERE key IS NOT NULL").catch(e => console.warn('Índice de configurações ignorado:', e.message));
  await q("CREATE UNIQUE INDEX IF NOT EXISTS idx_emergency_types_code_unique ON emergency_types(code) WHERE code IS NOT NULL").catch(e => console.warn('Índice de emergências ignorado:', e.message));
  await q("CREATE UNIQUE INDEX IF NOT EXISTS idx_common_areas_name_unique ON common_areas(name) WHERE name IS NOT NULL").catch(e => console.warn('Índice de áreas comuns ignorado:', e.message));
  await q("CREATE UNIQUE INDEX IF NOT EXISTS idx_system_updates_code_unique ON system_updates(update_code) WHERE update_code IS NOT NULL").catch(e => console.warn('Índice de atualizações ignorado:', e.message));
  await q("CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint_unique ON push_subscriptions(endpoint) WHERE endpoint IS NOT NULL").catch(e => console.warn('Índice de push ignorado:', e.message));

  await q("CREATE UNIQUE INDEX IF NOT EXISTS idx_reservation_slot ON reservations(area, reserved_for, start_time, end_time) WHERE status <> 'cancelada'").catch(e => console.warn('Índice de reservas ignorado:', e.message));

  const defaultSettings = {
    THEME_ACCENT: '#126b5f', THEME_TEXT_SIZE: 'comfort', MENU_ORIENTATION: 'vertical', UI_DENSITY: 'comfort', APPEARANCE: 'light', APP_VERSION:'Vitória Régia Pro v12.6.4',
    CONDO_NAME: 'Condomínio Vitória Régia', DEVELOPED_BY: 'CrewCheck', CREWCHECK_SITE: 'https://www.crewcheck.online/', CREWCHECK_FOOTER: 'Desenvolvido por CrewCheck - todos os direitos reservados', CONDO_ADDRESS: '', WEATHER_CITY: 'João Pessoa', WEATHER_LAT: '-7.1195', WEATHER_LON: '-34.8450',
    ELEVATOR_OPERATOR_NAME: 'Operadora do elevador', ELEVATOR_EMERGENCY_PHONE: '', EMERGENCY_EMAILS: process.env.SENDGRID_TO_DEFAULT || '',
    EMERGENCY_APPROVAL_REQUIRED: 'true', FOOTER_MODE: 'minimal', EMAIL_PROVIDER: process.env.MAIL_PROVIDER || 'sendgrid',
    SENDGRID_FROM_EMAIL: process.env.SENDGRID_FROM_EMAIL || '', SENDGRID_FROM_NAME: process.env.SENDGRID_FROM_NAME || 'Condomínio Vitória Régia', SENDGRID_REPLY_TO: process.env.SENDGRID_REPLY_TO || '', EMAIL_SIGNATURE: 'Condomínio Vitória Régia',
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '', TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || DEFAULT_TELEGRAM_CHAT_ID, TELEGRAM_PORTARIA_CHAT_ID: process.env.TELEGRAM_PORTARIA_CHAT_ID || DEFAULT_TELEGRAM_CHAT_ID, TELEGRAM_PORTARIA_LABEL: process.env.TELEGRAM_PORTARIA_LABEL || 'Celular Portaria', TELEGRAM_PORTARIA_ENABLED: process.env.TELEGRAM_PORTARIA_ENABLED || 'true', TELEGRAM_PORTARIA_RECEIVE_EMERGENCY: process.env.TELEGRAM_PORTARIA_RECEIVE_EMERGENCY || 'true', TELEGRAM_PORTARIA_RECEIVE_PACKAGES: process.env.TELEGRAM_PORTARIA_RECEIVE_PACKAGES || 'true', TELEGRAM_INTERCOM_FALLBACK_ENABLED: process.env.TELEGRAM_INTERCOM_FALLBACK_ENABLED || 'true', PACKAGE_ELEVATOR_AUTH_ENABLED: process.env.PACKAGE_ELEVATOR_AUTH_ENABLED || 'true', PACKAGE_TELEGRAM_DECISIONS_ENABLED: process.env.PACKAGE_TELEGRAM_DECISIONS_ENABLED || 'true', KIOSK_PORTARIA_PREMIUM_ENABLED: process.env.KIOSK_PORTARIA_PREMIUM_ENABLED || 'true', KIOSK_PORTARIA_PIN: process.env.KIOSK_PORTARIA_PIN || '', KIOSK_ALLOWED_APPS: process.env.KIOSK_ALLOWED_APPS || 'Vitória Régia Portaria,Telegram,Câmera,Wi-Fi', TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME || 'vitoriaregia_bot', TELEGRAM_START_URL: process.env.TELEGRAM_START_URL || 'https://t.me/vitoriaregia_bot', TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET || '', TELEGRAM_ENABLED: process.env.TELEGRAM_ENABLED || process.env.ENABLE_TELEGRAM || 'true', TELEGRAM_PARSE_MODE: process.env.TELEGRAM_PARSE_MODE || '', WHATSAPP_PHONE_NUMBER_ID: '', WHATSAPP_ACCESS_TOKEN: '', WHATSAPP_API_VERSION: 'v19.0',
    DELIVERY_DEFAULT_CHANNELS: '{"app":true,"browser":true,"email":true,"telegram":true,"whatsapp":false}',
    ALLOW_MULTIPLE_RESIDENTS_PER_UNIT: 'false', MAX_RESIDENTS_PER_UNIT:'2', SHOW_UPDATES_TO_SINDICO: 'false',
    RESERVATION_DEFAULT_RULES: 'Declaro que li e aceito as normas de uso do espaço comum, incluindo horários, limpeza, ruído, convidados e responsabilidade por danos.',
    RESERVATION_MAX_GUESTS_DEFAULT: '30', RESERVATION_COUNT_CHILDREN: 'true', RESERVATION_COUNT_INFANTS: 'false',
    BOLETO_PROVIDER: 'manual', APK_BASE_URL: process.env.PUBLIC_APP_URL || 'https://vitoriaregia1.onrender.com', APK_PORTARIA_URL: '', APK_SINDICO_URL: '', APK_MORADOR_URL: '',
    ENABLE_EMAIL: 'true', ENABLE_TELEGRAM: 'true', ENABLE_WHATSAPP: 'false', ENABLE_BROWSER_PUSH: 'true',
    ENABLE_APP_PORTARIA: 'true', ENABLE_APP_SINDICO: 'true', ENABLE_APP_MORADOR: 'true',
    REGISTRATION_REQUIRE_EMAIL: 'true', REGISTRATION_REQUIRE_WHATSAPP: 'false', REGISTRATION_REQUIRE_TELEGRAM: 'false',
    BANK_PROVIDER: 'manual', BANK_API_BASE_URL: '', BANK_CLIENT_ID: '', BANK_CLIENT_SECRET: '', BANK_API_TOKEN: '', BANK_CERT_PATH: '', BANK_KEY_PATH: '', BANK_ACCOUNT: '', BANK_AGENCY: '', BANK_WALLET: '', BANK_CONTRACT: '', BANK_PIX_KEY: '', BOLETO_AUTO_GENERATE: 'false',
    RESIDENT_CRITERIA: '[{"key":"possui_pet","label":"Possui pet"},{"key":"imovel_alugado","label":"Imóvel alugado"},{"key":"possui_carro","label":"Possui carro"},{"key":"idoso_ou_pcd","label":"Idoso ou pessoa com deficiência"}]', EMERGENCY_CRITICAL_ALERTS: 'true', EMERGENCY_LOCATIONS: '["Minha unidade","Corredor","Vizinho","Elevador","Garagem","Salao de Festas","Brinquedoteca","Sauna","Piscina","Portaria","Zeladoria","Limpeza"]',
    EMAIL_PROVIDER: process.env.SENDGRID_API_KEY ? 'sendgrid' : 'smtp', SENDGRID_FROM_EMAIL: process.env.SENDGRID_FROM_EMAIL || '', SENDGRID_FROM_NAME: process.env.SENDGRID_FROM_NAME || 'Condomínio Vitória Régia', SENDGRID_REPLY_TO: process.env.SENDGRID_REPLY_TO || '', SENDGRID_TO_DEFAULT: process.env.SENDGRID_TO_DEFAULT || '', SENDGRID_DATA_RESIDENCY: process.env.SENDGRID_DATA_RESIDENCY || 'global', SMTP_HOST: '', SMTP_PORT: '587', SMTP_USER: '', SMTP_PASS: '', SMTP_SECURE: 'false', MAIL_FROM: '',
    TELEGRAM_ENABLED: process.env.TELEGRAM_ENABLED || process.env.ENABLE_TELEGRAM || 'true', TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '', TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || DEFAULT_TELEGRAM_CHAT_ID, TELEGRAM_PORTARIA_CHAT_ID: process.env.TELEGRAM_PORTARIA_CHAT_ID || DEFAULT_TELEGRAM_CHAT_ID, TELEGRAM_PORTARIA_LABEL: process.env.TELEGRAM_PORTARIA_LABEL || 'Celular Portaria', TELEGRAM_PORTARIA_ENABLED: process.env.TELEGRAM_PORTARIA_ENABLED || 'true', TELEGRAM_PORTARIA_RECEIVE_EMERGENCY: process.env.TELEGRAM_PORTARIA_RECEIVE_EMERGENCY || 'true', TELEGRAM_PORTARIA_RECEIVE_PACKAGES: process.env.TELEGRAM_PORTARIA_RECEIVE_PACKAGES || 'true', TELEGRAM_INTERCOM_FALLBACK_ENABLED: process.env.TELEGRAM_INTERCOM_FALLBACK_ENABLED || 'true', PACKAGE_ELEVATOR_AUTH_ENABLED: process.env.PACKAGE_ELEVATOR_AUTH_ENABLED || 'true', PACKAGE_TELEGRAM_DECISIONS_ENABLED: process.env.PACKAGE_TELEGRAM_DECISIONS_ENABLED || 'true', KIOSK_PORTARIA_PREMIUM_ENABLED: process.env.KIOSK_PORTARIA_PREMIUM_ENABLED || 'true', KIOSK_PORTARIA_PIN: process.env.KIOSK_PORTARIA_PIN || '', KIOSK_ALLOWED_APPS: process.env.KIOSK_ALLOWED_APPS || 'Vitória Régia Portaria,Telegram,Câmera,Wi-Fi', TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET || '', TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME || 'vitoriaregia_bot', TELEGRAM_START_URL: process.env.TELEGRAM_START_URL || 'https://t.me/vitoriaregia_bot', TELEGRAM_PARSE_MODE: process.env.TELEGRAM_PARSE_MODE || '',
    WHATSAPP_API_VERSION: 'v19.0', WHATSAPP_PHONE_NUMBER_ID: '', WHATSAPP_BUSINESS_ACCOUNT_ID: '', WHATSAPP_ACCESS_TOKEN: '', WHATSAPP_TEMPLATE_PACKAGE: '', WHATSAPP_TEMPLATE_RESERVATION: '',
    VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', VAPID_SUBJECT: '',
    ENABLE_SYSTEM_UPDATES: 'true', UPDATE_CHANNEL: 'stable', UPDATE_FEED_URL: '', UPDATE_APPLY_MODE: 'github', UPDATE_GITHUB_REPO: process.env.UPDATE_GITHUB_REPO || 'bmedeiros1987/vitoriaregia1', UPDATE_GITHUB_BRANCH: process.env.UPDATE_GITHUB_BRANCH || 'main'
  };
  for (const [key, value] of Object.entries(defaultSettings)) await q('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO NOTHING', [key, value]);

  // Sincroniza variáveis do Render para canais de comunicação sem gravar segredo no GitHub.
  const envSyncKeys = ['ENABLE_TELEGRAM','TELEGRAM_ENABLED','TELEGRAM_BOT_TOKEN','TELEGRAM_CHAT_ID','TELEGRAM_PORTARIA_CHAT_ID','TELEGRAM_PORTARIA_LABEL','TELEGRAM_PORTARIA_ENABLED','TELEGRAM_PORTARIA_RECEIVE_EMERGENCY','TELEGRAM_PORTARIA_RECEIVE_PACKAGES','TELEGRAM_INTERCOM_FALLBACK_ENABLED','PACKAGE_ELEVATOR_AUTH_ENABLED','PACKAGE_TELEGRAM_DECISIONS_ENABLED','KIOSK_PORTARIA_PREMIUM_ENABLED','KIOSK_PORTARIA_PIN','KIOSK_ALLOWED_APPS','TELEGRAM_BOT_USERNAME','TELEGRAM_START_URL','TELEGRAM_WEBHOOK_SECRET','TELEGRAM_API_BASE_URL','TELEGRAM_PARSE_MODE','TELEGRAM_SUPPORT_CHAT_ID','PUBLIC_APP_URL','ENABLE_EMAIL','SENDGRID_API_KEY','SMTP_PASS','SENDGRID_FROM_EMAIL','SENDGRID_FROM_NAME','SENDGRID_REPLY_TO','SENDGRID_TO_DEFAULT','EMAIL_PROVIDER','ENABLE_WHATSAPP','WHATSAPP_API_VERSION','WHATSAPP_PHONE_NUMBER_ID','WHATSAPP_BUSINESS_ACCOUNT_ID','WHATSAPP_ACCESS_TOKEN'];
  for (const key of envSyncKeys) {
    if (process.env[key] !== undefined && String(process.env[key]).trim() !== '') {
      await q('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value', [key, String(process.env[key])]).catch(()=>null);
    }
  }
  if (process.env.TELEGRAM_ENABLED !== undefined) await q('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value', ['ENABLE_TELEGRAM', String(process.env.TELEGRAM_ENABLED)]).catch(()=>null);
  if (process.env.ENABLE_TELEGRAM !== undefined) await q('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value', ['TELEGRAM_ENABLED', String(process.env.ENABLE_TELEGRAM)]).catch(()=>null);
  // Vitória Régia v10.9: Telegram sempre ativo por predefinição para todos os fluxos do sistema.
  await q("INSERT INTO settings(key,value) VALUES('ENABLE_TELEGRAM','true') ON CONFLICT(key) DO UPDATE SET value='true' WHERE settings.value IS NULL OR lower(settings.value) IN ('','false','0','nao','não','off')").catch(()=>null);
  await q("INSERT INTO settings(key,value) VALUES('TELEGRAM_ENABLED','true') ON CONFLICT(key) DO UPDATE SET value='true' WHERE settings.value IS NULL OR lower(settings.value) IN ('','false','0','nao','não','off')").catch(()=>null);
  await q("INSERT INTO settings(key,value) VALUES('TELEGRAM_CHAT_ID',$1) ON CONFLICT(key) DO UPDATE SET value=$1 WHERE settings.value IS NULL OR btrim(settings.value)=''", [DEFAULT_TELEGRAM_CHAT_ID]).catch(()=>null);
  await q("INSERT INTO settings(key,value) VALUES('TELEGRAM_TEST_CHAT_ID',$1) ON CONFLICT(key) DO UPDATE SET value=$1 WHERE settings.value IS NULL OR btrim(settings.value)=''", [DEFAULT_TELEGRAM_CHAT_ID]).catch(()=>null);
  await q("INSERT INTO settings(key,value) VALUES('TELEGRAM_PORTARIA_CHAT_ID',$1) ON CONFLICT(key) DO UPDATE SET value=$1 WHERE settings.value IS NULL OR btrim(settings.value)=''", [DEFAULT_TELEGRAM_CHAT_ID]).catch(()=>null);
  await q("INSERT INTO settings(key,value) VALUES('TELEGRAM_PORTARIA_LABEL','Celular Portaria') ON CONFLICT(key) DO NOTHING").catch(()=>null);
  await q("INSERT INTO settings(key,value) VALUES('TELEGRAM_PORTARIA_ENABLED','true') ON CONFLICT(key) DO NOTHING").catch(()=>null);
  await q("INSERT INTO settings(key,value) VALUES('TELEGRAM_PORTARIA_RECEIVE_EMERGENCY','true') ON CONFLICT(key) DO NOTHING").catch(()=>null);
  await q("INSERT INTO settings(key,value) VALUES('TELEGRAM_PORTARIA_RECEIVE_PACKAGES','true') ON CONFLICT(key) DO NOTHING").catch(()=>null);
  await q("INSERT INTO settings(key,value) VALUES('TELEGRAM_INTERCOM_FALLBACK_ENABLED','true') ON CONFLICT(key) DO NOTHING").catch(()=>null);
  await q("INSERT INTO settings(key,value) VALUES('PACKAGE_ELEVATOR_AUTH_ENABLED','true') ON CONFLICT(key) DO NOTHING").catch(()=>null);
  await q("INSERT INTO settings(key,value) VALUES('PACKAGE_TELEGRAM_DECISIONS_ENABLED','true') ON CONFLICT(key) DO NOTHING").catch(()=>null);
  await q("INSERT INTO settings(key,value) VALUES('KIOSK_PORTARIA_PREMIUM_ENABLED','true') ON CONFLICT(key) DO NOTHING").catch(()=>null);
  await q("INSERT INTO settings(key,value) VALUES('KIOSK_ALLOWED_APPS','Vitória Régia Portaria,Telegram,Câmera,Wi-Fi') ON CONFLICT(key) DO NOTHING").catch(()=>null);
  await q("INSERT INTO settings(key,value) VALUES('DELIVERY_DEFAULT_CHANNELS',$1) ON CONFLICT(key) DO UPDATE SET value=$1", ['{"app":true,"browser":true,"email":true,"telegram":true,"whatsapp":false}']).catch(()=>null);
  await q("UPDATE users SET notification_preferences = jsonb_set(COALESCE(notification_preferences,'{}'::jsonb), '{telegram}', 'true'::jsonb, true)").catch(()=>null);
  await q("UPDATE residents SET notification_preferences = jsonb_set(COALESCE(notification_preferences,'{}'::jsonb), '{telegram}', 'true'::jsonb, true)").catch(()=>null);


  const defaults = [
    ['elevador','Preso no elevador',process.env.ELEVATOR_EMERGENCY_PHONE || '',process.env.ELEVATOR_OPERATOR_NAME || 'Operadora do elevador','Mantenha a calma, acione o alarme interno e ligue para a operadora cadastrada pelo síndico.',false,1],
    ['incendio','Fogo / fumaça','193','Corpo de Bombeiros','Acione 193, deixe o local com segurança e aguarde orientação da portaria.',true,2],
    ['gas','Vazamento de gás','193','Corpo de Bombeiros / manutenção','Evite acionar interruptores, abra portas e janelas se houver segurança, afaste-se do local e aguarde orientação.',true,3],
    ['invasao','Invasão do prédio','190','Polícia Militar','Evite confronto, procure local seguro e comunique a portaria.',true,4],
    ['saude','Emergência médica','192','SAMU','Acione 192 e informe bloco, unidade e ponto de referência.',false,5],
    ['hidraulica','Vazamento grave','','Manutenção predial','Feche o registro se possível e informe imediatamente a administração.',false,6],
    ['energia','Queda de energia','','Concessionária / manutenção','Verifique áreas comuns e aguarde orientação da portaria.',false,7]
  ];
  for (const row of defaults) await q('INSERT INTO emergency_types(code,label,phone,supplier,instructions,notify_all,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(code) DO UPDATE SET notify_all=EXCLUDED.notify_all, sort_order=EXCLUDED.sort_order', row);

  const areas = [
    ['Salão de festas', 250, true], ['Churrasqueira', 120, true], ['Espaço gourmet', 180, true], ['Quadra', 0, false], ['Piscina', 0, false]
  ];
  for (const [name, fee, approval] of areas) await q('INSERT INTO common_areas(name, fee_amount, requires_approval, rules_document, reservation_periods) VALUES($1,$2,$3,$4,$5) ON CONFLICT(name) DO NOTHING', [name, fee, approval, defaultSettings.RESERVATION_DEFAULT_RULES, 'dia_todo,manha,tarde,noite,horario']);

  const masterEmail = process.env.BRUNO_EMAIL || process.env.MASTER_EMAIL || 'bruno@vitoriaregia.local';
  const masterPassword = process.env.BRUNO_PASSWORD || process.env.MASTER_PASSWORD || process.env.ADMIN_PASSWORD || '123456';
  const masterExists = await q('SELECT id FROM users WHERE lower(email)=lower($1)', [masterEmail]);
  if (!masterExists.rowCount) {
    await q('INSERT INTO users(name,email,password_hash,role,user_type,permissions,active) VALUES($1,$2,$3,$4,$5,$6,$7)', ['Administrador', masterEmail, await bcrypt.hash(masterPassword, 10), 'master', 'master', JSON.stringify(rolePermissions('master')), true]);
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
  return { id: row.id, name: row.name, email: row.email, role, user_type: row.user_type || role, is_outsourced: row.is_outsourced === true, unit: row.unit || '', phone: row.phone || '', whatsapp_phone: row.whatsapp_phone || row.phone || '', telegram_chat_id: row.telegram_chat_id || '', telegram_username: row.telegram_username || '', notification_preferences: parseJson(row.notification_preferences, {}), active: row.active !== false, resident_id: row.resident_id || null, employee_id: row.employee_id || null, permissions: normalizePermissions(row.permissions, role), force_password_change: row.force_password_change === true, last_login: row.last_login || null, created_at: row.created_at || null };
}
function auth(req, res, next) { try { const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,''); const payload=jwt.verify(token, JWT_SECRET); payload.permissions=normalizePermissions(payload.permissions, payload.role); req.user=payload; next(); } catch { res.status(401).json({ error: 'Não autorizado' }); } }
function hasPermission(user, permission) { if (!permission) return true; if (user?.role === 'master' || user?.role === 'admin') return true; if (user?.role === 'sindico') return !['platform.manage','bank.manage','system.update'].includes(permission); return Boolean(user?.permissions?.[permission]); }
function can(permission) { return (req,res,next) => hasPermission(req.user, permission) ? next() : res.status(403).json({ error: 'Acesso não permitido para este usuário.' }); }
const SECRET_SETTING_KEYS = new Set(['SENDGRID_API_KEY','SMTP_PASS','TELEGRAM_BOT_TOKEN','TELEGRAM_WEBHOOK_SECRET','WHATSAPP_ACCESS_TOKEN','WHATSAPP_API_TOKEN','UPDATE_GITHUB_TOKEN','DATABASE_URL','JWT_SECRET','BANK_CLIENT_SECRET','BANK_API_TOKEN','VAPID_PRIVATE_KEY','BANK_CERT_PATH','BANK_KEY_PATH']);
function isSecretSetting(key='') { return SECRET_SETTING_KEYS.has(String(key).toUpperCase()) || /TOKEN|SECRET|PASSWORD|PASS|PRIVATE_KEY|DATABASE_URL/i.test(String(key)); }
function maskSecretSetting(value='') { const s=String(value || ''); if (!s) return ''; if (s.includes('***')) return s; return s.length < 9 ? 'configurado' : `${s.slice(0,3)}***${s.slice(-3)}`; }
async function getSettingsObject({ maskSecrets=false }={}) { const rows=(await q('SELECT key,value FROM settings ORDER BY key')).rows; return rows.reduce((acc,r)=>{ acc[r.key] = maskSecrets && isSecretSetting(r.key) ? maskSecretSetting(r.value) : r.value; return acc; }, {}); }
async function getSetting(key, fallback='') { const r=await q('SELECT value FROM settings WHERE key=$1',[key]); const dbValue=r.rowCount ? String(r.rows[0].value ?? '') : ''; return dbValue !== '' ? dbValue : (process.env[key] || fallback); }
async function getTelegramDefaultChatId() { return String(await getSetting('TELEGRAM_CHAT_ID', process.env.TELEGRAM_CHAT_ID || DEFAULT_TELEGRAM_CHAT_ID) || DEFAULT_TELEGRAM_CHAT_ID).trim(); }
async function getTelegramPortariaChatId() {
  const fallback = await getTelegramDefaultChatId();
  return String(await getSetting('TELEGRAM_PORTARIA_CHAT_ID', process.env.TELEGRAM_PORTARIA_CHAT_ID || fallback) || fallback).trim();
}
async function getTelegramSupportChatId() {
  const fallback = await getTelegramDefaultChatId();
  return String(await getSetting('TELEGRAM_SUPPORT_CHAT_ID', process.env.TELEGRAM_SUPPORT_CHAT_ID || fallback) || fallback).trim();
}
async function telegramPortariaEnabled(kind='') {
  if (!boolValue(await getSetting('TELEGRAM_PORTARIA_ENABLED','true'), true)) return false;
  if (kind === 'emergencia') return boolValue(await getSetting('TELEGRAM_PORTARIA_RECEIVE_EMERGENCY','true'), true);
  if (kind === 'encomenda') return boolValue(await getSetting('TELEGRAM_PORTARIA_RECEIVE_PACKAGES','true'), true);
  return true;
}
async function getRuntimeSecret(key, fallback='') {
  // Preferência: Render/env > banco de configurações > fallback.
  // Isso impede que atualizações pelo site deixem Telegram/e-mail sem credencial quando a variável está no Render.
  const env = process.env[key];
  if (env !== undefined && String(env).trim() !== '') return String(env);
  const r = await q('SELECT value FROM settings WHERE key=$1',[key]).catch(()=>({rowCount:0,rows:[]}));
  const dbValue = r.rowCount ? String(r.rows[0].value ?? '') : '';
  return dbValue !== '' && !dbValue.includes('***') && dbValue !== 'configurado' ? dbValue : fallback;
}
async function preserveCommunicationSettingsSnapshot() {
  const keys=['ENABLE_EMAIL','EMAIL_PROVIDER','SENDGRID_API_KEY','SENDGRID_FROM_EMAIL','SENDGRID_FROM_NAME','SENDGRID_REPLY_TO','SENDGRID_TO_DEFAULT','SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASS','SMTP_SECURE','MAIL_FROM','ENABLE_TELEGRAM','TELEGRAM_ENABLED','TELEGRAM_BOT_TOKEN','TELEGRAM_CHAT_ID','TELEGRAM_TEST_CHAT_ID','TELEGRAM_BOT_USERNAME','TELEGRAM_START_URL','TELEGRAM_WEBHOOK_SECRET','TELEGRAM_API_BASE_URL','TELEGRAM_PARSE_MODE','TELEGRAM_SUPPORT_CHAT_ID','ENABLE_WHATSAPP','WHATSAPP_ACCESS_TOKEN','WHATSAPP_PHONE_NUMBER_ID','PUBLIC_APP_URL','UPDATE_GITHUB_TOKEN','UPDATE_GITHUB_REPO','UPDATE_GITHUB_BRANCH','RENDER_DEPLOY_HOOK_URL'];
  const out={};
  for (const k of keys) { const v = await getRuntimeSecret(k,''); if (v) out[k]=v; }
  return out;
}
async function restoreCommunicationSettingsSnapshot(snapshot={}) {
  for (const [k,v] of Object.entries(snapshot||{})) {
    if (v !== undefined && String(v).trim() !== '') await q('INSERT INTO settings(key,value,updated_at) VALUES($1,$2,now()) ON CONFLICT(key) DO UPDATE SET value=$2,updated_at=now()',[k,String(v)]).catch(()=>null);
  }
}

function withTimeout(promise, ms=8000, label='operação') { return Promise.race([promise, new Promise(resolve => setTimeout(() => resolve({ ok:false, timeout:true, error:`Tempo limite excedido em ${label}` }), ms))]); }
function channelResultSummary(result) { if (!result) return 'não solicitado'; if (result.ok) return 'enviado'; if (result.skipped) return 'ignorado'; if (result.timeout) return 'tempo esgotado'; return 'erro'; }

function isMaster(user) { return user?.role === 'master' || user?.role === 'admin'; }
function masterOnly(req, res, next) { return isMaster(req.user) ? next() : res.status(403).json({ error: 'Acesso reservado para manutenção do sistema.' }); }
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
    return boolValue(enabledPrimary, true) || boolValue(enabledLegacy, true);
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
const PLATFORM_SETTING_KEYS = new Set(['ENABLE_EMAIL','ENABLE_TELEGRAM','ENABLE_WHATSAPP','ENABLE_BROWSER_PUSH','ENABLE_APP_PORTARIA','ENABLE_APP_SINDICO','ENABLE_APP_MORADOR','REGISTRATION_REQUIRE_EMAIL','REGISTRATION_REQUIRE_WHATSAPP','REGISTRATION_REQUIRE_TELEGRAM','BANK_PROVIDER','BANK_API_BASE_URL','BANK_CLIENT_ID','BANK_ACCOUNT','BANK_AGENCY','BANK_WALLET','BANK_CONTRACT','BANK_PIX_KEY','BOLETO_AUTO_GENERATE','BOLETO_PROVIDER','ENABLE_SYSTEM_UPDATES','UPDATE_CHANNEL','UPDATE_FEED_URL','UPDATE_APPLY_MODE','UPDATE_GITHUB_REPO','UPDATE_GITHUB_BRANCH','APK_PORTARIA_URL','APK_SINDICO_URL','APK_MORADOR_URL','RESERVATION_MAX_GUESTS_DEFAULT','RESERVATION_COUNT_CHILDREN','RESERVATION_COUNT_INFANTS','RESIDENT_CRITERIA','EMERGENCY_CRITICAL_ALERTS','ALLOW_MULTIPLE_RESIDENTS_PER_UNIT','MAX_RESIDENTS_PER_UNIT','SHOW_UPDATES_TO_SINDICO','EMAIL_PROVIDER','SENDGRID_FROM_EMAIL','SENDGRID_FROM_NAME','SENDGRID_REPLY_TO','SENDGRID_TO_DEFAULT','SENDGRID_DATA_RESIDENCY','SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASS','SMTP_SECURE','MAIL_FROM','TELEGRAM_ENABLED','TELEGRAM_BOT_TOKEN','TELEGRAM_CHAT_ID','TELEGRAM_PORTARIA_CHAT_ID','TELEGRAM_PORTARIA_LABEL','TELEGRAM_PORTARIA_ENABLED','TELEGRAM_PORTARIA_RECEIVE_EMERGENCY','TELEGRAM_PORTARIA_RECEIVE_PACKAGES','TELEGRAM_INTERCOM_FALLBACK_ENABLED','PACKAGE_ELEVATOR_AUTH_ENABLED','PACKAGE_TELEGRAM_DECISIONS_ENABLED','KIOSK_PORTARIA_PREMIUM_ENABLED','KIOSK_PORTARIA_PIN','KIOSK_ALLOWED_APPS','TELEGRAM_WEBHOOK_SECRET','TELEGRAM_BOT_USERNAME','TELEGRAM_START_URL','TELEGRAM_PARSE_MODE','WHATSAPP_API_VERSION','WHATSAPP_PHONE_NUMBER_ID','WHATSAPP_BUSINESS_ACCOUNT_ID','WHATSAPP_ACCESS_TOKEN','WHATSAPP_TEMPLATE_PACKAGE','WHATSAPP_TEMPLATE_RESERVATION','VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','VAPID_SUBJECT']);
function containsProtectedSettings(body={}) { return Object.keys(body || {}).some(k => PLATFORM_SETTING_KEYS.has(k)); }
async function publicSettingsObject() {
  const s = await getSettingsObject();
  const keys = ['CONDO_NAME','APPEARANCE','THEME_ACCENT','ENABLE_EMAIL','ENABLE_TELEGRAM','ENABLE_WHATSAPP','ENABLE_BROWSER_PUSH','ENABLE_APP_PORTARIA','ENABLE_APP_SINDICO','ENABLE_APP_MORADOR','REGISTRATION_REQUIRE_EMAIL','REGISTRATION_REQUIRE_WHATSAPP','REGISTRATION_REQUIRE_TELEGRAM','APK_PORTARIA_URL','APK_SINDICO_URL','APK_MORADOR_URL','RESERVATION_MAX_GUESTS_DEFAULT','RESERVATION_COUNT_CHILDREN','RESERVATION_COUNT_INFANTS','RESIDENT_CRITERIA','EMERGENCY_CRITICAL_ALERTS','ALLOW_MULTIPLE_RESIDENTS_PER_UNIT','MAX_RESIDENTS_PER_UNIT','SHOW_UPDATES_TO_SINDICO','CREWCHECK_SITE','DEVELOPED_BY','THEME_TEXT_SIZE'];
  return Object.fromEntries(keys.map(k => [k, s[k] ?? '']));
}
function loginEmailFromChannels(body={}) {
  const email = String(body.email || '').trim(); if (email) return email.toLowerCase();
  const wa = onlyDigits(body.whatsapp_phone || body.phone || ''); if (wa) return `whatsapp_${wa}@vitoriaregia.local`;
  const tg = onlyDigits(body.telegram_chat_id || ''); if (tg) return `telegram_${tg}@vitoriaregia.local`;
  const tu = String(body.telegram_username || '').trim().replace(/^@/,'').toLowerCase().replace(/[^a-z0-9_]/g,''); if (tu) return `telegram_${tu}@vitoriaregia.local`;
  return `usuario_${randomCode(10).toLowerCase()}@vitoriaregia.local`; 
}

function normalizeUnit(unit='') { return String(unit || '').trim().replace(/\s+/g,'').toUpperCase(); }
function normalizeEmail(email='') { return String(email || '').trim().toLowerCase(); }
function hasDuplicateMessage(kind) { return `${kind} já cadastrado. Confira o cadastro existente antes de gravar novamente.`; }
function formatDeliveryPreference(v='') { const key=String(v||'').toLowerCase(); return ({ receber_elevador:'Autorizou envio pelo elevador', elevador:'Autorizou envio pelo elevador', retirar_portaria:'Vai retirar na portaria', buscar_portaria:'Vai retirar na portaria', retirar_mais_tarde:'Vai retirar mais tarde', retirar_agora:'Está indo retirar agora', chamar_interfone:'Pediu contato/interfone antes', nao_reconhece:'Não reconhece esta encomenda', portaria:'Vai retirar na portaria', nao_informado:'Aguardando escolha do morador' }[key] || 'Aguardando escolha do morador'); }
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
  const start = String(body.start_time || '00:00').slice(0,5);
  const end = String(body.end_time || '23:59').slice(0,5);
  const params=[String(body.area||''), String(body.reserved_for||''), start, end];
  if (excludeId) params.push(excludeId);
  const r=await q(`SELECT * FROM reservations
    WHERE deleted_at IS NULL
      AND COALESCE(status,'') NOT IN ('cancelada','cancelado')
      AND lower(coalesce(area,''))=lower($1)
      AND reserved_for=$2::date
      AND (($3::time < COALESCE(NULLIF(end_time,''),'23:59')::time)
       AND ($4::time > COALESCE(NULLIF(start_time,''),'00:00')::time))
      ${excludeId?'AND id <> $5':''}
    ORDER BY id DESC LIMIT 1`, params);
  return r.rows[0] || null;
}
async function requireNoDuplicate(kind, record) { if (record) { const err=new Error(hasDuplicateMessage(kind)); err.status=409; err.existing=record; throw err; } }
async function lookupResidentsForUnit({ unit='', recipient='' }={}) {
  const params=[]; let where=`COALESCE(active,true)=true`;
  if (unit) { params.push(normalizeUnit(unit)); where += ` AND upper(replace(coalesce(unit,''),' ',''))=$${params.length}`; }
  if (recipient) { params.push(`%${String(recipient).trim()}%`); where += ` AND lower(name) LIKE lower($${params.length})`; }
  const rows=(await q(`SELECT id,name,unit,phone,whatsapp_phone,email,telegram_chat_id,telegram_username,document,vehicle,resident_tags,notification_preferences,'resident' source FROM residents WHERE ${where} ORDER BY name LIMIT 20`, params)).rows;
  if (rows.length || !unit) return rows;
  const users=(await q("SELECT NULL::integer id,name,unit,phone,whatsapp_phone,email,telegram_chat_id,telegram_username,'' document,'' vehicle,'{}'::jsonb resident_tags,notification_preferences,'user' source FROM users WHERE upper(replace(coalesce(unit,''),' ',''))=$1 AND COALESCE(active,true)=true AND role NOT IN ('funcionario','portaria','financeiro') ORDER BY name LIMIT 20",[normalizeUnit(unit)])).rows;
  return users;
}

function escapeHtml(v='') { return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
function textToHtml(v='') { return `<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.55;color:#111827">${escapeHtml(v).replace(/\n/g,'<br>')}</div>`; }
function emailButton(url='', label='Acessar sistema') {
  if (!url) return '';
  return `<div style="margin-top:24px"><a href="${escapeHtml(url)}" style="display:inline-block;background:linear-gradient(135deg,#00345d,#0f766e);color:#ffffff;text-decoration:none;font-weight:700;border-radius:14px;padding:13px 20px;box-shadow:0 12px 26px rgba(0,52,93,.22)">${escapeHtml(label)}</a></div>`;
}
async function professionalEmailHtml({ subject='', text='', html='', actionUrl='', actionLabel='Acessar sistema' }={}) {
  const base = (await getSetting('PUBLIC_APP_URL', process.env.PUBLIC_APP_URL || process.env.RENDER_EXTERNAL_URL || '')).replace(/\/$/, '');
  const logo = base ? `${base}/logo-vitoria-regia.svg` : '';
  const crew = base ? `${base}/crewcheck-logo.svg` : '';
  const building = base ? `${base}/building-vitoria-regia.jpg` : '';
  const content = html || textToHtml(text);
  const accent = await getSetting('THEME_ACCENT', '#0f766e');
  return `<div style="margin:0;padding:28px;background:#eef4f3;font-family:Arial,Helvetica,sans-serif;color:#13231f">
    <div style="max-width:720px;margin:0 auto;background:#ffffff;border-radius:26px;overflow:hidden;border:1px solid #dce9e6;box-shadow:0 22px 58px rgba(0,31,55,.16)">
      <div style="padding:0;background:#002b4b;color:white">
        <div style="${building?`background:linear-gradient(135deg,rgba(0,31,55,.90),rgba(15,118,110,.78)),url('${building}') center/cover no-repeat;`:"background:linear-gradient(135deg,#002b4b,#0f766e);"}padding:30px 32px 34px 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>
            ${logo?`<td width="110" valign="middle" style="padding-right:28px"><img src="${logo}" alt="Vitória Régia" style="display:block;width:86px;height:86px;border-radius:18px;background:rgba(255,255,255,.96);padding:10px;border:1px solid rgba(255,255,255,.55)"/></td>`:''}
            <td valign="middle"><div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;opacity:.82;margin-bottom:7px">Condomínio Vitória Régia</div><h1 style="margin:0;font-size:23px;line-height:1.25;font-weight:800;color:#ffffff">${escapeHtml(subject || 'Atualização do sistema')}</h1><p style="margin:10px 0 0 0;font-size:14px;line-height:1.5;opacity:.94">Comunicação oficial do sistema Vitória Régia.</p></td>
          </tr></table>
        </div>
      </div>
      <div style="padding:40px 38px 16px 38px;font-size:15.5px;line-height:1.72;color:#16302c">${content}${emailButton(actionUrl, actionLabel)}</div>
      <div style="margin:12px 34px 28px 34px;padding:16px 18px;border-radius:18px;background:#f4f8f7;border:1px solid #e4eeeb;color:#50635f;font-size:13px;line-height:1.55">Esta mensagem foi enviada automaticamente pelo sistema. Em caso de dúvida, consulte a administração do condomínio.</div>
      <div style="padding:20px 30px;background:#f8fbfa;font-size:12px;color:#657773;border-top:1px solid #e5eeeb">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="line-height:1.45"><strong style="color:#12322e">Vitória Régia</strong><br/>Desenvolvido por CrewCheck · Todos os direitos reservados.</td>${crew?`<td align="right"><img src="${crew}" alt="CrewCheck" style="display:block;height:30px;margin-left:16px"/></td>`:''}</tr></table>
      </div>
    </div>
  </div>`;
}
function maskEmailList(value='') { return splitList(value).map(email => email.replace(/(^.).*(@.*$)/, '$1***$2')); }

async function sendEmailSmart({ to, subject, text, html, actionUrl='', actionLabel='Acessar sistema' }) {
  if (!(await featureEnabled('email'))) return { ok:false, skipped:true, reason:'Canal de e-mail não liberado nas configurações.' };
  const destination = splitList(to); if (!destination.length) { const err = new Error('Informe ao menos um destinatário de e-mail.'); err.status=400; throw err; }
  const provider = String(await getSetting('EMAIL_PROVIDER', process.env.SENDGRID_API_KEY ? 'sendgrid' : 'smtp')).toLowerCase();
  const sendgridKey = await getSetting('SENDGRID_API_KEY', process.env.SENDGRID_API_KEY || '');
  const fromEmail = await getSetting('SENDGRID_FROM_EMAIL', process.env.SENDGRID_FROM_EMAIL || process.env.MAIL_FROM || '');
  const fromName = await getSetting('SENDGRID_FROM_NAME', process.env.SENDGRID_FROM_NAME || 'Vitória Régia');
  const replyTo = await getSetting('SENDGRID_REPLY_TO', process.env.SENDGRID_REPLY_TO || '');
  const bodyText=String(text||'').trim(); const bodyHtml=await professionalEmailHtml({ subject, text:bodyText, html, actionUrl, actionLabel });
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
  if (!(await featureEnabled('browser'))) return { ok:false, skipped:true, reason:'Notificação do navegador não liberada nas configurações.' };
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.TELEGRAM_TIMEOUT_MS || 6500));
  try {
    const r = await fetch(`${base}/bot${token}/${method}`, { method:'POST', signal:controller.signal, headers:{ 'content-type':'application/json', connection:'keep-alive' }, body: JSON.stringify(body) });
    const data = await r.json().catch(()=>({}));
    if (r.ok && data.ok !== false) return { ok:true, data, description:data.description || '', transport:'post', delivered_at:new Date().toISOString() };
    if (method !== 'sendMessage') return { ok:false, data, description:data.description || '' };
  } catch(e) {
    if (method !== 'sendMessage') return { ok:false, error:e.name === 'AbortError' ? 'Tempo limite do Telegram excedido.' : e.message };
  } finally { clearTimeout(timer); }
  const chat = encodeURIComponent(body.chat_id || '');
  const text = encodeURIComponent(body.text || '');
  const url = `${base}/bot${token}/sendMessage?chat_id=${chat}&text=${text}`;
  const controller2 = new AbortController();
  const timer2 = setTimeout(() => controller2.abort(), Number(process.env.TELEGRAM_TIMEOUT_MS || 6500));
  try {
    const r2 = await fetch(url, { signal:controller2.signal, headers:{ connection:'keep-alive' } });
    const data2 = await r2.json().catch(()=>({}));
    return { ok:r2.ok && data2.ok !== false, data:data2, description:data2.description || '', transport:'get_fallback', delivered_at:new Date().toISOString(), ajuda: (r2.ok && data2.ok !== false) ? '' : 'Verifique se TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID e ENABLE_TELEGRAM estão corretos no Render.' };
  } catch(e) {
    return { ok:false, error:e.name === 'AbortError' ? 'Tempo limite do Telegram excedido.' : e.message, transport:'get_fallback' };
  } finally { clearTimeout(timer2); }
}
const telegramDedupeMemory = new Map();
function telegramDedupeKey(chat, text, options={}) {
  const cleanText = String(text || '').trim().replace(/\s+/g, ' ');
  const markup = options?.reply_markup ? JSON.stringify(options.reply_markup) : '';
  return `${chat}::${cleanText}::${markup}`;
}
function pruneTelegramDedupe(now=Date.now()) {
  const ttl = Number(process.env.TELEGRAM_DEDUPE_TTL_MS || 60000);
  for (const [k, ts] of telegramDedupeMemory.entries()) if (now - ts > ttl) telegramDedupeMemory.delete(k);
}
function markTelegramDedupe(keys=[], now=Date.now()) {
  const normalized = [...new Set(keys.filter(Boolean).map(k => String(k)))];
  const hit = normalized.find(k => telegramDedupeMemory.has(k));
  if (hit) return { duplicate:true, key:hit };
  for (const k of normalized) telegramDedupeMemory.set(k, now);
  return { duplicate:false, keys:normalized };
}
function unmarkTelegramDedupe(keys=[]) {
  for (const k of keys.filter(Boolean)) telegramDedupeMemory.delete(String(k));
}
function telegramPremiumMessage({ title='Vitória Régia', body='', category='notificacao', actionUrl='', details={} }={}) {
  const icons = {
    emergencia:'🚨', encomenda:'📦', reserva:'📅', financeiro:'💳', suporte:'🛟', ocorrencia:'📘', comunicado:'📣', cadastro:'👤', sistema:'⚙️', notificacao:'🔔'
  };
  const icon = icons[String(category || 'notificacao').toLowerCase()] || icons.notificacao;
  const lines = [
    `${icon} ${String(title || 'Notificação Vitória Régia').trim()}`,
    '',
    String(body || '').trim()
  ].filter(v => v !== undefined);
  const pairs = Object.entries(details || {}).filter(([,v]) => v !== undefined && v !== null && String(v).trim() !== '');
  if (pairs.length) {
    lines.push('', 'Detalhes:');
    for (const [k,v] of pairs) lines.push(`• ${k}: ${v}`);
  }
  if (actionUrl) lines.push('', `Acesse: ${actionUrl}`);
  lines.push('', 'Condomínio Vitória Régia');
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
function notificationCategoryFrom(title='', body='', payload={}) {
  const t = `${title} ${body}`.toLowerCase();
  if (payload?.emergency || /emerg[eê]ncia|alerta/.test(t)) return 'emergencia';
  if (/encomenda|portaria|retirada/.test(t)) return 'encomenda';
  if (/reserva|sal[aã]o|espa[cç]o/.test(t)) return 'reserva';
  if (/boleto|financeiro|pagamento|taxa|cobran[cç]a/.test(t)) return 'financeiro';
  if (/suporte|ticket|pedido/.test(t)) return 'suporte';
  if (/ocorr[eê]ncia|livro/.test(t)) return 'ocorrencia';
  if (/comunicado|aviso|mensagem/.test(t)) return 'comunicado';
  if (/cadastro|senha|usu[aá]rio/.test(t)) return 'cadastro';
  return 'notificacao';
}
function fullActionUrl(actionUrl='') {
  const base = String(process.env.PUBLIC_APP_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');
  if (!actionUrl) return base || '';
  if (/^https?:\/\//i.test(actionUrl)) return actionUrl;
  return base ? `${base}${actionUrl.startsWith('/') ? '' : '/'}${actionUrl}` : actionUrl;
}

async function sendTelegramMessage(chatId, text, options={}) {
  if (!(await featureEnabled('telegram'))) return { ok:false, skipped:true, reason:'Telegram não liberado em Configurações.' };
  const allowDefaultChat = options.allowDefaultChat !== false;
  const cleanOptions = { ...(options || {}) };
  delete cleanOptions.allowDefaultChat;
  delete cleanOptions.dedupeKey;
  const chat = chatId || (allowDefaultChat ? await getTelegramDefaultChatId() : '');
  if (!chat) return { ok:false, skipped:true, reason:'Chat ID do Telegram não configurado para este destinatário.' };
  const now = Date.now();
  pruneTelegramDedupe(now);

  // v12.5.2: deduplicação global por conteúdo + destinatário.
  // Mesmo que uma área chame createNotification() e também chame sendTelegramMessage(),
  // ou que dois módulos montem dedupeKey diferentes, a mesma mensagem para o mesmo chat
  // fica bloqueada por TELEGRAM_DEDUPE_TTL_MS (padrão: 60s).
  const naturalKey = telegramDedupeKey(chat, text, cleanOptions);
  const explicitKey = options.dedupeKey ? `explicit:${options.dedupeKey}` : '';
  const guard = markTelegramDedupe([naturalKey, explicitKey], now);
  if (guard.duplicate) return { ok:true, skipped:true, deduped:true, reason:'Mensagem Telegram duplicada bloqueada globalmente.' };

  const parseMode = await getSetting('TELEGRAM_PARSE_MODE', process.env.TELEGRAM_PARSE_MODE || '');
  const payload = { chat_id: chat, text, ...(parseMode ? { parse_mode: parseMode } : {}), ...cleanOptions };
  const result = await telegramApi('sendMessage', payload);
  if (!result?.ok) unmarkTelegramDedupe(guard.keys);
  return result;
}
async function sendPortariaTelegram({ title, body, category='notificacao', action_url='', details={}, dedupeKey='' }={}) {
  if (!(await telegramPortariaEnabled(category))) return { ok:false, skipped:true, reason:'Telegram Portaria Premium desativado.' };
  const chat = await getTelegramPortariaChatId();
  const label = await getSetting('TELEGRAM_PORTARIA_LABEL','Celular Portaria');
  const text = telegramPremiumMessage({ title, body, category, actionUrl:fullActionUrl(action_url), details:{ ...details, Destino:label } });
  return sendTelegramMessage(chat, text, { disable_web_page_preview:true, allowDefaultChat:false, dedupeKey:dedupeKey || `portaria:${category}:${title}:${body}` });
}
async function sendWhatsAppText(phone, text) { if (!(await featureEnabled('whatsapp'))) return { ok:false, skipped:true, reason:'WhatsApp não liberado nas configurações.' }; const phoneId=await getSetting('WHATSAPP_PHONE_NUMBER_ID', process.env.WHATSAPP_PHONE_NUMBER_ID || ''); const token=await getSetting('WHATSAPP_ACCESS_TOKEN', process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_API_TOKEN || ''); const version=await getSetting('WHATSAPP_API_VERSION', process.env.WHATSAPP_API_VERSION || 'v19.0'); const to = onlyDigits(phone); if (!phoneId || !token || !to) return { ok:false, skipped:true }; const r = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, { method:'POST', headers:{ 'content-type':'application/json', authorization:`Bearer ${token}` }, body: JSON.stringify({ messaging_product:'whatsapp', to, type:'text', text:{ body:text } }) }); return { ok:r.ok, data: await r.json().catch(()=>({})) }; }
async function findResident({ unit='', recipient='', resident_id=null, user_id=null }={}) {
  if (resident_id) { const r=await q('SELECT * FROM residents WHERE id=$1 AND COALESCE(active,true)=true',[resident_id]); if (r.rowCount) return r.rows[0]; }
  if (user_id) { const r=await q('SELECT r.* FROM users u JOIN residents r ON r.id=u.resident_id WHERE u.id=$1',[user_id]); if (r.rowCount) return r.rows[0]; }
  if (unit) {
    const normalized = normalizeUnit(unit);
    const r=await q("SELECT * FROM residents WHERE upper(replace(coalesce(unit,''),' ',''))=$1 AND COALESCE(active,true)=true ORDER BY id DESC LIMIT 1",[normalized]);
    if (r.rowCount) return r.rows[0];
    const u=(await q("SELECT * FROM users WHERE upper(replace(coalesce(unit,''),' ',''))=$1 AND COALESCE(active,true)=true AND role NOT IN ('funcionario','portaria','financeiro') ORDER BY id DESC LIMIT 1",[normalized])).rows[0];
    if (u) {
      const created=(await q('INSERT INTO residents(name,unit,phone,whatsapp_phone,email,document,telegram_chat_id,telegram_username,notification_preferences) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[u.name||u.email, u.unit||unit, u.phone||'', u.whatsapp_phone||u.phone||'', u.email||'', '', u.telegram_chat_id||'', u.telegram_username||'', JSON.stringify(parseJson(u.notification_preferences,{ app:true,browser:true,email:Boolean(u.email),telegram:true,whatsapp:Boolean(u.whatsapp_phone||u.phone) }))])).rows[0];
      await q('UPDATE users SET resident_id=$1 WHERE id=$2 AND resident_id IS NULL',[created.id,u.id]).catch(()=>null);
      await audit('sistema','criou morador a partir de usuário',`${created.name} unidade ${created.unit}`).catch(()=>null);
      return created;
    }
  }
  if (recipient) { const r=await q('SELECT * FROM residents WHERE COALESCE(active,true)=true AND lower(name) LIKE lower($1) ORDER BY id DESC LIMIT 1',[`%${String(recipient).trim()}%`]); if (r.rowCount) return r.rows[0]; }
  return null;
}
async function createNotification({ resident_id=null, user_id=null, title, body, channel='app', channels={}, action_url='', payload={}, status='enviando' }) {
  const normalizedChannels = { app:true, browser:true, telegram:true, email:false, ...(channels || {}) };
  const normalizedPayload = { ...(payload || {}) };
  const r=await q('INSERT INTO notifications(user_id,resident_id,title,body,channel,channels,status,delivery_status,delivery_started_at,action_url,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now(),$9,$10) RETURNING *',[user_id,resident_id,title,body,channel,JSON.stringify(normalizedChannels),status,JSON.stringify({ app:'registrada' }),action_url,JSON.stringify(normalizedPayload)]);
  const notification = r.rows[0];

  // v12.5.0: notificações criadas diretamente pelo sistema também disparam Telegram.
  // Antes, o Telegram funcionava em testes/emergência/encomenda, mas vários módulos apenas gravavam
  // a notificação no banco. Esta entrega automática cobre ocorrências, suporte, auditorias internas etc.
  if (normalizedChannels.telegram && !normalizedPayload.__skip_auto_delivery) {
    try {
      let target = null;
      if (resident_id) target = (await q('SELECT telegram_chat_id, notification_preferences FROM residents WHERE id=$1',[resident_id])).rows[0] || null;
      if (!target && user_id) target = (await q('SELECT telegram_chat_id, notification_preferences FROM users WHERE id=$1',[user_id])).rows[0] || null;
      const prefs = parseJson(target?.notification_preferences, { telegram:true });
      if (prefs.telegram !== false) {
        const premium = telegramPremiumMessage({ title:title || 'Notificação Vitória Régia', body:body || '', category:notificationCategoryFrom(title, body, normalizedPayload), actionUrl:fullActionUrl(action_url), details: normalizedPayload?.package_id ? { Código: normalizedPayload.pickup_code || '', Encomenda: normalizedPayload.package_id } : {} });
        const result = await sendTelegramMessage(target?.telegram_chat_id || '', premium, { disable_web_page_preview:true, allowDefaultChat:true, dedupeKey:`notification:${target?.telegram_chat_id || resident_id || user_id || 'default'}:${title}:${body}` }).catch(e=>({ ok:false, error:e.message }));
        await updateNotificationDelivery(notification.id, { telegram: result }).catch(()=>null);
      }
    } catch(e) {
      await updateNotificationDelivery(notification.id, { telegram:{ ok:false, error:e.message } }).catch(()=>null);
    }
  }
  return notification;
}
async function updateNotificationDelivery(id, delivery={}) {
  if (!id) return null;
  const hasError = Object.values(delivery).some(v => v && typeof v === 'object' && !v.ok && !v.skipped);
  const finished = Object.values(delivery).some(v => v && typeof v === 'object' && (v.ok || v.skipped || v.error || v.timeout));
  const status = hasError ? 'erro_envio' : (finished ? 'enviada' : 'enviando');
  await q('UPDATE notifications SET delivery_status=$1,status=$2,delivery_finished_at=now() WHERE id=$3',[JSON.stringify(delivery),status,id]).catch(()=>null);
  return { status, delivery };
}
async function notifyResident(resident, { title, body, channels={}, action_url='', payload={} }) {
  const prefs = await filterChannelsByPlan({ app:true, browser:true, email:true, telegram:true, whatsapp:false, ...parseJson(resident?.notification_preferences, {}) , ...channels });
  const notification = await createNotification({ resident_id: resident?.id || null, title, body, channel:'app', channels:prefs, action_url, payload:{ ...payload, __skip_auto_delivery:true }, status:'enviando' }).catch(()=>null);
  const jobs = {};
  if (prefs.telegram) {
    const tgOptions = payload?.telegram_reply_markup ? { reply_markup: payload.telegram_reply_markup, disable_web_page_preview:true } : { disable_web_page_preview:true };
    const premium = telegramPremiumMessage({ title, body, category:notificationCategoryFrom(title, body, payload), actionUrl:fullActionUrl(action_url), details: payload?.package_id ? { Código: payload.pickup_code || '', Encomenda: payload.package_id } : {} });
    jobs.telegram = withTimeout(sendTelegramMessage(resident?.telegram_chat_id || '', premium, { ...tgOptions, allowDefaultChat:true, dedupeKey:`resident:${notification?.id || resident?.id || 'sem-id'}:telegram` }).catch(e=>({ ok:false, error:e.message })), Number(process.env.TELEGRAM_TIMEOUT_MS || 6500), 'Telegram');
  }
  if (prefs.email && resident?.email) jobs.email = withTimeout(sendEmailSmart({ to: resident.email, subject:title, text:body, actionUrl: action_url, actionLabel:'Abrir no sistema' }).catch(e=>({ ok:false, error:e.message })), Number(process.env.EMAIL_TIMEOUT_MS || 12000), 'E-mail');
  if (prefs.browser && resident?.id) jobs.browser = sendBrowserPushToResident(resident.id, title, body, action_url || '/', payload).catch(e=>({ ok:false, error:e.message }));
  if (prefs.whatsapp && (resident?.whatsapp_phone || resident?.phone)) jobs.whatsapp = sendWhatsAppText(resident.whatsapp_phone || resident.phone, body).catch(e=>({ ok:false, error:e.message }));
  const entries = await Promise.all(Object.entries(jobs).map(async ([k,p]) => [k, await p]));
  const delivery = Object.fromEntries(entries);
  await updateNotificationDelivery(notification?.id, delivery);
  return { ok: !Object.values(delivery).some(v=>v && !v.ok && !v.skipped), notification_id:notification?.id || null, delivery, resumo:Object.fromEntries(Object.entries(delivery).map(([k,v])=>[k,channelResultSummary(v)])) };
}
async function notifyStaff({ title, body, action_url='', channels={} }) {
  const staff = (await q("SELECT * FROM users WHERE role IN ('master','sindico','admin','portaria') AND active=true")).rows;
  const notifIds=[];
  for (const user of staff) {
    const n = await createNotification({ user_id:user.id, title, body, channel:'app', channels:{ app:true, browser:true, telegram:true, email:true, ...channels }, action_url, payload:{ __skip_auto_delivery:true }, status:'enviando' }).catch(()=>null);
    if (n?.id) notifIds.push(n.id);
  }
  const jobs = {};
  if (await featureEnabled('telegram')) { const category=notificationCategoryFrom(title, body, {}); jobs.telegram = withTimeout(sendTelegramMessage('', telegramPremiumMessage({ title, body, category, actionUrl:fullActionUrl(action_url) }), { disable_web_page_preview:true, dedupeKey:`staff:${title}:${body}` }).catch(e=>({ ok:false, error:e.message })), Number(process.env.TELEGRAM_TIMEOUT_MS || 6500), 'Telegram'); jobs.telegram_portaria = withTimeout(sendPortariaTelegram({ title, body, category, action_url, dedupeKey:`staff-portaria:${title}:${body}` }).catch(e=>({ ok:false, error:e.message })), Number(process.env.TELEGRAM_TIMEOUT_MS || 6500), 'Telegram Portaria'); }
  const emails = staff.map(u=>u.email).filter(Boolean);
  if (emails.length && await featureEnabled('email')) jobs.email = withTimeout(sendEmailSmart({ to: emails.join(','), subject:title, text:body, actionUrl: action_url, actionLabel:'Abrir no sistema' }).catch(e=>({ ok:false, error:e.message })), Number(process.env.EMAIL_TIMEOUT_MS || 12000), 'E-mail');
  const entries = await Promise.all(Object.entries(jobs).map(async ([k,p]) => [k, await p]));
  const delivery = Object.fromEntries(entries);
  for (const id of notifIds) await updateNotificationDelivery(id, delivery);
  return { ok: !Object.values(delivery).some(v=>v && !v.ok && !v.skipped), delivery };
}
async function notifyAllResidents({ title, body, channels={}, action_url='', payload={} }) { const residents=(await q('SELECT * FROM residents WHERE email IS NOT NULL OR phone IS NOT NULL')).rows; for (const r of residents) await notifyResident(r, { title, body, channels:{ app:true, browser:true, ...channels }, action_url, payload }).catch(()=>null); }

async function sendTemporaryPasswordToUser(user, temp, title='Senha temporária - Vitória Régia') {
  const prefs = await filterChannelsByPlan({ app:true, browser:true, email:true, telegram:true, whatsapp:true });
  const body = `Sua senha temporária é: ${temp}\nAcesse o sistema e altere sua senha.`;
  await createNotification({ user_id:user.id, title:'Senha temporária gerada', body:'Uma senha temporária foi enviada pelos seus canais cadastrados.', channel:'app', channels:prefs, payload:{ __skip_auto_delivery:true } }).catch(()=>null);
  const jobs=[];
  if (prefs.email && user.email) jobs.push(sendEmailSmart({ to:user.email, subject:title, text:body, actionUrl:'/#/perfil', actionLabel:'Abrir meu perfil' }).catch(e=>({ ok:false, error:e.message })));
  if (prefs.telegram) jobs.push(sendTelegramMessage(user.telegram_chat_id || '', telegramPremiumMessage({ title, body, category:'cadastro', actionUrl:fullActionUrl('/#/perfil') })).catch(e=>({ ok:false, error:e.message }))); 
  if (prefs.whatsapp && (user.whatsapp_phone || user.phone)) jobs.push(sendWhatsAppText(user.whatsapp_phone || user.phone, body).catch(e=>({ ok:false, error:e.message })));
  return Promise.all(jobs);
}

async function sendRegistrationAcknowledgement(request={}) {
  if (!request?.email || !(await featureEnabled('email'))) return { ok:false, skipped:true, reason:'E-mail não informado ou canal de e-mail desativado.' };
  const roleName = String(request.role || 'morador') === 'funcionario' ? 'funcionário do condomínio' : 'morador';
  const unitLine = request.unit ? `\nUnidade/setor informado: ${request.unit}` : '';
  const text = `Olá, ${request.name || 'usuário'}.

Recebemos sua solicitação de cadastro como ${roleName} no Sistema Vitória Régia.${unitLine}

Seu cadastro será analisado pela administração em até 48 horas.

Se aprovado, você receberá um novo aviso com seu usuário de acesso e uma senha temporária. No primeiro acesso, o sistema solicitará a alteração da senha para sua segurança.

Esta é uma mensagem automática de confirmação.`;
  return sendEmailSmart({
    to: request.email,
    subject: 'Solicitação de cadastro recebida - Vitória Régia',
    text,
    actionUrl: '',
    actionLabel: 'Acessar sistema'
  });
}

async function currentOnDuty(role='portaria') { const r = await q("SELECT s.*, e.name employee_name, e.email employee_email, e.phone employee_phone FROM shifts s JOIN employees e ON e.id=s.employee_id WHERE e.active=true AND s.status <> 'cancelada' AND now() BETWEEN s.starts_at AND s.ends_at AND ($1='' OR s.role=$1 OR e.role=$1) ORDER BY s.starts_at DESC LIMIT 1", [role || '']); return r.rows[0] || null; }
function normalizeDate(value='') { const s=String(value||''); const m=s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/); if (!m) return null; const year=m[3].length===2?'20'+m[3]:m[3]; return `${year}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; }
function parseCurrency(value='') { const matches=[...String(value||'').matchAll(/(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/g)].map(m=>m[1]); if (!matches.length) return ''; const nums=matches.map(x=>Number(x.replace(/\./g,'').replace(',','.'))).filter(Number.isFinite); return nums.length ? String(Math.max(...nums).toFixed(2)) : ''; }
function normalizeOcrText(text='') {
  return String(text || '')
    .replace(/\r/g, '\n')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\u00a0/g, ' ')
    .replace(/[|]+/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
function firstMatch(text, patterns) {
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) return String(m[1]).trim();
  }
  return '';
}
function normalizeOcrUnit(raw='') {
  const s = String(raw || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  const num = (s.match(/(11(?:01|02|03)|10(?:01|02|03)|[1-9]0[1-3]|[1-9][0-9]{2})/) || [,''])[1] || '';
  if (!num) return '';
  const n = Number(num);
  if ([101,102,103].includes(n) || (/^[2-9]0[1-3]$/.test(num)) || (/^10(?:01|02|03)$/.test(num)) || (/^11(?:01|02|03)$/.test(num))) return num;
  return num;
}
function parsePackageText(text='') {
  const clean = normalizeOcrText(text);
  const upper = clean.toUpperCase();
  const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);
  const carriers = [
    ['J&T Express', /\bJ\s*&\s*T\s*(?:EXPRESS)?\b|\bJNT\b/i],
    ['Correios', /\bCORREIOS\b|SEDEX|PAC\b/i],
    ['Jadlog', /\bJADLOG\b/i],
    ['Loggi', /\bLOGGI\b/i],
    ['Total Express', /\bTOTAL\s+EXPRESS\b/i],
    ['Mercado Livre', /MERCADO\s*LIVRE|MELI|MERCADO\s*ENVIOS/i],
    ['Amazon', /\bAMAZON\b/i],
    ['Shopee', /\bSHOPEE\b|SPX\b/i],
    ['Magalu', /MAGALU|MAGAZINE\s+LUIZA/i],
    ['DHL', /\bDHL\b/i],
    ['FedEx', /\bFEDEX\b/i],
    ['UPS', /\bUPS\b/i]
  ];
  const carrier = (carriers.find(([,re]) => re.test(clean)) || [''])[0] || '';
  const jntCode = firstMatch(upper, [ /\b([A-Z]{2}\s*\d{3}\s*[-–]?\s*\d{2}\s*\d{3})\b/, /\b([A-Z]{2}\s*\d{3}\s*[-–]?\s*\d{5,6})\b/ ]).replace(/\s+/g, ' ').trim();
  const postalCode = firstMatch(upper, [/\b([A-Z]{2}\d{9}[A-Z]{2})\b/]);
  const longBarcode = firstMatch(upper, [/\b(\d{12,18})\b/]);
  const tracking = (jntCode || postalCode || longBarcode || firstMatch(upper, [/\b([A-Z]{1,4}\d{8,16})\b/])).replace(/\s/g,'').replace(/[-–]/g,'-');
  const order_number = firstMatch(clean, [/(?:Pedido|Order|Pedido nº|Pedido n[ºo])\s*[:\-]?\s*([A-Z0-9\-\.\/]+)/i]);
  const invoice_number = firstMatch(clean, [/(?:NFe|NF-e|NF\s*n[ºo]|Nota Fiscal)\s*(?:N[ºo]\.?\s*)?[:\-]?\s*(\d{3,12})/i]);
  const barcode = longBarcode || '';
  let recipient = firstMatch(clean, [ /DESTINAT[ÁA]RIO\s*\n\s*([^\n]+)/i, /(?:Destinat[áa]rio|Recebedor|Nome do destinat[áa]rio|Cliente|Nome)\s*[:\-]\s*([^\n]+)/i ]);
  if (!recipient) { const idx = lines.findIndex(l => /DESTINAT[ÁA]RIO/i.test(l)); if (idx >= 0) recipient = (lines[idx+1] || '').trim(); }
  if (!recipient) recipient = lines.find(l => /^[A-ZÀ-Ú][A-Za-zÀ-ÿ'´`\s]{6,}$/.test(l) && !/LTDA|EXPRESS|COMERCIAL|REMETENTE|DESTINAT/i.test(l)) || '';
  let unit = firstMatch(clean, [
    /(?:apto|apartamento|unidade|unid\.?|ap\.?|apto\.|apart\.?|apt\.?|sala|cs|casa)\s*[:\-]?\s*(11(?:01|02|03)|10(?:01|02|03)|[1-9]0[1-3]|[1-9][0-9]{2})/i,
    /(?:Vit[óo]ria\s+R[ée]gia|Edif[ií]cio\s+Vit[óo]ria\s+R[ée]gia|Condom[ií]nio\s+Vit[óo]ria\s+R[ée]gia)[^\n;,.]*[;,\s]+(?:SN|N|N[ºo])?\s*(11(?:01|02|03)|10(?:01|02|03)|[1-9]0[1-3]|[1-9][0-9]{2})/i,
    /(?:Lote|Bloco|Torre|Edif[ií]cio)[^\n]*?(11(?:01|02|03)|10(?:01|02|03)|[1-9]0[1-3]|[1-9][0-9]{2})/i,
    /\b(?:CS|SN|AP|APT|APTO)\s*(11(?:01|02|03)|10(?:01|02|03)|[1-9]0[1-3]|[1-9][0-9]{2})\b/i
  ]);
  unit = normalizeOcrUnit(unit || firstMatch(clean, [/\b(11(?:01|02|03)|10(?:01|02|03)|[1-9]0[1-3])\b/]));
  const sender = firstMatch(clean, [ /REMETENTE\s*\n\s*([^\n]+)/i, /(?:Remetente|Sender|Loja|Emitente)\s*[:\-]\s*([^\n]+)/i ]);
  const addressBlock = firstMatch(clean, [/(?:DESTINAT[ÁA]RIO[\s\S]{0,250}?)(?:REMETENTE|$)/i]);
  const notesParts = [];
  if (carrier) notesParts.push(`Transportadora: ${carrier}`);
  if (order_number) notesParts.push(`Pedido: ${order_number}`);
  if (invoice_number) notesParts.push(`NF-e: ${invoice_number}`);
  if (barcode) notesParts.push(`Código de barras: ${barcode}`);
  if (sender) notesParts.push(`Remetente: ${sender}`);
  const notes = notesParts.join(' · ');
  return { tracking: tracking || '', recipient: recipient || '', unit: unit || '', label: carrier || tracking || '', carrier, order_number, invoice_number, barcode, sender, address: addressBlock || '', notes, raw: clean.slice(0,5000) };
}
function parseInvoiceText(text='') {
  const clean = normalizeOcrText(text);
  const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);
  const access_key = firstMatch(clean, [/\b(\d{44})\b/]);
  const document_number = firstMatch(clean, [ /(?:NF\-?e|NFS\-?e|nota fiscal|n[úu]mero|nº|no\.)\s*[:\-]?\s*(\d{3,12})/i, /(?:DANFE|CHAVE DE ACESSO|S[ée]rie)[\s\S]{0,120}?\b(\d{5,12})\b/i ]) || firstMatch(clean, [/\b(\d{6,12})\b/]);
  const supplier = firstMatch(clean, [ /(?:emitente|fornecedor|prestador|remetente)\s*[:\-]\s*([^\n]+)/i, /(\b[A-ZÀ-Ú0-9 .,&\-]+(?:LTDA|S\.A\.?|SA|MEI|EIRELI|COMERCIAL|SERVIÇOS|SERVICOS)\b[^\n]*)/i ]) || lines.find(l => /LTDA|S\.A|MEI|EIRELI|SERVI|COMERC/i.test(l)) || '';
  const amount = parseCurrency(clean);
  const issue_date = normalizeDate(firstMatch(clean, [/(?:emiss[aã]o|emitida em|data de emiss[aã]o|data)\s*[:\-]?\s*([0-9\/\-.]+)/i]) || clean);
  const due_date = normalizeDate(firstMatch(clean, [/(?:vencimento|venc\.?|pagar at[eé]|data de vencimento)\s*[:\-]?\s*([0-9\/\-.]+)/i]));
  const unit = normalizeOcrUnit(firstMatch(clean, [/(?:apto|apartamento|unidade|unid\.?|ap\.?)\s*[:\-]?\s*(11(?:01|02|03)|10(?:01|02|03)|[1-9]0[1-3])/i]));
  return { supplier, document_number, access_key, amount, issue_date, due_date, unit, category:'nota fiscal', raw:clean.slice(0,8000) };
}
function googleCalendarUrl(res) { const date = String(res.reserved_for || '').replace(/-/g,''); const start = (res.all_day ? '0000' : (res.start_time || '19:00').replace(':','')) + '00'; const end = (res.all_day ? '2359' : (res.end_time || '23:00').replace(':','')) + '00'; const title=encodeURIComponent(`Reserva ${res.area || ''} - Unidade ${res.unit || ''}`); const details=encodeURIComponent(`Reserva Vitória Régia\nMorador: ${res.resident || ''}\nStatus: ${res.status || ''}`); return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${date}T${start}/${date}T${end}&details=${details}&location=${encodeURIComponent(res.area || '')}`; }
function icsContent(res) { const date=String(res.reserved_for||'').replace(/-/g,''); const start=(res.all_day?'0000':(res.start_time||'19:00').replace(':',''))+'00'; const end=(res.all_day?'2359':(res.end_time||'23:00').replace(':',''))+'00'; const uid=`reserva-${res.id}@vitoriaregia`; return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Vitoria Regia Pro//Reservas//PT-BR','BEGIN:VEVENT',`UID:${uid}`,`DTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'')}`,`DTSTART:${date}T${start}`,`DTEND:${date}T${end}`,`SUMMARY:Reserva ${res.area || ''} - Unidade ${res.unit || ''}`,`DESCRIPTION:Morador ${res.resident || ''} - Status ${res.status || ''}`,`LOCATION:${res.area || ''}`,'END:VEVENT','END:VCALENDAR'].join('\r\n'); }

function reservationStatusInfo(status='pre_agendada', res={}) {
  const label = ({ pre_agendada:'pré-agendada', pendente_pagamento:'pendente pagamento', pendente_aceite_regras:'pendente aceite das regras de utilização', confirmada:'confirmada', cancelada:'cancelada' }[status] || status || 'atualizada');
  const when = res.reserved_for ? new Date(res.reserved_for).toLocaleDateString('pt-BR', { timeZone:'UTC' }) : 'data informada';
  const timeText = res.all_day ? 'durante o dia todo' : `das ${res.start_time || '--'} às ${res.end_time || '--'}`;
  const base = `Reserva do espaço ${res.area || ''} para ${when}, ${timeText}, unidade ${res.unit || '-'}.`;
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
function updateSignatureRequired(manifest={}) {
  const env = String(process.env.UPDATE_REQUIRE_SIGNATURE || '').toLowerCase().trim();
  const manifestFlag = String(manifest.requires_signature ?? manifest.require_signature ?? '').toLowerCase().trim();
  // O próprio pacote pode declarar que não exige assinatura. Nesse caso, token interno + hash bastam.
  if (['0','false','nao','não','no','off'].includes(manifestFlag)) return false;
  return ['1','true','sim','yes','on'].includes(env);
}
function verifyManifestSignature(manifest) {
  const required = updateSignatureRequired(manifest);
  const hasSignature = Boolean(manifest.signature);
  if (!required) return true;
  if (!hasSignature) {
    throw new Error('Atualização validada por token/hash, mas o Render está exigindo assinatura digital. Defina UPDATE_REQUIRE_SIGNATURE=false ou use um ZIP assinado.');
  }
  if (!UPDATE_PUBLIC_KEY) {
    throw new Error('UPDATE_PUBLIC_KEY não configurada no Render para validar a assinatura digital.');
  }
  const ok = cryptoVerify('RSA-SHA256', Buffer.from(canonicalUpdateManifest(manifest)), UPDATE_PUBLIC_KEY, Buffer.from(String(manifest.signature), 'base64'));
  if (!ok) throw new Error('Assinatura digital inválida para esta chave pública.');
  return true;
}
function normalizeUpdateManifest(raw={}) {
  const manifest = { ...raw };
  manifest.system = manifest.system || 'vitoria-regia-pro';
  manifest.update_code = manifest.update_code || manifest.code || manifest.codigo || '';
  manifest.version = manifest.version || manifest.to_version || manifest.name || '';
  manifest.to_version = manifest.to_version || manifest.version || '';
  manifest.title = manifest.title || manifest.name || `Atualização ${manifest.update_code}`;
  manifest.payload_file = manifest.payload_file || manifest.payload || 'payload.zip';
  manifest.validation_token = manifest.validation_token || manifest.token || manifest.update_token || '';
  manifest.token = manifest.token || manifest.validation_token || '';
  return manifest;
}
function validateUpdatePackage(buffer, validationCode='') {
  const zip = new AdmZip(buffer);
  const manifestEntry = zip.getEntry('vr-update.json') || zip.getEntry('vitoria-regia-update.json') || zip.getEntry('manifest.json');
  if (!manifestEntry) throw new Error('Pacote sem vr-update.json. Envie o ZIP oficial de atualização, não o ZIP completo do sistema.');
  const manifest = normalizeUpdateManifest(JSON.parse(manifestEntry.getData().toString('utf8')));
  if (manifest.system !== 'vitoria-regia-pro') throw new Error('Pacote não pertence ao Sistema Vitória Régia Pro.');
  if (!manifest.update_code || !manifest.payload_sha256) throw new Error('Manifesto de atualização incompleto: faltam código da atualização ou hash do payload.');
  const payloadEntry = zip.getEntry(manifest.payload_file || 'payload.zip') || zip.getEntry('payload.zip');
  if (!payloadEntry) throw new Error('Pacote sem payload.zip. Envie o arquivo de atualização oficial.');
  const payloadBuffer = payloadEntry.getData();
  const payloadHash = sha256Hex(payloadBuffer);
  if (payloadHash !== String(manifest.payload_sha256).toLowerCase()) throw new Error('Hash do payload não confere. O ZIP pode estar corrompido ou foi alterado.');
  const token = String(validationCode || manifest.validation_token || manifest.token || '').trim();
  if (!token) throw new Error('Token interno ausente no pacote de atualização. Gere novamente o ZIP oficial.');
  const expectedTokenHash = sha256Hex(Buffer.from(`${token}:${manifest.update_code}:${payloadHash}`));
  if (manifest.validation_token_hash && expectedTokenHash !== String(manifest.validation_token_hash).toLowerCase()) throw new Error('Token interno inválido para este pacote.');
  // A assinatura digital é opcional por padrão. Quando desativada, o pacote é autenticado por token interno + hash SHA-256.
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
function friendlyGithubError(status, data={}, repo='', endpoint='') {
  const raw = String(data?.message || data?.raw || '').trim();
  if (status === 401 || /bad credentials/i.test(raw)) {
    return 'GitHub recusou o token: Bad credentials. Crie um novo token no GitHub com acesso ao repositório '+repo+' e configure UPDATE_GITHUB_TOKEN no Render. Para token fine-grained, libere Contents: Read and write. Depois salve e aplique novamente.';
  }
  if (status === 403) {
    return 'GitHub recusou a atualização: o token não tem permissão de escrita no repositório '+repo+'. Confira se o token tem Contents: Read and write, acesso ao repositório correto e se a branch aceita push.';
  }
  if (status === 404) {
    return 'GitHub não encontrou o repositório ou branch configurados. Confira UPDATE_GITHUB_REPO e UPDATE_GITHUB_BRANCH nas configurações de atualização.';
  }
  return raw || `Erro GitHub ${status} ao acessar ${endpoint}`;
}
async function githubApi(repo, endpoint, options={}) {
  const token = await getRuntimeSecret('UPDATE_GITHUB_TOKEN', process.env.GITHUB_TOKEN || '');
  if (!token) throw new Error('Configure UPDATE_GITHUB_TOKEN nas variáveis do Render ou em Configurações → Atualizações antes de aplicar pelo GitHub.');
  const cleanToken = String(token).replace(/^Bearer\s+/i, '').trim();
  const response = await fetch(`https://api.github.com/repos/${repo}${endpoint}`, { ...options, headers:{ 'Accept':'application/vnd.github+json', 'Authorization':`Bearer ${cleanToken}`, 'X-GitHub-Api-Version':'2022-11-28', ...(options.headers || {}) } });
  const text = await response.text();
  let data = {}; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw:text }; }
  if (!response.ok) throw new Error(friendlyGithubError(response.status, data, repo, endpoint));
  return data;
}
async function testGithubUpdateAccess() {
  const repo = await getRuntimeSecret('UPDATE_GITHUB_REPO','bmedeiros1987/vitoriaregia1');
  const branch = await getRuntimeSecret('UPDATE_GITHUB_BRANCH','main');
  const token = await getRuntimeSecret('UPDATE_GITHUB_TOKEN', process.env.GITHUB_TOKEN || '');
  if (!token) return { ok:false, repo, branch, message:'UPDATE_GITHUB_TOKEN não está configurado.' };
  await githubApi(repo, `/git/ref/heads/${encodeURIComponent(branch)}`);
  return { ok:true, repo, branch, message:'Token GitHub válido para ler a branch configurada. A aplicação pode prosseguir.' };
}
async function applyUpdateViaGithub(payloadBuffer, manifest) {
  const repo = await getRuntimeSecret('UPDATE_GITHUB_REPO','bmedeiros1987/vitoriaregia1');
  const branch = await getRuntimeSecret('UPDATE_GITHUB_BRANCH','main');
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
  const hook = await getRuntimeSecret('RENDER_DEPLOY_HOOK_URL','');
  if (hook) await fetch(hook, { method:'POST' }).catch(()=>null);
  return { repo, branch, commit:newCommit.sha, files:tree.length, deployHook:Boolean(hook) };
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
  requireFields(req.body,['name']);
  const requestedRole = ['morador','funcionario'].includes(String(req.body.role||'').toLowerCase()) ? String(req.body.role).toLowerCase() : 'morador';
  const requiresUnit = requestedRole === 'morador';
  if (requiresUnit && !String(req.body.unit || '').trim()) { const err=new Error('Informe a unidade/apartamento para solicitar este tipo de cadastro.'); err.status=400; throw err; }
  if (requiresUnit) {
    const allowMultiple = boolValue(await getSetting('ALLOW_MULTIPLE_RESIDENTS_PER_UNIT','false'), false);
    const maxResidents = Number(await getSetting('MAX_RESIDENTS_PER_UNIT','2') || 2);
    const activeInUnit = (await q("SELECT COUNT(*)::int count FROM residents WHERE upper(replace(coalesce(unit,''),' ',''))=$1 AND COALESCE(active,true)=true",[normalizeUnit(req.body.unit)])).rows[0].count;
    if (!allowMultiple && activeInUnit >= 1) { const err=new Error('Esta unidade já possui morador cadastrado. Peça ao síndico para liberar moradores adicionais ou solicite cadastro por dentro do sistema.'); err.status=409; throw err; }
    if (allowMultiple && activeInUnit >= maxResidents) { const err=new Error(`Limite de ${maxResidents} morador(es) por unidade atingido. Solicite análise do síndico.`); err.status=409; throw err; }
  }
  const emailEnabled = await featureEnabled('email'); const whatsappEnabled = await featureEnabled('whatsapp'); const telegramEnabled = await featureEnabled('telegram');
  const hasEmail = Boolean(String(req.body.email || '').trim()); const hasWhats = Boolean(onlyDigits(req.body.whatsapp_phone || req.body.phone || '')); const hasTelegram = Boolean(String(req.body.telegram_chat_id || req.body.telegram_username || '').trim());
  if (boolValue(await getSetting('REGISTRATION_REQUIRE_EMAIL','true'), true) && emailEnabled && !hasEmail) { const err=new Error('Informe o e-mail para solicitar cadastro.'); err.status=400; throw err; }
  if (!hasEmail && !hasWhats && !hasTelegram) { const err=new Error('Informe ao menos um contato liberado: e-mail, WhatsApp ou Telegram.'); err.status=400; throw err; }
  if (hasEmail) await requireNoDuplicate('Usuário', (await q('SELECT id,email FROM users WHERE lower(email)=lower($1) AND COALESCE(active,true)=true LIMIT 1',[req.body.email])).rows[0]);
  if (hasEmail) await requireNoDuplicate('Solicitação de cadastro', (await q("SELECT id,email,status FROM registration_requests WHERE lower(email)=lower($1) AND status='pendente' LIMIT 1",[req.body.email])).rows[0]);
  if (req.body.document) await requireNoDuplicate('Morador', (await q("SELECT id,name,unit FROM residents WHERE regexp_replace(coalesce(document,''),'\D','','g')=$1 AND COALESCE(active,true)=true LIMIT 1",[onlyDigits(req.body.document)])).rows[0]);
  if (hasWhats && !whatsappEnabled) { const err=new Error('Cadastro por WhatsApp ainda não está liberado neste condomínio.'); err.status=400; throw err; }
  if (hasTelegram && !telegramEnabled) { const err=new Error('Cadastro por Telegram ainda não está liberado neste condomínio.'); err.status=400; throw err; }
  const channels = await filterChannelsByPlan({ email:hasEmail, whatsapp:hasWhats, telegram:hasTelegram, app:true, browser:true });
  const r=await q('INSERT INTO registration_requests(name,email,phone,whatsapp_phone,telegram_chat_id,telegram_username,preferred_channels,unit,document,role,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *', [req.body.name, req.body.email || '', req.body.phone || req.body.whatsapp_phone || '', req.body.whatsapp_phone || req.body.phone || '', req.body.telegram_chat_id || '', req.body.telegram_username || '', JSON.stringify(channels), requiresUnit ? (req.body.unit || '') : (req.body.unit || ''), req.body.document || '', requestedRole, req.body.notes || '']);
  const savedRequest = r.rows[0];
  const emailAck = hasEmail ? await sendRegistrationAcknowledgement(savedRequest).catch(e => ({ ok:false, error:e.message })) : { ok:false, skipped:true, reason:'E-mail não informado.' };
  await audit(req.body.email || req.body.phone || req.body.telegram_chat_id || 'cadastro', 'solicitou cadastro', req.body.unit || '');
  res.json({ ok:true, message: hasEmail && emailAck.ok ? 'Solicitação enviada. Enviamos um e-mail confirmando que seu cadastro será analisado em até 48h.' : 'Solicitação enviada para aprovação. Se o e-mail não chegar, acompanhe pelo sistema ou confira com a administração.', request:savedRequest, email_ack:emailAck });
} catch(e){ next(e); } });

app.post('/api/residents/request-same-unit', auth, async (req,res,next)=>{ try {
  const baseResident = req.user.resident_id ? (await q('SELECT * FROM residents WHERE id=$1 AND COALESCE(active,true)=true',[req.user.resident_id])).rows[0] : null;
  const unit = baseResident?.unit || req.user.unit || req.body.unit || '';
  if (!unit) return res.status(400).json({ error:'Não foi possível identificar sua unidade. Atualize seu perfil ou fale com a administração.' });
  const allowMultiple = boolValue(await getSetting('ALLOW_MULTIPLE_RESIDENTS_PER_UNIT','false'), false);
  const maxResidents = Number(await getSetting('MAX_RESIDENTS_PER_UNIT','2') || 2);
  if (!allowMultiple) return res.status(403).json({ error:'O cadastro de moradores adicionais para a mesma unidade não está liberado neste condomínio.' });
  const activeInUnit = (await q("SELECT COUNT(*)::int count FROM residents WHERE upper(replace(coalesce(unit,''),' ',''))=$1 AND COALESCE(active,true)=true",[normalizeUnit(unit)])).rows[0].count;
  if (activeInUnit >= maxResidents) return res.status(409).json({ error:`Limite de ${maxResidents} morador(es) por unidade atingido.` });
  requireFields(req.body,['name']);
  if (!req.body.email && !req.body.whatsapp_phone && !req.body.telegram_chat_id && !req.body.telegram_username) return res.status(400).json({ error:'Informe e-mail, WhatsApp ou Telegram do morador adicional.' });
  if (req.body.email) await requireNoDuplicate('Usuário', (await q('SELECT id,email FROM users WHERE lower(email)=lower($1) AND COALESCE(active,true)=true LIMIT 1',[req.body.email])).rows[0]);
  if (req.body.email) await requireNoDuplicate('Solicitação de cadastro', (await q("SELECT id,email,status FROM registration_requests WHERE lower(email)=lower($1) AND status='pendente' LIMIT 1",[req.body.email])).rows[0]);
  const channels = await filterChannelsByPlan({ app:true, browser:true, email:Boolean(req.body.email), whatsapp:Boolean(req.body.whatsapp_phone || req.body.phone), telegram:true });
  const r=await q('INSERT INTO registration_requests(name,email,phone,whatsapp_phone,telegram_chat_id,telegram_username,preferred_channels,unit,document,role,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',[req.body.name,req.body.email||'',req.body.phone||req.body.whatsapp_phone||'',req.body.whatsapp_phone||req.body.phone||'',req.body.telegram_chat_id||'',req.body.telegram_username||'',JSON.stringify(channels),unit,req.body.document||'','morador',`Solicitação interna feita por usuário da unidade ${unit}.`]);
  if (req.body.email) await sendRegistrationAcknowledgement(r.rows[0]).catch(()=>null);
  await audit(req.user.email,'solicitou morador adicional',`${req.body.name} - unidade ${unit}`);
  res.json({ ok:true, message:'Solicitação enviada ao síndico para aprovação. Se aprovada, o novo usuário receberá senha temporária nos canais cadastrados.', request:r.rows[0] });
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
  await q("UPDATE users SET name=$1,email=COALESCE(NULLIF($2,''),email),phone=$3,whatsapp_phone=$4,telegram_chat_id=$5,telegram_username=$6,notification_preferences=$7 WHERE id=$8",[body.name||user.name, body.email||user.email, body.phone||'', body.whatsapp_phone||body.phone||'', body.telegram_chat_id||'', body.telegram_username||'', JSON.stringify(prefs), user.id]);
  if (user.resident_id) await q("UPDATE residents SET name=$1,email=COALESCE(NULLIF($2,''),email),phone=$3,whatsapp_phone=$4,telegram_chat_id=$5,telegram_username=$6,unit=COALESCE(NULLIF($7,''),unit),vehicle=$8,document=COALESCE(NULLIF($9,''),document),notification_preferences=$10 WHERE id=$11",[body.name||user.name, body.email||user.email, body.phone||'', body.whatsapp_phone||body.phone||'', body.telegram_chat_id||'', body.telegram_username||'', body.unit||'', body.vehicle||'', body.document||'', JSON.stringify(prefs), user.resident_id]);
  await audit(req.user.email,'atualizou perfil','próprio');
  res.json({ ok:true });
} catch(e){ next(e); } });


app.get('/api/dashboard', auth, can('dashboard.view'), async (req,res,next)=>{ try { const own = isResident(req.user) && req.user.resident_id; const [residents, packagesTotal, packagesPending, visitorsToday, reservationsPending, messagesNew, emergencyPending, boletosPending, pendingRegistrations, weather] = await Promise.all([
  q('SELECT COUNT(*)::int count FROM residents WHERE COALESCE(active,true)=true'), q(own?'SELECT COUNT(*)::int count FROM packages WHERE resident_id=$1 AND deleted_at IS NULL':'SELECT COUNT(*)::int count FROM packages WHERE deleted_at IS NULL', own?[req.user.resident_id]:[]), q(own?"SELECT COUNT(*)::int count FROM packages WHERE resident_id=$1 AND deleted_at IS NULL AND status <> 'entregue'":"SELECT COUNT(*)::int count FROM packages WHERE deleted_at IS NULL AND status <> 'entregue'", own?[req.user.resident_id]:[]), q(own?"SELECT COUNT(*)::int count FROM visitors WHERE deleted_at IS NULL AND created_at::date=current_date AND unit=(SELECT unit FROM residents WHERE id=$1)":"SELECT COUNT(*)::int count FROM visitors WHERE deleted_at IS NULL AND created_at::date=current_date", own?[req.user.resident_id]:[]), q(own?"SELECT COUNT(*)::int count FROM reservations WHERE resident_id=$1 AND deleted_at IS NULL AND status='pre_agendada'":"SELECT COUNT(*)::int count FROM reservations WHERE deleted_at IS NULL AND status='pre_agendada'", own?[req.user.resident_id]:[]), q(own?"SELECT COUNT(*)::int count FROM messages WHERE resident_id=$1 AND status <> 'fechada'":"SELECT COUNT(*)::int count FROM messages WHERE status='nova'", own?[req.user.resident_id]:[]), q("SELECT COUNT(*)::int count FROM emergency_requests WHERE status='pendente'"), q(own?"SELECT COUNT(*)::int count FROM boletos WHERE resident_id=$1 AND deleted_at IS NULL AND status <> 'pago'":"SELECT COUNT(*)::int count FROM boletos WHERE deleted_at IS NULL AND status <> 'pago'", own?[req.user.resident_id]:[]), q("SELECT COUNT(*)::int count FROM registration_requests WHERE status='pendente'"), getWeatherSafe()
]);
  res.json({ version:APP_VERSION, metrics:{ residents:residents.rows[0].count, packages:packagesTotal.rows[0].count, pendingPackages:packagesPending.rows[0].count, visitorsToday:visitorsToday.rows[0].count, reservationsPending:reservationsPending.rows[0].count, messagesNew:messagesNew.rows[0].count, emergencyPending:emergencyPending.rows[0].count, boletosPending:boletosPending.rows[0].count, pendingRegistrations:pendingRegistrations.rows[0].count }, weather }); } catch(e){ next(e); } });


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
  if (boolValue(await getSetting('ALLOW_MULTIPLE_RESIDENTS_PER_UNIT','false'), false)) { const max=Number(await getSetting('MAX_RESIDENTS_PER_UNIT','2') || 2); const c=(await q("SELECT COUNT(*)::int count FROM residents WHERE upper(replace(coalesce(unit,''),' ',''))=$1 AND COALESCE(active,true)=true",[normalizeUnit(req.body.unit)])).rows[0].count; if (c >= max) { const err=new Error(`Limite de ${max} morador(es) por unidade atingido.`); err.status=409; throw err; } }
  const prefs = await filterChannelsByPlan(req.body.notification_preferences || { app:true, browser:true, email:Boolean(req.body.email), telegram:true, whatsapp:Boolean(req.body.whatsapp_phone || req.body.phone) });
  const r=await q('INSERT INTO residents(name,unit,phone,whatsapp_phone,email,document,vehicle,vehicle_model,vehicle_plate,pet_name,notes,access_profile,access_permissions,telegram_chat_id,telegram_username,notification_preferences,resident_tags) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *', [req.body.name, req.body.unit, req.body.phone||'', req.body.whatsapp_phone||req.body.phone||'', req.body.email||'', req.body.document||'', req.body.vehicle||req.body.vehicle_model||'', req.body.vehicle_model||req.body.vehicle||'', req.body.vehicle_plate||'', req.body.pet_name||'', req.body.notes||'', req.body.access_profile||'morador', JSON.stringify(req.body.access_permissions || rolePermissions('morador')), req.body.telegram_chat_id||'', req.body.telegram_username||'', JSON.stringify(prefs), JSON.stringify(req.body.resident_tags || {})]);
  await audit(req.user.email,'criou morador',req.body.name);
  res.json(r.rows[0]);
} catch(e){ next(e); } });
app.put('/api/residents/:id', auth, can('residents.manage'), async (req,res,next)=>{ try {
  requireFields(req.body,['name','unit']);
  await requireNoDuplicate('Morador', await residentDuplicate(req.body, req.params.id));
  const prefs = await filterChannelsByPlan(req.body.notification_preferences || { app:true, browser:true, email:Boolean(req.body.email), telegram:true, whatsapp:Boolean(req.body.whatsapp_phone || req.body.phone) });
  const r=await q('UPDATE residents SET name=$1,unit=$2,phone=$3,whatsapp_phone=$4,email=$5,document=$6,vehicle=$7,vehicle_model=$8,vehicle_plate=$9,pet_name=$10,notes=$11,access_profile=$12,access_permissions=$13,telegram_chat_id=$14,telegram_username=$15,notification_preferences=$16,resident_tags=$17 WHERE id=$18 RETURNING *', [req.body.name, req.body.unit, req.body.phone||'', req.body.whatsapp_phone||req.body.phone||'', req.body.email||'', req.body.document||'', req.body.vehicle||req.body.vehicle_model||'', req.body.vehicle_model||req.body.vehicle||'', req.body.vehicle_plate||'', req.body.pet_name||'', req.body.notes||'', req.body.access_profile||'morador', JSON.stringify(req.body.access_permissions || {}), req.body.telegram_chat_id||'', req.body.telegram_username||'', JSON.stringify(prefs), JSON.stringify(req.body.resident_tags || {}), req.params.id]);
  res.json(r.rows[0]||{});
} catch(e){ next(e); } });
app.delete('/api/residents/:id', auth, can('residents.manage'), async (req,res,next)=>{ try { await q('UPDATE residents SET active=false,deleted_at=now() WHERE id=$1',[req.params.id]); await audit(req.user.email,'removeu morador',req.params.id); res.json({ ok:true }); } catch(e){ next(e); } });

app.get('/api/users', auth, can('users.manage'), async (req,res,next)=>{ try { const sql=isMaster(req.user) ? 'SELECT * FROM users WHERE COALESCE(active,true)=true ORDER BY id DESC' : "SELECT * FROM users WHERE role <> 'master' AND COALESCE(active,true)=true ORDER BY id DESC"; res.json((await q(sql)).rows.map(sanitizeUser)); } catch(e){ next(e); } });
app.post('/api/users', auth, can('users.manage'), async (req,res,next)=>{ try {
  requireFields(req.body,['name','role']);
  const role=req.body.role || 'morador';
  if (role === 'master' && !isMaster(req.user)) return res.status(403).json({ error:'Ação restrita à área técnica.' });
  const userType=req.body.user_type || role; const password=req.body.password || randomCode(8);
  const resident_id = ['funcionario','portaria','financeiro'].includes(role) ? null : (req.body.resident_id || null);
  const unit = (role === 'sindico' && req.body.is_outsourced) || ['funcionario','portaria','financeiro'].includes(role) ? '' : (req.body.unit || '');
  const perms=normalizePermissions(req.body.permissions || {}, role);
  const email = loginEmailFromChannels(req.body);
  await requireNoDuplicate('Usuário', await userDuplicate({ ...req.body, email }));
  const prefs = await filterChannelsByPlan(req.body.notification_preferences || { app:true,browser:true,email:Boolean(req.body.email),telegram:true,whatsapp:Boolean(req.body.whatsapp_phone || req.body.phone) });
  const r=await q('INSERT INTO users(name,email,password_hash,role,user_type,is_outsourced,unit,permissions,resident_id,employee_id,phone,whatsapp_phone,telegram_chat_id,telegram_username,notification_preferences,active,force_password_change) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *', [req.body.name, email, await bcrypt.hash(password,10), role, userType, req.body.is_outsourced===true, unit, JSON.stringify(perms), resident_id, req.body.employee_id || null, req.body.phone||req.body.whatsapp_phone||'', req.body.whatsapp_phone||req.body.phone||'', req.body.telegram_chat_id||'', req.body.telegram_username||'', JSON.stringify(prefs), req.body.active !== false, Boolean(!req.body.password)]);
  await audit(req.user.email,'criou usuário com aprovação automática',email);
  if (!req.body.password) {
    await sendTemporaryPasswordToUser({ ...r.rows[0], email:req.body.email || r.rows[0].email, telegram_chat_id:req.body.telegram_chat_id || r.rows[0].telegram_chat_id, telegram_username:req.body.telegram_username || r.rows[0].telegram_username, whatsapp_phone:req.body.whatsapp_phone || req.body.phone || r.rows[0].whatsapp_phone, phone:req.body.phone || r.rows[0].phone, notification_preferences:prefs }, password, 'Cadastro aprovado - Vitória Régia').catch(()=>null);
  }
  res.json({ user:sanitizeUser(r.rows[0]), temp_password_sent: !req.body.password, message: !req.body.password ? 'Usuário cadastrado e aprovado automaticamente. A senha temporária foi enviada pelos canais disponíveis.' : 'Usuário cadastrado.' });
} catch(e){ next(e); } });
app.put('/api/users/:id', auth, can('users.manage'), async (req,res,next)=>{ try { const role=req.body.role||'morador'; if (role === 'master' && !isMaster(req.user)) return res.status(403).json({ error:'Ação restrita à área técnica.' }); const perms=normalizePermissions(req.body.permissions||{},role); const resident_id=['funcionario','portaria','financeiro'].includes(role) ? null : (req.body.resident_id || null); const unit=(role==='sindico' && req.body.is_outsourced) || ['funcionario','portaria','financeiro'].includes(role) ? '' : (req.body.unit || ''); await requireNoDuplicate('Usuário', await userDuplicate(req.body, req.params.id)); const prefs=await filterChannelsByPlan(req.body.notification_preferences || {}); let sql='UPDATE users SET name=$1,email=$2,role=$3,user_type=$4,is_outsourced=$5,unit=$6,permissions=$7,resident_id=$8,employee_id=$9,phone=$10,whatsapp_phone=$11,telegram_chat_id=$12,telegram_username=$13,notification_preferences=$14,active=$15'; const params=[req.body.name,loginEmailFromChannels(req.body),role,req.body.user_type||role,req.body.is_outsourced===true,unit,JSON.stringify(perms),resident_id,req.body.employee_id||null,req.body.phone||req.body.whatsapp_phone||'',req.body.whatsapp_phone||req.body.phone||'',req.body.telegram_chat_id||'',req.body.telegram_username||'',JSON.stringify(prefs),req.body.active!==false]; if (req.body.password) { params.push(await bcrypt.hash(req.body.password,10)); sql += `,password_hash=$${params.length},force_password_change=false`; } params.push(req.params.id); sql += ` WHERE id=$${params.length} RETURNING *`; const r=await q(sql,params); await audit(req.user.email,'alterou usuário',req.body.email||req.body.phone||req.params.id); res.json(sanitizeUser(r.rows[0])); } catch(e){ next(e); } });

app.delete('/api/users/:id', auth, can('users.manage'), async (req,res,next)=>{ try {
  const existing=(await q('SELECT * FROM users WHERE id=$1',[req.params.id])).rows[0];
  if (!existing) return res.status(404).json({ error:'Usuário não encontrado.' });
  if ((existing.role === 'master' || existing.role === 'admin') && !isMaster(req.user)) return res.status(403).json({ error:'Ação restrita à área técnica.' });
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
app.post('/api/registration-requests/:id/approve', auth, can('users.manage'), async (req,res,next)=>{ try {
  const rr=(await q('SELECT * FROM registration_requests WHERE id=$1',[req.params.id])).rows[0];
  if (!rr) return res.status(404).json({ error:'Solicitação não encontrada.' });
  const role = ['morador','funcionario','portaria'].includes(String(rr.role||'').toLowerCase()) ? String(rr.role).toLowerCase() : 'morador';
  const needsResident = role === 'morador' && String(rr.unit || '').trim();
  const prefs=await filterChannelsByPlan(parseJson(rr.preferred_channels,{ email:Boolean(rr.email), whatsapp:Boolean(rr.whatsapp_phone || rr.phone), telegram:true, app:true, browser:true }));
  let resident=null;
  if (needsResident) {
    resident=await findResident({ unit: rr.unit, recipient: rr.name });
    if (!resident) resident=(await q('INSERT INTO residents(name,unit,phone,whatsapp_phone,email,document,telegram_chat_id,telegram_username,notification_preferences) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[rr.name,rr.unit,rr.phone||rr.whatsapp_phone||'',rr.whatsapp_phone||rr.phone||'',rr.email||'',rr.document,rr.telegram_chat_id||'',rr.telegram_username||'',JSON.stringify(prefs)])).rows[0];
  }
  const temp=randomCode(8);
  const email=loginEmailFromChannels(rr);
  const user=(await q('INSERT INTO users(name,email,password_hash,role,user_type,unit,resident_id,phone,whatsapp_phone,telegram_chat_id,telegram_username,notification_preferences,permissions,active,force_password_change) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true,true) ON CONFLICT(email) DO UPDATE SET active=true,resident_id=EXCLUDED.resident_id, unit=EXCLUDED.unit, phone=EXCLUDED.phone, whatsapp_phone=EXCLUDED.whatsapp_phone, telegram_chat_id=EXCLUDED.telegram_chat_id, telegram_username=EXCLUDED.telegram_username RETURNING *',[rr.name,email,await bcrypt.hash(temp,10),role,role,rr.unit || '',resident?.id || null,rr.phone||rr.whatsapp_phone||'',rr.whatsapp_phone||rr.phone||'',rr.telegram_chat_id||'',rr.telegram_username||'',JSON.stringify(prefs),JSON.stringify(rolePermissions(role))])).rows[0];
  await q("UPDATE registration_requests SET status='aprovada',approved_by=$1,approved_at=now() WHERE id=$2",[req.user.id,rr.id]);
  await sendTemporaryPasswordToUser({ ...user, email: rr.email || user.email, telegram_chat_id: rr.telegram_chat_id || user.telegram_chat_id, telegram_username: rr.telegram_username || user.telegram_username, whatsapp_phone: rr.whatsapp_phone || rr.phone || user.whatsapp_phone, phone: rr.phone || user.phone, notification_preferences: prefs }, temp, 'Cadastro aprovado - Vitória Régia').catch(()=>null);
  await audit(req.user.email,'aprovou cadastro',email);
  res.json({ ok:true, user:sanitizeUser(user) });
} catch(e){ next(e); } });
app.post('/api/registration-requests/:id/reject', auth, can('users.manage'), async (req,res,next)=>{ try { await q("UPDATE registration_requests SET status='rejeitada',approved_by=$1,approved_at=now(),notes=COALESCE(notes,'') || $2 WHERE id=$3",[req.user.id, `\nRejeitada: ${req.body.note||''}`, req.params.id]); res.json({ ok:true }); } catch(e){ next(e); } });

app.get('/api/employees', auth, can('employees.manage'), async (_req,res,next)=>{ try { res.json((await q('SELECT * FROM employees ORDER BY active DESC,name')).rows); } catch(e){ next(e); } });
app.post('/api/employees', auth, can('employees.manage'), async (req,res,next)=>{ try { requireFields(req.body,['name']); const r=await q('INSERT INTO employees(name,role,phone,email,active,notes) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[req.body.name,req.body.role||'portaria',req.body.phone||'',req.body.email||'',req.body.active!==false,req.body.notes||'']); res.json(r.rows[0]); } catch(e){ next(e); } });
app.get('/api/shifts', auth, async (req,res,next)=>{ try { const full = hasPermission(req.user,'shifts.manage') || req.user.role==='sindico' || req.user.role==='master'; const base = full ? '' : 'WHERE s.starts_at::date BETWEEN current_date - interval \'7 days\' AND current_date + interval \'45 days\''; res.json((await q(`SELECT s.*, e.name employee_name, e.email employee_email, e.phone employee_phone, rep.name temporary_for_employee_name FROM shifts s LEFT JOIN employees e ON e.id=s.employee_id LEFT JOIN employees rep ON rep.id=s.temporary_for_employee_id ${base} ORDER BY starts_at DESC LIMIT 300`)).rows); } catch(e){ next(e); } });
app.post('/api/shifts', auth, can('shifts.manage'), async (req,res,next)=>{ try { requireFields(req.body,['employee_id','starts_at','ends_at']); const payload=[req.body.employee_id,req.body.role||'portaria',req.body.starts_at,req.body.ends_at,req.body.status||'programada',req.body.notes||'',req.body.shift_type||'custom',req.body.recurrence_type||'single',JSON.stringify(req.body.weekdays||[]),Array.isArray(req.body.month_days)?req.body.month_days.join(','):(req.body.month_days||''),req.body.start_time||'',req.body.end_time||'',req.body.temporary_for_employee_id||null,req.body.allow_employee_edit===true,req.body.substitution_reason||'']; const r=await q('INSERT INTO shifts(employee_id,role,starts_at,ends_at,status,notes,shift_type,recurrence_type,weekdays,month_days,start_time,end_time,temporary_for_employee_id,allow_employee_edit,substitution_reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *',payload); const created=r.rows[0]; const emp=(await q('SELECT * FROM employees WHERE id=$1',[created.employee_id])).rows[0]; const rep=created.temporary_for_employee_id?(await q('SELECT * FROM employees WHERE id=$1',[created.temporary_for_employee_id])).rows[0]:null; const text=`Escala Vitória Régia\nFunção: ${created.role}\nPeríodo: ${new Date(created.starts_at).toLocaleString('pt-BR')} até ${new Date(created.ends_at).toLocaleString('pt-BR')}\n${created.substitution_reason ? 'Motivo da substituição: '+created.substitution_reason+'\n' : ''}${created.notes||''}`; if(emp?.email) await sendEmailSmart({to:emp.email,subject:'Sua escala foi atualizada - Vitória Régia',text}).catch(()=>null); if(await featureEnabled('telegram')) await sendTelegramMessage('', telegramPremiumMessage({ title:'Escala atualizada', body:`${emp?.name||'Funcionário'}, sua escala foi atualizada.\n${text}`, category:'sistema' })).catch(()=>null); if(rep){ if(rep.email) await sendEmailSmart({to:rep.email,subject:'Substituição de escala registrada - Vitória Régia',text:`Você foi substituído temporariamente.\n${text}`}).catch(()=>null); if(await featureEnabled('telegram')) await sendTelegramMessage('', telegramPremiumMessage({ title:'Substituição de escala', body:`${rep.name}, há uma substituição temporária na sua escala.\n${text}`, category:'sistema' })).catch(()=>null); } await audit(req.user.email,'cadastrou escala',`${emp?.name||created.employee_id} ${created.starts_at}`); res.json(created); } catch(e){ next(e); } });
app.get('/api/shifts/on-duty', auth, async (req,res,next)=>{ try { res.json(await currentOnDuty(req.query.role || 'portaria') || {}); } catch(e){ next(e); } });
app.get('/api/shifts/:id/google', auth, async (req,res,next)=>{ try { const s=(await q('SELECT s.*, e.name employee_name FROM shifts s LEFT JOIN employees e ON e.id=s.employee_id WHERE s.id=$1',[req.params.id])).rows[0]; if(!s) return res.status(404).json({error:'Escala não encontrada.'}); const fmt=d=>new Date(d).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z/,'Z'); const title=encodeURIComponent(`Escala ${s.role||''} - ${s.employee_name||''}`); const details=encodeURIComponent(`Escala Vitória Régia\nFunção: ${s.role||''}\nObservações: ${s.notes||''}`); res.json({url:`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${fmt(s.starts_at)}/${fmt(s.ends_at)}&details=${details}&location=${encodeURIComponent('Condomínio Vitória Régia')}`}); } catch(e){ next(e); } });

app.get('/api/messages', auth, async (req,res,next)=>{ try { if (isResident(req.user) && req.user.resident_id) return res.json((await q('SELECT m.*, e.name employee_name FROM messages m LEFT JOIN employees e ON e.id=m.assigned_employee_id WHERE m.resident_id=$1 ORDER BY m.id DESC',[req.user.resident_id])).rows); res.json((await q('SELECT m.*, e.name employee_name, r.name resident_name FROM messages m LEFT JOIN employees e ON e.id=m.assigned_employee_id LEFT JOIN residents r ON r.id=m.resident_id ORDER BY m.id DESC LIMIT 200')).rows); } catch(e){ next(e); } });
app.post('/api/messages', auth, async (req,res,next)=>{ try { requireFields(req.body,['subject','body']); const resident=await findResident({ resident_id:req.user.resident_id, unit:req.body.unit, user_id:req.user.id }); const duty=await currentOnDuty('portaria'); const r=await q('INSERT INTO messages(resident_id,user_id,unit,subject,body,assigned_employee_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[resident?.id||req.user.resident_id||null,req.user.id,req.body.unit||resident?.unit||'',req.body.subject,req.body.body,duty?.employee_id||null]); if (duty?.employee_email) await sendEmailSmart({ to:duty.employee_email, subject:`Mensagem do morador - ${req.body.subject}`, text:req.body.body }).catch(()=>null);
  if (await featureEnabled('telegram')) await sendTelegramMessage('', telegramPremiumMessage({ title:`Mensagem do morador - ${req.body.subject}`, body:req.body.body, category:'comunicado', details:{ Unidade:req.body.unit||resident?.unit||'-' } })).catch(()=>null); await createNotification({ title:'Nova mensagem de morador', body:`${req.body.subject} - Unidade ${req.body.unit || resident?.unit || '-'}`, user_id:null, channel:'app', payload:{ message_id:r.rows[0].id, employee_id:duty?.employee_id||null } }).catch(()=>null); res.json({ ...r.rows[0], assigned_employee:duty?.employee_name||null }); } catch(e){ next(e); } });
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
app.post('/api/packages', auth, can('packages.manage'), async (req,res,next)=>{ try { requireFields(req.body,['tracking','recipient','unit']); await requireNoDuplicate('Encomenda', await packageDuplicate(req.body)); const resident=await findResident(req.body); const pickup=randomCode(6); const channels={ app:true, browser:true, ...parseJson(await getSetting('DELIVERY_DEFAULT_CHANNELS','{}'),{}), ...(req.body.notification_channels || {}), telegram:true }; const r=await q('INSERT INTO packages(tracking,recipient,unit,resident_id,label,notes,extracted_text,pickup_code,notification_channels,notification_status,photo_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',[req.body.tracking,req.body.recipient,req.body.unit,resident?.id||null,req.body.label||req.body.tracking,req.body.notes||'',req.body.extracted_text||'',pickup,JSON.stringify(channels),resident?'enviando':'sem_vinculo',req.body.photo_url||'']); const pack=r.rows[0]; const action_url=`/#/encomendas?package=${pack.id}`; const body=`Sua encomenda ${pack.tracking} chegou na portaria. Código de retirada: ${pickup}. Escolha pelo Telegram: autorizar envio pelo elevador, retirar agora, retirar mais tarde, pedir contato por interfone ou informar que não reconhece.`; if (resident) await notifyResident(resident,{ title:'Encomenda chegou', body, channels, action_url, payload:{ package_id:pack.id, pickup_code:pickup, telegram_reply_markup:{ inline_keyboard:[[ { text:'🛗 Enviar pelo elevador', callback_data:`pkg:${pack.id}:receber_elevador` }, { text:'🚶 Vou retirar agora', callback_data:`pkg:${pack.id}:retirar_agora` } ],[ { text:'🕒 Retirar mais tarde', callback_data:`pkg:${pack.id}:retirar_mais_tarde` }, { text:'📞 Chamar no interfone', callback_data:`pkg:${pack.id}:chamar_interfone` } ],[ { text:'❌ Não reconheço', callback_data:`pkg:${pack.id}:nao_reconhece` } ]] } } }).catch(()=>null); await sendPortariaTelegram({ title:'Encomenda cadastrada', body:`${pack.tracking} · Unidade ${pack.unit || '-'} · ${pack.recipient || resident?.name || ''}. Aguardando decisão do morador.`, category:'encomenda', action_url:'/#/portaria/encomendas', details:{ Código:pack.tracking, Unidade:pack.unit || '-', Retirada:pickup }, dedupeKey:`package-created-portaria:${pack.id}` }).catch(()=>null); await audit(req.user.email,'registrou encomenda',`${pack.tracking} ${resident?'vinculada':'sem vínculo'}`); await q("UPDATE packages SET notification_status='enviada' WHERE id=$1",[pack.id]).catch(()=>null); res.json({ ...pack, resident, linked:Boolean(resident) }); } catch(e){ next(e); } });
app.post('/api/packages/:id/preference', auth, async (req,res,next)=>{ try { if (!isResident(req.user)) return res.status(403).json({ error:'Somente o morador pode escolher o método de entrega.' }); const preference=req.body.delivery_preference || req.body.preference || 'retirar_portaria'; const r=await q('UPDATE packages SET delivery_preference=$1,resident_response_at=now() WHERE id=$2 AND (resident_id=$3 OR $4=true) RETURNING *',[preference,req.params.id,req.user.resident_id,isMaster(req.user)]); if(!r.rowCount) return res.status(404).json({ error:'Encomenda não encontrada para este morador.' }); await notifyStaff({ title:'Preferência de entrega informada', body:`Encomenda ${r.rows[0]?.tracking || req.params.id}: ${formatDeliveryPreference(preference)}`, action_url:`/#/encomendas` }).catch(()=>null); res.json(r.rows[0]||{}); } catch(e){ next(e); } });
app.post('/api/packages/:id/intercom-fallback', auth, can('packages.manage'), async (req,res,next)=>{ try {
  if (!boolValue(await getSetting('TELEGRAM_INTERCOM_FALLBACK_ENABLED','true'), true)) return res.status(400).json({ error:'Fallback Telegram por interfone está desativado.' });
  const p=(await q('SELECT * FROM packages WHERE id=$1',[req.params.id])).rows[0];
  if(!p) return res.status(404).json({ error:'Encomenda não encontrada.' });
  const resident=await findResident({ resident_id:p.resident_id, unit:p.unit, recipient:p.recipient });
  const body=`A portaria tentou contato por interfone, mas não conseguiu falar. Encomenda ${p.tracking || p.label || p.id} está aguardando orientação. Responda pelo botão: enviar pelo elevador, retirar agora, retirar mais tarde ou não reconheço.`;
  if (resident) await notifyResident(resident,{ title:'Portaria tentou interfone', body, channels:{ app:true,browser:true,email:false,telegram:true,whatsapp:false }, action_url:'/#/portaria/encomendas', payload:{ package_id:p.id, pickup_code:p.pickup_code || '', telegram_reply_markup:{ inline_keyboard:[[ { text:'🛗 Enviar pelo elevador', callback_data:`pkg:${p.id}:receber_elevador` }, { text:'🚶 Vou retirar agora', callback_data:`pkg:${p.id}:retirar_agora` } ],[ { text:'🕒 Retirar mais tarde', callback_data:`pkg:${p.id}:retirar_mais_tarde` }, { text:'❌ Não reconheço', callback_data:`pkg:${p.id}:nao_reconhece` } ]] } } }).catch(()=>null);
  await sendPortariaTelegram({ title:'Interfone sem contato', body:`Mensagem enviada ao morador da unidade ${p.unit || '-'}. Encomenda ${p.tracking || p.id}.`, category:'encomenda', action_url:'/#/portaria/encomendas', details:{ Unidade:p.unit || '-', Código:p.tracking || p.id, Morador:resident?.name || p.recipient || '-' }, dedupeKey:`intercom-fallback-portaria:${p.id}` }).catch(()=>null);
  await audit(req.user.email,'acionou Telegram após interfone sem contato',`${p.tracking || p.id} unidade ${p.unit || '-'}`).catch(()=>null);
  res.json({ ok:true, package:p, resident, message: resident ? 'Telegram enviado ao morador e à portaria.' : 'Morador não localizado; aviso enviado à portaria.' });
} catch(e){ next(e); } });
async function updatePackageDeliveryStatus(id){ const p=(await q('SELECT * FROM packages WHERE id=$1',[id])).rows[0]; if(!p) return null; if(p.staff_delivered_at && p.resident_delivered_at && p.status!=='entregue'){ const r=await q("UPDATE packages SET status='entregue',delivered_at=now() WHERE id=$1 RETURNING *",[id]); return r.rows[0]; } return p; }
app.post('/api/packages/:id/staff-confirm-delivery', auth, can('packages.manage'), async (req,res,next)=>{ try { await q("UPDATE packages SET staff_delivered_at=now(), delivered_by_staff=$1, status=CASE WHEN resident_delivered_at IS NOT NULL THEN 'entregue' ELSE 'aguardando_confirmacao_morador' END WHERE id=$2 RETURNING *",[req.user.id,req.params.id]); const p=await updatePackageDeliveryStatus(req.params.id); await audit(req.user.email,'confirmou entrega pela portaria',req.params.id); res.json(p||{}); } catch(e){ next(e); } });
app.post('/api/packages/:id/resident-confirm-delivery', auth, async (req,res,next)=>{ try { const r=await q("UPDATE packages SET resident_delivered_at=now(), delivered_by_resident=$1, status=CASE WHEN staff_delivered_at IS NOT NULL THEN 'entregue' ELSE 'aguardando_confirmacao_portaria' END WHERE id=$2 AND (resident_id=$3 OR $4=true) RETURNING *",[req.user.id,req.params.id,req.user.resident_id,isMaster(req.user)]); if(!r.rowCount) return res.status(404).json({ error:'Encomenda não encontrada para este morador.' }); const p=await updatePackageDeliveryStatus(req.params.id); await notifyStaff({ title:'Morador confirmou recebimento', body:`Encomenda ${p?.tracking || req.params.id} confirmada pelo morador.`, action_url:'/#/encomendas' }).catch(()=>null); res.json(p||{}); } catch(e){ next(e); } });
app.post('/api/packages/:id/deliver', auth, can('packages.manage'), async (req,res,next)=>{ try { await q("UPDATE packages SET staff_delivered_at=now(), delivered_by_staff=$1, status=CASE WHEN resident_delivered_at IS NOT NULL THEN 'entregue' ELSE 'aguardando_confirmacao_morador' END WHERE id=$2 RETURNING *",[req.user.id,req.params.id]); const p=await updatePackageDeliveryStatus(req.params.id); await audit(req.user.email,'confirmou entrega pela portaria',req.params.id); res.json(p||{}); } catch(e){ next(e); } });
app.get('/api/visitors', auth, can('visitors.view'), async (req,res,next)=>{ try { const unit=req.query.unit || ''; const params=[]; let where='WHERE deleted_at IS NULL'; if (unit) { params.push(unit); where+=' AND lower(unit)=lower($1)'; } res.json((await q(`SELECT * FROM visitors ${where} ORDER BY id DESC LIMIT 300`, params)).rows); } catch(e){ next(e); } });
app.post('/api/visitors', auth, can('visitors.manage'), async (req,res,next)=>{ try { requireFields(req.body,['name','unit']); const r=await q('INSERT INTO visitors(name,document,unit,authorized_by,status,plate,phone,recurring,weekdays,valid_from,valid_until,announce_required,announcement_channel,notification_channels,photo_data,reservation_id,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *',[req.body.name,req.body.document||'',req.body.unit,req.body.authorized_by||'',req.body.status||'autorizado',req.body.plate||'',req.body.phone||'',req.body.recurring===true,JSON.stringify(req.body.weekdays||[]),req.body.valid_from||null,req.body.valid_until||null,req.body.announce_required!==false,req.body.announcement_channel||'interfone',JSON.stringify(req.body.notification_channels||{}),req.body.photo_data||'',req.body.reservation_id||null,req.body.notes||'']); await audit(req.user.email,'autorizou visitante',req.body.name); res.json(r.rows[0]); } catch(e){ next(e); } });
app.post('/api/visitors/:id/intercom-fallback', auth, can('visitors.manage'), async (req,res,next)=>{ try {
  if (!boolValue(await getSetting('TELEGRAM_INTERCOM_FALLBACK_ENABLED','true'), true)) return res.status(400).json({ error:'Fallback Telegram por interfone está desativado.' });
  const v=(await q('SELECT * FROM visitors WHERE id=$1',[req.params.id])).rows[0];
  if(!v) return res.status(404).json({ error:'Visitante não encontrado.' });
  const resident=await findResident({ unit:v.unit, recipient:v.authorized_by });
  const body=`A portaria tentou contato por interfone, mas não conseguiu falar. Visitante: ${v.name}. Unidade ${v.unit || '-'}. Acesse o sistema ou responda à portaria para autorizar ou negar a entrada.`;
  if (resident) await notifyResident(resident,{ title:'Portaria tentou interfone', body, channels:{ app:true,browser:true,email:false,telegram:true,whatsapp:false }, action_url:'/#/portaria/visitantes', payload:{ visitor_id:v.id } }).catch(()=>null);
  await sendPortariaTelegram({ title:'Interfone sem contato', body:`Visitante ${v.name} na unidade ${v.unit || '-'}. Aviso Telegram enviado ao morador quando localizado.`, category:'notificacao', action_url:'/#/portaria/visitantes', details:{ Visitante:v.name, Unidade:v.unit || '-', Morador:resident?.name || '-' }, dedupeKey:`visitor-intercom-portaria:${v.id}` }).catch(()=>null);
  await audit(req.user.email,'acionou Telegram de visitante após interfone sem contato',`${v.name} unidade ${v.unit || '-'}`).catch(()=>null);
  res.json({ ok:true, visitor:v, resident, message: resident ? 'Telegram enviado ao morador e à portaria.' : 'Morador não localizado; aviso enviado à portaria.' });
} catch(e){ next(e); } });
app.delete('/api/visitors/:id', auth, can('visitors.manage'), async (req,res,next)=>{ try { await q("UPDATE visitors SET deleted_at=now(), status='removido' WHERE id=$1",[req.params.id]); res.json({ ok:true }); } catch(e){ next(e); } });

app.get('/api/common-areas', auth, async (_req,res,next)=>{ try { res.json((await q('SELECT * FROM common_areas WHERE active=true ORDER BY name')).rows); } catch(e){ next(e); } });
app.post('/api/common-areas', auth, can('settings.manage'), async (req,res,next)=>{ try { requireFields(req.body,['name']); const r=await q('INSERT INTO common_areas(name,fee_amount,rules_document,active,requires_approval,max_guests,count_children,count_infants,reservation_periods) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(name) DO UPDATE SET fee_amount=$2,rules_document=$3,active=$4,requires_approval=$5,max_guests=$6,count_children=$7,count_infants=$8,reservation_periods=$9 RETURNING *',[req.body.name,req.body.fee_amount||0,req.body.rules_document||'',req.body.active!==false,req.body.requires_approval!==false,req.body.max_guests||30,req.body.count_children!==false,req.body.count_infants===true,req.body.reservation_periods||'dia_todo,manha,tarde,noite,horario']); res.json(r.rows[0]); } catch(e){ next(e); } });
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
  const isAllDay = req.body.all_day === true || ['dia_todo','dia todo','diatodo','dia inteiro','24h'].includes(String(req.body.reservation_mode || req.body.period_label || req.body.shift || '').toLowerCase()) || (String(req.body.start_time||'')==='00:00' && String(req.body.end_time||'')==='23:59');
  let reservationUnit = req.body.unit || ''; let reservationResident = req.body.resident || ''; if (isResident(req.user) && req.user.resident_id) { const rr=(await q('SELECT name,unit FROM residents WHERE id=$1',[req.user.resident_id])).rows[0] || {}; reservationUnit = rr.unit || reservationUnit; reservationResident = rr.name || reservationResident || req.user.name; }
  req.body.unit = reservationUnit; req.body.resident = reservationResident;
  requireFields(req.body, isAllDay ? ['area','unit','resident','reserved_for'] : ['area','unit','resident','reserved_for','start_time','end_time']);
  const startForDuplicate = isAllDay ? '00:00' : (req.body.start_time || '19:00');
  const endForDuplicate = isAllDay ? '23:59' : (req.body.end_time || '23:00');
  await requireNoDuplicate('Reserva', await reservationDuplicate({ ...req.body, start_time:startForDuplicate, end_time:endForDuplicate }));
  const resident=await findResident({ resident_id:req.user.resident_id, unit:req.body.unit, recipient:req.body.resident });
  const area=(await q('SELECT * FROM common_areas WHERE lower(name)=lower($1) LIMIT 1',[req.body.area])).rows[0];
  const start=startForDuplicate; const end=endForDuplicate;
  const fee=Number(req.body.fee_amount ?? area?.fee_amount ?? 0);
  const termsAccepted=req.body.terms_accepted===true;
  let status = req.body.status || 'pre_agendada';
  if (!termsAccepted) status='pendente_aceite_regras';
  else if (fee > 0) status='pendente_pagamento';
  const r=await q('INSERT INTO reservations(area,area_id,unit,resident,resident_id,reserved_for,start_time,end_time,shift,reservation_mode,period_label,all_day,status,fee_amount,document_text,terms_accepted,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *',[req.body.area,area?.id||null,req.body.unit,req.body.resident||resident?.name||req.user.name,resident?.id||req.user.resident_id||null,req.body.reserved_for,start,end,req.body.shift||req.body.reservation_mode||'horario',req.body.reservation_mode||req.body.shift||'horario',req.body.period_label||'',isAllDay,status,fee,req.body.document_text || area?.rules_document || await getSetting('RESERVATION_DEFAULT_RULES'),termsAccepted,req.user.id]);
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
app.post('/api/ocr/parse-package', auth, can('packages.manage'), async (req,res,next)=>{ try { res.json(parsePackageText(req.body?.text || '')); } catch(e){ next(e); } });
app.post('/api/ocr/parse-invoice', auth, can('invoices.manage'), async (req,res,next)=>{ try { res.json(parseInvoiceText(req.body?.text || '')); } catch(e){ next(e); } });

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


function parseBrazilianMoney(str='') { const m=String(str).match(/(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/); return m ? Number(m[1].replace(/\./g,'').replace(',','.')) : 0; }
function parseFinancialRowsFromText(text='') {
  const lines = String(text || '').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const rows=[];
  for (const line of lines) {
    const dateMatch=line.match(/(\d{2}\/\d{2}\/\d{4})/);
    const moneyMatches=[...line.matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/g)].map(m=>m[1]);
    if (!moneyMatches.length) continue;
    const amount=Number(moneyMatches[moneyMatches.length-1].replace(/\./g,'').replace(',','.'));
    let title=line.replace(/(\d{2}\/\d{2}\/\d{4})/g,'').replace(/(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/g,'').replace(/[-–—]+$/,'').trim();
    title=title.replace(/\s{2,}/g,' ') || 'Lançamento importado';
    let due_date=null;
    if(dateMatch){ const [d,m,y]=dateMatch[1].split('/'); due_date=`${y}-${m}-${d}`; }
    const type=/receita|taxa|fundo|apto|apartamento/i.test(line) && !/despesa|sal[aá]rio|energia|[aá]gua|telefone|manuten/i.test(line) ? 'receita' : 'despesa';
    rows.push({ title, amount, due_date, type, category:type==='receita'?'receitas importadas':'despesas importadas' });
  }
  return rows.slice(0,100);
}

app.get('/api/finance', auth, can('finance.view'), async (req,res,next)=>{ try { if (isResident(req.user) && req.user.resident_id) return res.json((await q('SELECT f.*, b.digitable_line, b.payment_link FROM finance f LEFT JOIN boletos b ON b.id=f.boleto_id WHERE f.deleted_at IS NULL AND (f.resident_id=$1 OR f.unit=(SELECT unit FROM residents WHERE id=$1)) ORDER BY f.due_date DESC NULLS LAST,f.id DESC',[req.user.resident_id])).rows); res.json((await q('SELECT f.*, b.digitable_line, b.payment_link FROM finance f LEFT JOIN boletos b ON b.id=f.boleto_id WHERE f.deleted_at IS NULL ORDER BY f.due_date DESC NULLS LAST,f.id DESC')).rows); } catch(e){ next(e); } });
app.post('/api/finance/import-document', auth, can('finance.manage'), async (req,res,next)=>{ try {
  const rows = parseFinancialRowsFromText(req.body.text || req.body.extracted_text || '');
  if(req.body.preview !== false) return res.json({ ok:true, rows, message:`${rows.length} lançamentos encontrados para conferência.` });
  const created=[];
  for (const row of rows) { const r=await q('INSERT INTO finance(title,amount,type,status,due_date,unit,category) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[row.title,row.amount,row.type,'pendente',row.due_date||null,req.body.unit||'',row.category]); created.push(r.rows[0]); }
  await audit(req.user.email,'importou financeiro por documento',`${created.length} lançamentos`);
  res.json({ ok:true, created });
} catch(e){ next(e); } });
app.post('/api/finance', auth, can('finance.manage'), async (req,res,next)=>{ try { requireFields(req.body,['title','amount','type']); const resident=await findResident(req.body); let boleto_id=req.body.boleto_id||null; if (req.body.generate_boleto) { const boleto=await createBoleto({ unit:req.body.unit, resident_id:resident?.id||null, title:req.body.title, amount:req.body.amount, due_date:req.body.due_date, bank_name:req.body.bank_name||'', digitable_line:req.body.digitable_line||'', pdf_url:req.body.pdf_url||'', payment_link:req.body.payment_link||'', source_type:'finance' }); boleto_id=boleto.id; } const r=await q('INSERT INTO finance(title,amount,type,status,due_date,unit,resident_id,category,boleto_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[req.body.title,req.body.amount,req.body.type,req.body.status||'pendente',req.body.due_date||null,req.body.unit||'',resident?.id||null,req.body.category||'geral',boleto_id]); await audit(req.user.email,'lançou financeiro',req.body.title); res.json(r.rows[0]); } catch(e){ next(e); } });
app.post('/api/finance/:id/pay', auth, can('finance.manage'), async (req,res,next)=>{ try { const r=await q("UPDATE finance SET status='pago' WHERE id=$1 RETURNING *",[req.params.id]); if (r.rows[0]?.boleto_id) await q("UPDATE boletos SET status='pago',paid_at=now() WHERE id=$1",[r.rows[0].boleto_id]); res.json(r.rows[0]||{}); } catch(e){ next(e); } });
app.get('/api/boletos', auth, can('finance.view'), async (req,res,next)=>{ try { if (isResident(req.user) && req.user.resident_id) return res.json((await q('SELECT * FROM boletos WHERE deleted_at IS NULL AND (resident_id=$1 OR unit=(SELECT unit FROM residents WHERE id=$1)) ORDER BY id DESC',[req.user.resident_id])).rows); res.json((await q('SELECT * FROM boletos WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 300')).rows); } catch(e){ next(e); } });
app.post('/api/boletos', auth, can('boletos.manage'), async (req,res,next)=>{ try { requireFields(req.body,['title','amount']); const resident=await findResident(req.body); const boleto=await createBoleto({ unit:req.body.unit, resident_id:resident?.id||null, title:req.body.title, amount:req.body.amount, due_date:req.body.due_date, bank_name:req.body.bank_name||'', digitable_line:req.body.digitable_line||'', barcode:req.body.barcode||'', pdf_url:req.body.pdf_url||'', payment_link:req.body.payment_link||'', provider:req.body.provider||'manual', source_type:req.body.source_type||'manual' }); res.json(boleto); } catch(e){ next(e); } });

app.get('/api/notices', auth, can('notices.view'), async (req,res,next)=>{ try { res.json((await q("SELECT * FROM notices WHERE target_role IN ('todos',$1) OR $1 IN ('sindico','admin') ORDER BY id DESC",[req.user.role])).rows); } catch(e){ next(e); } });
app.post('/api/notices', auth, can('notices.manage'), async (req,res,next)=>{ try { requireFields(req.body,['title','body']); const criteria=req.body.target_criteria || {}; const r=await q('INSERT INTO notices(title,body,channel,priority,target_role,target_criteria) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[req.body.title,req.body.body,req.body.channel||'app',req.body.priority||'normal',req.body.target_role||'todos',JSON.stringify(criteria)]); await audit(req.user.email,'criou comunicado',req.body.title); const selectedKeys=Object.keys(criteria).filter(k => criteria[k]); if ((req.body.target_role || 'todos') === 'morador' || (req.body.target_role || 'todos') === 'todos') { let residents=(await q('SELECT * FROM residents WHERE COALESCE(active,true)=true ORDER BY id DESC')).rows; if (selectedKeys.length) residents=residents.filter(r => selectedKeys.every(k => parseJson(r.resident_tags, {})[k] === true)); for (const resident of residents) await notifyResident(resident,{ title:req.body.title, body:req.body.body, channels:{ app:true,browser:true,email:req.body.priority==='critica',telegram:true }, action_url:'/#/comunicacao', payload:{ notice_id:r.rows[0].id, criteria:selectedKeys } }).catch(()=>null); } res.json(r.rows[0]); } catch(e){ next(e); } });
app.get('/api/invoices', auth, can('invoices.view'), async (_req,res,next)=>{ try { res.json((await q('SELECT i.*, r.name resident_name FROM invoices i LEFT JOIN residents r ON r.id=i.resident_id ORDER BY i.id DESC')).rows); } catch(e){ next(e); } });
app.post('/api/invoices', auth, can('invoices.manage'), async (req,res,next)=>{ try { requireFields(req.body,['supplier']); const resident=await findResident(req.body); const r=await q('INSERT INTO invoices(supplier,document_number,access_key,amount,issue_date,due_date,unit,resident_id,category,status,extracted_text,file_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *',[req.body.supplier,req.body.document_number||'',req.body.access_key||'',req.body.amount||0,req.body.issue_date||null,req.body.due_date||null,req.body.unit||'',resident?.id||null,req.body.category||'nota fiscal',req.body.status||'registrada',req.body.extracted_text||'',req.body.file_name||'']); res.json(r.rows[0]); } catch(e){ next(e); } });
app.get('/api/incidents', auth, can('incidents.view'), async (_req,res,next)=>{ try { res.json((await q('SELECT * FROM incidents ORDER BY id DESC')).rows); } catch(e){ next(e); } });
app.post('/api/incidents', auth, can('incidents.manage'), async (req,res,next)=>{ try { requireFields(req.body,['title']); const r=await q('INSERT INTO incidents(title,description,unit,severity) VALUES($1,$2,$3,$4) RETURNING *',[req.body.title,req.body.description||'',req.body.unit||'',req.body.severity||'normal']); res.json(r.rows[0]); } catch(e){ next(e); } });
app.post('/api/incidents/:id/close', auth, can('incidents.manage'), async (req,res,next)=>{ try { const r=await q("UPDATE incidents SET status='fechada',closed_at=now() WHERE id=$1 RETURNING *",[req.params.id]); res.json(r.rows[0]||{}); } catch(e){ next(e); } });
app.get('/api/maintenance', auth, can('maintenance.view'), async (_req,res,next)=>{ try { res.json((await q('SELECT * FROM maintenance ORDER BY scheduled_for DESC NULLS LAST,id DESC')).rows); } catch(e){ next(e); } });
app.post('/api/maintenance', auth, can('maintenance.manage'), async (req,res,next)=>{ try { requireFields(req.body,['title']); const r=await q('INSERT INTO maintenance(title,supplier,scheduled_for,status,cost,notes) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[req.body.title,req.body.supplier||'',req.body.scheduled_for||null,req.body.status||'planejada',req.body.cost||0,req.body.notes||'']); res.json(r.rows[0]); } catch(e){ next(e); } });

app.get('/api/emergency-types', auth, async (_req,res,next)=>{ try { res.json((await q('SELECT * FROM emergency_types WHERE active=true ORDER BY sort_order,label')).rows); } catch(e){ next(e); } });
app.post('/api/emergency-types', auth, can('settings.manage'), async (req,res,next)=>{ try { requireFields(req.body,['code','label']); const r=await q('INSERT INTO emergency_types(code,label,phone,supplier,instructions,notify_all,active,sort_order,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()) ON CONFLICT(code) DO UPDATE SET label=$2,phone=$3,supplier=$4,instructions=$5,notify_all=$6,active=$7,sort_order=$8,updated_at=now() RETURNING *',[req.body.code,req.body.label,req.body.phone||'',req.body.supplier||'',req.body.instructions||'',req.body.notify_all===true,req.body.active!==false,req.body.sort_order||99]); res.json(r.rows[0]); } catch(e){ next(e); } });

function emergencyLocationText(er={}) {
  return er.occurrence_location || er.unit || 'local a confirmar pela portaria';
}
function emergencyProfessionalMessage(er={}) {
  const loc = emergencyLocationText(er);
  const code = String(er.type_code || '').toLowerCase();
  const obs = er.message ? `\nObservação: ${er.message}` : '';
  const map = {
    incendio: {
      title:'Alerta de emergência: fogo ou fumaça',
      body:`🚨 ALERTA DE EMERGÊNCIA\n\nFoi identificado aviso de fogo ou fumaça no condomínio.\n\nLocal informado: ${loc}\n\nOrientação: mantenha a calma, evite usar elevadores, afaste-se da área indicada e acompanhe as próximas orientações da portaria/síndico.${obs}`
    },
    gas: {
      title:'Alerta de emergência: vazamento de gás',
      body:`🚨 ALERTA DE EMERGÊNCIA\n\nFoi identificado aviso de vazamento de gás no condomínio.\n\nLocal informado: ${loc}\n\nOrientação: não acione interruptores, evite chamas/faíscas, afaste-se da área indicada e acompanhe as próximas orientações da portaria/síndico.${obs}`
    },
    invasao: {
      title:'Alerta de segurança: invasão',
      body:`🚨 ALERTA DE SEGURANÇA\n\nFoi registrado aviso de invasão ou acesso não autorizado no condomínio.\n\nLocal informado: ${loc}\n\nOrientação: evite circular pelas áreas comuns, procure local seguro e acompanhe as próximas orientações da portaria/síndico.${obs}`
    }
  };
  if (map[code]) return map[code];
  return {
    title:`Emergência: ${er.type_label || 'Ocorrência'}`,
    body:`🚨 COMUNICADO DE EMERGÊNCIA\n\nOcorrência: ${er.type_label || 'Emergência'}\nLocal informado: ${loc}${obs}\n\nA equipe responsável já foi acionada. Acompanhe as próximas orientações pelo sistema.`
  };
}

async function handleEmergencyRequest(req,res,next){ try {
  const code=req.body.type || req.body.code || 'geral';
  const type=(await q('SELECT * FROM emergency_types WHERE code=$1',[code])).rows[0] || { code, label:'Emergência', notify_all:false, phone:'', supplier:'', instructions:'' };
  let loginUnit=req.user?.unit || '';
  if (!loginUnit && req.user?.resident_id) {
    const residentRow = await q('SELECT unit FROM residents WHERE id=$1',[req.user.resident_id]).catch(()=>({ rows:[] }));
    loginUnit = residentRow.rows?.[0]?.unit || '';
  }
  const roleLocation = ['portaria','zeladoria','limpeza','manutencao','seguranca'].includes(String(req.user?.role||'')) ? roleLabel(req.user.role).toLowerCase() : '';
  const loc=req.body.occurrence_location || req.body.location_type || req.body.location || (loginUnit ? 'Minha unidade' : roleLocation);
  const neighbor=req.body.neighbor_unit || '';
  const floor=req.body.floor || '';
  const finalLocation = loc === 'Minha unidade' ? (loginUnit || req.body.unit || '') : loc === 'Vizinho' ? `Vizinho - unidade ${neighbor || 'não informada'}` : loc === 'Corredor' ? `Corredor - andar ${floor || 'não informado'}` : (loc || req.body.unit || loginUnit || roleLocation || '');
  const unit=req.body.unit || loginUnit || roleLocation || '';
  const message=req.body.message || '';
  const notify_all=Boolean(type.notify_all);
  const r=await q('INSERT INTO emergency_requests(type_code,type_label,unit,message,requested_by,requested_role,status,notify_all,occurrence_location,location_type,neighbor_unit,floor) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *',[code,type.label,unit,message,req.user.id,req.user.role,'pendente',notify_all,finalLocation,loc,neighbor,floor]);
  const body=`${type.label} solicitada. Local: ${finalLocation || unit || 'a confirmar'}. ${message}`;
  await notifyStaff({ title:'Emergência aguardando aprovação', body, action_url:'/#/emergencia' }).catch(()=>null);
  await q('INSERT INTO incidents(title,description,unit,severity,status) VALUES($1,$2,$3,$4,$5)', [`Emergência pendente: ${type.label}`, `${body}\nContato: ${type.supplier || '-'} ${type.phone || ''}\nOrientação: ${type.instructions || '-'}`, unit || finalLocation, 'critica', 'aberta']).catch(()=>null);
  res.json({ ok:true, request:r.rows[0], message:'Solicitação enviada para aprovação da portaria/síndico.', emergency:type });
} catch(e){ next(e); } }
app.post('/api/emergency', auth, can('emergency.use'), handleEmergencyRequest);
app.post('/api/emergency-requests', auth, can('emergency.use'), handleEmergencyRequest);
app.get('/api/emergency-requests', auth, can('emergency.approve'), async (_req,res,next)=>{ try { res.json((await q('SELECT er.*, u.email requested_email FROM emergency_requests er LEFT JOIN users u ON u.id=er.requested_by ORDER BY er.id DESC LIMIT 200')).rows); } catch(e){ next(e); } });
app.post('/api/emergency-requests/:id/approve', auth, can('emergency.approve'), async (req,res,next)=>{ try {
  const r=await q("UPDATE emergency_requests SET status='aprovada',approved_by=$1,decision_note=$2,decided_at=now() WHERE id=$3 RETURNING *",[req.user.id,req.body.note||'',req.params.id]);
  const er=r.rows[0];
  if (!er) return res.status(404).json({ error:'Solicitação não encontrada.' });
  const msg=emergencyProfessionalMessage(er);
  if (er.notify_all) {
    await notifyAllResidents({ title:msg.title, body:msg.body, channels:{ app:true,browser:true,email:false,telegram:true,whatsapp:true }, action_url:'/#/emergencia', payload:{ emergency:true, critical:true, type:er.type_code } });
  } else {
    await notifyStaff({ title:msg.title, body:msg.body, action_url:'/#/emergencia', channels:{ telegram:true,email:false,browser:true } });
  }
  await audit(req.user.email,'aprovou emergência',er.type_label);
  res.json({ ...er, notification_title:msg.title });
} catch(e){ next(e); } });
app.post('/api/emergency-requests/:id/reject', auth, can('emergency.approve'), async (req,res,next)=>{ try { const r=await q("UPDATE emergency_requests SET status='rejeitada',approved_by=$1,decision_note=$2,decided_at=now() WHERE id=$3 RETURNING *",[req.user.id,req.body.note||'',req.params.id]); res.json(r.rows[0]||{}); } catch(e){ next(e); } });

app.get('/api/notifications', auth, async (req,res,next)=>{ try { const rows = isResident(req.user) && req.user.resident_id ? (await q('SELECT * FROM notifications WHERE resident_id=$1 OR user_id=$2 ORDER BY id DESC LIMIT 150',[req.user.resident_id,req.user.id])).rows : (await q('SELECT * FROM notifications WHERE user_id IS NULL OR user_id=$1 ORDER BY id DESC LIMIT 150',[req.user.id])).rows; res.json(rows); } catch(e){ next(e); } });
app.post('/api/notifications/:id/read', auth, async (req,res,next)=>{ try {
  const r=await q("UPDATE notifications SET status='lida',read_at=now() WHERE id=$1 RETURNING *",[req.params.id]);
  const n=r.rows[0];
  if(n){ await audit(req.user.email || req.user.name || 'sistema','leu e removeu notificação',`${n.title || ''} #${n.id}`).catch(()=>null); await q('DELETE FROM notifications WHERE id=$1',[n.id]).catch(()=>null); }
  res.json({ ok:true, removed:true, notification:n||{} });
} catch(e){ next(e); } });
app.post('/api/notifications/read-all', auth, async (req,res,next)=>{ try {
  let rows=[];
  if (isResident(req.user) && req.user.resident_id) rows=(await q("UPDATE notifications SET status='lida',read_at=COALESCE(read_at,now()) WHERE resident_id=$1 OR user_id=$2 RETURNING id,title",[req.user.resident_id,req.user.id])).rows;
  else rows=(await q("UPDATE notifications SET status='lida',read_at=COALESCE(read_at,now()) WHERE user_id IS NULL OR user_id=$1 RETURNING id,title",[req.user.id])).rows;
  for (const n of rows) await audit(req.user.email || req.user.name || 'sistema','leu e removeu notificação',`${n.title || ''} #${n.id}`).catch(()=>null);
  if (rows.length) await q("DELETE FROM notifications WHERE id = ANY($1::int[])",[rows.map(r=>r.id)]).catch(()=>null);
  res.json({ ok:true, removed:rows.length, message:'Notificações marcadas como lidas e arquivadas na auditoria.' });
} catch(e){ next(e); } });
app.delete('/api/notifications/:id', auth, async (req,res,next)=>{ try {
  let r;
  if (isResident(req.user) && req.user.resident_id) r=await q('DELETE FROM notifications WHERE id=$1 AND (resident_id=$2 OR user_id=$3) RETURNING id,title',[req.params.id,req.user.resident_id,req.user.id]);
  else r=await q('DELETE FROM notifications WHERE id=$1 AND (user_id IS NULL OR user_id=$2) RETURNING id,title',[req.params.id,req.user.id]);
  const n=r.rows[0];
  if(!n) return res.status(404).json({ error:'Notificação não encontrada.' });
  await audit(req.user.email || req.user.name || 'sistema','apagou notificação',`${n.title || ''} #${n.id}`).catch(()=>null);
  res.json({ ok:true, removed:1 });
} catch(e){ next(e); } });
app.delete('/api/notifications', auth, async (req,res,next)=>{ try {
  let rows=[];
  if (isResident(req.user) && req.user.resident_id) rows=(await q('DELETE FROM notifications WHERE resident_id=$1 OR user_id=$2 RETURNING id,title',[req.user.resident_id,req.user.id])).rows;
  else rows=(await q('DELETE FROM notifications WHERE user_id IS NULL OR user_id=$1 RETURNING id,title',[req.user.id])).rows;
  for (const n of rows) await audit(req.user.email || req.user.name || 'sistema','apagou todas as notificações',`${n.title || ''} #${n.id}`).catch(()=>null);
  res.json({ ok:true, removed:rows.length, message:'Todas as notificações foram apagadas.' });
} catch(e){ next(e); } });
app.delete('/api/notifications/read', auth, async (req,res,next)=>{ try {
  let rows=[];
  if (isResident(req.user) && req.user.resident_id) rows=(await q("DELETE FROM notifications WHERE status='lida' AND (resident_id=$1 OR user_id=$2) RETURNING id,title",[req.user.resident_id,req.user.id])).rows;
  else rows=(await q("DELETE FROM notifications WHERE status='lida' AND (user_id IS NULL OR user_id=$1) RETURNING id,title",[req.user.id])).rows;
  for (const n of rows) await audit(req.user.email || req.user.name || 'sistema','apagou notificação lida',`${n.title || ''} #${n.id}`).catch(()=>null);
  res.json({ ok:true, removed:rows.length, message:'Notificações lidas apagadas e mantidas na auditoria.' });
} catch(e){ next(e); } });
app.get('/api/notifications/log', auth, can('settings.manage'), async (_req,res,next)=>{ try {
  res.json((await q("SELECT id,title,body,channel,status,delivery_status,created_at,read_at FROM notifications ORDER BY id DESC LIMIT 300")).rows);
} catch(e){ next(e); } });
app.get('/api/push/vapid-public-key', auth, async (_req,res)=>res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || '' }));
app.post('/api/push/subscribe', auth, async (req,res,next)=>{ try { if (!req.body.endpoint) return res.status(400).json({ error:'Endpoint não informado.' }); await q('INSERT INTO push_subscriptions(user_id,endpoint,payload) VALUES($1,$2,$3) ON CONFLICT(endpoint) DO UPDATE SET payload=$3',[req.user.id,req.body.endpoint,JSON.stringify(req.body)]); res.json({ ok:true }); } catch(e){ next(e); } });


app.get('/api/apps/download/:kind', auth, async (req,res,next)=>{ try {
  const kind=String(req.params.kind||'').toLowerCase();
  const allowed={ portaria:'ENABLE_APP_PORTARIA', sindico:'ENABLE_APP_SINDICO', morador:'ENABLE_APP_MORADOR' };
  if (!allowed[kind]) return res.status(404).send('Aplicativo não encontrado.');
  if (!(isMaster(req.user) || boolValue(await getSetting(allowed[kind], 'true'), true))) return res.status(403).send('Aplicativo bloqueado pelas configurações do sistema.');
  const configured=await getSetting(`APK_${kind.toUpperCase()}_URL`, '');
  if (configured) return res.redirect(configured);
  const file=path.join(__dirname,'..','apks',`vitoria-regia-${kind}.apk`);
  try { await fs.access(file); } catch { return res.status(404).send('APK ainda não foi gerado. Gere pelo GitHub Actions ou configure a URL do APK em Configurações → Apps.'); }
  res.download(file, `vitoria-regia-${kind}.apk`);
} catch(e){ next(e); } });

app.get('/api/settings', auth, async (_req,res,next)=>{ try { res.json(await getSettingsObject({ maskSecrets:true })); } catch(e){ next(e); } });
app.post('/api/settings', auth, can('settings.manage'), async (req,res,next)=>{ try {
  if (containsProtectedSettings(req.body) && !isMaster(req.user)) return res.status(403).json({ error:'Funcionalidades liberadas, apps e banco exigem acesso reservado.' });
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
    githubTokenConfigured: Boolean(await getRuntimeSecret('UPDATE_GITHUB_TOKEN', process.env.GITHUB_TOKEN || '')),
    renderDeployHookConfigured: Boolean(await getRuntimeSecret('RENDER_DEPLOY_HOOK_URL','')),
    feedUrl: await getSetting('UPDATE_FEED_URL', process.env.UPDATE_FEED_URL || ''),
    signatureRequired: ['1','true','sim','yes','on'].includes(String(process.env.UPDATE_REQUIRE_SIGNATURE || await getSetting('UPDATE_REQUIRE_SIGNATURE','false')).toLowerCase())
  });
} catch(e){ next(e); } });
app.get('/api/system-updates', auth, canViewUpdates, async (_req,res,next)=>{ try { res.json((await q("SELECT id,update_code,version,title,notes,from_version,to_version,status,payload_sha256,manifest,announced_at,validated_at,applied_at,error,created_at FROM system_updates ORDER BY id DESC LIMIT 100")).rows); } catch(e){ next(e); } });
app.post('/api/system-updates/github-test', auth, masterOnly, async (_req,res,next)=>{ try {
  const result = await testGithubUpdateAccess();
  res.status(result.ok ? 200 : 400).json(result);
} catch(e){ next(e); } });
app.post('/api/system-updates/upload', auth, masterOnly, uploadUpdateZip.single('update_zip'), async (req,res,next)=>{ try {
  if (!boolValue(await getSetting('ENABLE_SYSTEM_UPDATES','true'), true)) return res.status(403).json({ error:'Central de atualizações bloqueada nas configurações.' });
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
  res.json({ ok:true, message:'Atualização validada pelo site. Autenticação conferida por token interno e hash SHA-256. Assinatura digital é exigida somente quando UPDATE_REQUIRE_SIGNATURE=true.', update:{ update_code:validation.manifest.update_code, version:validation.manifest.version || validation.manifest.to_version, title:validation.manifest.title, notes:validation.manifest.notes, signed:Boolean(validation.manifest.signature) }, files:validation.files });
} catch(e){ next(e); } });
app.post('/api/system-updates/:id/notify', auth, masterOnly, async (req,res,next)=>{ try {
  const row = (await q('SELECT * FROM system_updates WHERE id=$1',[req.params.id])).rows[0];
  if (!row) return res.status(404).json({ error:'Atualização não encontrada.' });
  const manifest = parseJson(row.manifest, { update_code:row.update_code, version:row.version, title:row.title, notes:row.notes });
  const notified = await notifyUpdateAvailable(manifest, req.user.email);
  res.json({ ok:true, notified, message:'Aviso de atualização reenviado.' });
} catch(e){ next(e); } });
app.post('/api/system-updates/:id/apply', auth, masterOnly, async (req,res,next)=>{ try {
  const communicationSnapshot = await preserveCommunicationSettingsSnapshot();
  const row = (await q('SELECT * FROM system_updates WHERE id=$1',[req.params.id])).rows[0];
  if (!row) return res.status(404).json({ error:'Atualização não encontrada.' });
  if (!row.package_data) return res.status(400).json({ error:'Esta atualização foi apenas anunciada. Envie o ZIP validado antes de aplicar.' });
  const validation = validateUpdatePackage(row.package_data, req.body?.validation_code || parseJson(row.manifest, {}).validation_token || '');
  const mode = String(req.body?.mode || await getSetting('UPDATE_APPLY_MODE', process.env.UPDATE_APPLY_MODE || 'github')).toLowerCase();
  let result;
  if (mode === 'github') {
    await testGithubUpdateAccess();
    result = await applyUpdateViaGithub(validation.payloadBuffer, validation.manifest);
  }
  else if (mode === 'local') result = await applyUpdateLocally(validation.payloadBuffer);
  else result = { manual:true, message:'Atualização validada. Modo manual selecionado; publique o payload pelo GitHub.' };
  await q("UPDATE system_updates SET status=$1, applied_by=$2, applied_at=now(), error=NULL WHERE id=$3", [mode === 'manual' ? 'validado' : 'aplicado', req.user.id, req.params.id]);
  await restoreCommunicationSettingsSnapshot(communicationSnapshot);
  await notifyUpdateAvailable({ ...validation.manifest, title:`Atualização ${validation.manifest.version || validation.manifest.update_code} aplicada` }, req.user.email).catch(()=>null);
  await audit(req.user.email, 'aplicou atualização preservando configurações de comunicação', validation.manifest.update_code);
  res.json({ ok:true, mode, result, requires_relogin:true, message: mode === 'github' ? 'Atualização enviada ao GitHub. O Render fará novo deploy pelo repositório/deploy hook. Entre novamente após o deploy para carregar a nova versão.' : 'Atualização processada. Entre novamente para carregar a nova versão.' });
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

async function getWeatherSafe(input={}) { try { const lat=Number(input.lat || await getSetting('WEATHER_LAT','-7.1195')); const lon=Number(input.lon || await getSetting('WEATHER_LON','-34.8450')); const city=input.city || await getSetting('WEATHER_CITY','João Pessoa'); const url=`https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m`; const r=await fetch(url, { signal: AbortSignal.timeout(4500) }); const data=await r.json(); return { city, temperature:data?.current?.temperature_2m, humidity:data?.current?.relative_humidity_2m, wind:data?.current?.wind_speed_10m, code:data?.current?.weather_code, updated_at:data?.current?.time, source:'localização' }; } catch { return { city: await getSetting('WEATHER_CITY','João Pessoa'), temperature:null, humidity:null, source:'indisponível' }; } }
app.get('/api/weather', auth, async (req,res,next)=>{ try { res.json(await getWeatherSafe({ lat:req.query.lat, lon:req.query.lon, city:req.query.city })); } catch(e){ next(e); } });

function safeBool(v) { return Boolean(v && String(v).trim()); }
app.get('/api/notify/config', auth, can('settings.manage'), async (_req,res,next)=>{ try {
  const telegramToken = await getSetting('TELEGRAM_BOT_TOKEN', process.env.TELEGRAM_BOT_TOKEN || '');
  const whatsToken = await getSetting('WHATSAPP_ACCESS_TOKEN', process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_API_TOKEN || '');
  const smtpPass = await getSetting('SMTP_PASS', process.env.SMTP_PASS || '');
  const sendgridKey = process.env.SENDGRID_API_KEY || await getSetting('SENDGRID_API_KEY','');
  res.json({
    email: { enabled: await featureEnabled('email'), provider: await getSetting('MAIL_PROVIDER', await getSetting('EMAIL_PROVIDER', sendgridKey ? 'sendgrid' : 'smtp')), sendgridApiKeyConfigured: safeBool(sendgridKey), sendgridApiKey: maskSecretSetting(sendgridKey), sendgridFromEmail: await getSetting('SENDGRID_FROM_EMAIL', process.env.SENDGRID_FROM_EMAIL || ''), sendgridFromName: await getSetting('SENDGRID_FROM_NAME', 'Condomínio Vitória Régia'), replyTo: await getSetting('SENDGRID_REPLY_TO',''), smtpHost: await getSetting('SMTP_HOST',''), smtpPort: await getSetting('SMTP_PORT','587'), smtpUser: await getSetting('SMTP_USER',''), smtpPassConfigured: safeBool(smtpPass) },
    telegram: { enabled: await featureEnabled('telegram'), configured: safeBool(telegramToken), token: maskSecretSetting(telegramToken), chatDefaultConfigured: safeBool(await getTelegramDefaultChatId()), chatDefault: maskSecretSetting(await getTelegramDefaultChatId()), chatDefaultRaw: await getTelegramDefaultChatId(), botUsername: await getSetting('TELEGRAM_BOT_USERNAME', process.env.TELEGRAM_BOT_USERNAME || ''), startUrl: await getSetting('TELEGRAM_START_URL', process.env.TELEGRAM_START_URL || ''), apiBaseUrl: await getSetting('TELEGRAM_API_BASE_URL', process.env.TELEGRAM_API_BASE_URL || 'https://api.telegram.org'), webhookSecretConfigured: safeBool(await getSetting('TELEGRAM_WEBHOOK_SECRET', process.env.TELEGRAM_WEBHOOK_SECRET || '')) },
    whatsapp: { enabled: await featureEnabled('whatsapp'), configured: safeBool(await getSetting('WHATSAPP_PHONE_NUMBER_ID', process.env.WHATSAPP_PHONE_NUMBER_ID || '')) && safeBool(whatsToken), token: maskSecretSetting(whatsToken), phoneNumberId: await getSetting('WHATSAPP_PHONE_NUMBER_ID',''), businessAccountId: await getSetting('WHATSAPP_BUSINESS_ACCOUNT_ID',''), apiVersion: await getSetting('WHATSAPP_API_VERSION','v19.0'), apiBaseUrl: await getSetting('WHATSAPP_API_BASE_URL','https://graph.facebook.com') },
    browser: { enabled: await featureEnabled('browser'), configured: safeBool(await getSetting('VAPID_PUBLIC_KEY', process.env.VAPID_PUBLIC_KEY || '')) && safeBool(await getSetting('VAPID_PRIVATE_KEY', process.env.VAPID_PRIVATE_KEY || '')), publicKeyConfigured: safeBool(await getSetting('VAPID_PUBLIC_KEY', process.env.VAPID_PUBLIC_KEY || '')) }
  });
} catch(e){ next(e); } });
app.post('/api/notify/test', auth, can('settings.manage'), async (req,res,next)=>{ try {
  const channel=String(req.body.channel || 'email'); const msg=req.body.message || 'Mensagem de teste Vitória Régia';
  if (channel === 'email') return res.json(await sendEmailSmart({ to:req.body.to || req.body.email || await getSetting('SENDGRID_TO_DEFAULT',''), subject:req.body.subject || 'Teste Vitória Régia', text:msg, actionUrl:req.body.action_url || await getSetting('PUBLIC_APP_URL',''), actionLabel:req.body.action_label || 'Abrir sistema' }));
  if (channel === 'telegram') { const chat=String(req.body.chat_id || req.body.to || '').trim(); const allowDefault=String(req.body.target_type || '').trim() === 'padrao' || (!req.body.target_type && !chat); return res.json(await sendTelegramMessage(chat, telegramPremiumMessage({ title:req.body.subject || 'Teste Vitória Régia', body:msg, category:'sistema', actionUrl:fullActionUrl('/#/comunicacao') }), { allowDefaultChat:allowDefault })); }
  if (channel === 'whatsapp') return res.json(await sendWhatsAppText(req.body.phone || req.body.to || '', msg));
  if (channel === 'browser') { await createNotification({ user_id:req.user.id, title:req.body.subject || 'Teste Vitória Régia', body:msg, channel:'app', channels:{ app:true,browser:true }, payload:{ test:true } }); return res.json({ ok:true, channel:'browser' }); }
  res.status(400).json({ error:'Canal inválido.' });
} catch(e){ next(e); } });
app.post('/api/notify/email/preview', auth, can('settings.manage'), async (req,res,next)=>{ try {
  const html = await professionalEmailHtml({ subject:req.body.subject || 'Prévia de e-mail Vitória Régia', text:req.body.message || 'Esta é uma prévia do novo modelo premium de e-mail.', actionUrl:req.body.action_url || await getSetting('PUBLIC_APP_URL',''), actionLabel:req.body.action_label || 'Abrir sistema' });
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.send(html);
} catch(e){ next(e); } });
const uploadManual = multer({ storage: multer.memoryStorage(), limits:{ fileSize: 20 * 1024 * 1024 } });
const uploadDocument = multer({ storage: multer.memoryStorage(), limits:{ fileSize: Number(process.env.DOCUMENT_UPLOAD_LIMIT_MB || 25) * 1024 * 1024 } });

app.get('/api/documents', auth, async (req,res,next)=>{ try { if (req.user.role === 'sindico' || req.user.role === 'subsindico' || req.user.role === 'admin' || req.user.role === 'master') return res.json((await q('SELECT id,title,description,audience,is_public,file_name,mime_type,file_size,created_at FROM documents ORDER BY id DESC')).rows); res.json((await q('SELECT id,title,description,audience,is_public,file_name,mime_type,file_size,created_at FROM documents WHERE is_public=true ORDER BY id DESC')).rows); } catch(e){ next(e); } });
app.post('/api/documents/upload', auth, can('documents.manage'), uploadDocument.single('document'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Envie um arquivo.' });

    const result = await q(`
      INSERT INTO documents(
        title, description, audience, is_public,
        file_name, mime_type, file_size, file_data, uploaded_by
      )
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING id,title,description,audience,is_public,file_name,mime_type,file_size,created_at
    `, [
      req.body.title || req.file.originalname,
      req.body.description || '',
      req.body.audience || 'publico',
      String(req.body.is_public) !== 'false',
      req.file.originalname,
      req.file.mimetype || 'application/octet-stream',
      req.file.size,
      req.file.buffer,
      req.user.id
    ]);

    await audit(req.user.email, 'enviou documento', result.rows[0].title);
    return res.json(result.rows[0]);
  } catch (e) {
    return next(e);
  }
});
app.get('/api/documents/:id/download', auth, async (req,res,next)=>{ try { const r=(await q('SELECT * FROM documents WHERE id=$1',[req.params.id])).rows[0]; if(!r) return res.status(404).send('Documento não encontrado.'); if(!r.is_public && !['sindico','subsindico','admin','master'].includes(req.user.role)) return res.status(403).send('Documento restrito.'); res.setHeader('Content-Type', r.mime_type || 'application/octet-stream'); res.setHeader('Content-Disposition', `inline; filename="${String(r.file_name || 'documento').replace(/"/g,'')}"`); res.send(r.file_data); } catch(e){ next(e); } });

app.get('/api/occurrence-book', auth, can('occurrences.view'), async (req,res,next)=>{ try { if (isResident(req.user) && req.user.resident_id) return res.json((await q('SELECT * FROM occurrence_book WHERE created_by=$1 OR unit=$2 ORDER BY id DESC',[req.user.id, req.user.unit||''])).rows); res.json((await q('SELECT o.*, u.name created_by_name FROM occurrence_book o LEFT JOIN users u ON u.id=o.created_by ORDER BY o.id DESC LIMIT 300')).rows); } catch(e){ next(e); } });
app.post('/api/occurrence-book', auth, can('occurrences.manage'), async (req,res,next)=>{ try { requireFields(req.body,['title','description']); const unit=req.body.unit || req.user.unit || ''; const r=await q('INSERT INTO occurrence_book(title,description,unit,category,priority,created_by,status) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[req.body.title, req.body.description, unit, req.body.category||'queixa', req.body.priority||'normal', req.user.id, 'aberta']); await audit(req.user.email,'registrou livro de ocorrências',req.body.title); const syndics=(await q("SELECT * FROM users WHERE role IN ('sindico','subsindico') AND active=true")).rows; for(const u of syndics) await createNotification({ user_id:u.id, title:'Nova ocorrência registrada', body:`${req.body.title} - unidade/local ${unit || '-'}`, channel:'app', channels:{app:true,browser:true,email:true,telegram:true}, action_url:'/#/ocorrencias', payload:{ occurrence_id:r.rows[0].id } }).catch(()=>null); res.json(r.rows[0]); } catch(e){ next(e); } });
app.post('/api/occurrence-book/:id/respond', auth, can('occurrences.manage'), async (req,res,next)=>{ try { const r=await q("UPDATE occurrence_book SET response=$1,status=COALESCE($2,status),updated_at=now(),closed_at=CASE WHEN $2='fechada' THEN now() ELSE closed_at END WHERE id=$3 RETURNING *",[req.body.response||'', req.body.status||'respondida', req.params.id]); await audit(req.user.email,'respondeu ocorrência',req.params.id); res.json(r.rows[0]||{}); } catch(e){ next(e); } });

app.get('/api/faqs', auth, async (_req,res,next)=>{ try { res.json((await q('SELECT * FROM faqs WHERE active=true ORDER BY sort_order, id')).rows); } catch(e){ next(e); } });
app.get('/api/support-tickets', auth, can('support.view'), async (req,res,next)=>{ try { if (isResident(req.user)) return res.json((await q('SELECT * FROM support_tickets WHERE created_by=$1 ORDER BY id DESC',[req.user.id])).rows); res.json((await q('SELECT s.*, u.name created_by_name FROM support_tickets s LEFT JOIN users u ON u.id=s.created_by ORDER BY s.id DESC LIMIT 300')).rows); } catch(e){ next(e); } });
app.post('/api/support-tickets', auth, can('support.view'), async (req,res,next)=>{ try {
  requireFields(req.body,['subject','body']);
  const r=await q('INSERT INTO support_tickets(subject,body,priority,created_by,target,status) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[req.body.subject,req.body.body,req.body.priority||'normal',req.user.id,req.body.target||'suporte','aberto']);
  const ticket=r.rows[0];
  await audit(req.user.email,'abriu suporte',req.body.subject);
  const admins=(await q("SELECT * FROM users WHERE role IN ('sindico','subsindico','admin','master') AND active=true")).rows;
  for(const u of admins) await createNotification({ user_id:u.id, title:'Novo pedido de suporte', body:req.body.subject, channel:'app', channels:{app:true,email:true,telegram:true}, action_url:'/#/suporte', payload:{ support_id:ticket.id, category:'suporte' } }).catch(()=>null);

  // v12.6.5: suporte também envia uma mensagem Telegram direta para o chat de suporte/global.
  // Isso garante que @bmedeiros1987 receba pelo Chat ID padrão 8188648317 mesmo se o usuário admin
  // ainda não tiver telegram_chat_id individual cadastrado.
  if (await featureEnabled('telegram')) {
    const supportChat = await getTelegramSupportChatId();
    const author = req.user.name || req.user.email || 'Usuário do sistema';
    const unit = req.user.unit || req.body.unit || '-';
    const text = telegramPremiumMessage({
      title:'Novo pedido de suporte',
      body:`${req.body.subject}

${String(req.body.body || '').slice(0,900)}`,
      category:'suporte',
      actionUrl:fullActionUrl('/#/suporte'),
      details:{ Ticket:ticket.id, Prioridade:req.body.priority||'normal', Solicitante:author, Unidade:unit }
    });
    await sendTelegramMessage(supportChat, text, { disable_web_page_preview:true, allowDefaultChat:true, dedupeKey:`support-ticket:${ticket.id}:${supportChat}` }).catch(e=>updateNotificationDelivery(ticket.id, { telegram_support:{ ok:false, error:e.message } }).catch(()=>null));
  }
  res.json(ticket);
} catch(e){ next(e); } });

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
  res.json(await sendTelegramMessage(req.body?.chat_id || req.body?.to || '', telegramPremiumMessage({ title:'Teste do Telegram', body:msg, category:'sistema', actionUrl:fullActionUrl('/#/configuracoes/telegram') })));
} catch(e){ next(e); } });
app.post('/api/telegram/webhook', async (req,res,next)=>{ try {
  const cb=req.body?.callback_query;
  if (cb?.data && /^pkg:\d+:(receber_elevador|retirar_portaria|retirar_mais_tarde|retirar_agora|chamar_interfone|nao_reconhece)$/.test(cb.data)) {
    const [,id,pref]=cb.data.split(':');
    const r=await q('UPDATE packages SET delivery_preference=$1,resident_response_at=now() WHERE id=$2 RETURNING *',[pref,id]);
    await notifyStaff({ title:'Preferência de entrega informada', body:`Encomenda ${r.rows[0]?.tracking || id}: ${formatDeliveryPreference(pref)}`, action_url:'/#/portaria/encomendas' }).catch(()=>null);
    await telegramApi('answerCallbackQuery',{ callback_query_id:cb.id, text:'Preferência registrada para a portaria.' }).catch(()=>null);
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
app.post('/api/notify/telegram', auth, can('notices.manage'), async (req,res,next)=>{ try { requireFields(req.body,['message']); res.json(await sendTelegramMessage(req.body.chat_id || '', telegramPremiumMessage({ title:req.body.title || 'Notificação Vitória Régia', body:req.body.message, category:req.body.category || 'comunicado', actionUrl:fullActionUrl(req.body.action_url || '/#/comunicacao') }))); } catch(e){ next(e); } });
app.post('/api/notify/whatsapp', auth, can('notices.manage'), async (req,res,next)=>{ try { requireFields(req.body,['phone','message']); res.json(await sendWhatsAppText(req.body.phone, req.body.message)); } catch(e){ next(e); } });
app.get('/api/audit', auth, can('audit.view'), async (_req,res,next)=>{ try { res.json((await q('SELECT * FROM audit ORDER BY id DESC LIMIT 150')).rows); } catch(e){ next(e); } });
app.get('/api/export', auth, can('audit.view'), async (_req,res,next)=>{ try { const tables=['residents','users','employees','shifts','messages','packages','visitors','common_areas','reservations','reservation_visitors','finance','boletos','notices','invoices','incidents','emergency_requests','maintenance','settings','emergency_types','system_updates','manuals','documents','occurrence_book','support_tickets','faqs']; const out={}; for (const t of tables) out[t]=(await q(`SELECT * FROM ${t} ORDER BY 1 DESC LIMIT 1000`)).rows; res.json(out); } catch(e){ next(e); } });
app.post('/api/seed-demo', auth, can('settings.manage'), async (req,res,next)=>{ try { await q("INSERT INTO residents(name,unit,phone,whatsapp_phone,email,document,vehicle,notes) VALUES('Maria Oliveira','101','83999990000','5583999990000','morador@example.com','000.000.000-00','ABC1D23','Cadastro demo') ON CONFLICT DO NOTHING"); await q("INSERT INTO employees(name,role,phone,email) VALUES('Carlos Portaria','portaria','83988880000','portaria@example.com') ON CONFLICT DO NOTHING"); await q("INSERT INTO notices(title,body,priority,target_role) VALUES('Assembleia geral','Reunião no salão às 19h.','alta','todos')"); await audit(req.user.email,'carregou demonstração','seed-demo'); res.json({ ok:true }); } catch(e){ next(e); } });

const staticDir = path.join(__dirname, '../public');
const fallbackStatic = path.join(__dirname, '../../client/dist');
app.use(express.static(staticDir));
app.use(express.static(fallbackStatic));
app.get(/.*/, (_req,res)=>{ const file = path.join(staticDir,'index.html'); res.sendFile(file, err => { if (err) res.sendFile(path.join(fallbackStatic,'index.html')); }); });

app.get('/api/error-logs', auth, masterOnly, async (req,res,next)=>{ try { const r=await q('SELECT id,actor,method,path,message,created_at FROM error_logs ORDER BY id DESC LIMIT 200'); res.json(r.rows); } catch(e){ next(e); } });
app.delete('/api/error-logs', auth, masterOnly, async (req,res,next)=>{ try { await q('DELETE FROM error_logs'); await audit(req.user.email,'limpou logs de erro','todos'); res.json({ ok:true }); } catch(e){ next(e); } });

app.use(async (err,req,res,_next)=>{ console.error(err); try { await q('INSERT INTO error_logs(actor,method,path,message,stack,payload) VALUES($1,$2,$3,$4,$5,$6)', [req.user?.email || '', req.method, req.originalUrl || req.url, err.message || 'Erro interno', err.stack || '', JSON.stringify({ body:req.body ? Object.keys(req.body).reduce((o,k)=>{ o[k]=/token|senha|password|secret|key/i.test(k)?'***':req.body[k]; return o; },{}) : {} })]); } catch(_){} res.status(err.status || 500).json({ error: err.message || 'Erro interno' }); });
createConnectedPool().then(p=>{ pool=p; return init(); }).then(()=>app.listen(process.env.PORT || 3000,()=>console.log(`${APP_VERSION} online na porta ${process.env.PORT || 3000}`))).catch(error=>{ console.error('Falha ao iniciar:', error); process.exit(1); });
