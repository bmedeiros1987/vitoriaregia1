const fs = require('fs');

function cleanEnvValue(value) {
  if (value === undefined || value === null) return '';
  let text = String(value).trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
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

function databaseUrlScheme() {
  const url = env('DATABASE_URL').toLowerCase();
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) return 'postgres';
  if (url.startsWith('mysql://') || url.startsWith('mysql2://')) return 'mysql';
  return '';
}

function getDatabaseProvider() {
  // A URL PostgreSQL deve vencer variáveis antigas MYSQL_* que possam ter ficado no Render.
  const scheme = databaseUrlScheme();
  if (scheme) return scheme;

  const provider = env('DATABASE_PROVIDER').toLowerCase();
  if (['postgres', 'postgresql', 'pg'].includes(provider)) return 'postgres';
  if (['mysql', 'mariadb'].includes(provider)) return 'mysql';

  if (env('PGHOST') || env('PGDATABASE') || env('PGUSER') || env('PGPASSWORD')) return 'postgres';
  if (env('MYSQL_HOST') || env('MYSQL_DATABASE') || env('MYSQL_USER') || env('MYSQL_PASSWORD')) return 'mysql';

  // O projeto foi restaurado para PostgreSQL/Aiven por padrão.
  return 'postgres';
}

function hasDatabaseConfig() {
  const provider = getDatabaseProvider();
  if (provider === 'postgres') {
    return Boolean(env('DATABASE_URL') || env('PGHOST') || env('PGDATABASE') || env('PGUSER'));
  }
  return Boolean(env('DATABASE_URL') || env('MYSQL_HOST') || env('MYSQL_DATABASE') || env('MYSQL_USER'));
}

function parseMaybeJson(value) {
  if (Buffer.isBuffer(value)) value = value.toString('utf8');
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed || !['{', '['].includes(trimmed[0])) return value;
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    return value;
  }
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
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0];
  if (Array.isArray(result)) return result;
  return [];
}

function mysqlSslConfig() {
  const mode = env('MYSQL_SSL_MODE', env('MYSQL_SSL')).toLowerCase();
  const useSsl = bool(env('MYSQL_SSL'), false) || ['required', 'require', 'true', 'verify_ca', 'verify_identity'].includes(mode);
  if (!useSsl) return undefined;
  return { rejectUnauthorized: bool(env('MYSQL_SSL_REJECT_UNAUTHORIZED'), false) };
}

function normalizeMysqlConnectionUri(uri) {
  const cleaned = cleanEnvValue(uri);
  if (!cleaned) return cleaned;
  return cleaned
    .replace(/ssl-mode=REQUIRED/ig, 'ssl=true')
    .replace(/sslmode=require/ig, 'ssl=true')
    .replace(/ssl-mode=VERIFY_CA/ig, 'ssl=true')
    .replace(/ssl-mode=VERIFY_IDENTITY/ig, 'ssl=true');
}

function translateToMysql(sql) {
  let text = String(sql || '');
  text = text.replace(/\$\d+/g, '?');
  text = text.replace(/::jsonb/g, '');
  text = text.replace(/\bas\s+"([^"]+)"/gi, 'as $1');
  text = text.replace(/timestamptz/gi, 'timestamp');
  return text;
}

function convertQuestionMarksToPg(text, existingMax = 0) {
  let index = existingMax;
  return text.replace(/\?/g, () => `$${++index}`);
}

function maxPgPlaceholder(text) {
  let max = 0;
  String(text || '').replace(/\$(\d+)/g, (_, n) => {
    max = Math.max(max, Number(n));
    return _;
  });
  return max;
}

