import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL || '';
const DB_SSL_MODE = String(process.env.DATABASE_SSL_MODE || process.env.DATABASE_SSL || 'auto').toLowerCase();

function maskDatabaseUrl(value = '') {
  try {
    const u = new URL(value);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return value.replace(/:\/\/([^:\/\s]+):([^@\s]+)@/, '://$1:***@');
  }
}
function removeSslQueryParams(value = '') {
  try {
    const u = new URL(value);
    ['sslmode', 'sslcert', 'sslkey', 'sslrootcert'].forEach(k => u.searchParams.delete(k));
    return u.toString();
  } catch {
    return value.replace(/[?&](sslmode|sslcert|sslkey|sslrootcert)=[^&]*/gi, '').replace(/\?&/, '?').replace(/[?&]$/, '');
  }
}
function urlSslMode(value = '') {
  try { return new URL(value).searchParams.get('sslmode')?.toLowerCase() || ''; }
  catch { const m = value.match(/[?&]sslmode=([^&]+)/i); return m ? decodeURIComponent(m[1]).toLowerCase() : ''; }
}
function looksLikeExternalCloudDb(value = '') {
  try { return /render\.com|neon\.tech|supabase\.co|railway\.app|amazonaws\.com|azure\.com|googleusercontent\.com|aivencloud\.com/i.test(new URL(value).hostname); }
  catch { return /render\.com|neon\.tech|supabase\.co|railway\.app|amazonaws\.com|azure\.com|googleusercontent\.com|aivencloud\.com/i.test(value); }
}
function preferredSslAttempts() {
  const sslMode = urlSslMode(DATABASE_URL);
  if (['0','false','no','off','disable','disabled'].includes(DB_SSL_MODE)) return [false, true];
  if (['1','true','yes','on','require','required'].includes(DB_SSL_MODE)) return [true, false];
  if (sslMode === 'disable') return [false, true];
  if (['require','prefer','verify-ca','verify-full','no-verify'].includes(sslMode)) return [true, false];
  return looksLikeExternalCloudDb(DATABASE_URL) ? [true, false] : [false, true];
}
function poolConfig(sslEnabled) {
  return {
    connectionString: removeSslQueryParams(DATABASE_URL),
    ssl: sslEnabled ? { rejectUnauthorized: false } : false,
    max: 2,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 15000
  };
}
function isRetryableSslError(error) {
  return /ssl|tls|certificate|self[- ]signed|handshake|no pg_hba\.conf entry|encryption/i.test(String(error?.message || error || ''));
}
async function connect() {
  const attempts = [...new Set(preferredSslAttempts())];
  let lastError;
  for (const sslEnabled of attempts) {
    const candidate = new Pool(poolConfig(sslEnabled));
    try {
      await candidate.query('SELECT 1');
      console.log(`[preflight] Banco conectado ${sslEnabled ? 'com SSL/TLS' : 'sem SSL/TLS'}: ${maskDatabaseUrl(DATABASE_URL)}`);
      return candidate;
    } catch (error) {
      lastError = error;
      await candidate.end().catch(() => null);
      console.warn(`[preflight] Tentativa ${sslEnabled ? 'com SSL/TLS' : 'sem SSL/TLS'} falhou: ${error.message}`);
      if (!isRetryableSslError(error)) break;
    }
  }
  throw lastError;
}

