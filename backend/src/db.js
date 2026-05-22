'use strict';

const mysql = require('mysql2/promise');

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1','true','yes','sim','on'].includes(String(value).toLowerCase());
}

function parseMysqlUrl(rawUrl) {
  if (!rawUrl) return null;
  const u = new URL(rawUrl);
  return {
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username || ''),
    password: decodeURIComponent(u.password || ''),
    database: (u.pathname || '').replace(/^\//, '') || process.env.MYSQL_DATABASE || 'defaultdb',
    ssl: u.searchParams.get('sslmode') === 'require' || u.searchParams.get('ssl') === 'true'
  };
}

function getConfig() {
  const fromUrl = process.env.DATABASE_URL ? parseMysqlUrl(process.env.DATABASE_URL) : null;
  const cfg = fromUrl || {
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE || 'defaultdb',
    ssl: bool(process.env.MYSQL_SSL, false)
  };
  return {
    ...cfg,
    waitForConnections: true,
    connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 5),
    ssl: cfg.ssl ? { rejectUnauthorized: bool(process.env.MYSQL_SSL_REJECT_UNAUTHORIZED, false) } : undefined
  };
}

function createPool() {
  return mysql.createPool(getConfig());
}

module.exports = { mysql, createPool, getConfig };