function postgresConflictTarget(table) {
  const normalized = String(table || '').replace(/"/g, '').toLowerCase();
  const targets = {
    app_meta: '("key")',
    notification_config: '(id)',
    asaas_config: '(id)',
    auth_accounts: '(email)',
    residents: '(id)',
    pending_residents: '(id)',
    bookings: '(id)',
    visitors: '(id)',
    packages: '(id)',
    notices: '(id)',
    staff: '(id)',
    staff_schedules: '(id)',
    services: '(id)',
    service_requests: '(id)',
    contact_messages: '(id)',
    notification_logs: '(id)',
    activity_logs: '(id)',
  };
  return targets[normalized] || 'ON CONSTRAINT ' + normalized + '_pkey';
}

function translateOnDuplicateKeyToPostgres(text) {
  if (!/on\s+duplicate\s+key\s+update/i.test(text)) return text;

  const match = text.match(/^([\s\S]*?insert\s+into\s+(["`]?\w+["`]?)\s*[\s\S]*?)\s+on\s+duplicate\s+key\s+update\s+([\s\S]*)$/i);
  if (!match) return text;

  const [, insertPart, tableName, updatePartRaw] = match;
  const target = postgresConflictTarget(tableName);
  let updatePart = updatePartRaw.trim();

  updatePart = updatePart.replace(/`([^`]+)`/g, '"$1"');
  updatePart = updatePart.replace(/\bvalues\s*\(\s*`?([a-zA-Z_][\w]*)`?\s*\)/gi, 'excluded.$1');
  updatePart = updatePart.replace(/\s*=\s*/g, '=');

  return `${insertPart} on conflict ${target} do update set ${updatePart}`;
}

function translateInformationSchemaStatistics(text) {
  if (!/information_schema\.statistics/i.test(text)) return text;
  return 'select count(1) as count from pg_indexes where schemaname = current_schema() and tablename = $1 and indexname = $2';
}

function translateToPostgres(sql) {
  let text = String(sql || '');

  // Consulta de teste do backend MySQL antigo.
  text = text.replace(
    /select\s+now\(\)\s+as\s+now\s*,\s*database\(\)\s+as\s+databaseName\s*,\s*current_user\(\)\s+as\s+userName/i,
    'select now() as now, current_database() as "databaseName", current_user as "userName"'
  );

  text = text.replace(/`([^`]+)`/g, '"$1"');
  text = text.replace(/\blongtext\b/gi, 'text');
  text = text.replace(/\bdatetime\b/gi, 'timestamp');
  text = text.replace(/\btinyint\s*\(\s*1\s*\)/gi, 'boolean');
  text = text.replace(/\bjson\b/gi, 'jsonb');
  text = text.replace(/\s+on\s+update\s+current_timestamp/gi, '');
  text = text.replace(/\bdatabase\s*\(\s*\)/gi, 'current_database()');

  text = translateInformationSchemaStatistics(text);
  text = translateOnDuplicateKeyToPostgres(text);

  const existingMax = maxPgPlaceholder(text);
  if (text.includes('?')) text = convertQuestionMarksToPg(text, existingMax);

  return text;
}

async function runMysqlQuery(executor, sql, params = []) {
  const output = await executor.query(translateToMysql(sql), params);
  let rows;
  let fields;
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

async function runPostgresQuery(executor, sql, params = []) {
  const text = translateToPostgres(sql);
  const result = await executor.query(text, params);
  return {
    rows: normalizeRows(result.rows || []),
    fields: result.fields,
    raw: result,
    rowCount: result.rowCount,
    affectedRows: result.rowCount,
  };
}

let rawPool = null;
let wrappedPool = null;
let activeProvider = null;

function createMysqlRawPool() {
  let mysql;
  try {
    mysql = require('mysql2/promise');
  } catch (error) {
    throw new Error('Dependência mysql2 ausente. Rode npm install ou use PostgreSQL com DATABASE_URL.');
  }

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
  const databaseUrl = normalizeMysqlConnectionUri(env('DATABASE_URL'));
  if (databaseUrl && databaseUrl.toLowerCase().startsWith('mysql')) {
    return mysql.createPool({ uri: databaseUrl, ...common, ...(ssl ? { ssl } : {}) });
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

function postgresSslConfig() {
  const mode = env('PGSSLMODE', '').toLowerCase();
  const url = env('DATABASE_URL').toLowerCase();
  const requiresSsl = ['require', 'required', 'verify-ca', 'verify-full'].includes(mode) || /sslmode=require/i.test(url) || bool(env('PGSSL'), false);
  if (!requiresSsl) return undefined;

  const caPath = env('PGSSLROOTCERT') || env('PG_CA_CERT_PATH');
  const certPath = env('PGSSLCERT') || env('PG_CLIENT_CERT_PATH');
  const keyPath = env('PGSSLKEY') || env('PG_CLIENT_KEY_PATH');
  const ssl = { rejectUnauthorized: bool(env('PGSSL_REJECT_UNAUTHORIZED'), false) };

  try {
    if (caPath && fs.existsSync(caPath)) ssl.ca = fs.readFileSync(caPath, 'utf8');
    if (certPath && fs.existsSync(certPath)) ssl.cert = fs.readFileSync(certPath, 'utf8');
    if (keyPath && fs.existsSync(keyPath)) ssl.key = fs.readFileSync(keyPath, 'utf8');
  } catch (error) {
    console.warn('Aviso: não foi possível carregar certificado PostgreSQL:', error.message);
  }

  return ssl;
}

function createPostgresRawPool() {
  let Pool;
  try {
    Pool = require('pg').Pool;
  } catch (error) {
    throw new Error('Dependência pg ausente. Rode npm install após substituir o package.json.');
  }

  const ssl = postgresSslConfig();
  const connectionString = env('DATABASE_URL');

  if (connectionString) {
    return new Pool({
      connectionString,
      max: Number(env('PGPOOL_MAX', '5') || 5),
      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: 30000,
      ...(ssl ? { ssl } : {}),
    });
  }

  return new Pool({
    host: env('PGHOST'),
    port: Number(env('PGPORT', '5432') || 5432),
    database: env('PGDATABASE'),
    user: env('PGUSER'),
    password: env('PGPASSWORD'),
    max: Number(env('PGPOOL_MAX', '5') || 5),
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 30000,
    ...(ssl ? { ssl } : {}),
  });
}

function wrapMysqlConnection(conn) {
  return {
    async query(sql, params = []) {
      return runMysqlQuery(conn, sql, params);
    },
    async release() {
      conn.release();
    },
  };
}

function wrapPostgresClient(client) {
  return {
    async query(sql, params = []) {
      return runPostgresQuery(client, sql, params);
    },
    async release() {
      client.release();
    },
  };
}

function getPool() {
  if (!hasDatabaseConfig()) return null;
  const provider = getDatabaseProvider();
  if (wrappedPool && activeProvider === provider) return wrappedPool;

  activeProvider = provider;
  rawPool = provider === 'postgres' ? createPostgresRawPool() : createMysqlRawPool();

  wrappedPool = {
    async query(sql, params = []) {
      return provider === 'postgres'
        ? runPostgresQuery(rawPool, sql, params)
        : runMysqlQuery(rawPool, sql, params);
    },
    async connect() {
      if (provider === 'postgres') {
        const client = await rawPool.connect();
        return wrapPostgresClient(client);
      }
      const conn = await rawPool.getConnection();
      return wrapMysqlConnection(conn);
    },
    async end() {
      const result = await rawPool.end();
      rawPool = null;
      wrappedPool = null;
      activeProvider = null;
      return result;
    },
  };

  return wrappedPool;
}

async function query(text, params) {
  const db = getPool();
  if (!db) {
    throw new Error('Banco de dados não configurado. Configure DATABASE_URL PostgreSQL/Aiven no Render ou variáveis PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD.');
  }
  return db.query(text, params);
}

async function testConnection() {
  const provider = getDatabaseProvider();
  if (provider === 'postgres') {
    const result = await query('select now() as now, current_database() as "databaseName", current_user as "userName"');
    const row = rowsOf(result)[0] || {};
    return { now: row.now, database: row.databaseName, user: row.userName, provider };
  }
  const result = await query('select now() as now, database() as databaseName, current_user() as userName');
  const row = rowsOf(result)[0] || {};
  return { now: row.now, database: row.databaseName, user: row.userName, provider };
}

module.exports = {
  getPool,
  hasDatabaseConfig,
  query,
  testConnection,
  getDatabaseProvider,
  rowsOf,
  // Exportado apenas para teste local/sintaxe; não é usado pelo servidor.
  _internal: { translateToPostgres, translateToMysql },
};