const migrations = [
  // Tabela users de versões antigas. Esta parte é executada antes do index.js para evitar erro no seed do Master/Síndico.
  "ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS name TEXT",
  "ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS email TEXT",
  "ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS password_hash TEXT",
  "ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'morador'",
  "ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS user_type TEXT DEFAULT 'morador'",
  "ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS is_outsourced BOOLEAN DEFAULT false",
  "ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS unit TEXT",
  "ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}'::jsonb",
  "ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS resident_id INTEGER",
  "ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS employee_id INTEGER",
  "ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS phone TEXT",
  "ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT",
  "ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT",
  "ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{\"app\":true,\"email\":true,\"telegram\":false,\"whatsapp\":false,\"browser\":true}'::jsonb",
  "ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true",
  "ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN DEFAULT false",
  "ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP",
  "ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT now()",

  // Colunas mais usadas em tabelas legadas. O IF EXISTS evita erro em bancos novos.
  "ALTER TABLE IF EXISTS residents ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT",
  "ALTER TABLE IF EXISTS residents ADD COLUMN IF NOT EXISTS access_profile TEXT DEFAULT 'morador'",
  "ALTER TABLE IF EXISTS residents ADD COLUMN IF NOT EXISTS access_permissions JSONB DEFAULT '{}'::jsonb",
  "ALTER TABLE IF EXISTS residents ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT",
  "ALTER TABLE IF EXISTS residents ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{\"app\":true,\"email\":true,\"telegram\":false,\"whatsapp\":false,\"browser\":true}'::jsonb",
  "ALTER TABLE IF EXISTS packages ADD COLUMN IF NOT EXISTS pickup_code TEXT",
  "ALTER TABLE IF EXISTS packages ADD COLUMN IF NOT EXISTS delivery_preference TEXT DEFAULT 'nao_informado'",
  "ALTER TABLE IF EXISTS packages ADD COLUMN IF NOT EXISTS notification_channels JSONB DEFAULT '{}'::jsonb",
  "ALTER TABLE IF EXISTS packages ADD COLUMN IF NOT EXISTS resident_response_at TIMESTAMP",
  "ALTER TABLE IF EXISTS visitors ADD COLUMN IF NOT EXISTS phone TEXT",
  "ALTER TABLE IF EXISTS visitors ADD COLUMN IF NOT EXISTS recurring BOOLEAN DEFAULT false",
  "ALTER TABLE IF EXISTS visitors ADD COLUMN IF NOT EXISTS weekdays JSONB DEFAULT '[]'::jsonb",
  "ALTER TABLE IF EXISTS visitors ADD COLUMN IF NOT EXISTS valid_from DATE",
  "ALTER TABLE IF EXISTS visitors ADD COLUMN IF NOT EXISTS valid_until DATE",
  "ALTER TABLE IF EXISTS visitors ADD COLUMN IF NOT EXISTS announce_required BOOLEAN DEFAULT true",
  "ALTER TABLE IF EXISTS visitors ADD COLUMN IF NOT EXISTS announcement_channel TEXT DEFAULT 'interfone'",
  "ALTER TABLE IF EXISTS visitors ADD COLUMN IF NOT EXISTS notification_channels JSONB DEFAULT '{}'::jsonb",
  "ALTER TABLE IF EXISTS visitors ADD COLUMN IF NOT EXISTS photo_data TEXT",
  "ALTER TABLE IF EXISTS visitors ADD COLUMN IF NOT EXISTS reservation_id INTEGER",
  "ALTER TABLE IF EXISTS visitors ADD COLUMN IF NOT EXISTS notes TEXT",
  "ALTER TABLE IF EXISTS reservations ADD COLUMN IF NOT EXISTS area_id INTEGER",
  "ALTER TABLE IF EXISTS reservations ADD COLUMN IF NOT EXISTS start_time TEXT DEFAULT '19:00'",
  "ALTER TABLE IF EXISTS reservations ADD COLUMN IF NOT EXISTS end_time TEXT DEFAULT '23:00'",
  "ALTER TABLE IF EXISTS reservations ADD COLUMN IF NOT EXISTS fee_amount NUMERIC(12,2) DEFAULT 0",
  "ALTER TABLE IF EXISTS reservations ADD COLUMN IF NOT EXISTS boleto_id INTEGER",
  "ALTER TABLE IF EXISTS reservations ADD COLUMN IF NOT EXISTS document_text TEXT",
  "ALTER TABLE IF EXISTS reservations ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN DEFAULT false",
  "ALTER TABLE IF EXISTS reservations ADD COLUMN IF NOT EXISTS cancel_reason TEXT",
  "ALTER TABLE IF EXISTS reservations ADD COLUMN IF NOT EXISTS created_by INTEGER",
  "ALTER TABLE IF EXISTS reservations ADD COLUMN IF NOT EXISTS approved_by INTEGER",
  "ALTER TABLE IF EXISTS reservations ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP",
  "ALTER TABLE IF EXISTS reservations ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMP",
  "ALTER TABLE IF EXISTS finance ADD COLUMN IF NOT EXISTS unit TEXT",
  "ALTER TABLE IF EXISTS finance ADD COLUMN IF NOT EXISTS resident_id INTEGER",
  "ALTER TABLE IF EXISTS finance ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'geral'",
  "ALTER TABLE IF EXISTS finance ADD COLUMN IF NOT EXISTS boleto_id INTEGER",
  "ALTER TABLE IF EXISTS notifications ADD COLUMN IF NOT EXISTS channels JSONB DEFAULT '{}'::jsonb",
  "ALTER TABLE IF EXISTS notifications ADD COLUMN IF NOT EXISTS action_url TEXT",
  "ALTER TABLE IF EXISTS notifications ADD COLUMN IF NOT EXISTS payload JSONB DEFAULT '{}'::jsonb",
  "ALTER TABLE IF EXISTS emergency_types ADD COLUMN IF NOT EXISTS notify_all BOOLEAN DEFAULT false",
  "ALTER TABLE IF EXISTS system_updates ADD COLUMN IF NOT EXISTS package_data BYTEA",
  "ALTER TABLE IF EXISTS system_updates ADD COLUMN IF NOT EXISTS validation_token_hash TEXT",
  "ALTER TABLE IF EXISTS system_updates ADD COLUMN IF NOT EXISTS payload_sha256 TEXT",
  "ALTER TABLE IF EXISTS system_updates ADD COLUMN IF NOT EXISTS manifest JSONB DEFAULT '{}'::jsonb",

  // Normalização segura. Só roda se a tabela existir.
  "UPDATE users SET role=COALESCE(NULLIF(role,''),'morador') WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='users')",
  "UPDATE users SET user_type=COALESCE(NULLIF(user_type,''),COALESCE(NULLIF(role,''),'morador')) WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='users')",
  "UPDATE users SET permissions=COALESCE(permissions,'{}'::jsonb) WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='users')",
  "UPDATE users SET active=COALESCE(active,true) WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='users')",
  "UPDATE users SET notification_preferences=COALESCE(notification_preferences,'{\"app\":true,\"email\":true,\"telegram\":false,\"whatsapp\":false,\"browser\":true}'::jsonb) WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='users')"
];

async function main() {
  if (!DATABASE_URL) {
    console.log('[preflight] DATABASE_URL não configurada; pulando migração preflight.');
    return;
  }
  const pool = await connect();
  try {
    for (const sql of migrations) {
      try {
        await pool.query(sql);
      } catch (error) {
        console.warn(`[preflight] Migração ignorada: ${error.message}`);
      }
    }
    const check = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name IN ('permissions','user_type','notification_preferences','force_password_change') ORDER BY column_name");
    console.log(`[preflight] Migração concluída. Colunas de users conferidas: ${check.rows.map(r => r.column_name).join(', ') || 'tabela users ainda não existe'}`);
  } finally {
    await pool.end().catch(() => null);
  }
}

main().catch(error => {
  console.error('[preflight] Falha na migração antes da inicialização:', error);
  process.exit(1);
});
