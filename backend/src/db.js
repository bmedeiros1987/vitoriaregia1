const mysql = require('mysql2/promise');

function cleanEnvValue(value) {
  if (value === undefined || value === null) return '';
  let text = String(value).trim();
  // Render aceita valores colados manualmente. Se o usuário copiar DATABASE_URL com aspas
  // do arquivo .env, essas aspas podem virar parte do valor e quebrar o mysql2 com
  // "Invalid URL". Removemos somente aspas externas equivalentes.
  if ((text.startsWith('\"') && text.endsWith('\"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim();
  }
  return text;
}

function env(name, fallback = '') {
  const value = cleanEnvValue(process.env[name]);
  return value || fallback;
}

function bool(value, fallback = false) {
  const text = cleanEnvValue(value);
  if (!text) return fallback;
  return ['1', 'true', 'yes', 'sim', 'on', 'required', 'require'].includes(text.toLowerCase());
}

function getDatabaseProvider() {
  const provider = env('DATABASE_PROVIDER').toLowerCase();
  if (provider) return provider;
  if (env('DATABASE_URL').toLowerCase().startsWith('mysql://')) return 'mysql';
  if (env('MYSQL_HOST') || env('MYSQL_DATABASE') || env('MYSQL_USER')) return 'mysql';
  return 'mysql';
}

function hasDatabaseConfig() {
  return Boolean(
    env('DATABASE_URL') ||
    env('MYSQL_HOST') ||
    env('MYSQL_DATABASE') ||
    env('MYSQL_USER')
  );
}

function mysqlSslConfig() {
  const mode = env('MYSQL_SSL_MODE', env('MYSQL_SSL')).toLowerCase();
  const useSsl = bool(env('MYSQL_SSL'), false) || ['required', 'require', 'true', 'verify_ca', 'verify_identity'].includes(mode);
  if (!useSsl) return undefined;
  return {
    // Aiven exige SSL. Em hospedagens como Render, geralmente não há CA local instalada,
    // por isso o padrão seguro para evitar falha de handshake é usar SSL sem validar CA.
    rejectUnauthorized: bool(env('MYSQL_SSL_REJECT_UNAUTHORIZED'), false),
  };
}

function normalizeConnectionUri(uri) {
  const cleaned = cleanEnvValue(uri);
  if (!cleaned) return cleaned;
  // mysql2 não entende ssl-mode=REQUIRED em todos os ambientes.
  return cleaned
    .replace(/ssl-mode=REQUIRED/ig, 'ssl=true')
    .replace(/sslmode=require/ig, 'ssl=true')
    .replace(/ssl-mode=VERIFY_CA/ig, 'ssl=true')
    .replace(/ssl-mode=VERIFY_IDENTITY/ig, 'ssl=true');
}

let rawPool = null;
let wrappedPool = null;

function translateSql(sql) {
  let text = String(sql || '');
  text = text.replace(/\$\d+/g, '?');
  text = text.replace(/::jsonb/g, '');
  text = text.replace(/\bas\s+"([^"]+)"/gi, 'as $1');
  text = text.replace(/timestamptz/gi, 'timestamp');
  return text;
}

function parseMaybeJson(value) {
  if (Buffer.isBuffer(value)) value = value.toString('utf8');
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed || !['{', '['].includes(trimmed[0])) return value;
  try { return JSON.parse(trimmed); } catch (_) { return value; }
}

function normalizeRows(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map((row) => {
    const out = { ...row };
    for (const key of Object.keys(out)) out[key] = parseMaybeJson(out[key]);
    return out;
  });
}

function rowsOf(result) {
  if (!result) return [];
  if (Array.isArray(result.rows)) return result.rows;
  // Formato bruto do mysql2: [rows, fields]
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0];
  if (Array.isArray(result)) return result;
  return [];
}

async function runMysqlQuery(executor, sql, params = []) {
  const output = await executor.query(translateSql(sql), params);
  let rows;
  let fields;

  // mysql2/promise retorna [rows, fields]. Esta proteção também aceita
  // chamadas que eventualmente retornem um objeto já normalizado.
  if (Array.isArray(output) && output.length === 2 && (Array.isArray(output[0]) || typeof output[0] === 'object')) {
    rows = output[0];
    fields = output[1];
  } else if (output && Array.isArray(output.rows)) {
    rows = output.rows;
    fields = output.fields;
  } else {
    rows = output;
  }

  const normalizedRows = Array.isArray(rows) ? normalizeRows(rows) : [];
  const raw = rows || null;

  return {
    rows: normalizedRows,
    fields,
    raw,
    affectedRows: raw && typeof raw === 'object' ? raw.affectedRows : undefined,
    insertId: raw && typeof raw === 'object' ? raw.insertId : undefined,
  };
}

function wrapConnection(conn) {
  return {
    async query(sql, params = []) {
      return runMysqlQuery(conn, sql, params);
    },
    async release() { conn.release(); },
  };
}

function createRawPool() {
  const common = {
    waitForConnections: true,
    connectionLimit: Number(env('MYSQL_POOL_MAX', '5') || 5),
    queueLimit: 0,
    connectTimeout: 15000,
    multipleStatements: false,
    decimalNumbers: true,
    dateStrings: false,
  };

  const ssl = mysqlSslConfig();
  const databaseUrl = normalizeConnectionUri(env('DATABASE_URL'));
  if (databaseUrl) {
    return mysql.createPool({
      uri: databaseUrl,
      ...common,
      ...(ssl ? { ssl } : {}),
    });
  }

  return mysql.createPool({
    host: env('MYSQL_HOST'),
    port: Number(env('MYSQL_PORT', '3306') || 3306),
    database: env('MYSQL_DATABASE'),
    user: env('MYSQL_USER'),
    password: env('MYSQL_PASSWORD'),
    ...common,
    ...(ssl ? { ssl } : {}),
  });
}

function getPool() {
  if (!hasDatabaseConfig()) return null;
  if (wrappedPool) return wrappedPool;

  rawPool = createRawPool();
  wrappedPool = {
    async query(sql, params = []) {
      return runMysqlQuery(rawPool, sql, params);
    },
    async connect() {
      const conn = await rawPool.getConnection();
      return wrapConnection(conn);
    },
    async end() {
      const result = await rawPool.end();
      rawPool = null;
      wrappedPool = null;
      return result;
    },
  };
  return wrappedPool;
}

async function query(text, params) {
  const db = getPool();
  if (!db) throw new Error('Banco de dados MySQL não configurado. Configure MYSQL_HOST/MYSQL_DATABASE/MYSQL_USER/MYSQL_PASSWORD ou DATABASE_URL.');
  return db.query(text, params);
}

async function testConnection() {
  const result = await query('select now() as now, database() as databaseName, current_user() as userName');
  const row = rowsOf(result)[0] || {};
  return { now: row.now, database: row.databaseName, user: row.userName, provider: getDatabaseProvider() };
}

module.exports = { getPool, hasDatabaseConfig, query, testConnection, getDatabaseProvider, rowsOf };
