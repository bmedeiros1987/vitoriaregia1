require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

function readFileIfExists(filePath) {
  if (!filePath) return undefined;
  const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  return fs.existsSync(resolved) ? fs.readFileSync(resolved, 'utf8') : undefined;
}

function buildSSL() {
  if ((process.env.PGSSLMODE || '').toLowerCase() === 'disable') return false;

  const ca = readFileIfExists(process.env.PGSSL_CA_PATH);
  const cert = readFileIfExists(process.env.PGSSL_CERT_PATH);
  const key = readFileIfExists(process.env.PGSSL_KEY_PATH);

  if (ca || cert || key) {
    const ssl = {
      rejectUnauthorized: Boolean(ca),
      ca,
      cert,
      key,
    };
    Object.keys(ssl).forEach((field) => ssl[field] === undefined && delete ssl[field]);
    return ssl;
  }

  if ((process.env.PGSSLMODE || '').toLowerCase() === 'require') {
    return { rejectUnauthorized: false };
  }

  return false;
}

function createPool(overrides = {}) {
  return new Pool({
    host: overrides.host || process.env.PGHOST,
    port: Number(overrides.port || process.env.PGPORT || 5432),
    database: overrides.database || process.env.PGDATABASE || 'defaultdb',
    user: overrides.user || process.env.PGUSER || 'avnadmin',
    password: overrides.password || process.env.PGPASSWORD,
    ssl: buildSSL(),
    max: Number(process.env.PGPOOL_MAX || 10),
  });
}

const pool = createPool();

module.exports = { pool, createPool };
