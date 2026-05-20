const fs = require('fs');
const { Pool } = require('pg');

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'sim', 'on'].includes(String(value).toLowerCase());
}

function readOptionalFile(filePath) {
  if (!filePath) return undefined;
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    console.warn(`Aviso: não foi possível ler arquivo SSL ${filePath}: ${error.message}`);
    return undefined;
  }
}

function sslConfig() {
  const sslMode = String(process.env.PGSSLMODE || process.env.PG_SSLMODE || '').toLowerCase();
  const useSsl = bool(process.env.PGSSL, false) || sslMode === 'require' || sslMode === 'verify-ca' || sslMode === 'verify-full';
  if (!useSsl) return undefined;

  const ca = process.env.PGSSL_CA || readOptionalFile(process.env.PGSSL_CA_PATH);
  const cert = process.env.PGSSL_CERT || readOptionalFile(process.env.PGSSL_CERT_PATH);
  const key = process.env.PGSSL_KEY || readOptionalFile(process.env.PGSSL_KEY_PATH);

  return {
    rejectUnauthorized: bool(process.env.PGSSL_REJECT_UNAUTHORIZED, false),
    ...(ca ? { ca } : {}),
    ...(cert ? { cert } : {}),
    ...(key ? { key } : {}),
  };
}

function hasDatabaseConfig() {
  return Boolean(process.env.DATABASE_URL || process.env.PGHOST);
}

let pool = null;

function getPool() {
  if (!hasDatabaseConfig()) return null;
  if (pool) return pool;

  if (process.env.DATABASE_URL) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: sslConfig() });
  } else {
    pool = new Pool({
      host: process.env.PGHOST,
      port: Number(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      ssl: sslConfig(),
      max: Number(process.env.PGPOOL_MAX || 5),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }
  return pool;
}

async function query(text, params) {
  const db = getPool();
  if (!db) throw new Error('Banco de dados não configurado. Configure PGHOST/PGDATABASE/PGUSER/PGPASSWORD ou DATABASE_URL.');
  return db.query(text, params);
}

async function testConnection() {
  const result = await query('select now() as now, current_database() as database, current_user as user');
  return result.rows[0];
}

module.exports = { getPool, hasDatabaseConfig, query, testConnection };
