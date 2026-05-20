const mysql = require('mysql2/promise');

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'sim', 'on', 'required', 'require'].includes(String(value).toLowerCase());
}

function getDatabaseProvider() {
  const provider = String(process.env.DATABASE_PROVIDER || '').toLowerCase();
  if (provider) return provider;
  if (String(process.env.DATABASE_URL || '').toLowerCase().startsWith('mysql://')) return 'mysql';
  if (process.env.MYSQL_HOST || process.env.MYSQL_DATABASE || process.env.MYSQL_USER) return 'mysql';
  return 'mysql';
}

function hasDatabaseConfig() {
  return Boolean(
    process.env.DATABASE_URL ||
    process.env.MYSQL_HOST ||
    process.env.MYSQL_DATABASE ||
    process.env.MYSQL_USER
  );
}

function mysqlSslConfig() {
  const mode = String(process.env.MYSQL_SSL_MODE || process.env.MYSQL_SSL || '').toLowerCase();
  const useSsl = bool(process.env.MYSQL_SSL, false) || ['required', 'require', 'true', 'verify_ca', 'verify_identity'].includes(mode);
  if (!useSsl) return undefined;
  return {
    rejectUnauthorized: bool(process.env.MYSQL_SSL_REJECT_UNAUTHORIZED, false),
  };
}

function normalizeConnectionUri(uri) {
  if (!uri) return uri;
  // mysql2 entende ssl=true melhor do que ssl-mode=REQUIRED em alguns ambientes.
  return uri.replace('ssl-mode=REQUIRED', 'ssl=true').replace('sslmode=require', 'ssl=true');
}

let pool = null;

function translateSql(sql) {
  let text = String(sql || '');
  text = text.replace(/\$\d+/g, '?');
  text = text.replace(/::jsonb/g, '');
  text = text.replace(/\bas\s+"([^"]+)"/gi, 'as $1');
  text = text.replace(/timestamptz/gi, 'timestamp');
  return text;
}

function parseMaybeJson(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed || !['{', '['].includes(trimmed[0])) return value;
  try { return JSON.parse(trimmed); } catch (_) { return value; }
}

function normalizeRows(rows) {
  return (rows || []).map((row) => {
    const out = { ...row };
    for (const key of Object.keys(out)) out[key] = parseMaybeJson(out[key]);
    return out;
  });
}

function wrapConnection(conn) {
  return {
    async query(sql, params = []) {
      const [rows, fields] = await conn.query(translateSql(sql), params);
      return { rows: Array.isArray(rows) ? normalizeRows(rows) : rows, fields, raw: rows };
    },
    async release() { conn.release(); },
  };
}

function getPool() {
  if (!hasDatabaseConfig()) return null;
  if (pool) return pool;

  const common = {
    waitForConnections: true,
    connectionLimit: Number(process.env.MYSQL_POOL_MAX || 5),
    queueLimit: 0,
    connectTimeout: 10000,
    multipleStatements: false,
    decimalNumbers: true,
    dateStrings: false,
  };

  const ssl = mysqlSslConfig();
  if (process.env.DATABASE_URL) {
    pool = mysql.createPool({ uri: normalizeConnectionUri(process.env.DATABASE_URL), ...common, ...(ssl ? { ssl } : {}) });
  } else {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST,
      port: Number(process.env.MYSQL_PORT || 3306),
      database: process.env.MYSQL_DATABASE,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      ...common,
      ...(ssl ? { ssl } : {}),
    });
  }

  return {
    async query(sql, params = []) {
      const [rows, fields] = await pool.query(translateSql(sql), params);
      return { rows: Array.isArray(rows) ? normalizeRows(rows) : rows, fields, raw: rows };
    },
    async connect() {
      const conn = await pool.getConnection();
      return wrapConnection(conn);
    },
    async end() { return pool.end(); },
  };
}

async function query(text, params) {
  const db = getPool();
  if (!db) throw new Error('Banco de dados MySQL não configurado. Configure MYSQL_HOST/MYSQL_DATABASE/MYSQL_USER/MYSQL_PASSWORD ou DATABASE_URL.');
  return db.query(text, params);
}

async function testConnection() {
  const result = await query('select now() as now, database() as databaseName, current_user() as userName');
  const row = result.rows[0] || {};
  return { now: row.now, database: row.databaseName, user: row.userName, provider: getDatabaseProvider() };
}

module.exports = { getPool, hasDatabaseConfig, query, testConnection, getDatabaseProvider };
