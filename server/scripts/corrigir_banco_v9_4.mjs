import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERRO: DATABASE_URL não informado.');
  process.exit(1);
}

function removeSslQueryParams(value='') {
  try {
    const u = new URL(value);
    ['sslmode','sslcert','sslkey','sslrootcert'].forEach(k => u.searchParams.delete(k));
    return u.toString();
  } catch {
    return value;
  }
}

function maskDatabaseUrl(value='') {
  try {
    const u = new URL(value);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return value.replace(/:\/\/([^:\/\s]+):([^@\s]+)@/, '://$1:***@');
  }
}

const sql = [
  `ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS name TEXT`,
  `ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS email TEXT`,
  `ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS password_hash TEXT`,
  `ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'morador'`,
  `ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS user_type TEXT DEFAULT 'morador'`,
  `ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS is_outsourced BOOLEAN DEFAULT false`,
  `ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS unit TEXT`,
  `ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}'::jsonb`,
  `ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS resident_id INTEGER`,
  `ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS employee_id INTEGER`,
  `ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS phone TEXT`,
  `ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT`,
  `ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT`,
  `ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"app":true,"email":true,"telegram":false,"whatsapp":false,"browser":true}'::jsonb`,
  `ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true`,
  `ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN DEFAULT false`,
  `ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP`,
  `ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT now()`,
  `ALTER TABLE IF EXISTS residents ADD COLUMN IF NOT EXISTS access_permissions JSONB DEFAULT '{}'::jsonb`,
  `ALTER TABLE IF EXISTS residents ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"app":true,"email":true,"telegram":false,"whatsapp":false,"browser":true}'::jsonb`,
  `ALTER TABLE IF EXISTS residents ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT`,
  `ALTER TABLE IF EXISTS residents ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT`,
  `UPDATE users SET permissions = '{}'::jsonb WHERE permissions IS NULL`,
  `UPDATE users SET role = COALESCE(NULLIF(role, ''), 'morador') WHERE role IS NULL OR role = ''`,
  `UPDATE users SET user_type = COALESCE(NULLIF(user_type, ''), role, 'morador') WHERE user_type IS NULL OR user_type = ''`,
  `UPDATE users SET active = true WHERE active IS NULL`,
  `UPDATE users SET notification_preferences = '{"app":true,"email":true,"telegram":false,"whatsapp":false,"browser":true}'::jsonb WHERE notification_preferences IS NULL`,
  `ALTER TABLE users ALTER COLUMN permissions SET DEFAULT '{}'::jsonb`,
  `ALTER TABLE users ALTER COLUMN notification_preferences SET DEFAULT '{"app":true,"email":true,"telegram":false,"whatsapp":false,"browser":true}'::jsonb`
];

const pool = new Pool({
  connectionString: removeSslQueryParams(DATABASE_URL),
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000
});

try {
  console.log('Conectando ao banco:', maskDatabaseUrl(DATABASE_URL));
  await pool.query('BEGIN');
  for (const statement of sql) await pool.query(statement);
  const check = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name='users' AND column_name='permissions'`);
  if (!check.rowCount) throw new Error('A coluna users.permissions não foi criada.');
  await pool.query('COMMIT');
  console.log('OK: banco corrigido. A coluna users.permissions existe e as colunas essenciais foram conferidas.');
} catch (error) {
  await pool.query('ROLLBACK').catch(() => null);
  console.error('ERRO ao corrigir banco:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => null);
}
