import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Pool as PgPool } from 'pg';
import mysql from 'mysql2/promise';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, 'dist');
const port = Number(process.env.PORT || 4173);

const DATABASE_URL = (process.env.DATABASE_URL || process.env.MYSQL_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL_NON_POOLING || '').trim();
const DB_KIND = DATABASE_URL.toLowerCase().startsWith('mysql://') || DATABASE_URL.toLowerCase().startsWith('mysql2://') ? 'mysql' : 'postgres';
const AUTO_MIGRATE = String(process.env.CREWCHECK_AUTO_MIGRATE || 'true').toLowerCase() !== 'false';
const AUTH_REQUIRED = String(process.env.CREWCHECK_AUTH_REQUIRED || 'true').toLowerCase() !== 'false';
const SESSION_DAYS = Number(process.env.CREWCHECK_SESSION_DAYS || 30);

let pool = null;
let schemaPromise = null;

function getPool() {
  if (!DATABASE_URL) return null;
  if (!pool) {
    if (DB_KIND === 'mysql') {
      const url = new URL(DATABASE_URL.replace(/^mysql2:/i, 'mysql:'));
      const sslRequired = /ssl-mode=required/i.test(url.search) || /aivencloud\.com$/i.test(url.hostname) || process.env.MYSQL_SSL === 'true' || process.env.MYSQL_SSL_MODE === 'REQUIRED';
      pool = createMysqlAdapter(mysql.createPool({
        host: url.hostname,
        port: Number(url.port || 3306),
        user: decodeURIComponent(url.username || ''),
        password: decodeURIComponent(url.password || ''),
        database: (url.pathname || '/defaultdb').replace(/^\//, '') || 'defaultdb',
        waitForConnections: true,
        connectionLimit: Number(process.env.MYSQL_POOL_MAX || 5),
        queueLimit: 0,
        timezone: '+00:00',
        dateStrings: false,
        ssl: sslRequired ? { rejectUnauthorized: false } : undefined,
      }));
    } else {
      pool = new PgPool({
        connectionString: DATABASE_URL,
        max: Number(process.env.PG_POOL_MAX || 5),
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 8_000,
        ssl: DATABASE_URL.includes('supabase.co') || process.env.PGSSLMODE === 'require'
          ? { rejectUnauthorized: false }
          : undefined,
      });
    }
  }
  return pool;
}

function createMysqlAdapter(mysqlPool) {
  return {
    kind: 'mysql',
    async query(sql, params = []) {
      return mysqlQuery(mysqlPool, sql, params);
    },
  };
}

function convertPgPlaceholders(sql, params) {
  const ordered = [];
  let converted = sql
    .replace(/::jsonb/g, '')
    .replace(/::uuid/g, '')
    .replace(/now\(\)/gi, 'CURRENT_TIMESTAMP')
    .replace(/\btrue\b/gi, '1')
    .replace(/\bfalse\b/gi, '0');
  converted = converted.replace(/\$(\d+)/g, (_, n) => {
    ordered.push(params[Number(n) - 1]);
    return '?';
  });
  return { sql: normalizeMysqlSql(converted), params: normalizeMysqlParams(ordered.length ? ordered : params) };
}

function normalizeMysqlSql(sql) {
  // MySQL 8 treats RANK as a reserved window function. Keep the JS/API field named
  // "rank", but always escape the SQL identifier when talking to MySQL/Aiven.
  return sql
    .replace(/\`rank\`/gi, '__CREWCHECK_RANK__')
    .replace(/\brank\b/gi, '\`rank\`')
    .replace(/__CREWCHECK_RANK__/g, '\`rank\`');
}

function mysqlDateTime(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 19).replace('T', ' ');
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) {
    return value.slice(0, 19).replace('T', ' ');
  }
  return value;
}

function normalizeMysqlParams(params = []) {
  return params.map((param) => mysqlDateTime(param));
}

function normalizeMysqlRow(row) {
  if (!row || typeof row !== 'object') return row;
  for (const key of ['roster_json', 'compliance_json', 'gym_json', 'metadata']) {
    if (typeof row[key] === 'string') {
      try { row[key] = JSON.parse(row[key]); } catch {}
    }
  }
  for (const key of ['is_active']) {
    if (key in row) row[key] = Boolean(row[key]);
  }
  return row;
}

async function mysqlQuery(mysqlPool, originalSql, params = []) {
  const compact = originalSql.replace(/\s+/g, ' ').trim().toLowerCase();
  const { sql, params: mysqlParams } = convertPgPlaceholders(originalSql, params);

  if (compact.startsWith('insert into crewcheck_users')) {
    await mysqlPool.execute(normalizeMysqlSql(sql.replace(/\s+returning \*/i, '')), normalizeMysqlParams(mysqlParams));
    const [rows] = await mysqlPool.execute(normalizeMysqlSql('select * from crewcheck_users where id = ? limit 1'), normalizeMysqlParams([params[0]]));
    return { rows: rows.map(normalizeMysqlRow), rowCount: rows.length };
  }

  if (compact.startsWith('insert into crewcheck_rosters')) {
    const id = params[17];
    await mysqlPool.execute(normalizeMysqlSql(sql.replace(/\s+returning[\s\S]*$/i, '')), normalizeMysqlParams(mysqlParams));
    const [rows] = await mysqlPool.execute(normalizeMysqlSql(`select id, created_at, updated_at, crew_name, crew_id, base, \`rank\`, airline, period_year, period_month,
      source_file_name, score, intensity_score, alerts_count, critical_alerts_count, checksum from crewcheck_rosters where id = ? limit 1`), normalizeMysqlParams([id]));
    return { rows: rows.map(normalizeMysqlRow), rowCount: rows.length };
  }

  if (compact.startsWith('update crewcheck_rosters') && /returning/i.test(originalSql)) {
    const id = params[17];
    await mysqlPool.execute(normalizeMysqlSql(sql.replace(/\s+returning[\s\S]*$/i, '')), normalizeMysqlParams(mysqlParams));
    const [rows] = await mysqlPool.execute(normalizeMysqlSql(`select id, created_at, updated_at, crew_name, crew_id, base, \`rank\`, airline, period_year, period_month,
      source_file_name, score, intensity_score, alerts_count, critical_alerts_count, checksum from crewcheck_rosters where id = ? limit 1`), normalizeMysqlParams([id]));
    return { rows: rows.map(normalizeMysqlRow), rowCount: rows.length };
  }

  if (compact.startsWith('delete from crewcheck_rosters') && /returning/i.test(originalSql)) {
    const rosterId = params[0];
    const userId = params[1];
    const [before] = await mysqlPool.execute(normalizeMysqlSql('select id from crewcheck_rosters where id = ? and (? is null or user_id = ?) limit 1'), normalizeMysqlParams([rosterId, userId, userId]));
    if (!before.length) return { rows: [], rowCount: 0 };
    await mysqlPool.execute(normalizeMysqlSql('delete from crewcheck_rosters where id = ? and (? is null or user_id = ?)'), normalizeMysqlParams([rosterId, userId, userId]));
    return { rows: before, rowCount: before.length };
  }

  const [result] = await mysqlPool.execute(normalizeMysqlSql(sql), normalizeMysqlParams(mysqlParams));
  if (Array.isArray(result)) return { rows: result.map(normalizeMysqlRow), rowCount: result.length };
  return { rows: [], rowCount: result.affectedRows || 0 };
}

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.ttf', 'font/ttf'],
  ['.map', 'application/json; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.pdf', 'application/pdf'],
  ['.ics', 'text/calendar; charset=utf-8'],
]);

function safeJoin(root, requestedPath) {
  const decoded = decodeURIComponent(requestedPath.split('?')[0]);
  const cleanPath = decoded === '/' ? '/index.html' : decoded;
  const target = path.normalize(path.join(root, cleanPath));
  if (!target.startsWith(root)) return null;
  return target;
}

async function exists(filePath) {
  try {
    const stat = await fsp.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function requireDatabase(res) {
  const db = getPool();
  if (!db) {
    sendJson(res, 503, {
      ok: false,
      code: 'DATABASE_URL_NOT_CONFIGURED',
      message: 'Configure a variável DATABASE_URL no Render para ativar a base de dados.',
    });
    return null;
  }
  return db;
}

async function ensureSchema() {
  const db = getPool();
  if (!db || !AUTO_MIGRATE) return;
  if (!schemaPromise) {
    schemaPromise = (async () => {
      if (DB_KIND === 'mysql') {
        await db.query(`
          create table if not exists crewcheck_users (
            id char(36) primary key,
            created_at timestamp not null default current_timestamp,
            updated_at timestamp not null default current_timestamp on update current_timestamp,
            name varchar(255) not null default 'Tripulante',
            email varchar(320) not null,
            password_hash text not null,
            role varchar(64) not null default 'crew',
            crew_id varchar(64),
            base varchar(16),
            \`rank\` varchar(64),
            is_active tinyint(1) not null default 1,
            last_login_at timestamp null,
            temp_password_hash text,
            temp_password_expires_at timestamp null,
            unique key crewcheck_users_email_uidx (email)
          ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
        `);

        await db.query(`
          create table if not exists crewcheck_sessions (
            id char(36) primary key,
            created_at timestamp not null default current_timestamp,
            expires_at timestamp not null,
            user_id char(36),
            token_hash varchar(128) not null unique,
            user_agent text,
            ip varchar(128),
            key crewcheck_sessions_user_idx (user_id, created_at),
            constraint crewcheck_sessions_user_fk foreign key (user_id) references crewcheck_users(id) on delete cascade
          ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
        `).catch(async () => {
          await db.query(`
            create table if not exists crewcheck_sessions (
              id char(36) primary key,
              created_at timestamp not null default current_timestamp,
              expires_at timestamp not null,
              user_id char(36),
              token_hash varchar(128) not null unique,
              user_agent text,
              ip varchar(128),
              key crewcheck_sessions_user_idx (user_id, created_at)
            ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
          `);
        });

        await db.query(`
          create table if not exists crewcheck_rosters (
            id char(36) primary key,
            created_at timestamp not null default current_timestamp,
            updated_at timestamp not null default current_timestamp on update current_timestamp,
            user_id char(36),
            crew_name varchar(255),
            crew_id varchar(64),
            base varchar(16),
            \`rank\` varchar(64),
            airline varchar(128),
            period_year int,
            period_month int,
            source_file_name varchar(255),
            roster_json json not null,
            compliance_json json,
            gym_json json,
            score int,
            intensity_score int,
            alerts_count int not null default 0,
            critical_alerts_count int not null default 0,
            checksum varchar(128),
            key crewcheck_rosters_created_at_idx (created_at),
            key crewcheck_rosters_crew_id_idx (crew_id),
            key crewcheck_rosters_period_idx (period_year, period_month),
            key crewcheck_rosters_user_idx (user_id, created_at),
            key crewcheck_rosters_checksum_idx (checksum)
          ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
        `);

        await db.query(`
          create table if not exists crewcheck_audit_logs (
            id char(36) primary key,
            created_at timestamp not null default current_timestamp,
            user_id char(36),
            action varchar(160) not null,
            entity_id char(36),
            metadata json not null,
            key crewcheck_audit_user_idx (user_id, created_at),
            key crewcheck_audit_action_idx (action)
          ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
        `);

        await db.query(`
          create table if not exists crewcheck_calendar_feeds (
            id char(36) primary key,
            created_at timestamp not null default current_timestamp,
            updated_at timestamp not null default current_timestamp on update current_timestamp,
            user_id char(36),
            token varchar(128) not null unique,
            ics_content mediumtext,
            period_label varchar(64),
            mode varchar(32),
            events_count int not null default 0,
            key crewcheck_calendar_feeds_user_idx (user_id),
            key crewcheck_calendar_feeds_token_idx (token)
          ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
        `);
        return;
      }

      // Migração tolerante PostgreSQL/Aiven legacy.
      await db.query(`
        create table if not exists crewcheck_users (
          id uuid primary key,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          name text not null default 'Tripulante',
          email text not null unique,
          password_hash text not null,
          role text not null default 'crew',
          crew_id text,
          base text,
          rank text,
          is_active boolean not null default true,
          last_login_at timestamptz,
          temp_password_hash text,
          temp_password_expires_at timestamptz
        );
      `);

      await db.query(`alter table crewcheck_users add column if not exists updated_at timestamptz not null default now();`);
      await db.query(`alter table crewcheck_users add column if not exists name text not null default 'Tripulante';`);
      await db.query(`alter table crewcheck_users add column if not exists role text not null default 'crew';`);
      await db.query(`alter table crewcheck_users add column if not exists crew_id text;`);
      await db.query(`alter table crewcheck_users add column if not exists base text;`);
      await db.query(`alter table crewcheck_users add column if not exists rank text;`);
      await db.query(`alter table crewcheck_users add column if not exists is_active boolean not null default true;`);
      await db.query(`alter table crewcheck_users add column if not exists last_login_at timestamptz;`);
      await db.query(`alter table crewcheck_users add column if not exists temp_password_hash text;`);
      await db.query(`alter table crewcheck_users add column if not exists temp_password_expires_at timestamptz;`);
      await db.query(`create unique index if not exists crewcheck_users_email_uidx on crewcheck_users (lower(email));`).catch(() => null);

      await db.query(`
        create table if not exists crewcheck_sessions (
          id uuid primary key,
          created_at timestamptz not null default now(),
          expires_at timestamptz not null,
          user_id uuid references crewcheck_users(id) on delete cascade,
          token_hash text not null unique,
          user_agent text,
          ip text
        );
      `);
      await db.query(`alter table crewcheck_sessions add column if not exists user_id uuid references crewcheck_users(id) on delete cascade;`);
      await db.query(`alter table crewcheck_sessions add column if not exists user_agent text;`);
      await db.query(`alter table crewcheck_sessions add column if not exists ip text;`);
      await db.query(`create index if not exists crewcheck_sessions_user_idx on crewcheck_sessions (user_id, created_at desc);`).catch(() => null);

      await db.query(`
        create table if not exists crewcheck_rosters (
          id uuid primary key,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          user_id uuid references crewcheck_users(id) on delete set null,
          crew_name text,
          crew_id text,
          base text,
          rank text,
          airline text,
          period_year integer,
          period_month integer,
          source_file_name text,
          roster_json jsonb not null,
          compliance_json jsonb,
          gym_json jsonb,
          score integer,
          intensity_score integer,
          alerts_count integer not null default 0,
          critical_alerts_count integer not null default 0,
          checksum text
        );
      `);
      await db.query(`alter table crewcheck_rosters add column if not exists updated_at timestamptz not null default now();`);
      await db.query(`alter table crewcheck_rosters add column if not exists user_id uuid references crewcheck_users(id) on delete set null;`);
      await db.query(`alter table crewcheck_rosters add column if not exists source_file_name text;`);
      await db.query(`alter table crewcheck_rosters add column if not exists checksum text;`);
      await db.query(`alter table crewcheck_rosters add column if not exists gym_json jsonb;`);
      await db.query(`alter table crewcheck_rosters add column if not exists intensity_score integer;`);
      await db.query(`alter table crewcheck_rosters add column if not exists alerts_count integer not null default 0;`);
      await db.query(`alter table crewcheck_rosters add column if not exists critical_alerts_count integer not null default 0;`);
      await db.query(`create index if not exists crewcheck_rosters_created_at_idx on crewcheck_rosters (created_at desc);`).catch(() => null);
      await db.query(`create index if not exists crewcheck_rosters_crew_id_idx on crewcheck_rosters (crew_id);`).catch(() => null);
      await db.query(`create index if not exists crewcheck_rosters_period_idx on crewcheck_rosters (period_year, period_month);`).catch(() => null);
      await db.query(`create index if not exists crewcheck_rosters_user_idx on crewcheck_rosters (user_id, created_at desc);`).catch(() => null);
      await db.query(`create index if not exists crewcheck_rosters_checksum_idx on crewcheck_rosters (checksum);`).catch(() => null);

      await db.query(`
        create table if not exists crewcheck_audit_logs (
          id uuid primary key,
          created_at timestamptz not null default now(),
          user_id uuid references crewcheck_users(id) on delete set null,
          action text not null,
          entity_id uuid,
          metadata jsonb not null default '{}'::jsonb
        );
      `);
      await db.query(`alter table crewcheck_audit_logs add column if not exists user_id uuid references crewcheck_users(id) on delete set null;`);
      await db.query(`alter table crewcheck_audit_logs add column if not exists entity_id uuid;`);
      await db.query(`alter table crewcheck_audit_logs add column if not exists metadata jsonb not null default '{}'::jsonb;`);

      await db.query(`
        create table if not exists crewcheck_calendar_feeds (
          id uuid primary key,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          user_id uuid references crewcheck_users(id) on delete cascade,
          token text not null unique,
          ics_content text,
          period_label text,
          mode text,
          events_count integer not null default 0
        );
      `);
      await db.query(`alter table crewcheck_calendar_feeds add column if not exists updated_at timestamptz not null default now();`);
      await db.query(`alter table crewcheck_calendar_feeds add column if not exists ics_content text;`);
      await db.query(`alter table crewcheck_calendar_feeds add column if not exists period_label text;`);
      await db.query(`alter table crewcheck_calendar_feeds add column if not exists mode text;`);
      await db.query(`alter table crewcheck_calendar_feeds add column if not exists events_count integer not null default 0;`);
      await db.query(`create index if not exists crewcheck_calendar_feeds_user_idx on crewcheck_calendar_feeds (user_id);`).catch(() => null);
      await db.query(`create index if not exists crewcheck_calendar_feeds_token_idx on crewcheck_calendar_feeds (token);`).catch(() => null);
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  await schemaPromise;
}



// --- CrewCheck server-side PDF parser (mobile-safe) ---
const AIRPORTS = new Set(['BSB','GRU','CGH','VCP','NAT','MCZ','FOR','CNF','PMW','FLN','MAB','CPV','GYN','JPA','EZE','VIX','SSA','GIG','SDU','REC','AJU','BEL','SLZ','CGB','POA','CUR']);
const MONTHS = { jan:1, feb:2, fev:2, mar:3, apr:4, abr:4, may:5, mai:5, ma:5, jun:6, jul:7, aug:8, ago:8, sep:9, set:9, oct:10, out:10, nov:11, dec:12, dez:12 };
const WEEKDAYS_PT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

async function parsePdfOnServer({ filename, dataBase64 }) {
  if (!dataBase64 || typeof dataBase64 !== 'string') throw new Error('PDF não recebido pelo servidor.');
  const bytes = Buffer.from(dataBase64, 'base64');
  if (!bytes.length) throw new Error('PDF vazio.');
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.js');
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), disableWorker: true, isEvalSupported: false, disableFontFace: true }).promise;
  const pages = [];
  const allItems = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const page = await pdf.getPage(pageNo);
    const tc = await page.getTextContent();
    const items = tc.items.map((it) => ({
      str: String(it.str || '').trim(),
      x: Number(it.transform?.[4] || 0),
      y: Number(it.transform?.[5] || 0),
      page: pageNo,
    })).filter((it) => it.str);
    allItems.push(...items);
    pages.push({ pageNo, items });
  }
  const fullText = buildServerFullText(pages);
  const isAims = /Convertida para padr/i.test(fullText) || /Tripulante:/i.test(fullText);
  const roster = isAims ? parseServerAims(fullText, pages) : parseServerRosterReport(fullText, pages, filename);
  roster.rawText = fullText;
  roster.days = finalizeServerDays(roster.days, roster.month, roster.year, roster.base);
  const diagnostics = buildParseDiagnostics(roster, isAims ? 'AIMS' : 'CrewRosterReport');
  return { roster, diagnostics };
}

function buildServerFullText(pages) {
  return pages.map(({ items }) => {
    const rows = [];
    const sorted = [...items].sort((a,b) => b.y - a.y || a.x - b.x);
    for (const item of sorted) {
      let row = rows.find((r) => Math.abs(r.y - item.y) <= 3);
      if (!row) { row = { y: item.y, items: [] }; rows.push(row); }
      row.items.push(item);
    }
    return rows.sort((a,b)=>b.y-a.y).map((r)=>r.items.sort((a,b)=>a.x-b.x).map((i)=>i.str).join(' ').replace(/\s+/g,' ').trim()).join('\n');
  }).join('\n');
}

function parseServerHeader(fullText, filename='') {
  const compact = fullText.replace(/\s+/g, ' ');
  let crewName = 'Tripulante', crewId = '', base = 'BSB', rank = 'CCM', month = new Date().getMonth()+1, year = new Date().getFullYear();
  const a = compact.match(/Tripulante:\s*([^-]+?)\s*-\s*BP:\s*(\d+)\s*-\s*Base:\s*([A-Z]{3})\s*-\s*(\d{2})\/(\d{2})\/(\d{4})\s*at[ée]\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  if (a) { crewName=a[1].trim(); crewId=a[2]; base=a[3]; month=Number(a[5]); year=Number(a[6]); }
  const r = compact.match(/Roster\s+Report\s+(\d{2})-([A-Za-z]{3})-(\d{4})\s+to\s+(\d{2})-([A-Za-z]{3})-(\d{4})\s+(.+?)\s*\|\s*(\d{6,})\s*\|\s*([A-Z0-9]+)\s*\|\s*([A-Z]{3})\s*\|\s*([A-Z]{2,5})/i);
  if (r) { month=monthNameToNum(r[2]); year=Number(r[3]); crewName=r[7].trim(); crewId=r[8]; base=r[10]; rank=r[11]; }
  return { crewName, crewId, base, rank, month, year, airline: /\bLA\s?\d{3,4}\b/i.test(fullText) ? 'LATAM' : 'Companhia aérea' };
}
function monthNameToNum(v) { return MONTHS[String(v||'').slice(0,3).toLowerCase()] || 0; }
function dateObj(day, month, year) { const d = new Date(year, month-1, day); return { date: `${String(day).padStart(2,'0')}/${String(month).padStart(2,'0')}/${year}`, dayOfWeek: WEEKDAYS_PT[d.getDay()] }; }
function makeDay(day, month, year, base) { const d = dateObj(day, month, year); return { date:d.date, dayOfWeek:d.dayOfWeek, dayNumber:day, month, year, type:'OTHER', pairingCode:'', dutyReport:null, dutyDebrief:null, legs:[], dutyHours:null, flyingHours:null, isNextDay:false, hotel:null, base, rawText:'' }; }



function buildRosterDateBlocksV3(fullText) {
  const lines = fullText.split(/\n+/).map((line) => cleanRosterLineV3(line)).filter(Boolean);
  const blocks = [];
  let current = null;
  const dateAtStart = /^\s*(\d{2})-([A-Za-z]{3})-(\d{4})\b\s*(.*)$/;
  for (const line of lines) {
    if (/^(Roster Report|Date\s+|Duty\s+|Report\s+|Updated By|Updated Date|A\/C|Type\s*$)/i.test(line)) continue;
    const match = line.match(dateAtStart);
    if (match) {
      if (current) blocks.push(current);
      current = { dayToken: match[1], monthToken: match[2], yearToken: match[3], text: match[4] || '' };
      continue;
    }
    if (current && isRosterContinuationV3(line)) {
      current.text += ' ' + line;
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

function cleanRosterLineV3(line) {
  return String(line || '')
    .replace(/\u000c/g, ' ')
    .replace(/\uFFFE/g, ' ')
    .replace(/\b\d{2}-[A-Za-z]{3}-\d{4}\s+\d{2}\.\d{2}\b/g, ' ')
    .replace(/\b(SCHEDULER|msgsys|\d{6,})\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isRosterContinuationV3(line) {
  return /\b(LA\s?\d{3,4}|DOPR|DOP|DOF?|DR|OFF|VC|HSBE?|ASB|CBF|EMER|MT|CRM|C\d{2,3}F|NSJ?|IJ|DM|[A-Z]{3}\s+\d{1,2}:\d{2}|\d{1,2}:\d{2}\(\+1\))\b/i.test(line);
}

function parseCrewRosterBlockV3(dayNumber, month, year, base, blockText) {
  const raw = cleanRosterLineV3(blockText);
  const upper = raw.toUpperCase();
  const events = [];
  const hasFlight = /\bLA\s?\d{3,4}\b/i.test(raw);
  const activityCodes = [...upper.matchAll(/\b(HSBE|HSB|ASB|CBF|EMER|C\d{2,3}F|MT|CRM|NSJ|NS|IJ|DM)\b/g)].map((m) => m[1]);
  const restMatch = upper.match(/\b(DOPR|DOP|DOF|DO|DR|OFF|VC)\b/);

  // Operational activities always win over rest markers in the same visual column/block.
  // This prevents ASB after an ellipsis/rest artifact from being converted to inativo/folga.
  for (const code of [...new Set(activityCodes)]) {
    const activity = makeDay(dayNumber, month, year, base);
    activity.rawText = raw;
    activity.pairingCode = code;
    activity.type = code === 'ASB' || code === 'HSB' || code === 'HSBE' ? code : (code === 'CRM' || /^C\d{2,3}F$/.test(code) || code === 'CBF' || code === 'EMER' ? 'CRM' : 'OTHER');
    const window = pickDutyWindowForCodeV3(raw, code);
    activity.dutyReport = window.start;
    activity.dutyDebrief = window.end;
    activity.dutyHours = window.start && window.end ? diffHours(window.start, window.end) : null;
    activity.flyingHours = 0;
    events.push(activity);
  }

  if (hasFlight) {
    const flightDay = makeDay(dayNumber, month, year, base);
    flightDay.rawText = raw;
    parseFlightsFromRosterTextV3(flightDay, raw);
    if (flightDay.legs.length) events.push(flightDay);
  }

  if (!events.length && restMatch) {
    const restDay = makeDay(dayNumber, month, year, base);
    restDay.rawText = raw;
    restDay.type = restMatch[1];
    restDay.pairingCode = restMatch[1];
    restDay.dutyHours = 0;
    restDay.flyingHours = 0;
    events.push(restDay);
  }

  if (!events.length && raw) {
    const other = makeDay(dayNumber, month, year, base);
    other.rawText = raw;
    events.push(other);
  }
  return events;
}

function pickDutyWindowForCodeV3(text, code) {
  const upper = String(text || '').toUpperCase();
  const codeIndex = upper.indexOf(String(code).toUpperCase());
  const fragment = codeIndex >= 0 ? text.slice(Math.max(0, codeIndex - 35), codeIndex + 180) : text;
  const stationTimes = [...fragment.matchAll(/\b[A-Z]{3}\s+(\d{1,2}:\d{2}(?:\(\+1\))?)\b/g)].map((m) => normalizeTimeToken(m[1]));
  if (stationTimes.length >= 2) return { start: stationTimes[0], end: stationTimes[stationTimes.length - 1] };
  const allTimes = uniqueTimesV3([...fragment.matchAll(/\b\d{1,2}:\d{2}(?:\(\+1\))?\b/g)].map((m) => normalizeTimeToken(m[0])));
  if (!allTimes.length) return { start: null, end: null };
  const start = allTimes[0];
  let end = allTimes[1] || allTimes[0];
  for (const time of allTimes.slice(1)) {
    const hours = diffHours(start, time);
    if (hours >= 0.25 && hours <= 14 && !looksLikeDurationV3(time)) end = time;
  }
  return { start, end };
}

function looksLikeDurationV3(time) {
  const normalized = normalizeTimeToken(time);
  // Common duration columns in CrewRosterReport/AIMS. They should never be used
  // as the end time for MT/ASB/HSB/HSBE.
  return ['00:59','01:25','01:40','01:45','01:50','02:00','02:05','02:10','02:15','02:25','02:30','02:40','02:45','02:50','03:00','03:10','03:15','05:20','06:00','06:25','07:30','07:35','07:40','08:55','10:30','10:45','10:55','11:30'].includes(normalized);
}

function uniqueTimesV3(times) {
  const out = [];
  for (const time of times) {
    if (/^\d{2}:\d{2}/.test(time) && !out.includes(time)) out.push(time);
  }
  return out;
}

function parseFlightsFromRosterTextV3(day, text) {
  const normalized = cleanRosterLineV3(text);
  const flightRe = /\b(LA\s?\d{3,4}|LA\d{3,4})\b([\s\S]*?)(?=\bLA\s?\d{3,4}\b|$)/gi;
  let match;
  while ((match = flightRe.exec(normalized)) !== null) {
    const flightNumber = match[1].replace(/\s+/g, '');
    const segment = match[2] || '';
    const leg = parseRosterFlightSegmentV3(flightNumber, segment);
    if (leg && !day.legs.some((item) => item.flightNumber === leg.flightNumber && item.origin === leg.origin && item.departureTime === leg.departureTime)) {
      day.legs.push(leg);
    }
  }
  if (day.legs.length) {
    day.type = 'VOO';
    day.pairingCode = day.legs[0].flightNumber;
    const firstIdx = normalized.indexOf(day.legs[0].flightNumber);
    const beforeFirst = firstIdx > 0 ? normalized.slice(0, firstIdx) : normalized;
    const report = [...beforeFirst.matchAll(/\b\d{1,2}:\d{2}\b/g)].map((m) => normalizeTimeToken(m[0])).at(-1);
    day.dutyReport = report || day.legs[0].departureTime;
    const afterLast = normalized.slice(Math.max(0, normalized.lastIndexOf(day.legs.at(-1).arrivalTime)));
    const timesAfter = uniqueTimesV3([...afterLast.matchAll(/\b\d{1,2}:\d{2}(?:\(\+1\))?\b/g)].map((m) => normalizeTimeToken(m[0])));
    day.dutyDebrief = timesAfter.length >= 2 ? timesAfter[1] : (timesAfter[0] || day.legs.at(-1).arrivalTime);
    day.isNextDay = day.legs.some((leg) => leg.isNextDay) || diffHours(day.dutyReport, day.dutyDebrief) > 18;
    day.flyingHours = day.legs.reduce((sum, leg) => sum + (leg.duration || diffHours(leg.departureTime, leg.arrivalTime)), 0);
    day.dutyHours = diffHours(day.dutyReport, day.dutyDebrief);
  }
}

function parseRosterFlightSegmentV3(flightNumber, segment) {
  const tokens = String(segment || '').split(/\s+/).filter(Boolean);
  let workType = 'OP';
  let aircraftType = undefined;
  for (const token of tokens) {
    const upper = token.toUpperCase();
    if (['OP','PS','DH'].includes(upper)) workType = upper;
    if (/^(32S|31R|39R|328|319|320|321|32N)$/.test(upper)) aircraftType = upper;
  }
  const pattern = findBestFlightPatternV3(tokens);
  if (!pattern) return null;
  const { origin, destination, departureTime, arrivalTime } = pattern;
  const isNextDay = /\(\+1\)/.test(arrivalTime) || toMin(arrivalTime) < toMin(departureTime);
  return { flightNumber, origin, destination, departureTime, arrivalTime: normalizeTimeToken(arrivalTime), workType, aircraftType, isNextDay, duration: diffHours(departureTime, arrivalTime) };
}

function findBestFlightPatternV3(tokens) {
  const upper = tokens.map((token) => String(token || '').toUpperCase());
  const candidates = [];
  for (let i = 0; i < upper.length; i++) {
    if (!AIRPORTS.has(upper[i])) continue;
    for (let j = i + 1; j < Math.min(upper.length, i + 5); j++) {
      if (!isTimeToken(tokens[j])) continue;
      for (let k = j + 1; k < Math.min(upper.length, j + 5); k++) {
        if (!AIRPORTS.has(upper[k])) continue;
        for (let l = k + 1; l < Math.min(upper.length, k + 5); l++) {
          if (!isTimeToken(tokens[l])) continue;
          const departureTime = normalizeTimeToken(tokens[j]);
          const arrivalTime = normalizeTimeToken(tokens[l]);
          const duration = diffHours(departureTime, arrivalTime);
          if (duration < 0.25 || duration > 7.5) continue;
          // Prefer realistic airport-time-airport-time patterns and avoid same-airport
          // duplicates caused by Duty Report/Debrief columns in AIMS/CrewRoster PDFs.
          const samePenalty = upper[i] === upper[k] ? 20 : 0;
          const score = 100 - samePenalty - Math.abs(duration - 1.8) - (j - i - 1) * 2 - (k - j - 1) * 2 - (l - k - 1) * 2;
          candidates.push({ origin: upper[i], destination: upper[k], departureTime, arrivalTime, score });
        }
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] || null;
}

function parseAimsTokensIntoEventsV3(tokens, dayNum, month, year, base) {
  const normalized = tokens.map((token) => String(token || '').trim()).filter(Boolean);
  const upperTokens = normalized.map((token) => token.toUpperCase());
  const joined = upperTokens.join(' ');
  const events = [];
  const activityCodes = [];
  for (let i = 0; i < upperTokens.length; i++) {
    const token = upperTokens[i];
    if (['HSB','HSBE','ASB','CBF','EMER','MT','CRM','NS','NSJ','IJ','DM'].includes(token) || /^C\d{2,3}F$/.test(token)) activityCodes.push({ code: token, index: i });
  }
  for (const { code, index } of activityCodes) {
    const day = makeDay(dayNum, month, year, base);
    day.rawText = normalized.join(' ');
    day.pairingCode = code;
    day.type = code === 'HSB' || code === 'HSBE' || code === 'ASB' ? code : (code === 'CRM' || /^C\d{2,3}F$/.test(code) || code === 'CBF' || code === 'EMER' ? 'CRM' : 'OTHER');
    const window = pickDutyWindowFromAimsTokensV3(normalized, index);
    day.dutyReport = window.start;
    day.dutyDebrief = window.end;
    day.dutyHours = window.start && window.end ? diffHours(window.start, window.end) : null;
    day.flyingHours = 0;
    events.push(day);
  }
  const flightDay = makeDay(dayNum, month, year, base);
  flightDay.rawText = normalized.join(' ');
  for (let i = 0; i < upperTokens.length; i++) {
    if (upperTokens[i] === 'LA' && /^\d{3,4}$/.test(upperTokens[i+1] || '')) {
      const next = upperTokens.findIndex((token, idx) => idx > i + 1 && token === 'LA');
      const seq = normalized.slice(i + 2, next > 0 ? next : normalized.length);
      const leg = parseAimsFlightSeq('LA' + upperTokens[i+1], seq);
      if (leg) flightDay.legs.push(leg);
    }
  }
  if (flightDay.legs.length) {
    flightDay.type = 'VOO';
    flightDay.pairingCode = flightDay.legs[0].flightNumber;
    const firstLaIndex = upperTokens.findIndex((token) => token === 'LA');
    const beforeFirst = normalized.slice(0, firstLaIndex).filter(isTimeToken).map(normalizeTimeToken);
    const firstSeqStart = upperTokens.findIndex((token) => token === 'LA') + 2;
    const firstOrigin = flightDay.legs[0].origin;
    const firstOriginIdx = upperTokens.findIndex((token, idx) => idx >= firstSeqStart && token === firstOrigin);
    const firstTimesBeforeOrigin = normalized.slice(firstSeqStart, firstOriginIdx).filter(isTimeToken).map(normalizeTimeToken);
    flightDay.dutyReport = beforeFirst[0] || (firstTimesBeforeOrigin.length >= 2 ? firstTimesBeforeOrigin[0] : null) || flightDay.legs[0].departureTime;
    flightDay.dutyDebrief = inferAimsDebriefV3(normalized, flightDay.legs.at(-1)) || flightDay.legs.at(-1).arrivalTime;
    flightDay.isNextDay = flightDay.legs.some((leg) => leg.isNextDay) || diffHours(flightDay.dutyReport, flightDay.dutyDebrief) > 18;
    flightDay.flyingHours = flightDay.legs.reduce((sum, leg) => sum + (leg.duration || diffHours(leg.departureTime, leg.arrivalTime)), 0);
    flightDay.dutyHours = diffHours(flightDay.dutyReport, flightDay.dutyDebrief);
    events.push(flightDay);
  }
  if (!events.length) {
    const rest = joined.match(/\b(DOPR|DOP|DOF|DO|DR|OFF|VC)\b/);
    if (rest) {
      const day = makeDay(dayNum, month, year, base);
      day.rawText = normalized.join(' ');
      day.type = rest[1]; day.pairingCode = rest[1]; day.dutyHours = 0; day.flyingHours = 0;
      events.push(day);
    }
  }
  return events.length ? events : [makeDay(dayNum, month, year, base)];
}

function pickDutyWindowFromAimsTokensV3(tokens, index) {
  const slice = tokens.slice(index, Math.min(tokens.length, index + 18));
  const stationTimes = [];
  for (let i = 0; i < slice.length - 1; i++) {
    if (AIRPORTS.has(String(slice[i]).toUpperCase()) && isTimeToken(slice[i + 1])) stationTimes.push(normalizeTimeToken(slice[i + 1]));
  }
  if (stationTimes.length >= 2) return { start: stationTimes[0], end: stationTimes[stationTimes.length - 1] };
  const times = uniqueTimesV3(slice.filter(isTimeToken).map(normalizeTimeToken));
  if (!times.length) return { start: null, end: null };
  const start = times[0];
  let end = times[1] || times[0];
  for (const time of times.slice(1)) {
    const hours = diffHours(start, time);
    if (hours >= 0.25 && hours <= 14 && !looksLikeDurationV3(time)) end = time;
  }
  return { start, end };
}

function inferAimsDebriefV3(tokens, lastLeg) {
  if (!lastLeg) return null;
  const upper = tokens.map((token) => String(token).toUpperCase());
  const destIdx = upper.findLastIndex ? upper.findLastIndex((token) => token === lastLeg.destination) : (() => { for (let i=upper.length-1;i>=0;i--) if (upper[i]===lastLeg.destination) return i; return -1; })();
  if (destIdx < 0) return null;
  const after = tokens.slice(destIdx + 1).filter(isTimeToken).map(normalizeTimeToken);
  if (after.length >= 2) return after[1];
  return after[0] || null;
}

function parseServerRosterReport(fullText, pages, filename='') {
  const h = parseServerHeader(fullText, filename);
  const blocks = buildRosterDateBlocksV3(fullText);
  const days = [];
  for (const block of blocks) {
    const month = monthNameToNum(block.monthToken) || h.month;
    const year = Number(block.yearToken) || h.year;
    const parsed = parseCrewRosterBlockV3(Number(block.dayToken), month, year, h.base, block.text);
    days.push(...parsed);
  }
  return { ...h, days, rawText: fullText, totals: extractTotals(fullText) };
}

function parseServerLineIntoDay(day, line) {
  const parsed = parseCrewRosterBlockV3(day.dayNumber, day.month, day.year, day.base, line);
  const best = parsed.find((item) => item.legs?.length) || parsed.find((item) => item.pairingCode) || parsed[0];
  if (!best) return;
  Object.assign(day, best, { rawText: `${day.rawText || ''}\n${line}`.trim() });
}

function parseServerAims(fullText, pages) {
  const h = parseServerHeader(fullText);
  const days = [];
  for (const page of pages) {
    const markers = page.items.map(item=>({ item, marker: parseAimsDateMarkerServer(item.str, h.month, h.year) })).filter(x=>x.marker);
    if (!markers.length) continue;
    markers.sort((a,b)=>a.item.x-b.item.x);
    for (let i=0;i<markers.length;i++) {
      const { item, marker } = markers[i];
      if (marker.month !== h.month || marker.year !== h.year) continue;
      const left = i ? (markers[i-1].item.x + item.x)/2 : item.x - 999;
      const right = i < markers.length-1 ? (item.x + markers[i+1].item.x)/2 : item.x + 999;
      const tokens = page.items.filter(it=>it !== item && it.x >= left && it.x < right && it.y < item.y - 1)
        .sort((a,b)=> b.y-a.y || a.x-b.x)
        .flatMap(it=>String(it.str||'').split(/\s+/))
        .map(t=>t.trim()).filter(Boolean)
        .filter(t=>!ignoreAimsTokenServer(t));
      days.push(...parseAimsTokensIntoEventsV3(tokens, marker.day, marker.month, marker.year, h.base));
    }
  }
  return { ...h, days, rawText: fullText, totals: extractTotals(fullText) };
}
function parseAimsDateMarkerServer(value, baseMonth, baseYear) {
  const m = String(value||'').trim().match(/^(\d{2})(Jan|Feb|Mar|Apr|May|Ma|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Fev|Abr|Mai|Ago|Set|Out|Dez)$/i);
  if (!m) return null;
  const day=Number(m[1]); let month=monthNameToNum(m[2]); if (m[2].toLowerCase()==='ma') month = baseMonth===6 ? 5 : 3;
  let year=baseYear; if (month < baseMonth-6) year++; if (month > baseMonth+6) year--;
  return { day, month, year };
}
function ignoreAimsTokenServer(t) { const u=String(t).toUpperCase(); return !t || ['MON','TUE','WED','THU','FRI','SAT','SUN','SEG','TER','QUA','QUI','SEX','SAB','SÁB','DOM','Y'].includes(u) || /^(TIMEZONE|CONFIRA|TRIPULAÇÕES|TRIPULACOES)/i.test(u) || /^\d{2}(JAN|FEB|MAR|APR|MAY|MA|JUN|JUL|AUG|SEP|OCT|NOV|DEC)$/i.test(t); }
function parseAimsTokensIntoDay(tokens, dayNum, month, year, base) {
  return parseAimsTokensIntoEventsV3(tokens, dayNum, month, year, base)[0] || makeDay(dayNum, month, year, base);
}
function parseAimsFlightSeq(flightNumber, seq) {
  const tokens = seq.map((t) => String(t || '').trim()).filter(Boolean);
  const upper = tokens.map((t) => t.toUpperCase());
  const pattern = findBestFlightPatternV3(tokens);
  if (!pattern) return null;
  const aircraft = upper.find((token) => /^\([A-Z0-9]{3}\)$/.test(token))?.replace(/[()]/g, '') || upper.find((token) => /^(32S|31R|39R|328|319|320|321|32N)$/.test(token)) || undefined;
  const { origin, destination, departureTime, arrivalTime } = pattern;
  return { flightNumber, origin, destination, departureTime, arrivalTime, workType:'OP', aircraftType: aircraft, isNextDay:/\(\+1\)/.test(arrivalTime) || toMin(arrivalTime) < toMin(departureTime), duration: diffHours(departureTime, arrivalTime) };
}
function firstTimeBeforeFirstFlight(tokens) { const idx=tokens.findIndex(t=>String(t).toUpperCase()==='LA'); const arr=(idx>=0?tokens.slice(0, idx):tokens).filter(isTimeToken); return arr[0] ? normalizeTimeToken(arr[0]) : null; }
function isTimeToken(t) { return /^\d{1,2}:\d{2}(?:\(\+1\))?$/.test(String(t)); }
function normalizeTimeToken(t) { return String(t).replace(/^([0-9]):/,'0$1:'); }
function diffHours(a,b) { const ma=toMin(a), mb=toMin(b); return ((mb<=ma?mb+1440:mb)-ma)/60; }
function toMin(t) { const [h,m]=normalizeTimeToken(t).replace('(＋1)','').replace('( +1 )','').replace('( +1)','').replace('(+1)','').split(':').map(Number); return h*60+m; }
function findAircraftAfter(text, idx) { const part=text.slice(idx, idx+160); return part.match(/\b(32S|31R|39R|328|319|320|321|32N)\b/i)?.[1]; }
function extractTotals(fullText) { const m=fullText.match(/FH\s*:\s*(\d{1,3}:\d{2})\s*\|\s*DH\s*:\s*(\d{1,3}:\d{2})/i); return m ? { flightHours: timeToHours(m[1]), dutyHours: timeToHours(m[2]) } : {}; }
function timeToHours(s) { const [h,m]=s.split(':').map(Number); return h + m/60; }
function finalizeServerDays(days, month, year, base) {
  const good = days.filter(d => d && d.month === month && d.year === year && (d.type !== 'OTHER' || d.legs?.length || d.pairingCode));
  const byKey = new Map();
  for (const d of good) {
    const legKey = (d.legs || []).map((leg) => `${leg.flightNumber}-${leg.origin}-${leg.destination}-${leg.departureTime}`).join(',');
    const key = `${d.date}|${d.pairingCode || d.type}|${d.dutyReport || ''}|${legKey}`;
    if (!byKey.has(key)) byKey.set(key, d);
  }
  return [...byKey.values()].sort((a,b)=> new Date(a.year,a.month-1,a.dayNumber).getTime()-new Date(b.year,b.month-1,b.dayNumber).getTime() || (toMin(a.dutyReport || '23:59') - toMin(b.dutyReport || '23:59')) || String(a.pairingCode).localeCompare(String(b.pairingCode)));
}
function buildParseDiagnostics(roster, sourceFormat) {
  const days = roster.days || [];
  const uniqueDays = new Set(days.map(d=>d.date)).size;
  const flights = days.reduce((s,d)=>s+(d.legs?.length||0),0);
  const reserve = days.filter((d)=>d.type==='ASB').length;
  const meetings = days.filter((d)=>(d.pairingCode||'')==='MT').length;
  const activities = days.filter(d=>d.pairingCode || d.legs?.length).length;
  const confidence = uniqueDays >= 25 && flights >= 20 && reserve >= 2 && meetings >= 1 ? 'alta' : uniqueDays >= 20 && flights >= 15 ? 'média' : 'baixa';
  return { sourceFormat, uniqueDays, totalEvents: days.length, flights, reserve, meetings, activities, confidence, message: confidence === 'baixa' ? 'Poucos eventos foram lidos; use o modo de reprocessamento ou confira o PDF.' : 'Escala lida com auditoria de servidor: ASB/MT/voos validados.' };
}
// --- end CrewCheck server-side PDF parser ---

async function readJsonBody(req, maxBytes = 16 * 1024 * 1024) {
  let total = 0;
  const chunks = [];
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      const err = new Error('Payload muito grande.');
      err.statusCode = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

function checksumPayload(payload) {
  const roster = payload?.roster;
  const periodKey = roster?.year && roster?.month
    ? `period:${roster?.crewId || roster?.crewName || 'crew'}:${roster.year}-${String(roster.month).padStart(2, '0')}`
    : null;
  return crypto.createHash('sha256').update(periodKey || JSON.stringify(payload)).digest('hex');
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isLatamCorporateEmail(email) {
  return normalizeEmail(email).endsWith('@latam.com');
}

const C32F_ADMIN_EMAIL = 'bmedeiros1987@gmail.com';

function isC32FAdminEmail(email) {
  return normalizeEmail(email) === C32F_ADMIN_EMAIL;
}

function newId() {
  return crypto.randomUUID();
}

function dbErrorInfo(error) {
  return {
    message: error?.message || String(error),
    code: error?.code || null,
    detail: error?.detail || null,
    hint: error?.hint || null,
    constraint: error?.constraint || null,
  };
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(String(password), salt, 210_000, 32, 'sha256').toString('hex');
  return `pbkdf2_sha256$210000$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  const [scheme, iterStr, salt, expected] = String(stored || '').split('$');
  if (scheme !== 'pbkdf2_sha256' || !salt || !expected) return false;
  const iterations = Number(iterStr || 210_000);
  const hash = crypto.pbkdf2Sync(String(password), salt, iterations, 32, 'sha256').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expected, 'hex'));
}

function generateTemporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let out = '';
  const bytes = crypto.randomBytes(10);
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return out.slice(0, 10);
}

function canUseTemporaryPassword(password, user) {
  if (!user?.temp_password_hash || !user?.temp_password_expires_at) return false;
  if (new Date(user.temp_password_expires_at).getTime() < Date.now()) return false;
  return verifyPassword(password, user.temp_password_hash);
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    crewId: row.crew_id,
    base: row.base,
    rank: row.rank,
  };
}

function getBearerToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return '';
}

async function getAuthUser(req) {
  if (!AUTH_REQUIRED) {
    return { id: null, name: 'Modo local', email: 'local@crewcheck', role: 'local' };
  }
  const db = getPool();
  if (!db) return null;
  const token = getBearerToken(req);
  if (!token) return null;
  await ensureSchema();
  const result = await db.query(
    `select u.*
       from crewcheck_sessions s
       join crewcheck_users u on u.id = s.user_id
      where s.token_hash = $1
        and s.expires_at > now()
        and u.is_active = true
      limit 1`,
    [tokenHash(token)],
  );
  return result.rows[0] || null;
}

async function requireAuth(req, res) {
  if (!AUTH_REQUIRED) return { id: null, name: 'Modo local', email: 'local@crewcheck', role: 'local' };
  const user = await getAuthUser(req);
  if (!user) {
    sendJson(res, 401, { ok: false, code: 'AUTH_REQUIRED', message: 'Faça login ou cadastro para acessar o CrewCheck.' });
    return null;
  }
  return user;
}

async function createSession(db, user, req) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.query(
    `insert into crewcheck_sessions (id, user_id, token_hash, expires_at, user_agent, ip)
     values ($1, $2, $3, $4, $5, $6)`,
    [newId(), user.id, tokenHash(token), expiresAt.toISOString(), req.headers['user-agent'] || null, req.socket.remoteAddress || null],
  );
  await db.query('update crewcheck_users set last_login_at = now(), updated_at = now() where id = $1', [user.id]);
  return { token, expiresAt };
}

function summarizeRosterRow(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    crewName: row.crew_name,
    crewId: row.crew_id,
    base: row.base,
    rank: row.rank,
    airline: row.airline,
    year: row.period_year,
    month: row.period_month,
    sourceFileName: row.source_file_name,
    score: row.score,
    intensityScore: row.intensity_score,
    alertsCount: row.alerts_count,
    criticalAlertsCount: row.critical_alerts_count,
    checksum: row.checksum,
  };
}


function average(values) {
  const valid = values.map(Number).filter((v) => Number.isFinite(v));
  if (!valid.length) return 0;
  return Math.round((valid.reduce((sum, v) => sum + v, 0) / valid.length) * 10) / 10;
}

function countRosterDays(roster, predicate) {
  const days = Array.isArray(roster?.days) ? roster.days : [];
  return days.filter(predicate).length;
}

function countFlightSegments(roster) {
  const days = Array.isArray(roster?.days) ? roster.days : [];
  return days.reduce((sum, day) => sum + (Array.isArray(day.legs) ? day.legs.length : 0), 0);
}

function countHeavyDays(compliance) {
  const days = compliance?.loadAnalysis?.days;
  if (!Array.isArray(days)) return 0;
  return days.filter((day) => Number(day.fatigueScore || 0) >= 70).length;
}

function safePeriodLabel(row) {
  const year = Number(row.period_year || row.year || 0);
  const month = Number(row.period_month || row.month || 0);
  if (!year || !month) return 'Sem período';
  return `${String(month).padStart(2, '0')}/${year}`;
}


function dedupeRosterRowsByPeriod(rows) {
  const seen = new Set();
  const result = [];
  for (const row of rows || []) {
    const roster = row.roster_json || {};
    const key = `${roster.crewId || row.crew_id || row.crew_name || 'crew'}:${row.period_year || roster.year || '0000'}:${row.period_month || roster.month || '00'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }
  return result;
}

function buildStatsFromRosterRows(rows, mode = 'personal') {
  const normalized = (rows || []).map((row) => ({
    id: row.id,
    createdAt: row.created_at || null,
    period: safePeriodLabel(row),
    year: row.period_year || null,
    month: row.period_month || null,
    roster: row.roster_json || {},
    compliance: row.compliance_json || {},
    gym: Array.isArray(row.gym_json) ? row.gym_json : [],
    score: Number(row.score ?? row.compliance_json?.score ?? 0),
    intensityScore: Number(row.intensity_score ?? row.compliance_json?.loadAnalysis?.intensityScore ?? 0),
    alertsCount: Number(row.alerts_count ?? row.compliance_json?.alerts?.length ?? 0),
    criticalAlertsCount: Number(row.critical_alerts_count ?? 0),
  }));

  const byPeriod = new Map();
  for (const item of normalized) byPeriod.set(`${item.year || '0000'}:${item.month || '00'}:${item.roster?.crewId || item.roster?.crewName || 'crew'}`, item);
  const uniqueNormalized = Array.from(byPeriod.values());

  const periods = uniqueNormalized.map((item) => {
    const roster = item.roster;
    const compliance = item.compliance;
    const gym = item.gym;
    return {
      id: item.id,
      period: item.period,
      year: item.year,
      month: item.month,
      daysAnalyzed: Array.isArray(roster.days) ? roster.days.length : 0,
      flightSegments: countFlightSegments(roster),
      daysOff: countRosterDays(roster, (day) => ['DO', 'DR', 'DOF'].includes(day?.type) || ['DOP','DOPR','VC','FOLGA'].includes(String(day?.pairingCode || '').toUpperCase())),
      layovers: countRosterDays(roster, (day) => day?.type === 'LAYOVER'),
      standby: countRosterDays(roster, (day) => ['HSB', 'HSBE'].includes(day?.type)),
      reserve: countRosterDays(roster, (day) => day?.type === 'ASB'),
      gymGoodDays: gym.filter((item) => item?.priority === 'high' || item?.priority === 'medium').length,
      gymAvoidDays: gym.filter((item) => item?.priority === 'low' || item?.planType === 'evitar').length,
      heavyDays: countHeavyDays(compliance),
      score: item.score,
      intensityScore: item.intensityScore,
      alertsCount: item.alertsCount,
      criticalAlertsCount: item.criticalAlertsCount,
    };
  }).sort((a, b) => Number(a.year || 0) - Number(b.year || 0) || Number(a.month || 0) - Number(b.month || 0));

  const summary = {
    rostersCount: periods.length,
    firstPeriod: periods[0]?.period || null,
    lastPeriod: periods[periods.length - 1]?.period || null,
    avgScore: average(periods.map((p) => p.score)),
    avgIntensity: average(periods.map((p) => p.intensityScore)),
    avgAlerts: average(periods.map((p) => p.alertsCount)),
    avgCriticalAlerts: average(periods.map((p) => p.criticalAlertsCount)),
    avgFlightSegments: average(periods.map((p) => p.flightSegments)),
    avgDaysOff: average(periods.map((p) => p.daysOff)),
    avgLayovers: average(periods.map((p) => p.layovers)),
    avgGymGoodDays: average(periods.map((p) => p.gymGoodDays)),
    avgHeavyDays: average(periods.map((p) => p.heavyDays)),
  };

  return {
    mode,
    summary,
    periods: mode === 'global' ? [] : periods.slice(-18),
    disclaimer: 'Estatísticas superficiais geradas automaticamente a partir das escalas salvas. Use apenas como referência pessoal; não apresente como prova, cobrança ou documento oficial para empresa, sindicato ou terceiros.',
  };
}

async function sendEmail({ to, subject, text, html }) {
  const from = process.env.EMAIL_FROM || process.env.SENDGRID_FROM || process.env.MAILERSEND_FROM || '';
  if (!from) {
    return { ok: false, configured: false, message: 'Configure EMAIL_FROM e uma chave SENDGRID_API_KEY ou MAILERSEND_API_KEY.' };
  }

  if (process.env.SENDGRID_API_KEY) {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: from, name: process.env.EMAIL_FROM_NAME || 'CrewCheck' },
        subject,
        content: [
          { type: 'text/plain', value: text || subject },
          { type: 'text/html', value: html || `<pre>${escapeHtml(text || '')}</pre>` },
        ],
      }),
    });
    if (!response.ok) throw new Error(`SendGrid retornou HTTP ${response.status}`);
    return { ok: true, provider: 'sendgrid' };
  }

  if (process.env.MAILERSEND_API_KEY) {
    const response = await fetch('https://api.mailersend.com/v1/email', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.MAILERSEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: { email: from, name: process.env.EMAIL_FROM_NAME || 'CrewCheck' },
        to: [{ email: to }],
        subject,
        text: text || subject,
        html: html || `<pre>${escapeHtml(text || '')}</pre>`,
      }),
    });
    if (!response.ok) throw new Error(`MailerSend retornou HTTP ${response.status}`);
    return { ok: true, provider: 'mailersend' };
  }

  return { ok: false, configured: false, message: 'Envio por e-mail ainda não configurado. Adicione SENDGRID_API_KEY ou MAILERSEND_API_KEY no Render.' };
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
}


function buildWelcomeEmail({ email, temporaryPassword }) {
  const safeEmail = escapeHtml(email);
  const safePassword = escapeHtml(temporaryPassword);
  const subject = 'Bem-vindo ao CrewCheck Premium';
  const text = [
    'Bem-vindo ao CrewCheck Premium.',
    '',
    `Conta criada para: ${email}`,
    `Senha provisória de emergência: ${temporaryPassword}`,
    '',
    'Você pode acessar com a senha escolhida no cadastro. A senha provisória é temporária e serve apenas como alternativa inicial/de recuperação.',
    'Após carregar sua primeira escala, o CrewCheck preencherá automaticamente BP, base e função a partir do PDF.',
    '',
    'Equipe CrewCheck',
  ].join('\n');
  const html = `
  <div style="margin:0;padding:0;background:#eef5f8;font-family:Inter,Segoe UI,Arial,sans-serif;color:#092846">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef5f8;padding:32px 12px">
      <tr><td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:28px;overflow:hidden;box-shadow:0 24px 70px rgba(9,40,70,.16)">
          <tr><td style="height:7px;background:linear-gradient(90deg,#67e8f9,#3b82f6,#a855f7)"></td></tr>
          <tr><td style="padding:34px 34px 18px">
            <div style="font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:#0ea5e9;font-weight:800">CrewCheck Premium</div>
            <h1 style="margin:10px 0 8px;font-size:30px;line-height:1.1;color:#06172a">Cadastro criado com sucesso</h1>
            <p style="margin:0;color:#60758a;font-size:15px;line-height:1.7">Sua conta foi criada. O sistema usará apenas seu e-mail no cadastro e preencherá BP, base e função automaticamente após a leitura da escala.</p>
          </td></tr>
          <tr><td style="padding:0 34px 22px">
            <div style="background:#f8fbff;border:1px solid #dbeafe;border-radius:22px;padding:22px">
              <p style="margin:0 0 10px;color:#60758a;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.12em">Conta</p>
              <p style="margin:0;font-size:16px;font-weight:800;color:#092846">${safeEmail}</p>
            </div>
          </td></tr>
          <tr><td style="padding:0 34px 24px">
            <div style="background:#06172a;border-radius:24px;padding:24px;color:white">
              <p style="margin:0;color:#93c5fd;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.14em">Senha provisória de emergência</p>
              <div style="margin-top:14px;padding:16px 18px;border-radius:18px;background:rgba(255,255,255,.08);font-size:28px;letter-spacing:.12em;font-weight:900;text-align:center">${safePassword}</div>
              <p style="margin:16px 0 0;color:#cbd5e1;font-size:13px;line-height:1.6">Você também pode entrar com a senha escolhida no cadastro. A senha provisória expira automaticamente e deve ser usada apenas se necessário.</p>
            </div>
          </td></tr>
          <tr><td style="padding:0 34px 34px;color:#60758a;font-size:14px;line-height:1.7">
            <strong style="color:#092846">Próximo passo:</strong> acesse o CrewCheck, carregue seu PDF de escala e o sistema identificará automaticamente BP, base e função.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </div>`;
  return { subject, text, html };
}


function buildPasswordResetEmail({ email, temporaryPassword }) {
  const safeEmail = escapeHtml(email);
  const safePassword = escapeHtml(temporaryPassword);
  const subject = 'CrewCheck Premium — senha provisória de acesso';
  const text = [
    'CrewCheck Premium — recuperação de acesso.',
    '',
    `Conta: ${email}`,
    `Senha provisória: ${temporaryPassword}`,
    '',
    'A senha provisória expira em 7 dias e será invalidada após o uso.',
    'Se você não solicitou essa recuperação, ignore este e-mail.',
    '',
    'Equipe CrewCheck',
  ].join('\n');
  const html = `
  <div style="margin:0;padding:0;background:#eef5f8;font-family:Inter,Segoe UI,Arial,sans-serif;color:#092846">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef5f8;padding:32px 12px">
      <tr><td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:28px;overflow:hidden;box-shadow:0 24px 70px rgba(9,40,70,.16)">
          <tr><td style="height:7px;background:linear-gradient(90deg,#67e8f9,#3b82f6,#a855f7)"></td></tr>
          <tr><td style="padding:34px 34px 18px">
            <div style="font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:#0ea5e9;font-weight:800">CrewCheck Premium</div>
            <h1 style="margin:10px 0 8px;font-size:30px;line-height:1.1;color:#06172a">Recuperação de acesso</h1>
            <p style="margin:0;color:#60758a;font-size:15px;line-height:1.7">Geramos uma senha provisória para você acessar sua conta. Por segurança, use-a apenas uma vez e depois continue com sua senha principal.</p>
          </td></tr>
          <tr><td style="padding:0 34px 22px"><div style="background:#f8fbff;border:1px solid #dbeafe;border-radius:22px;padding:22px"><p style="margin:0 0 10px;color:#60758a;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.12em">Conta</p><p style="margin:0;font-size:16px;font-weight:800;color:#092846">${safeEmail}</p></div></td></tr>
          <tr><td style="padding:0 34px 24px"><div style="background:#06172a;border-radius:24px;padding:24px;color:white"><p style="margin:0;color:#93c5fd;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.14em">Senha provisória</p><div style="margin-top:14px;padding:16px 18px;border-radius:18px;background:rgba(255,255,255,.08);font-size:28px;letter-spacing:.12em;font-weight:900;text-align:center">${safePassword}</div><p style="margin:16px 0 0;color:#cbd5e1;font-size:13px;line-height:1.6">Expira em 7 dias e é invalidada após o primeiro uso.</p></div></td></tr>
          <tr><td style="padding:0 34px 34px;color:#60758a;font-size:14px;line-height:1.7"><strong style="color:#092846">Privacidade:</strong> usamos seus dados apenas para autenticação e análise da escala conforme as boas práticas da LGPD.</td></tr>
        </table>
      </td></tr>
    </table>
  </div>`;
  return { subject, text, html };
}


const IFLIGHT_MAIN_URL = 'https://iflightla.ibsplc.aero/iflight-cwp/web/getMainPage';

async function importIFlightRoster({ username, password, periodMonth, periodYear, mfaCode = '', challengeSessionId = '', step = 'start' }) {
  const connectorUrl = String(process.env.IFLIGHT_CONNECTOR_URL || '').trim();
  const connectorToken = String(process.env.IFLIGHT_CONNECTOR_TOKEN || '').trim();

  if (connectorUrl) {
    const response = await fetch(connectorUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(connectorToken ? { authorization: `Bearer ${connectorToken}` } : {}),
      },
      body: JSON.stringify({
        username,
        password,
        periodMonth,
        periodYear,
        mfaCode,
        challengeSessionId,
        step,
        source: 'crewcheck',
        mfaMode: 'manual_user_supplied',
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      const err = new Error(payload?.message || payload?.detail || `Conector iFlight retornou HTTP ${response.status}.`);
      err.statusCode = response.status || 502;
      err.code = payload?.code || 'IFLIGHT_CONNECTOR_ERROR';
      throw err;
    }
    if (payload?.requiresMfa || payload?.status === 'mfa_required' || payload?.challengeRequired) {
      return {
        requiresMfa: true,
        challengeSessionId: payload.challengeSessionId || payload.sessionId || payload.challengeId || challengeSessionId || '',
        challengeLabel: payload.challengeLabel || payload.factor || payload.method || 'MFA corporativo',
        message: payload.message || 'O portal solicitou MFA. Informe manualmente o código recebido para continuar.',
      };
    }
    if (payload.roster) {
      return { roster: payload.roster, sourceFileName: payload.sourceFileName || `iFlight_${periodYear}_${periodMonth}.pdf`, diagnostics: payload.diagnostics || null };
    }
    if (payload.dataBase64) {
      const parsed = await parsePdfOnServer({ filename: payload.filename || `iFlight_${periodYear}_${periodMonth}.pdf`, dataBase64: payload.dataBase64 });
      return { ...parsed, sourceFileName: payload.filename || `iFlight_${periodYear}_${periodMonth}.pdf` };
    }
    const err = new Error('O conector iFlight respondeu sem roster, sem PDF base64 e sem solicitação de MFA.');
    err.statusCode = 502;
    err.code = 'IFLIGHT_EMPTY_CONNECTOR_RESPONSE';
    throw err;
  }

  let redirectLocation = '';
  try {
    const probe = await fetch(IFLIGHT_MAIN_URL, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'user-agent': 'CrewCheck/10.5.7 (+https://crewcheck.online)',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    redirectLocation = probe.headers.get('location') || '';
    if (probe.status >= 300 && probe.status < 400 && redirectLocation) {
      const err = new Error(/accounts\.google\.com|saml|login|auth/i.test(redirectLocation)
        ? 'O iFlight usa autenticação corporativa externa. O CrewCheck já aceita usuário, senha e MFA manual, mas para baixar direto é necessário um conector corporativo autorizado que mantenha a sessão e devolva o desafio MFA ao app. Até configurar IFLIGHT_CONNECTOR_URL, use a importação por PDF.'
        : `O iFlight redirecionou para autenticação externa (${new URL(redirectLocation, IFLIGHT_MAIN_URL).hostname}). Configure um conector corporativo autorizado ou use o PDF.`);
      err.statusCode = 501;
      err.code = 'IFLIGHT_CONNECTOR_REQUIRED_FOR_MFA';
      throw err;
    }
  } catch (error) {
    if (error?.statusCode) throw error;
    const err = new Error(`Não foi possível verificar o portal iFlight agora. Detalhe: ${error?.message || String(error)}. Use a importação PDF ou configure IFLIGHT_CONNECTOR_URL.`);
    err.statusCode = 502;
    err.code = 'IFLIGHT_PORTAL_UNREACHABLE';
    throw err;
  }

  const err = new Error('O fluxo com usuário, senha e MFA manual está pronto, mas o download direto depende de conector/API corporativa autorizada em IFLIGHT_CONNECTOR_URL. Sem isso, use a importação PDF.');
  err.statusCode = 501;
  err.code = 'IFLIGHT_CONNECTOR_REQUIRED';
  throw err;
}


function externalBaseUrl(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || (req.socket.encrypted ? 'https' : 'https');
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return `${proto}://${host}`.replace(/\/$/, '');
}

function emptyCalendarFeed() {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CrewCheck//Automatic Calendar Feed//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:CrewCheck · Escala',
    'X-WR-CALDESC:Importe uma escala no CrewCheck para atualizar esta assinatura.',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

function calendarFeedUrl(req, token) {
  return `${externalBaseUrl(req)}/calendar-feed/${encodeURIComponent(token)}.ics`;
}

async function ensureCalendarFeedForUser(db, user) {
  await ensureSchema();
  const userId = user.id || null;
  if (!userId) throw new Error('Usuário sem sessão para criar assinatura de calendário.');
  const existing = await db.query('select * from crewcheck_calendar_feeds where user_id = $1 limit 1', [userId]);
  if (existing.rowCount) return existing.rows[0];
  const row = {
    id: newId(),
    token: crypto.randomBytes(32).toString('base64url'),
  };
  await db.query(
    'insert into crewcheck_calendar_feeds (id, user_id, token, ics_content, period_label, mode, events_count) values ($1,$2,$3,$4,$5,$6,$7)',
    [row.id, userId, row.token, emptyCalendarFeed(), null, 'all', 0],
  );
  const created = await db.query('select * from crewcheck_calendar_feeds where id = $1 limit 1', [row.id]);
  return created.rows[0];
}

const BSB_AERO_FLIGHTS_URL = 'https://www.bsb.aero/passageiros/voos-online';
const BSB_AERO_CACHE_TTL_MS = Number(process.env.BSB_AERO_CACHE_TTL_MS || 90_000);
const bsbAeroFlightCache = new Map();

function normalizeFlightToken(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function splitFlightTokens(value) {
  return String(value || '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .map(normalizeFlightToken)
    .filter((token) => /^[A-Z]{1,4}\d{2,5}$/.test(token));
}

function flightNumberVariants(value) {
  const token = normalizeFlightToken(value);
  const match = token.match(/^([A-Z]{1,4})(\d{2,5})$/);
  if (!match) return token ? [token] : [];
  const [, prefix, number] = match;
  const aliases = {
    LA: ['LA', 'TAM', 'JJ'],
    JJ: ['JJ', 'LA', 'TAM'],
    TAM: ['TAM', 'LA', 'JJ'],
    G3: ['G3', 'GLO'],
    GLO: ['GLO', 'G3'],
    AD: ['AD', 'AZU'],
    AZU: ['AZU', 'AD'],
    TP: ['TP', 'TAP'],
    TAP: ['TAP', 'TP'],
    CM: ['CM', 'CMP'],
    CMP: ['CMP', 'CM'],
    AR: ['AR', 'ARG'],
    ARG: ['ARG', 'AR'],
  };
  return Array.from(new Set([...(aliases[prefix] || [prefix]), prefix].map((item) => `${item}${number}`)));
}

function buildFlightCandidates({ flightNumber, codes }) {
  const tokens = [normalizeFlightToken(flightNumber), ...splitFlightTokens(codes)];
  return Array.from(new Set(tokens.flatMap(flightNumberVariants).filter(Boolean)));
}

function htmlToSearchText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#0*39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function flightTokenRegex(token) {
  const normalized = normalizeFlightToken(token);
  const match = normalized.match(/^([A-Z]{1,4})(\d{2,5})$/);
  if (!match) return new RegExp(escapeRegExp(normalized), 'i');
  const [, prefix, number] = match;
  return new RegExp(`\\b${escapeRegExp(prefix)}\\s*${escapeRegExp(number)}\\b`, 'i');
}

function extractSegmentForCandidates(text, candidates) {
  for (const token of candidates) {
    const regex = flightTokenRegex(token);
    const match = regex.exec(text);
    if (match) {
      const start = Math.max(0, match.index - 320);
      const end = Math.min(text.length, match.index + 640);
      return { token, segment: text.slice(start, end) };
    }
  }
  return null;
}

function parseBsbStatusSegment(segment) {
  const sourceText = String(segment || '');
  const statusWords = [
    'Embarque encerrado',
    'Última chamada',
    'Ultima chamada',
    'Embarcando',
    'Atrasado',
    'Cancelado',
    'Confirmado',
    'Previsto',
    'Programado',
    'No horário',
    'No horario',
    'Decolado',
    'Pousou',
    'Pousado',
    'Chegou',
    'Partiu',
    'Finalizado',
  ];
  const status = statusWords.find((word) => new RegExp(`\\b${escapeRegExp(word)}\\b`, 'i').test(sourceText)) || null;
  const gateMatch = sourceText.match(/(?:port[aã]o|gate)\s*[:\-]?\s*([A-Z]?\d{1,3}[A-Z]?)/i) || sourceText.match(/\bP(?:T|ORT)?\s*([A-Z]?\d{1,3}[A-Z]?)\b/i);
  const terminalMatch = sourceText.match(/(?:terminal|term\.?|t)\s*[:\-]?\s*([A-Z0-9]{1,4})\b/i);
  const scheduledMatch = sourceText.match(/(?:previsto|programado)\s*[:\-]?\s*([0-2]?\d:[0-5]\d)/i);
  const confirmedMatch = sourceText.match(/(?:confirmado|realizado)\s*[:\-]?\s*([0-2]?\d:[0-5]\d)/i);
  return {
    status: status ? normalizeBsbStatus(status) : null,
    gate: gateMatch?.[1] ? gateMatch[1].toUpperCase() : null,
    terminal: terminalMatch?.[1] ? terminalMatch[1].toUpperCase() : null,
    scheduledTime: scheduledMatch?.[1] || null,
    confirmedTime: confirmedMatch?.[1] || null,
  };
}

function normalizeBsbStatus(value) {
  const text = String(value || '').trim();
  const lower = text.toLowerCase();
  if (lower.includes('atras')) return 'Atrasado';
  if (lower.includes('cancel')) return 'Cancelado';
  if (lower.includes('embar')) return text.includes('encerrado') ? 'Embarque encerrado' : 'Embarcando';
  if (lower.includes('última') || lower.includes('ultima')) return 'Última chamada';
  if (lower.includes('decol')) return 'Decolado';
  if (lower.includes('pous') || lower.includes('cheg')) return 'Pousou';
  if (lower.includes('confirm')) return 'Confirmado';
  if (lower.includes('hor')) return 'No horário';
  return text || 'Programado';
}

function shouldUseBsbAero({ origin, destination, route, airport }) {
  const values = [origin, destination, route, airport].map((value) => String(value || '').toUpperCase());
  return values.some((value) => /(^|[^A-Z])BSB([^A-Z]|$)/.test(value));
}

async function fetchBsbAeroFlightStatus(params) {
  const flightNumber = normalizeFlightToken(params.flightNumber);
  const candidates = buildFlightCandidates(params);
  const date = String(params.date || '').slice(0, 10);
  const cacheKey = `${date}|${candidates.join(',') || flightNumber}|${params.origin || ''}|${params.destination || ''}`;
  const cached = bsbAeroFlightCache.get(cacheKey);
  if (cached && Date.now() - cached.time < BSB_AERO_CACHE_TTL_MS) return cached.value;

  const resultBase = {
    flightNumber,
    origin: params.origin,
    destination: params.destination,
    date,
    updatedAt: new Date().toISOString(),
  };

  try {
    const response = await fetch(BSB_AERO_FLIGHTS_URL, {
      headers: {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'pt-BR,pt;q=0.9,en;q=0.6',
        'cache-control': 'no-cache',
        pragma: 'no-cache',
        'user-agent': 'CrewCheck/10.8.4 (+https://github.com/bmedeiros1987/crewcheck) flight-status-bsb',
      },
      signal: AbortSignal.timeout(7500),
    });
    if (!response.ok) throw new Error(`BSB_AERO_HTTP_${response.status}`);
    const html = await response.text();
    const text = htmlToSearchText(html);
    const match = extractSegmentForCandidates(text, candidates);
    if (!match) {
      const value = { ok: true, ...resultBase, status: 'Programado', gate: null, terminal: null, source: 'BSB Aero oficial: voo não localizado no painel público' };
      bsbAeroFlightCache.set(cacheKey, { time: Date.now(), value });
      return value;
    }
    const parsed = parseBsbStatusSegment(match.segment);
    const value = {
      ok: true,
      ...resultBase,
      matchedFlight: match.token,
      status: parsed.status || 'Programado',
      gate: parsed.gate,
      terminal: parsed.terminal,
      scheduledTime: parsed.scheduledTime,
      confirmedTime: parsed.confirmedTime,
      source: 'BSB Aero oficial',
    };
    bsbAeroFlightCache.set(cacheKey, { time: Date.now(), value });
    return value;
  } catch (error) {
    const value = { ok: true, ...resultBase, status: 'Programado', gate: null, terminal: null, source: 'BSB Aero oficial indisponível' };
    bsbAeroFlightCache.set(cacheKey, { time: Date.now(), value });
    return value;
  }
}

async function getFlightStatusSnapshot(query) {
  const flightNumber = String(query.get('flightNumber') || '').replace(/\s+/g, '').toUpperCase().slice(0, 16);
  const origin = String(query.get('origin') || '').toUpperCase().slice(0, 4);
  const destination = String(query.get('destination') || '').toUpperCase().slice(0, 4);
  const date = String(query.get('date') || '').slice(0, 10);
  const codes = String(query.get('codes') || '').toUpperCase().slice(0, 128);
  const route = String(query.get('route') || '').toUpperCase().slice(0, 64);
  const airport = String(query.get('airport') || '').toUpperCase().slice(0, 4);
  const updatedAt = new Date().toISOString();
  const queryBase = { flightNumber, origin, destination, date, codes, route, airport };

  if (shouldUseBsbAero(queryBase)) {
    const bsbStatus = await fetchBsbAeroFlightStatus(queryBase);
    // Se o site oficial respondeu de forma conclusiva, ele fica como fonte preferencial.
    if (bsbStatus.source === 'BSB Aero oficial' || !String(process.env.FLIGHT_STATUS_ENDPOINT || '').trim()) return bsbStatus;
  }

  // Provedor opcional. Configure FLIGHT_STATUS_ENDPOINT com uma URL interna/proxy
  // que aceite flightNumber/origin/destination/date. Sem provedor, o CrewCheck
  // retorna estrutura segura para a UI, sem inventar portão/status.
  const provider = String(process.env.FLIGHT_STATUS_ENDPOINT || '').trim();
  if (provider) {
    try {
      const providerUrl = new URL(provider);
      providerUrl.searchParams.set('flightNumber', flightNumber);
      providerUrl.searchParams.set('codes', codes);
      if (origin) providerUrl.searchParams.set('origin', origin);
      if (destination) providerUrl.searchParams.set('destination', destination);
      if (date) providerUrl.searchParams.set('date', date);
      const response = await fetch(providerUrl, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(6500) });
      if (response.ok) {
        const payload = await response.json();
        return {
          ok: true,
          flightNumber,
          origin,
          destination,
          date,
          status: String(payload.status || payload.flightStatus || payload.state || 'Scheduled'),
          gate: payload.gate ? String(payload.gate) : null,
          terminal: payload.terminal ? String(payload.terminal) : null,
          source: payload.source || 'provedor externo',
          updatedAt,
        };
      }
    } catch (error) {
      return { ok: true, flightNumber, origin, destination, date, status: 'Scheduled', gate: null, terminal: null, source: 'provedor indisponível', updatedAt };
    }
  }

  return { ok: true, flightNumber, origin, destination, date, status: 'Scheduled', gate: null, terminal: null, source: shouldUseBsbAero(queryBase) ? 'BSB Aero oficial: voo não localizado' : 'Sem dados online', updatedAt };
}

async function handleApi(req, res, url) {
  if (url.pathname === '/api/health') {
    sendJson(res, 200, {
      ok: true,
      app: 'CrewCheck',
      databaseConfigured: Boolean(DATABASE_URL),
      databaseEnvDetected: Boolean(DATABASE_URL),
      authRequired: AUTH_REQUIRED,
      emailConfigured: Boolean(process.env.SENDGRID_API_KEY || process.env.MAILERSEND_API_KEY),
      autoMigrate: AUTO_MIGRATE,
    });
    return true;
  }

  if (url.pathname === '/api/calendar-feed' && req.method === 'GET') {
    const user = await requireAuth(req, res);
    if (!user) return true;
    const db = requireDatabase(res);
    if (!db) return true;
    try {
      const feed = await ensureCalendarFeedForUser(db, user);
      sendJson(res, 200, {
        ok: true,
        feedUrl: calendarFeedUrl(req, feed.token),
        token: feed.token,
        updatedAt: feed.updated_at || feed.updatedAt || null,
        periodLabel: feed.period_label || null,
        mode: feed.mode || 'all',
        hasContent: Boolean(feed.ics_content && String(feed.ics_content).includes('BEGIN:VEVENT')),
      });
    } catch (error) {
      sendJson(res, 500, { ok: false, message: 'Não foi possível criar o link de calendário.', detail: error.message });
    }
    return true;
  }

  if (url.pathname === '/api/calendar-feed' && req.method === 'POST') {
    const user = await requireAuth(req, res);
    if (!user) return true;
    const db = requireDatabase(res);
    if (!db) return true;
    try {
      const body = await readJsonBody(req, 3 * 1024 * 1024);
      const ical = String(body.ical || '').replace(/\r?\n/g, '\r\n');
      if (!ical.includes('BEGIN:VCALENDAR') || !ical.includes('END:VCALENDAR')) {
        sendJson(res, 400, { ok: false, message: 'Calendário ICS inválido.' });
        return true;
      }
      const feed = await ensureCalendarFeedForUser(db, user);
      const periodLabel = String(body.periodLabel || '').slice(0, 64) || null;
      const mode = String(body.mode || 'all').slice(0, 32);
      const eventsCount = Math.max(0, Math.min(5000, Number(body.eventsCount || 0) || 0));
      await db.query(
        'update crewcheck_calendar_feeds set updated_at = now(), ics_content = $1, period_label = $2, mode = $3, events_count = $4 where id = $5',
        [ical, periodLabel, mode, eventsCount, feed.id],
      );
      sendJson(res, 200, {
        ok: true,
        feedUrl: calendarFeedUrl(req, feed.token),
        updatedAt: new Date().toISOString(),
        periodLabel,
        mode,
        eventsCount,
      });
    } catch (error) {
      sendJson(res, 500, { ok: false, message: 'Não foi possível atualizar o calendário automático.', detail: error.message });
    }
    return true;
  }

  if (url.pathname === '/api/c32f/apostila-pdf' && req.method === 'GET') {
    const user = await requireAuth(req, res);
    if (!user) return true;
    if (AUTH_REQUIRED && !isC32FAdminEmail(user.email)) {
      sendJson(res, 403, { ok: false, code: 'C32F_ADMIN_ONLY', message: 'Apostila C32F restrita ao administrador autorizado.' });
      return true;
    }
    const pdfPath = path.join(__dirname, 'private', 'c32f', 'apostila-v6.pdf');
    if (!(await exists(pdfPath))) {
      sendJson(res, 404, { ok: false, code: 'C32F_PDF_NOT_FOUND', message: 'PDF da apostila C32F não encontrado no servidor.' });
      return true;
    }
    const download = url.searchParams.get('download') === '1';
    res.writeHead(200, {
      'content-type': 'application/pdf',
      'content-disposition': `${download ? 'attachment' : 'inline'}; filename="Apostila_C32F_Check_A32F_V6.pdf"`,
      'cache-control': 'private, no-store, max-age=0',
      'x-content-type-options': 'nosniff',
    });
    fs.createReadStream(pdfPath).pipe(res);
    return true;
  }




  if (url.pathname === '/api/flight-status' && req.method === 'GET') {
    try {
      const status = await getFlightStatusSnapshot(url.searchParams);
      sendJson(res, 200, status);
    } catch (error) {
      sendJson(res, 200, { ok: true, status: 'Scheduled', gate: null, terminal: null, source: 'Sem dados online', updatedAt: new Date().toISOString() });
    }
    return true;
  }

  if (url.pathname === '/api/parse-pdf' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req, 35 * 1024 * 1024);
      const parsed = await parsePdfOnServer({ filename: body.filename || 'escala.pdf', dataBase64: body.dataBase64 });
      sendJson(res, 200, { ok: true, ...parsed });
    } catch (err) {
      sendJson(res, 422, { ok: false, message: 'Não consegui interpretar este PDF no servidor.', detail: err?.message || String(err) });
    }
    return true;
  }



  if (url.pathname === '/api/iflight/import' && req.method === 'POST') {
    const user = await requireAuth(req, res);
    if (!user) return true;
    try {
      const body = await readJsonBody(req, 256 * 1024);
      const username = String(body.username || '').trim();
      const password = String(body.password || '');
      const periodMonth = String(body.periodMonth || '').padStart(2, '0');
      const periodYear = String(body.periodYear || '');
      const mfaCode = String(body.mfaCode || '').trim();
      const challengeSessionId = String(body.challengeSessionId || '').trim();
      const step = body.step === 'mfa' ? 'mfa' : 'start';
      sendJson(res, 410, { ok: false, code: 'IFLIGHT_CREDENTIAL_ENDPOINT_DISABLED', message: 'Por LGPD, o CrewCheck não recebe usuário nem senha corporativa. Use a WebView iFlight dentro do app: login/MFA ficam somente no portal oficial e o CrewCheck captura apenas o PDF da escala.' });
      return true;
      if (!username || !password || !/^\d{2}$/.test(periodMonth) || !/^\d{4}$/.test(periodYear)) {
        sendJson(res, 400, { ok: false, message: 'Informe usuário, senha, mês e ano para tentar a importação iFlight.' });
        return true;
      }
      if (step === 'mfa' && !mfaCode) {
        sendJson(res, 400, { ok: false, message: 'Informe o código MFA recebido para continuar.' });
        return true;
      }
      const imported = await importIFlightRoster({ username, password, periodMonth, periodYear, mfaCode, challengeSessionId, step });
      sendJson(res, 200, { ok: true, ...imported });
    } catch (error) {
      sendJson(res, error.statusCode || 500, {
        ok: false,
        code: error.code || 'IFLIGHT_IMPORT_FAILED',
        message: error.message || 'Não foi possível importar a escala do iFlight automaticamente.',
      });
    }
    return true;
  }

  if (url.pathname === '/api/auth/register' && req.method === 'POST') {
    const db = requireDatabase(res);
    if (!db) return true;
    try {
      await ensureSchema();
      const body = await readJsonBody(req, 256 * 1024);
      const email = normalizeEmail(body.email);
      const password = String(body.password || '');
      const confirmPassword = String(body.confirmPassword || '');
      if (!email || !email.includes('@') || password.length < 6 || password !== confirmPassword) {
        sendJson(res, 400, { ok: false, message: 'Informe e-mail válido, senha com pelo menos 6 caracteres e confirmação idêntica.' });
        return true;
      }
      if (isLatamCorporateEmail(email)) {
        sendJson(res, 400, { ok: false, code: 'CORPORATE_EMAIL_NOT_ALLOWED', message: 'Use um e-mail pessoal para criar a conta CrewCheck. O e-mail corporativo @latam.com é permitido somente no login do portal iFlight.' });
        return true;
      }
      const temporaryPassword = generateTemporaryPassword();
      const temporaryExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const name = 'Tripulante';
      const userResult = await db.query(
        `insert into crewcheck_users (id, name, email, password_hash, role, crew_id, base, rank, temp_password_hash, temp_password_expires_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         returning *`,
        [newId(), name, email, hashPassword(password), body.role || 'crew', null, null, null, hashPassword(temporaryPassword), temporaryExpiresAt],
      );
      const user = userResult.rows[0];
      const session = await createSession(db, user, req);
      let emailResult = { ok: false, configured: false };
      try {
        const welcome = buildWelcomeEmail({ email, temporaryPassword });
        emailResult = await sendEmail({ to: email, ...welcome });
      } catch (mailError) {
        emailResult = { ok: false, configured: true, message: mailError.message };
      }
      await db.query('insert into crewcheck_audit_logs (id, user_id, action, metadata) values ($1, $2, $3, $4::jsonb)', [
        newId(),
        user.id,
        'auth.register',
        JSON.stringify({ email, welcomeEmailSent: Boolean(emailResult.ok), tempPasswordExpiresAt: temporaryExpiresAt }),
      ]);
      sendJson(res, 201, { ok: true, user: publicUser(user), token: session.token, expiresAt: session.expiresAt, welcomeEmailSent: Boolean(emailResult.ok), emailStatus: emailResult });
    } catch (error) {
      if (String(error.message || '').includes('duplicate') || error.code === '23505' || error.code === 'ER_DUP_ENTRY') {
        sendJson(res, 409, { ok: false, message: 'Este e-mail já está cadastrado. Faça login.' });
      } else {
        sendJson(res, 500, { ok: false, message: `Não foi possível criar o cadastro. Detalhe técnico: ${error.message || 'erro desconhecido'}`, detail: error.message, code: error.code, db: dbErrorInfo(error) });
      }
    }
    return true;
  }


  if (url.pathname === '/api/auth/request-reset' && req.method === 'POST') {
    const db = requireDatabase(res);
    if (!db) return true;
    try {
      await ensureSchema();
      const body = await readJsonBody(req, 128 * 1024);
      const email = normalizeEmail(body.email);
      if (!email || !email.includes('@')) {
        sendJson(res, 400, { ok: false, message: 'Informe um e-mail válido.' });
        return true;
      }
      const result = await db.query('select * from crewcheck_users where email = $1 and is_active = true limit 1', [email]);
      const user = result.rows[0];
      let emailResult = { ok: false, configured: false };
      if (user) {
        const temporaryPassword = generateTemporaryPassword();
        const temporaryExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        await db.query('update crewcheck_users set temp_password_hash = $1, temp_password_expires_at = $2, updated_at = now() where id = $3', [hashPassword(temporaryPassword), temporaryExpiresAt, user.id]);
        try {
          const mail = buildPasswordResetEmail({ email, temporaryPassword });
          emailResult = await sendEmail({ to: email, ...mail });
        } catch (mailError) {
          emailResult = { ok: false, configured: true, message: mailError.message };
        }
        await db.query('insert into crewcheck_audit_logs (id, user_id, action, metadata) values ($1, $2, $3, $4::jsonb)', [newId(), user.id, 'auth.password_reset.requested', JSON.stringify({ email, emailSent: Boolean(emailResult.ok), tempPasswordExpiresAt: temporaryExpiresAt })]);
      }
      // Resposta neutra para não revelar se o e-mail existe.
      sendJson(res, 200, { ok: true, emailSent: Boolean(emailResult.ok), emailStatus: emailResult });
    } catch (error) {
      sendJson(res, 500, { ok: false, message: 'Não foi possível solicitar recuperação de senha.', detail: error.message, code: error.code, db: dbErrorInfo(error) });
    }
    return true;
  }

  if (url.pathname === '/api/auth/login' && req.method === 'POST') {
    const db = requireDatabase(res);
    if (!db) return true;
    try {
      await ensureSchema();
      const body = await readJsonBody(req, 256 * 1024);
      const email = normalizeEmail(body.email);
      const password = String(body.password || '');
      const result = await db.query('select * from crewcheck_users where email = $1 and is_active = true limit 1', [email]);
      const user = result.rows[0];
      const validMainPassword = user && verifyPassword(password, user.password_hash);
      const validTemporaryPassword = user && canUseTemporaryPassword(password, user);
      if (!user || (!validMainPassword && !validTemporaryPassword)) {
        sendJson(res, 401, { ok: false, message: 'E-mail ou senha inválidos.' });
        return true;
      }
      if (validTemporaryPassword) {
        await db.query('update crewcheck_users set temp_password_hash = null, temp_password_expires_at = null, updated_at = now() where id = $1', [user.id]);
      }
      const session = await createSession(db, user, req);
      sendJson(res, 200, { ok: true, user: publicUser(user), token: session.token, expiresAt: session.expiresAt });
    } catch (error) {
      sendJson(res, 500, { ok: false, message: 'Não foi possível fazer login.', detail: error.message });
    }
    return true;
  }

  if (url.pathname === '/api/auth/me' && req.method === 'GET') {
    const user = await requireAuth(req, res);
    if (!user) return true;
    sendJson(res, 200, { ok: true, user: publicUser(user) || user });
    return true;
  }

  if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
    const db = requireDatabase(res);
    if (!db) return true;
    const token = getBearerToken(req);
    if (token) {
      try {
        await ensureSchema();
        await db.query('delete from crewcheck_sessions where token_hash = $1', [tokenHash(token)]);
      } catch {
        // logout local deve continuar mesmo se o banco falhar
      }
    }
    sendJson(res, 200, { ok: true });
    return true;
  }


  if (url.pathname === '/api/account' && req.method === 'DELETE') {
    const user = await requireAuth(req, res);
    if (!user) return true;
    const db = requireDatabase(res);
    if (!db) return true;
    if (!user.id) {
      sendJson(res, 400, { ok: false, message: 'Modo local/offline não possui conta de servidor para excluir. Limpe os dados do app no dispositivo.' });
      return true;
    }
    try {
      await ensureSchema();
      const userId = user.id;
      const email = user.email || null;
      await db.query('delete from crewcheck_sessions where user_id = $1', [userId]);
      await db.query('delete from crewcheck_rosters where user_id = $1', [userId]);
      await db.query('delete from crewcheck_audit_logs where user_id = $1', [userId]);
      const exists = await db.query('select id from crewcheck_users where id = $1 limit 1', [userId]);
      await db.query('delete from crewcheck_users where id = $1', [userId]);
      const result = { rowCount: exists.rowCount || exists.rows?.length || 0 };
      try {
        const subject = 'Conta CrewCheck excluída';
        const text = `A conta CrewCheck vinculada ao e-mail ${email || ''} foi excluída junto com os dados associados salvos no servidor. Caso você não tenha solicitado esta ação, responda este e-mail.`;
        if (email) await sendEmail({ to: email, subject, text, html: `<p>${escapeHtml(text)}</p>` });
      } catch {
        // A exclusão não deve falhar por indisponibilidade do e-mail transacional.
      }
      sendJson(res, result.rowCount ? 200 : 404, { ok: Boolean(result.rowCount), deleted: Boolean(result.rowCount) });
    } catch (error) {
      sendJson(res, 500, { ok: false, message: 'Não foi possível excluir a conta e os dados.', detail: error.message, code: error.code, db: dbErrorInfo(error) });
    }
    return true;
  }

  if (url.pathname === '/api/db/status') {
    const db = requireDatabase(res);
    if (!db) return true;
    try {
      await ensureSchema();
      const result = DB_KIND === 'mysql'
        ? await db.query(`select now() as now, database() as database_name, current_user() as user_name, @@hostname as server_name, @@port as server_port`)
        : await db.query(`select now() as now, current_database() as database, current_user as user_name,
                inet_server_addr()::text as server_addr, inet_server_port() as server_port`);
      sendJson(res, 200, { ok: true, connected: true, databaseConfigured: Boolean(DATABASE_URL), engine: DB_KIND, ...result.rows[0] });
    } catch (error) {
      sendJson(res, 500, { ok: false, connected: false, databaseConfigured: Boolean(DATABASE_URL), engine: DB_KIND, message: 'Falha ao conectar ou migrar a base de dados.', detail: error.message, code: error.code, db: dbErrorInfo(error) });
    }
    return true;
  }


  if (url.pathname === '/api/stats' && req.method === 'GET') {
    const user = await requireAuth(req, res);
    if (!user) return true;
    const db = requireDatabase(res);
    if (!db) return true;
    try {
      await ensureSchema();
      const personalLimit = Math.min(Math.max(Number(url.searchParams.get('limit') || 60), 1), 120);
      const personalResult = await db.query(
        `select id, created_at, period_year, period_month, roster_json, compliance_json, gym_json, score, intensity_score, alerts_count, critical_alerts_count
           from crewcheck_rosters
          where ($1::uuid is null or user_id = $1)
          order by period_year asc, period_month asc, created_at asc
          limit $2`,
        [user.id || null, personalLimit],
      );
      const globalResult = await db.query(
        `select id, created_at, period_year, period_month, roster_json, compliance_json, gym_json, score, intensity_score, alerts_count, critical_alerts_count
           from crewcheck_rosters
          order by created_at desc
          limit 500`,
        [],
      );
      sendJson(res, 200, {
        ok: true,
        personal: buildStatsFromRosterRows(personalResult.rows, 'personal'),
        global: buildStatsFromRosterRows(globalResult.rows, 'global'),
        notice: 'Comparativo geral agregado e superficial. Não use como prova, documento oficial ou argumento contra empresa/terceiros.',
      });
    } catch (error) {
      sendJson(res, 500, { ok: false, message: 'Não foi possível gerar estatísticas.', detail: error.message, code: error.code, db: dbErrorInfo(error) });
    }
    return true;
  }

  if (url.pathname === '/api/rosters' && req.method === 'GET') {
    const user = await requireAuth(req, res);
    if (!user) return true;
    const db = requireDatabase(res);
    if (!db) return true;
    try {
      await ensureSchema();
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 20), 1), 100);
      const result = await db.query(
        `select id, created_at, updated_at, crew_name, crew_id, base, rank, airline, period_year, period_month,
                source_file_name, score, intensity_score, alerts_count, critical_alerts_count, checksum
           from crewcheck_rosters
          where ($2::uuid is null or user_id = $2)
          order by created_at desc
          limit $1`,
        [limit, user.id || null],
      );
      sendJson(res, 200, { ok: true, rosters: dedupeRosterRowsByPeriod(result.rows).map(summarizeRosterRow) });
    } catch (error) {
      sendJson(res, 500, { ok: false, message: 'Não foi possível listar as escalas salvas.', detail: error.message });
    }
    return true;
  }

  if (url.pathname === '/api/rosters' && req.method === 'POST') {
    const user = await requireAuth(req, res);
    if (!user) return true;
    const db = requireDatabase(res);
    if (!db) return true;
    try {
      await ensureSchema();
      const body = await readJsonBody(req);
      const roster = body.roster;
      if (!roster || !Array.isArray(roster.days)) {
        sendJson(res, 400, { ok: false, message: 'Payload inválido: roster.days é obrigatório.' });
        return true;
      }

      const compliance = body.compliance || null;
      const gym = Array.isArray(body.gym) ? body.gym : [];
      const alerts = Array.isArray(compliance?.alerts) ? compliance.alerts : [];
      const criticalAlerts = alerts.filter((alert) => alert?.severity === 'error');
      const payloadChecksum = body.checksum || checksumPayload({ roster, compliance, gym, sourceFileName: body.sourceFileName || null });

      const existing = await db.query(
        `select id from crewcheck_rosters
          where checksum = $1 and (($2::uuid is null and user_id is null) or user_id = $2)
          limit 1`,
        [payloadChecksum, user.id || null],
      );

      const params = [
        user.id || null,
        roster.crewName || null,
        roster.crewId || null,
        roster.base || null,
        roster.rank || null,
        roster.airline || null,
        Number(roster.year) || null,
        Number(roster.month) || null,
        body.sourceFileName || null,
        JSON.stringify(roster),
        JSON.stringify(compliance),
        JSON.stringify(gym),
        Number(compliance?.score ?? null),
        Number(compliance?.loadAnalysis?.intensityScore ?? null),
        alerts.length,
        criticalAlerts.length,
        payloadChecksum,
      ];

      let result;
      let action = 'roster.created';
      if (existing.rowCount) {
        result = await db.query(
          `update crewcheck_rosters
              set updated_at = now(),
                  user_id = $1,
                  crew_name = $2,
                  crew_id = $3,
                  base = $4,
                  rank = $5,
                  airline = $6,
                  period_year = $7,
                  period_month = $8,
                  source_file_name = $9,
                  roster_json = $10::jsonb,
                  compliance_json = $11::jsonb,
                  gym_json = $12::jsonb,
                  score = $13,
                  intensity_score = $14,
                  alerts_count = $15,
                  critical_alerts_count = $16,
                  checksum = $17
            where id = $18
            returning id, created_at, updated_at, crew_name, crew_id, base, rank, airline, period_year, period_month,
                      source_file_name, score, intensity_score, alerts_count, critical_alerts_count, checksum`,
          [...params, existing.rows[0].id],
        );
        action = 'roster.updated_dedup';
      } else {
        result = await db.query(
          `insert into crewcheck_rosters (
             id, user_id, crew_name, crew_id, base, rank, airline, period_year, period_month, source_file_name,
             roster_json, compliance_json, gym_json, score, intensity_score,
             alerts_count, critical_alerts_count, checksum
           ) values ($18,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13,$14,$15,$16,$17)
           returning id, created_at, updated_at, crew_name, crew_id, base, rank, airline, period_year, period_month,
                     source_file_name, score, intensity_score, alerts_count, critical_alerts_count, checksum`,
          [...params, newId()],
        );
      }

      if (user.id && (roster.crewId || roster.base || roster.rank || roster.crewName)) {
        await db.query(
          `update crewcheck_users
              set crew_id = coalesce(nullif($2, ''), crew_id),
                  base = coalesce(nullif($3, ''), base),
                  rank = coalesce(nullif($4, ''), rank),
                  name = case when $5 is not null and length(trim($5)) > 2 then $5 else name end,
                  updated_at = now()
            where id = $1`,
          [user.id, roster.crewId || null, roster.base || null, roster.rank || null, roster.crewName || null],
        );
      }

      await db.query('insert into crewcheck_audit_logs (id, user_id, action, entity_id, metadata) values ($1, $2, $3, $4, $5::jsonb)', [
        newId(),
        user.id || null,
        action,
        result.rows[0].id,
        JSON.stringify({ sourceFileName: body.sourceFileName || null, alerts: alerts.length, criticalAlerts: criticalAlerts.length, checksum: payloadChecksum }),
      ]);

      sendJson(res, existing.rowCount ? 200 : 201, { ok: true, deduplicated: Boolean(existing.rowCount), roster: summarizeRosterRow(result.rows[0]) });
    } catch (error) {
      const status = error.statusCode || 500;
      sendJson(res, status, { ok: false, message: 'Não foi possível salvar a escala.', detail: error.message });
    }
    return true;
  }

  const rosterMatch = url.pathname.match(/^\/api\/rosters\/([0-9a-f-]{36})$/i);
  if (rosterMatch && req.method === 'GET') {
    const user = await requireAuth(req, res);
    if (!user) return true;
    const db = requireDatabase(res);
    if (!db) return true;
    try {
      await ensureSchema();
      const result = await db.query(
        'select * from crewcheck_rosters where id = $1 and ($2::uuid is null or user_id = $2)',
        [rosterMatch[1], user.id || null],
      );
      if (!result.rowCount) {
        sendJson(res, 404, { ok: false, message: 'Escala não encontrada.' });
        return true;
      }
      const row = result.rows[0];
      sendJson(res, 200, {
        ok: true,
        roster: summarizeRosterRow(row),
        data: {
          roster: row.roster_json,
          compliance: row.compliance_json,
          gym: row.gym_json,
        },
      });
    } catch (error) {
      sendJson(res, 500, { ok: false, message: 'Não foi possível abrir a escala salva.', detail: error.message });
    }
    return true;
  }

  if (rosterMatch && req.method === 'DELETE') {
    const user = await requireAuth(req, res);
    if (!user) return true;
    const db = requireDatabase(res);
    if (!db) return true;
    try {
      await ensureSchema();
      const result = await db.query('delete from crewcheck_rosters where id = $1 and ($2::uuid is null or user_id = $2) returning id', [rosterMatch[1], user.id || null]);
      sendJson(res, result.rowCount ? 200 : 404, { ok: Boolean(result.rowCount) });
    } catch (error) {
      sendJson(res, 500, { ok: false, message: 'Não foi possível apagar a escala.', detail: error.message });
    }
    return true;
  }

  if (url.pathname === '/api/email/share' && req.method === 'POST') {
    const user = await requireAuth(req, res);
    if (!user) return true;
    try {
      const body = await readJsonBody(req, 1024 * 1024);
      const to = normalizeEmail(body.to);
      if (!to || !to.includes('@')) {
        sendJson(res, 400, { ok: false, message: 'Informe um e-mail válido.' });
        return true;
      }
      const subject = String(body.subject || 'Relatório CrewCheck').slice(0, 160);
      const message = String(body.message || 'Segue relatório gerado no CrewCheck.').slice(0, 20_000);
      const html = body.html ? String(body.html).slice(0, 60_000) : `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#092846"><h2>CrewCheck Premium</h2><p>${escapeHtml(message).replace(/\n/g, '<br>')}</p></div>`;
      const result = await sendEmail({ to, subject, text: message, html });
      if (!result.ok) {
        sendJson(res, 501, { ok: false, ...result });
        return true;
      }
      const db = getPool();
      if (db) {
        await ensureSchema();
        await db.query('insert into crewcheck_audit_logs (id, user_id, action, metadata) values ($1, $2, $3, $4::jsonb)', [
          newId(),
          user.id || null,
          'email.sent',
          JSON.stringify({ to, provider: result.provider, subject }),
        ]);
      }
      sendJson(res, 200, { ok: true, provider: result.provider });
    } catch (error) {
      sendJson(res, 500, { ok: false, message: 'Não foi possível enviar o e-mail.', detail: error.message });
    }
    return true;
  }

  return false;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    const feedMatch = url.pathname.match(/^\/calendar-feed\/([A-Za-z0-9_-]{20,})\.ics$/);
    if (feedMatch && req.method === 'GET') {
      const db = getPool();
      let ics = emptyCalendarFeed();
      if (db) {
        try {
          await ensureSchema();
          const result = await db.query('select ics_content from crewcheck_calendar_feeds where token = $1 limit 1', [feedMatch[1]]);
          if (result.rowCount && result.rows[0]?.ics_content) ics = String(result.rows[0].ics_content);
        } catch (error) {
          console.error('calendar feed error:', error.message);
        }
      }
      res.writeHead(200, {
        'content-type': 'text/calendar; charset=utf-8',
        'cache-control': 'no-store, max-age=0',
        'content-disposition': 'inline; filename="crewcheck.ics"',
      });
      res.end(ics.replace(/\r?\n/g, '\r\n'));
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      const handled = await handleApi(req, res, url);
      if (!handled) sendJson(res, 404, { ok: false, message: 'API endpoint não encontrado.' });
      return;
    }

    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, app: 'CrewCheck', databaseConfigured: Boolean(DATABASE_URL), authRequired: AUTH_REQUIRED }));
      return;
    }

    let filePath = safeJoin(distDir, url.pathname);
    if (!filePath) {
      res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Bad request');
      return;
    }

    const hasExtension = path.extname(filePath).length > 0;
    if (!(await exists(filePath))) {
      if (!hasExtension || req.headers.accept?.includes('text/html')) {
        filePath = path.join(distDir, 'index.html');
      }
    }

    if (!(await exists(filePath))) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Build não encontrado. Execute yarn build antes de iniciar.');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const headers = {
      'content-type': mimeTypes.get(ext) || 'application/octet-stream',
      'cache-control': ['.html', '.js', '.css', '.json', '.map'].includes(ext) ? 'no-store, max-age=0, must-revalidate' : 'public, max-age=86400',
    };
    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error(error);
    const wantsJson = req.url?.startsWith('/api/');
    if (wantsJson) {
      sendJson(res, 500, { ok: false, message: 'Erro interno no servidor.', detail: error.message });
      return;
    }
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Erro interno no servidor.');
  }
});

server.listen(port, '0.0.0.0', async () => {
  console.log(`CrewCheck server running on http://0.0.0.0:${port}`);
  console.log(DATABASE_URL ? 'Database: configured' : 'Database: DATABASE_URL not configured');
  console.log(`Auth required: ${AUTH_REQUIRED}`);
  if (DATABASE_URL && AUTO_MIGRATE) {
    try {
      await ensureSchema();
      console.log('Database schema ready.');
    } catch (error) {
      console.error('Database schema error:', error.message);
    }
  }
});

process.on('SIGTERM', async () => {
  if (pool) await pool.end();
  server.close(() => process.exit(0));
});

// --- CrewCheck RC3.1 ultra-precise parser overrides ---
parseServerAims = function(fullText, pages) {
  const h = parseServerHeader(fullText);
  const blocks = buildAimsTextBlocksPrecise(fullText, h.month, h.year);
  const days = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.month !== h.month || block.year !== h.year) continue;
    const next = blocks[i + 1];
    days.push(...parseAimsTokensIntoEventsV3(block.tokens, block.day, block.month, block.year, h.base, next?.tokens || []));
  }
  return { ...h, days, rawText: fullText, totals: extractTotals(fullText) };
};

parseCrewRosterBlockV3 = function(dayNumber, month, year, base, blockText) {
  const raw = cleanRosterLineV3(blockText);
  const upper = raw.toUpperCase();
  const events = [];
  const restMatch = upper.match(/\b(DOPR|DOP|DOF|DO|DR|OFF|VC)\b/);
  const activityMatches = [...upper.matchAll(/\b(HSBE|HSB|ASB|CBF|EMER|C\d{2,3}F|MT|CRM|NSJ|NS|IJ|DM)\b/g)].map((m) => ({ code: m[1], index: m.index || 0 }));
  const seen = new Set();
  for (const item of activityMatches) {
    const key = item.code + ':' + item.index;
    if (seen.has(key)) continue;
    seen.add(key);
    const d = makeDay(dayNumber, month, year, base);
    d.rawText = raw;
    d.pairingCode = normalizeActivityCodePrecise(item.code, raw);
    d.type = activityTypeFromCodePrecise(d.pairingCode);
    const window = pickDutyWindowForCodeV3(raw, item.code);
    d.dutyReport = window.start;
    d.dutyDebrief = window.end;
    d.dutyHours = window.start && window.end ? diffHours(window.start, window.end) : null;
    d.flyingHours = 0;
    events.push(d);
  }
  if (/\bLA\s?\d{3,4}\b/i.test(raw)) {
    const flightDay = makeDay(dayNumber, month, year, base);
    flightDay.rawText = raw;
    parseFlightsFromRosterTextV3(flightDay, raw);
    if (flightDay.legs.length) events.push(flightDay);
  }
  if (!events.length && restMatch) {
    const d = makeDay(dayNumber, month, year, base);
    d.rawText = raw; d.type = restMatch[1]; d.pairingCode = restMatch[1]; d.dutyHours = 0; d.flyingHours = 0;
    events.push(d);
  }
  if (!events.length && raw) { const d = makeDay(dayNumber, month, year, base); d.rawText = raw; events.push(d); }
  return events;
};

pickDutyWindowForCodeV3 = function(text, code) {
  const upper = String(text || '').toUpperCase();
  const codeIndex = Math.max(0, upper.indexOf(String(code || '').toUpperCase()));
  const fragment = codeIndex >= 0 ? text.slice(codeIndex, codeIndex + 220) : text;
  return pickActivityWindowFromTokensPrecise(fragment.split(/\s+/));
};

parseFlightsFromRosterTextV3 = function(day, text) {
  const normalized = cleanRosterLineV3(text);
  const strictRe = /\b(LA\s?\d{3,4})\b\s+(?:(?:CC|CP|FO|CM|CMT|CMD)\s+)?(?:(OP|PS|DH)\s+)?([A-Z]{3})\s+(\d{1,2}:\d{2}(?:\(\+1\))?)\s+([A-Z]{3})\s+(\d{1,2}:\d{2}(?:\(\+1\))?)/gi;
  let match;
  const parsed = [];
  while ((match = strictRe.exec(normalized)) !== null) {
    const flightNumber = match[1].replace(/\s+/g, '');
    const workType = (match[2] || inferWorkTypePrecise(normalized, match.index) || 'OP').toUpperCase();
    const origin = match[3].toUpperCase();
    const departureTime = normalizeTimeToken(match[4]);
    const destination = match[5].toUpperCase();
    const arrivalTimeRaw = normalizeTimeToken(match[6]);
    if (origin === destination) continue;
    const arrivalTime = arrivalTimeRaw.replace('(+1)', '');
    const after = normalized.slice(strictRe.lastIndex, strictRe.lastIndex + 70);
    const afterTimes = uniqueTimesV3([...after.matchAll(/\b\d{1,2}:\d{2}(?:\(\+1\))?\b/g)].map((m) => normalizeTimeToken(m[0])));
    const debriefCandidate = afterTimes.find((t) => !looksLikeDurationV3(t) && diffHours(arrivalTimeRaw, t) <= 3.5) || null;
    const aircraftType = findAircraftAfter(normalized, match.index) || undefined;
    parsed.push({ flightNumber, workType, origin, departureTime, destination, arrivalTime, arrivalTimeRaw, debriefCandidate, aircraftType, isNextDay:/\(\+1\)/.test(arrivalTimeRaw)||toMin(arrivalTimeRaw)<toMin(departureTime) });
  }
  for (const leg of parsed) {
    if (!day.legs.some((old) => old.flightNumber === leg.flightNumber && old.origin === leg.origin && old.departureTime === leg.departureTime)) {
      day.legs.push({ flightNumber: leg.flightNumber, origin: leg.origin, destination: leg.destination, departureTime: leg.departureTime, arrivalTime: leg.arrivalTime, workType: leg.workType, aircraftType: leg.aircraftType, isNextDay: leg.isNextDay, duration: diffHours(leg.departureTime, leg.arrivalTimeRaw) });
    }
  }
  if (!day.legs.length) {
    const flightRe = /\b(LA\s?\d{3,4}|LA\d{3,4})\b([\s\S]*?)(?=\bLA\s?\d{3,4}\b|$)/gi;
    let generic;
    while ((generic = flightRe.exec(normalized)) !== null) {
      const leg = parseRosterFlightSegmentV3(generic[1].replace(/\s+/g, ''), generic[2] || '');
      if (leg && leg.origin !== leg.destination && !day.legs.some((old) => old.flightNumber === leg.flightNumber && old.origin === leg.origin && old.departureTime === leg.departureTime)) day.legs.push(leg);
    }
  }
  if (day.legs.length) {
    day.type = 'VOO';
    day.pairingCode = day.legs[0].flightNumber;
    const firstLeg = day.legs[0];
    const firstIdx = normalized.indexOf(firstLeg.flightNumber);
    const beforeFirst = firstIdx > 0 ? normalized.slice(0, firstIdx) : normalized;
    day.dutyReport = [...beforeFirst.matchAll(/\b\d{1,2}:\d{2}\b/g)].map((m) => normalizeTimeToken(m[0])).at(-1) || firstLeg.departureTime;
    const last = day.legs.at(-1);
    const lastParsed = parsed.find((leg) => leg.flightNumber === last.flightNumber && leg.departureTime === last.departureTime);
    day.dutyDebrief = lastParsed?.debriefCandidate?.replace('(+1)', '') || addMinutesServerPrecise(last.arrivalTime, 30);
    day.isNextDay = day.legs.some((leg) => leg.isNextDay) || diffHours(day.dutyReport, day.dutyDebrief) > 18;
    day.flyingHours = day.legs.reduce((sum, leg) => sum + (leg.duration || diffHours(leg.departureTime, leg.arrivalTime)), 0);
    day.dutyHours = diffHours(day.dutyReport, day.dutyDebrief);
  }
};

parseRosterFlightSegmentV3 = function(flightNumber, segment) {
  const tokens = String(segment || '').split(/\s+/).filter(Boolean);
  let workType = 'OP'; let aircraftType = undefined;
  for (const token of tokens) { const upper = token.toUpperCase(); if (['OP','PS','DH'].includes(upper)) workType = upper; if (/^(32S|31R|39R|328|319|320|321|32N)$/.test(upper)) aircraftType = upper; }
  const pattern = findBestFlightPatternV3(tokens);
  if (!pattern || pattern.origin === pattern.destination) return null;
  const { origin, destination, departureTime, arrivalTime } = pattern;
  return { flightNumber, origin, destination, departureTime, arrivalTime: normalizeTimeToken(arrivalTime).replace('(+1)',''), workType, aircraftType, isNextDay:/\(\+1\)/.test(arrivalTime)||toMin(arrivalTime)<toMin(departureTime), duration: diffHours(departureTime, arrivalTime) };
};

findBestFlightPatternV3 = function(tokens) {
  const upper = tokens.map((token) => String(token || '').toUpperCase());
  const candidates = [];
  for (let i = 0; i < upper.length; i++) {
    if (!AIRPORTS.has(upper[i])) continue;
    const origin = upper[i];
    for (let j = Math.max(0, i - 3); j < Math.min(upper.length, i + 3); j++) {
      if (!isTimeToken(tokens[j]) || Math.abs(j - i) > 2) continue;
      const departureTime = normalizeTimeToken(tokens[j]);
      for (let k = i + 1; k < Math.min(upper.length, i + 8); k++) {
        if (!AIRPORTS.has(upper[k]) || upper[k] === origin) continue;
        for (let l = k + 1; l < Math.min(upper.length, k + 5); l++) {
          if (!isTimeToken(tokens[l])) continue;
          const arrivalTime = normalizeTimeToken(tokens[l]);
          const duration = diffHours(departureTime, arrivalTime);
          if (duration < 0.25 || duration > 8) continue;
          candidates.push({ origin, destination: upper[k], departureTime, arrivalTime, score: 200 - Math.abs(duration - 1.8) * 4 - Math.abs(j - i) * 8 - (k - i) * 2 - (l - k) });
        }
      }
    }
  }
  candidates.sort((a,b)=>b.score-a.score);
  return candidates[0] || null;
};

parseAimsTokensIntoEventsV3 = function(tokens, dayNum, month, year, base, nextTokens = []) {
  const normalized = tokens.map((token) => String(token || '').trim()).filter(Boolean);
  const upperTokens = normalized.map((token) => token.toUpperCase());
  const events = [];
  const activityPositions = [];
  for (let i = 0; i < upperTokens.length; i++) {
    let token = upperTokens[i];
    if (token === 'CRMB') token = 'CRM';
    if (['HSB','HSBE','ASB','CBF','EMER','MT','CRM','NS','NSJ','IJ','DM'].includes(token) || /^C\d{2,3}F$/.test(token)) activityPositions.push({ code: token, index: i });
  }
  for (let pos = 0; pos < activityPositions.length; pos++) {
    const { code, index } = activityPositions[pos];
    const nextIdxCandidate = activityPositions[pos + 1]?.index ?? upperTokens.findIndex((t, idx) => idx > index && t === 'LA');
    const slice = normalized.slice(index, nextIdxCandidate > index ? nextIdxCandidate : normalized.length);
    const d = makeDay(dayNum, month, year, base);
    d.rawText = normalized.join(' ');
    d.pairingCode = normalizeActivityCodePrecise(code, d.rawText);
    d.type = activityTypeFromCodePrecise(d.pairingCode);
    const window = pickActivityWindowFromTokensPrecise(slice);
    d.dutyReport = window.start; d.dutyDebrief = window.end; d.dutyHours = window.start && window.end ? diffHours(window.start, window.end) : null; d.flyingHours = 0;
    events.push(d);
  }
  const flightDay = makeDay(dayNum, month, year, base);
  flightDay.rawText = normalized.join(' ');
  for (let i = 0; i < upperTokens.length; i++) {
    if (upperTokens[i] === 'LA' && /^\d{3,4}$/.test(upperTokens[i+1] || '')) {
      const nextLa = upperTokens.findIndex((token, idx) => idx > i + 1 && token === 'LA');
      let seq = normalized.slice(i + 2, nextLa > 0 ? nextLa : normalized.length);
      if (seq.some((t) => String(t).startsWith('(...)')) && !hasCompleteLegTokensPrecise(seq)) seq = seq.concat(nextDayContinuationPrefixPrecise(nextTokens));
      const leg = parseAimsFlightSeq('LA' + upperTokens[i+1], seq);
      if (leg && leg.origin !== leg.destination && !flightDay.legs.some((old) => old.flightNumber === leg.flightNumber && old.origin === leg.origin && old.departureTime === leg.departureTime)) flightDay.legs.push(leg);
    }
  }
  if (flightDay.legs.length) {
    flightDay.type = 'VOO'; flightDay.pairingCode = flightDay.legs[0].flightNumber;
    const firstLaIndex = upperTokens.findIndex((t)=>t==='LA'); const firstOrigin = flightDay.legs[0].origin; const firstOriginIdx = upperTokens.findIndex((t,idx)=>idx>=firstLaIndex+2 && t===firstOrigin);
    const timesBeforeOrigin = normalized.slice(firstLaIndex+2, firstOriginIdx > 0 ? firstOriginIdx : firstLaIndex+2).filter(isTimeToken).map(normalizeTimeToken);
    flightDay.dutyReport = timesBeforeOrigin.length >= 2 ? timesBeforeOrigin[0] : (timesBeforeOrigin[0] || flightDay.legs[0].departureTime);
    flightDay.dutyDebrief = inferAimsDebriefPrecise(normalized, flightDay.legs.at(-1), nextTokens) || addMinutesServerPrecise(flightDay.legs.at(-1).arrivalTime, 30);
    flightDay.isNextDay = flightDay.legs.some((leg)=>leg.isNextDay) || diffHours(flightDay.dutyReport, flightDay.dutyDebrief) > 18;
    flightDay.flyingHours = flightDay.legs.reduce((sum, leg)=>sum+(leg.duration || diffHours(leg.departureTime, leg.arrivalTime)),0);
    flightDay.dutyHours = diffHours(flightDay.dutyReport, flightDay.dutyDebrief);
    events.push(flightDay);
  }
  if (!events.length) {
    const rest = upperTokens.join(' ').match(/\b(DOPR|DOP|DOF|DO|DR|OFF|VC)\b/);
    if (rest) { const d = makeDay(dayNum, month, year, base); d.rawText = normalized.join(' '); d.type = rest[1]; d.pairingCode = rest[1]; d.dutyHours=0; d.flyingHours=0; events.push(d); }
  }
  return events.length ? events : [makeDay(dayNum, month, year, base)];
};

parseAimsFlightSeq = function(flightNumber, seq) {
  const tokens = seq.map((t)=>String(t||'').trim()).filter(Boolean).filter((t)=>t !== '[extra]');
  const upper = tokens.map((t)=>t.toUpperCase());
  const firstAirportIdx = upper.findIndex((t)=>AIRPORTS.has(t));
  if (firstAirportIdx < 0) return null;
  const origin = upper[firstAirportIdx];
  const beforeOriginTimes = tokens.slice(0, firstAirportIdx).filter(isTimeToken).map(normalizeTimeToken);
  const departureTime = beforeOriginTimes.at(-1); if (!departureTime) return null;
  let destIdx = -1;
  for (let i = firstAirportIdx + 1; i < upper.length; i++) if (AIRPORTS.has(upper[i]) && upper[i] !== origin) { destIdx = i; break; }
  if (destIdx < 0) return null;
  const destination = upper[destIdx];
  const afterDestTimes = tokens.slice(destIdx + 1).filter(isTimeToken).map(normalizeTimeToken);
  const arrivalTime = afterDestTimes[0]; if (!arrivalTime) return null;
  const aircraft = upper.find((token)=>/^\([A-Z0-9]{3}\)$/.test(token))?.replace(/[()]/g,'') || upper.find((token)=>/^(32S|31R|39R|328|319|320|321|32N)$/.test(token)) || undefined;
  return { flightNumber, origin, destination, departureTime, arrivalTime: arrivalTime.replace('(+1)',''), workType:'OP', aircraftType: aircraft, isNextDay:/\(\+1\)/.test(arrivalTime) || toMin(arrivalTime) < toMin(departureTime), duration: diffHours(departureTime, arrivalTime) };
};

function buildAimsTextBlocksPrecise(fullText, baseMonth, baseYear) {
  const stopAtCrew = fullText.split(/\n\s*Tripulações\s*\n/i)[0];
  const lines = stopAtCrew.split(/\n+/).map((line)=>String(line||'').trim()).filter(Boolean).filter((line)=>!/^(Confira na escala|Escala de Tripulante|Tripulante:|Timezone)/i.test(line));
  const blocks = []; let current = null;
  for (const line of lines) {
    const marker = parseAimsDateMarkerServer(line, baseMonth, baseYear);
    if (marker) { if (current) blocks.push(current); current = { day: marker.day, month: marker.month, year: marker.year, tokens: [] }; continue; }
    if (!current) continue;
    for (const token of line.split(/\s+/).map((t)=>t.trim()).filter(Boolean)) if (!ignoreAimsTokenServer(token)) current.tokens.push(token);
  }
  if (current) blocks.push(current);
  return blocks;
}
function normalizeActivityCodePrecise(code, raw='') { const c=String(code||'').toUpperCase(); if (c === 'CRMB' || /\bCRMB\s*SB\b/i.test(raw)) return 'CRM'; return c; }
function activityTypeFromCodePrecise(code) { const c=normalizeActivityCodePrecise(code); if (c==='ASB'||c==='HSB'||c==='HSBE') return c; if (c==='CRM'||/^C\d{2,3}F$/.test(c)||c==='CBF'||c==='EMER') return 'CRM'; return 'OTHER'; }
function pickActivityWindowFromTokensPrecise(tokens) { const cleaned=tokens.map((t)=>String(t||'').trim()).filter(Boolean); const stationTimes=[]; for(let i=0;i<cleaned.length-1;i++){ if(AIRPORTS.has(cleaned[i].toUpperCase()) && isTimeToken(cleaned[i+1])) stationTimes.push(normalizeTimeToken(cleaned[i+1])); } const stationUnique=uniqueTimesV3(stationTimes).filter((t)=>!looksLikeDurationV3(t)); if(stationUnique.length>=2) return {start:stationUnique[0], end:stationUnique[stationUnique.length-1]}; const allTimes=uniqueTimesV3(cleaned.filter(isTimeToken).map(normalizeTimeToken)).filter((t)=>!looksLikeDurationV3(t)); if(!allTimes.length) return {start:null,end:null}; const start=allTimes[0]; let end=allTimes[1]||allTimes[0]; for(const t of allTimes.slice(1)){ const h=diffHours(start,t); if(h>=0.25 && h<=14) end=t; } return {start,end}; }
function hasCompleteLegTokensPrecise(tokens) { const upper=tokens.map((t)=>String(t).toUpperCase()); const airports=upper.filter((t)=>AIRPORTS.has(t)); const times=tokens.filter(isTimeToken); return airports.length >= 2 && airports.some((a)=>a !== airports[0]) && times.length >= 2; }
function nextDayContinuationPrefixPrecise(tokens) { const prefix=[]; const operational=new Set(['LA','DOPR','DOP','DOPR','DOP','DO','DOF','DR','OFF','VC','VC','HSB','HSBE','ASB','CBF','EMER','MT','CRM','CRMB','NS','NSJ','IJ','DM']); for(const token of tokens||[]){ const upper=String(token).toUpperCase(); if(prefix.length && operational.has(upper)) break; prefix.push(token); if(/^\([A-Z0-9]{3}\)$/.test(upper)) break; } return prefix; }
function inferAimsDebriefPrecise(tokens,lastLeg,nextTokens=[]) { if(!lastLeg) return null; const upper=tokens.map((t)=>String(t).toUpperCase()); let destIdx=-1; for(let i=upper.length-1;i>=0;i--) if(upper[i]===lastLeg.destination){ destIdx=i; break; } let after=destIdx>=0?tokens.slice(destIdx+1):[]; if(after.length<2 && nextTokens?.length) after=after.concat(nextDayContinuationPrefixPrecise(nextTokens)); const times=after.filter(isTimeToken).map(normalizeTimeToken); return times[1] || times[0] || null; }
function inferWorkTypePrecise(text, idx) { const near=String(text||'').slice(Math.max(0,idx-20), idx+35).toUpperCase(); return near.match(/\b(OP|PS|DH)\b/)?.[1] || null; }
function addMinutesServerPrecise(time, minutes) { const base=toMin(time)+minutes; const h=Math.floor((base%1440)/60); const m=base%60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`; }
// --- end CrewCheck RC3.1 ultra-precise parser overrides ---

// --- CrewCheck RC5 parser servidor obrigatório + APK/filechooser safe ---
parsePdfOnServer = async function parsePdfOnServerRC5({ filename, dataBase64 }) {
  if (!dataBase64 || typeof dataBase64 !== 'string') throw new Error('PDF não recebido pelo servidor.');
  const bytes = Buffer.from(dataBase64, 'base64');
  if (!bytes.length) throw new Error('PDF vazio.');
  const candidates = [];

  // 1) pdf-parse tends to produce a text stream close to pdftotext and is a
  // useful fallback for mobile PDFs when browser/PDF.js item positions vary.
  try {
    const mod = await import('pdf-parse');
    const pdfParse = mod.default || mod;
    const out = await pdfParse(bytes);
    if (out?.text && out.text.trim().length > 80) candidates.push({ source: 'pdf-parse', text: out.text });
  } catch (error) {
    console.warn('RC5 pdf-parse fallback unavailable:', error?.message || error);
  }

  // 2) PDF.js extraction with visual row grouping.
  try {
    const pdfjsImport = await import('pdfjs-dist/legacy/build/pdf.js');
    const pdfjs = pdfjsImport.default || pdfjsImport;
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), disableWorker: true, isEvalSupported: false, disableFontFace: true }).promise;
    const pages = [];
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
      const page = await pdf.getPage(pageNo);
      const tc = await page.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false });
      const items = tc.items.map((it) => ({
        str: String(it.str || '').trim(),
        x: Number(it.transform?.[4] || 0),
        y: Number(it.transform?.[5] || 0),
        page: pageNo,
      })).filter((it) => it.str);
      pages.push({ pageNo, items });
    }
    const visual = buildServerFullText(pages);
    const linear = pages.map((p) => p.items.map((i) => i.str).join('\n')).join('\n');
    if (visual.trim().length > 80) candidates.push({ source: 'pdfjs-visual', text: visual, pages });
    if (linear.trim().length > 80) candidates.push({ source: 'pdfjs-linear', text: linear, pages });
  } catch (error) {
    console.warn('RC5 pdfjs extraction unavailable:', error?.message || error);
  }

  const tried = [];
  for (const candidate of uniqueTextCandidatesRC5(candidates)) {
    try {
      const roster = parseCrewCheckTextRC5(candidate.text, filename, candidate.pages);
      roster.rawText = candidate.text;
      roster.days = finalizeServerDays(roster.days, roster.month, roster.year, roster.base);
      const diagnostics = buildParseDiagnosticsRC5(roster, candidate.source);
      if (diagnostics.confidence === 'baixa' || diagnostics.uniqueDays < 8 || diagnostics.totalEvents < 8) {
        tried.push(`${candidate.source}: leitura insuficiente (${diagnostics.uniqueDays} dias, ${diagnostics.totalEvents} eventos)`);
        continue;
      }
      return { roster, diagnostics };
    } catch (error) {
      tried.push(`${candidate.source}: ${error?.message || error}`);
    }
  }
  throw new Error(`Parser servidor não conseguiu validar a escala. Tentativas: ${tried.join(' | ') || 'nenhuma extração de texto útil'}`);
};

function uniqueTextCandidatesRC5(candidates) {
  const seen = new Set();
  const out = [];
  for (const candidate of candidates) {
    const key = String(candidate.text || '').slice(0, 1200).replace(/\s+/g, ' ');
    if (!seen.has(key)) { seen.add(key); out.push(candidate); }
  }
  return out;
}

function parseCrewCheckTextRC5(fullText, filename = '', pages = null) {
  const text = normalizePdfTextRC5(fullText);
  const isAims = /Escala de Tripulante Convertida para padr/i.test(text) || /Tripulante:\s*.+?BP:/i.test(text);
  if (isAims) return parseAimsTextRC5(text, filename);
  if (/Roster\s+Report/i.test(text) || /CrewRosterReport/i.test(filename || '')) return parseRosterReportTextRC5(text, filename);
  // Last chance: try both and keep the most complete one.
  const attempts = [];
  try { attempts.push(parseRosterReportTextRC5(text, filename)); } catch {}
  try { attempts.push(parseAimsTextRC5(text, filename)); } catch {}
  attempts.sort((a, b) => (b.days?.length || 0) - (a.days?.length || 0));
  if (attempts[0]?.days?.length) return attempts[0];
  throw new Error('Formato não reconhecido como CrewRosterReport ou AIMS.');
}

function normalizePdfTextRC5(value) {
  return String(value || '')
    .replace(/\u000c/g, '\n')
    .replace(/\uFFFE/g, ' ')
    .replace(/[\t\r]+/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n[ ]+/g, '\n')
    .trim();
}

function parseRosterReportTextRC5(fullText, filename = '') {
  const h = parseServerHeader(fullText, filename);
  const blocks = buildRosterBlocksRC5(fullText);
  const days = [];
  for (const block of blocks) {
    const month = monthNameToNum(block.monthToken) || h.month;
    const year = Number(block.yearToken) || h.year;
    const parsed = parseRosterBlockRC5(Number(block.dayToken), month, year, h.base, block.lines.join(' '));
    days.push(...parsed);
  }
  if (!days.length) throw new Error('Nenhum dia de escala encontrado no CrewRosterReport.');
  return { ...h, days, rawText: fullText, totals: extractTotals(fullText) };
}

function buildRosterBlocksRC5(fullText) {
  const lines = fullText.split(/\n+/).map(cleanRosterLineRC5).filter(Boolean);
  const blocks = [];
  let current = null;
  const dateRe = /^(\d{2})-([A-Za-z]{3})-(\d{4})\b\s*(.*)$/;
  for (const line of lines) {
    if (/^(Roster Report|Date\b|Duty\b|Report\b|Pairing\/Activity|Updated By|Updated Date|A\/C\b|Type\b|Overridde)/i.test(line)) continue;
    const match = line.match(dateRe);
    if (match) {
      if (current) blocks.push(current);
      current = { dayToken: match[1], monthToken: match[2], yearToken: match[3], lines: [match[4] || ''] };
      continue;
    }
    if (current && isUsefulRosterContinuationRC5(line)) current.lines.push(line);
  }
  if (current) blocks.push(current);
  return blocks;
}

function cleanRosterLineRC5(line) {
  return String(line || '')
    .replace(/\b\d{2}-[A-Za-z]{3}-\d{4}\s+\d{2}\.\d{2}\b/g, ' ')
    .replace(/\b(SCHEDULER|msgsys|AIRCOM_SQS|\d{6,})\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isUsefulRosterContinuationRC5(line) {
  return /\b(LA\s?\d{3,4}|DOPR|DOP|DOF?|DR|OFF|VC|HSBE?|ASB|CBF|EMER|MT|CRM|CRMB|CRMBSB|C\d{2,3}F|NSJ?|IJ|DM|SAER|[A-Z]{3}\s+\d{1,2}:\d{2}|\d{1,2}:\d{2}\(\+1\))\b/i.test(line);
}

function parseRosterBlockRC5(dayNumber, month, year, base, blockText) {
  const raw = cleanRosterLineRC5(blockText);
  const upper = raw.toUpperCase();
  const events = [];
  const activityRe = /\b(HSBE|HSB|ASB|CBF|EMER|C\d{2,3}F|CRMBSB|CRMB|CRM|MT|NSJ|NS|IJ|DM|SAER)\b/g;
  let act;
  while ((act = activityRe.exec(upper)) !== null) {
    const code = normalizeActivityCodeRC5(act[1]);
    const d = makeDay(dayNumber, month, year, base);
    d.rawText = raw;
    d.pairingCode = code;
    d.type = activityTypeFromCodeRC5(code);
    const window = pickActivityWindowRC5(raw.slice(Math.max(0, act.index), act.index + 240), code);
    d.dutyReport = window.start;
    d.dutyDebrief = window.end;
    d.dutyHours = window.start && window.end ? diffHours(window.start, window.end) : null;
    d.flyingHours = 0;
    if (!events.some((e) => e.pairingCode === d.pairingCode && e.dutyReport === d.dutyReport && e.dutyDebrief === d.dutyDebrief)) events.push(d);
  }

  const flightDay = makeDay(dayNumber, month, year, base);
  flightDay.rawText = raw;
  parseFlightsFromTextRC5(flightDay, raw);
  if (flightDay.legs.length) events.push(flightDay);

  if (!events.length) {
    const rest = upper.match(/\b(DOPR|DOP|DOF|DO|DR|OFF|VC)\b/);
    if (rest) {
      const d = makeDay(dayNumber, month, year, base);
      d.rawText = raw; d.type = rest[1]; d.pairingCode = rest[1]; d.dutyHours = 0; d.flyingHours = 0; events.push(d);
    }
  }
  return events;
}

function parseFlightsFromTextRC5(day, text) {
  const source = cleanRosterLineRC5(text);
  const strict = /\b(LA\s?\d{3,4})\b\s+(?:(?:CC|CP|FO|CM|CMT|CMD)\s+)?(?:(OP|PS|DH)\s+)?([A-Z]{3})\s+(\d{1,2}:\d{2}(?:\(\+1\))?)\s+([A-Z]{3})\s+(\d{1,2}:\d{2}(?:\(\+1\))?)/gi;
  let m;
  while ((m = strict.exec(source)) !== null) {
    const leg = makeLegRC5(m[1], m[3], m[5], m[4], m[6], m[2] || inferWorkTypePrecise(source, m.index) || 'OP', findAircraftAfter(source, m.index));
    addLegIfGoodRC5(day, leg);
  }
  if (!day.legs.length) {
    const re = /\b(LA\s?\d{3,4}|LA\d{3,4})\b([\s\S]*?)(?=\bLA\s?\d{3,4}\b|$)/gi;
    let seg;
    while ((seg = re.exec(source)) !== null) {
      const leg = parseGenericFlightSegmentRC5(seg[1], seg[2] || '');
      addLegIfGoodRC5(day, leg);
    }
  }
  if (day.legs.length) {
    day.type = 'VOO';
    day.pairingCode = day.legs[0].flightNumber;
    const firstIdx = source.indexOf(day.legs[0].flightNumber);
    const beforeFirst = firstIdx >= 0 ? source.slice(0, firstIdx) : source;
    day.dutyReport = [...beforeFirst.matchAll(/\b\d{1,2}:\d{2}\b/g)].map((x) => normalizeTimeToken(x[0])).at(-1) || day.legs[0].departureTime;
    const last = day.legs.at(-1);
    const afterLast = source.slice(Math.max(0, source.lastIndexOf(last.arrivalTime)));
    const timesAfter = [...afterLast.matchAll(/\b\d{1,2}:\d{2}(?:\(\+1\))?\b/g)].map((x) => normalizeTimeToken(x[0])).filter((t) => !looksLikeDurationV3(t));
    day.dutyDebrief = (timesAfter.find((t) => diffHours(last.arrivalTime, t) > 0 && diffHours(last.arrivalTime, t) <= 3.5) || addMinutesServerPrecise(last.arrivalTime, 30)).replace('(+1)', '');
    day.isNextDay = day.legs.some((leg) => leg.isNextDay) || diffHours(day.dutyReport, day.dutyDebrief) > 18;
    day.flyingHours = day.legs.reduce((sum, leg) => sum + (leg.duration || diffHours(leg.departureTime, leg.arrivalTime)), 0);
    day.dutyHours = diffHours(day.dutyReport, day.dutyDebrief);
  }
}

function parseGenericFlightSegmentRC5(flightNumber, segment) {
  const tokens = String(segment || '').split(/\s+/).filter(Boolean);
  let workType = 'OP'; let aircraftType = undefined;
  for (const token of tokens) {
    const u = String(token).toUpperCase();
    if (['OP','PS','DH'].includes(u)) workType = u;
    if (/^(32S|31R|39R|328|319|320|321|32N)$/.test(u)) aircraftType = u;
  }
  const pattern = findBestFlightPatternRC5(tokens);
  if (!pattern) return null;
  return makeLegRC5(flightNumber, pattern.origin, pattern.destination, pattern.departureTime, pattern.arrivalTime, workType, aircraftType);
}

function findBestFlightPatternRC5(tokens) {
  const upper = tokens.map((t) => String(t).toUpperCase());
  const candidates = [];
  for (let i = 0; i < upper.length; i++) {
    if (!AIRPORTS.has(upper[i])) continue;
    const origin = upper[i];
    const depCandidates = [];
    for (let j = Math.max(0, i - 3); j <= Math.min(upper.length - 1, i + 2); j++) if (isTimeToken(tokens[j])) depCandidates.push(j);
    for (const j of depCandidates) {
      const departureTime = normalizeTimeToken(tokens[j]);
      for (let k = i + 1; k < Math.min(upper.length, i + 9); k++) {
        if (!AIRPORTS.has(upper[k]) || upper[k] === origin) continue;
        for (let l = k + 1; l < Math.min(upper.length, k + 5); l++) {
          if (!isTimeToken(tokens[l])) continue;
          const arrivalTime = normalizeTimeToken(tokens[l]);
          const dur = diffHours(departureTime, arrivalTime);
          if (dur < 0.25 || dur > 8) continue;
          candidates.push({ origin, destination: upper[k], departureTime, arrivalTime, score: 100 - Math.abs(dur - 1.8) * 5 - Math.abs(j - i) * 6 - (k - i) * 2 });
        }
      }
    }
  }
  candidates.sort((a,b)=>b.score-a.score);
  return candidates[0] || null;
}

function makeLegRC5(flightNumber, origin, destination, departureTime, arrivalTime, workType = 'OP', aircraftType) {
  const cleanOrigin = String(origin || '').toUpperCase();
  const cleanDestination = String(destination || '').toUpperCase();
  const dep = normalizeTimeToken(departureTime);
  const arrRaw = normalizeTimeToken(arrivalTime);
  if (!AIRPORTS.has(cleanOrigin) || !AIRPORTS.has(cleanDestination) || cleanOrigin === cleanDestination) return null;
  return { flightNumber: String(flightNumber || '').replace(/\s+/g, ''), origin: cleanOrigin, destination: cleanDestination, departureTime: dep, arrivalTime: arrRaw.replace('(+1)', ''), workType: String(workType || 'OP').toUpperCase(), aircraftType, isNextDay: /\(\+1\)/.test(arrRaw) || toMin(arrRaw) < toMin(dep), duration: diffHours(dep, arrRaw) };
}

function addLegIfGoodRC5(day, leg) {
  if (!leg || leg.origin === leg.destination || !leg.flightNumber) return;
  if (!day.legs.some((old) => old.flightNumber === leg.flightNumber && old.origin === leg.origin && old.destination === leg.destination && old.departureTime === leg.departureTime)) day.legs.push(leg);
}

function parseAimsTextRC5(fullText, filename = '') {
  const h = parseServerHeader(fullText, filename);
  const blocks = buildAimsBlocksRC5(fullText, h.month, h.year);
  const days = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.month !== h.month || block.year !== h.year) continue;
    days.push(...parseAimsBlockRC5(block, blocks[i + 1], h.base));
  }
  if (!days.length) throw new Error('Nenhuma programação AIMS encontrada.');
  return { ...h, days, rawText: fullText, totals: extractTotals(fullText) };
}

function buildAimsBlocksRC5(fullText, baseMonth, baseYear) {
  const head = fullText.split(/\n\s*Tripulações\s*\n/i)[0];
  const lines = head.split(/\n+/).map((l) => String(l || '').trim()).filter(Boolean).filter((l) => !/^(Confira na escala|Escala de Tripulante|Tripulante:|Timezone)/i.test(l));
  const blocks = []; let current = null;
  for (const line of lines) {
    const marker = parseAimsDateMarkerServer(line, baseMonth, baseYear);
    if (marker) { if (current) blocks.push(current); current = { ...marker, tokens: [] }; continue; }
    if (!current) continue;
    for (const token of line.split(/\s+/).filter(Boolean)) if (!ignoreAimsTokenServer(token)) current.tokens.push(token);
  }
  if (current) blocks.push(current);
  return blocks;
}

function parseAimsBlockRC5(block, nextBlock, base) {
  const tokens = block.tokens.map((t) => String(t || '').trim()).filter(Boolean);
  const upper = tokens.map((t) => t.toUpperCase());
  const events = [];
  const activityPositions = [];
  for (let i = 0; i < upper.length; i++) {
    const code = normalizeActivityCodeRC5(upper[i]);
    if (['HSB','HSBE','ASB','CBF','EMER','MT','CRM','NS','NSJ','IJ','DM','SAER'].includes(code) || /^C\d{2,3}F$/.test(code)) activityPositions.push({ code, index: i });
  }
  for (let p = 0; p < activityPositions.length; p++) {
    const { code, index } = activityPositions[p];
    const nextIndex = activityPositions[p + 1]?.index ?? upper.findIndex((t, idx) => idx > index && t === 'LA');
    const slice = tokens.slice(index, nextIndex > index ? nextIndex : tokens.length);
    const d = makeDay(block.day, block.month, block.year, base);
    d.rawText = tokens.join(' '); d.pairingCode = code; d.type = activityTypeFromCodeRC5(code);
    const win = pickActivityWindowRC5(slice.join(' '), code);
    d.dutyReport = win.start; d.dutyDebrief = win.end; d.dutyHours = win.start && win.end ? diffHours(win.start, win.end) : null; d.flyingHours = 0;
    events.push(d);
  }
  const flightDay = makeDay(block.day, block.month, block.year, base);
  flightDay.rawText = tokens.join(' ');
  for (let i = 0; i < upper.length; i++) {
    if (upper[i] === 'LA' && /^\d{3,4}$/.test(upper[i+1] || '')) {
      const nextLa = upper.findIndex((t, idx) => idx > i + 1 && t === 'LA');
      let seq = tokens.slice(i + 2, nextLa > 0 ? nextLa : tokens.length);
      if (seq.some((t) => String(t).startsWith('(...)')) && !hasCompleteLegTokensPrecise(seq)) seq = seq.concat(nextDayContinuationPrefixPrecise(nextBlock?.tokens || []));
      const leg = parseAimsFlightSeqRC5('LA' + upper[i+1], seq);
      addLegIfGoodRC5(flightDay, leg);
    }
  }
  if (flightDay.legs.length) {
    flightDay.type = 'VOO'; flightDay.pairingCode = flightDay.legs[0].flightNumber;
    flightDay.dutyReport = inferAimsDutyReportRC5(tokens, flightDay.legs[0]) || flightDay.legs[0].departureTime;
    flightDay.dutyDebrief = inferAimsDebriefPrecise(tokens, flightDay.legs.at(-1), nextBlock?.tokens || []) || addMinutesServerPrecise(flightDay.legs.at(-1).arrivalTime, 30);
    flightDay.isNextDay = flightDay.legs.some((leg) => leg.isNextDay) || diffHours(flightDay.dutyReport, flightDay.dutyDebrief) > 18;
    flightDay.flyingHours = flightDay.legs.reduce((s, leg) => s + (leg.duration || diffHours(leg.departureTime, leg.arrivalTime)), 0);
    flightDay.dutyHours = diffHours(flightDay.dutyReport, flightDay.dutyDebrief);
    events.push(flightDay);
  }
  if (!events.length) {
    const rest = upper.join(' ').match(/\b(DOPR|DOP|DOF|DO|DR|OFF|VC)\b/);
    if (rest) { const d = makeDay(block.day, block.month, block.year, base); d.rawText = tokens.join(' '); d.type = rest[1]; d.pairingCode = rest[1]; d.dutyHours = 0; d.flyingHours = 0; events.push(d); }
  }
  return events;
}

function parseAimsFlightSeqRC5(flightNumber, seq) {
  const tokens = seq.map((t) => String(t || '').trim()).filter((t) => t && t !== '[extra]');
  const upper = tokens.map((t) => t.toUpperCase());
  const airportIndexes = [];
  for (let i = 0; i < upper.length; i++) if (AIRPORTS.has(upper[i])) airportIndexes.push(i);
  if (airportIndexes.length < 2) return null;
  for (let a = 0; a < airportIndexes.length - 1; a++) {
    const originIdx = airportIndexes[a];
    const origin = upper[originIdx];
    const dep = tokens.slice(0, originIdx).filter(isTimeToken).map(normalizeTimeToken).at(-1);
    if (!dep) continue;
    for (let b = a + 1; b < airportIndexes.length; b++) {
      const destIdx = airportIndexes[b];
      const destination = upper[destIdx];
      if (destination === origin) continue;
      const arr = tokens.slice(destIdx + 1).filter(isTimeToken).map(normalizeTimeToken)[0];
      if (!arr) continue;
      const aircraft = upper.find((t) => /^\([A-Z0-9]{3}\)$/.test(t))?.replace(/[()]/g, '') || undefined;
      return makeLegRC5(flightNumber, origin, destination, dep, arr, 'OP', aircraft);
    }
  }
  return null;
}

function inferAimsDutyReportRC5(tokens, firstLeg) {
  if (!firstLeg) return null;
  const upper = tokens.map((t) => String(t).toUpperCase());
  const laIndex = upper.findIndex((t) => t === 'LA');
  const originIdx = upper.findIndex((t, idx) => idx > laIndex && t === firstLeg.origin);
  const times = tokens.slice(laIndex >= 0 ? laIndex + 2 : 0, originIdx > 0 ? originIdx : tokens.length).filter(isTimeToken).map(normalizeTimeToken);
  return times[0] || null;
}

function normalizeActivityCodeRC5(code) {
  const c = String(code || '').toUpperCase();
  if (c === 'CRMB' || c === 'CRMBSB') return 'CRM';
  return c;
}
function activityTypeFromCodeRC5(code) {
  const c = normalizeActivityCodeRC5(code);
  if (c === 'ASB' || c === 'HSB' || c === 'HSBE') return c;
  if (c === 'CRM' || c === 'CBF' || c === 'EMER' || /^C\d{2,3}F$/.test(c)) return 'CRM';
  return 'OTHER';
}
function pickActivityWindowRC5(fragment, code = '') {
  const tokens = String(fragment || '').split(/\s+/).filter(Boolean);
  const times = uniqueTimesV3(tokens.filter(isTimeToken).map(normalizeTimeToken));
  const filtered = times.filter((t) => !looksLikeDurationV3(t));
  if (!filtered.length) return { start: null, end: null };
  const start = filtered[0];
  let end = filtered[filtered.length - 1];
  // duplicated report/rep and deb/deb are common: 14:00 14:00 BSB BSB 16:30 16:30
  if (end === start && filtered.length >= 2) end = filtered[1];
  return { start, end };
}
function buildParseDiagnosticsRC5(roster, sourceFormat) {
  const days = roster.days || [];
  const uniqueDays = new Set(days.map((d) => d.date)).size;
  const flights = days.reduce((s, d) => s + (d.legs?.length || 0), 0);
  const reserve = days.filter((d) => d.type === 'ASB').length;
  const standby = days.filter((d) => d.type === 'HSB' || d.type === 'HSBE').length;
  const meetings = days.filter((d) => (d.pairingCode || '') === 'MT').length;
  const bogusLegs = days.flatMap((d) => d.legs || []).filter((l) => l.origin === l.destination).length;
  const totalEvents = days.length;
  const confidence = uniqueDays >= 20 && flights >= 10 && bogusLegs === 0 ? 'alta' : uniqueDays >= 12 && totalEvents >= 12 && bogusLegs === 0 ? 'média' : 'baixa';
  return { sourceFormat, uniqueDays, totalEvents, flights, reserve, standby, meetings, bogusLegs, confidence, appVersion: '3.0.5 RC5', message: confidence === 'baixa' ? 'Leitura parcial: o sistema bloqueou escala incompleta para evitar erro.' : 'Escala lida pelo parser servidor RC5 com auditoria de ASB/MT/voos.' };
}
// --- end CrewCheck RC5 parser servidor obrigatório + APK/filechooser safe ---

// --- CrewCheck RC6 May/AIMS adaptive parser audit ---
parseServerHeader = function parseServerHeaderRC6(fullText, filename='') {
  const compact = String(fullText || '').replace(/\s+/g, ' ').trim();
  let crewName = 'Tripulante', crewId = '', base = 'BSB', rank = 'CCM';
  let month = new Date().getMonth()+1, year = new Date().getFullYear();

  const aims = compact.match(/Tripulante:\s*([^-]+?)\s*-\s*BP:\s*(\d+)\s*-\s*Base:\s*([A-Z]{3})\s*-\s*(\d{2})\/(\d{2})\/(\d{4})\s*at[ée]\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  if (aims) {
    crewName = aims[1].trim(); crewId = aims[2]; base = aims[3]; month = Number(aims[5]); year = Number(aims[6]);
  }

  const range = compact.match(/(\d{2})-([A-Za-z]{3})-(\d{4})\s+to\s+(\d{2})-([A-Za-z]{3})-(\d{4})/i);
  if (range) { month = monthNameToNum(range[2]) || month; year = Number(range[3]) || year; }

  const pipe = compact.match(/([A-ZÀ-Ú][A-ZÀ-Ú\s.'-]{4,}?)\s*\|\s*(\d{6,})\s*\|\s*([A-Z0-9]+)\s*\|\s*([A-Z]{3})\s*\|\s*([A-Z]{2,5})/);
  if (pipe) { crewName = pipe[1].trim(); crewId = pipe[2]; base = pipe[4]; rank = pipe[5]; }

  const rosterFull = compact.match(/Roster\s+Report\s+(?:Date\s+)?(\d{2})-([A-Za-z]{3})-(\d{4})\s+to\s+(\d{2})-([A-Za-z]{3})-(\d{4}).*?([A-ZÀ-Ú][A-ZÀ-Ú\s.'-]{4,}?)\s*\|\s*(\d{6,})\s*\|\s*([A-Z0-9]+)\s*\|\s*([A-Z]{3})\s*\|\s*([A-Z]{2,5})/i);
  if (rosterFull) { month = monthNameToNum(rosterFull[2]) || month; year = Number(rosterFull[3]) || year; crewName = rosterFull[7].trim(); crewId = rosterFull[8]; base = rosterFull[10]; rank = rosterFull[11]; }

  return { crewName, crewId, base, rank, month, year, airline: /\bLA\s?\d{3,4}\b/i.test(fullText) ? 'LATAM' : 'Companhia aérea' };
};

parseAimsDateMarkerServer = function parseAimsDateMarkerServerRC6(value, baseMonth, baseYear) {
  const m = String(value||'').trim().match(/^(\d{2})(Jan|Feb|Mar|Apr|May|Ma|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Fev|Abr|Mai|Ago|Set|Out|Dez)$/i);
  if (!m) return null;
  const day = Number(m[1]);
  const token = m[2].toLowerCase();
  let month = token === 'ma' ? 5 : monthNameToNum(m[2]);
  // AIMS em inglês frequentemente quebra "May" em "Ma" + "y". Portanto "Ma" é Maio.
  if (!month) month = baseMonth;
  let year = baseYear;
  if (month < baseMonth - 6) year++;
  if (month > baseMonth + 6) year--;
  return { day, month, year };
};

buildParseDiagnosticsRC5 = function buildParseDiagnosticsRC6(roster, sourceFormat) {
  const days = roster.days || [];
  const uniqueDays = new Set(days.map((d) => d.date)).size;
  const flights = days.reduce((s, d) => s + (d.legs?.length || 0), 0);
  const reserve = days.filter((d) => d.type === 'ASB').length;
  const standby = days.filter((d) => d.type === 'HSB' || d.type === 'HSBE').length;
  const meetings = days.filter((d) => (d.pairingCode || '') === 'MT').length;
  const crm = days.filter((d) => (d.pairingCode || '') === 'CRM').length;
  const bogusLegs = days.flatMap((d) => d.legs || []).filter((l) => l.origin === l.destination).length;
  const totalEvents = days.length;
  const flightHoursExpected = Number(roster.totals?.flightHours || 0);
  const activityCount = days.filter((d) => d.pairingCode || d.legs?.length).length;
  const parserFailure = bogusLegs > 0 || (flightHoursExpected > 5 && flights < 3) || uniqueDays < 8 || totalEvents < 8;
  let confidence = 'baixa';
  if (!parserFailure && uniqueDays >= 20 && flights >= 10) confidence = 'alta';
  else if (!parserFailure && uniqueDays >= 12 && activityCount >= 12) confidence = 'média';
  return {
    sourceFormat, uniqueDays, totalEvents, flights, reserve, standby, meetings, crm, bogusLegs,
    expectedFlightHours: flightHoursExpected, confidence, appVersion: '3.0.6 RC6',
    message: confidence === 'baixa'
      ? 'Leitura bloqueada/baixíssima: poucos voos ou eventos foram encontrados em relação ao total da escala.'
      : 'Escala lida pelo parser servidor RC6 com auditoria de mês, voos, ASB, CRM e AIMS Maio.'
  };
};

function scoreDiagnosticsRC6(d) {
  if (!d || d.bogusLegs > 0) return -9999;
  let score = 0;
  score += (d.uniqueDays || 0) * 8;
  score += (d.totalEvents || 0) * 4;
  score += (d.flights || 0) * 12;
  score += (d.reserve || 0) * 8;
  score += (d.standby || 0) * 5;
  score += (d.meetings || 0) * 4;
  score += (d.crm || 0) * 4;
  if ((d.expectedFlightHours || 0) > 5 && (d.flights || 0) < 3) score -= 1000;
  if (d.confidence === 'alta') score += 300;
  if (d.confidence === 'média') score += 100;
  if (d.confidence === 'baixa') score -= 200;
  return score;
}

parsePdfOnServer = async function parsePdfOnServerRC6({ filename, dataBase64 }) {
  if (!dataBase64 || typeof dataBase64 !== 'string') throw new Error('PDF não recebido pelo servidor.');
  const bytes = Buffer.from(dataBase64, 'base64');
  if (!bytes.length) throw new Error('PDF vazio.');
  const candidates = [];

  try {
    const pdfjsImport = await import('pdfjs-dist/legacy/build/pdf.js');
    const pdfjs = pdfjsImport.default || pdfjsImport;
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), disableWorker: true, isEvalSupported: false, disableFontFace: true }).promise;
    const pages = [];
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
      const page = await pdf.getPage(pageNo);
      const tc = await page.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false });
      const items = tc.items.map((it) => ({ str: String(it.str || '').trim(), x: Number(it.transform?.[4] || 0), y: Number(it.transform?.[5] || 0), page: pageNo })).filter((it) => it.str);
      pages.push({ pageNo, items });
    }
    const visual = buildServerFullText(pages);
    const linear = pages.map((p) => p.items.map((i) => i.str).join('\n')).join('\n');
    if (linear.trim().length > 80) candidates.push({ source: 'pdfjs-linear', text: linear, pages });
    if (visual.trim().length > 80) candidates.push({ source: 'pdfjs-visual', text: visual, pages });
  } catch (error) { console.warn('RC6 pdfjs extraction unavailable:', error?.message || error); }

  try {
    const mod = await import('pdf-parse');
    const pdfParse = mod.default || mod;
    const out = await pdfParse(bytes);
    if (out?.text && out.text.trim().length > 80) candidates.push({ source: 'pdf-parse', text: out.text });
  } catch (error) { console.warn('RC6 pdf-parse fallback unavailable:', error?.message || error); }

  const tried = [];
  const parsed = [];
  for (const candidate of uniqueTextCandidatesRC5(candidates)) {
    try {
      const roster = parseCrewCheckTextRC5(candidate.text, filename, candidate.pages);
      roster.rawText = candidate.text;
      roster.days = finalizeServerDays(roster.days, roster.month, roster.year, roster.base);
      const diagnostics = buildParseDiagnosticsRC5(roster, candidate.source);
      parsed.push({ roster, diagnostics, score: scoreDiagnosticsRC6(diagnostics) });
      tried.push(`${candidate.source}: ${diagnostics.uniqueDays} dias, ${diagnostics.totalEvents} eventos, ${diagnostics.flights} voos, confiança ${diagnostics.confidence}`);
    } catch (error) { tried.push(`${candidate.source}: ${error?.message || error}`); }
  }
  parsed.sort((a, b) => b.score - a.score);
  const best = parsed[0];
  if (best && best.score > 0 && best.diagnostics.confidence !== 'baixa') return { roster: best.roster, diagnostics: best.diagnostics };
  throw new Error(`Parser servidor RC6 não validou a escala com segurança. Tentativas: ${tried.join(' | ') || 'nenhuma extração de texto útil'}`);
};
// --- end CrewCheck RC6 May/AIMS adaptive parser audit ---

// --- CrewCheck RC7 Precision Core: deterministic CrewRosterReport/AIMS parser ---
const CREWCHECK_VERSION_RC7 = '10.2.0 · Rotina inteligente';

function cleanTextRC7(value) {
  return String(value || '')
    .replace(/\u000c/g, '\n')
    .replace(/\uFFFE/g, ' ')
    .replace(/[\t\r]+/g, ' ')
    .replace(/\n[ ]+/g, '\n')
    .replace(/[ ]{2,}/g, ' ')
    .trim();
}

function normalizeLineRC7(line) {
  return String(line || '')
    .replace(/\uFFFE/g, ' ')
    .replace(/\b(?:SCHEDULER|msgsys|AIRCOM_SQS)\b/gi, ' ')
    .replace(/\b\d{2}-[A-Za-z]{3}-\d{4}\s+\d{2}\.\d{2}\b/g, ' ')
    .replace(/\b\d{7,8}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}


function cleanCrewNameRC7(value) {
  return String(value || '')
    .replace(/\b(Tripulante|Crew|Roster|Report|Date|BP|Base)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+-\s*$/g, ' ')
    .trim() || 'Tripulante';
}

function headerRC7(fullText, filename = '') {
  const compact = cleanTextRC7(fullText).replace(/\s+/g, ' ');
  let crewName = 'Tripulante', crewId = '', base = 'BSB', rank = 'CCM';
  let month = new Date().getMonth() + 1;
  let year = new Date().getFullYear();

  const aims = compact.match(/Tripulante\s*:?\s*([A-ZÀ-Ú][A-ZÀ-Ú\s.'-]{3,}?)(?:\s*-\s*)?BP\s*:?\s*(\d{3,})(?:\s*-\s*)?Base\s*:?\s*([A-Z]{3})(?:\s*-\s*)?(\d{2})\/(\d{2})\/(\d{4})/i);
  if (aims) {
    crewName = cleanCrewNameRC7(aims[1]);
    crewId = aims[2];
    base = aims[3].toUpperCase();
    month = Number(aims[5]);
    year = Number(aims[6]);
  }

  const roster = compact.match(/Roster\s+Report\s+(?:Date\s+)?(\d{2})-([A-Za-z]{3})-(\d{4})\s+to\s+(\d{2})-([A-Za-z]{3})-(\d{4}).*?([A-ZÀ-Ú][A-ZÀ-Ú\s.'-]{4,}?)\s*\|\s*(\d{6,})\s*\|\s*([A-Z0-9]+)\s*\|\s*([A-Z]{3})\s*\|\s*([A-Z]{2,5})/i);
  if (roster) {
    month = monthNameToNum(roster[2]) || month;
    year = Number(roster[3]) || year;
    crewName = cleanCrewNameRC7(roster[7]);
    crewId = roster[8];
    base = roster[10];
    rank = roster[11];
  }

  const pipe = compact.match(/([A-ZÀ-Ú][A-ZÀ-Ú\s.'-]{4,}?)\s*\|\s*(\d{6,})\s*\|\s*([A-Z0-9]+)\s*\|\s*([A-Z]{3})\s*\|\s*([A-Z]{2,5})/);
  if (pipe) {
    crewName = cleanCrewNameRC7(pipe[1]);
    crewId = pipe[2];
    base = pipe[4];
    rank = pipe[5];
  }
  return { crewName, crewId, base, rank, month, year, airline: /\bLA\s?\d{3,4}\b/i.test(fullText) ? 'LATAM' : 'Companhia aérea' };
}

function dateStrRC7(day, month, year) {
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

function dateInReferenceMonthRC7(day, refMonth, refYear) {
  return day && day.month === refMonth && day.year === refYear;
}

function parseDateMarkerAimsRC7(line, baseMonth, baseYear) {
  const m = String(line || '').trim().match(/^(\d{2})(Jan|Feb|Mar|Apr|May|Ma|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Fev|Abr|Mai|Ago|Set|Out|Dez)$/i);
  if (!m) return null;
  const day = Number(m[1]);
  let month = String(m[2]).toLowerCase() === 'ma' ? 5 : (monthNameToNum(m[2]) || baseMonth);
  let year = baseYear;
  if (month < baseMonth - 6) year++;
  if (month > baseMonth + 6) year--;
  return { day, month, year };
}

function operationalCodeRC7(token, nextToken = '') {
  const t = String(token || '').toUpperCase();
  if (t === 'CRMBSB' || t === 'CRMB' || (t === 'CRM' && String(nextToken || '').toUpperCase() === 'BSB')) return 'CRM';
  if (t === 'CRMB' && String(nextToken || '').toUpperCase() === 'SB') return 'CRM';
  if (/^C\d{2,3}F$/.test(t)) return t;
  if (['HSB','HSBE','ASB','CBF','EMER','MT','CRM','NS','NSJ','IJ','DM','SAER'].includes(t)) return t;
  return null;
}

function dayTypeFromCodeRC7(code) {
  if (code === 'ASB' || code === 'HSB' || code === 'HSBE') return code;
  if (code === 'CRM' || code === 'CBF' || code === 'EMER' || /^C\d{2,3}F$/.test(code)) return 'CRM';
  return 'OTHER';
}

function stationTimePairsRC7(tokens) {
  const out = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    const a = String(tokens[i] || '').toUpperCase();
    if (AIRPORTS.has(a) && isTimeToken(tokens[i + 1])) out.push({ station: a, time: normalizeTimeToken(tokens[i + 1]) });
  }
  return out;
}

function activityWindowRC7(fragment, code = '') {
  const tokens = String(fragment || '').split(/\s+/).filter(Boolean);
  const pairs = stationTimePairsRC7(tokens);
  if (pairs.length >= 2) return { start: pairs[0].time, end: pairs[pairs.length - 1].time };
  const times = tokens.filter(isTimeToken).map(normalizeTimeToken);
  if (!times.length) return { start: null, end: null };
  const start = times[0];
  let end = times[times.length - 1];
  // If the last token is a pure duration column (e.g. 02:30 after BSB 16:30), prefer the last repeated pair before it.
  if (times.length >= 4 && toMin(end) < toMin(start) && !/\(\+1\)/.test(end)) end = times[times.length - 2];
  if (end === start && times.length >= 2) end = times[1];
  return { start, end };
}

function makeActivityDayRC7(day, month, year, base, code, fragment, rawText) {
  const d = makeDay(day, month, year, base);
  d.rawText = rawText || fragment;
  d.pairingCode = code;
  d.type = dayTypeFromCodeRC7(code);
  const win = activityWindowRC7(fragment, code);
  d.dutyReport = win.start;
  d.dutyDebrief = win.end;
  d.dutyHours = win.start && win.end ? diffHours(win.start, win.end) : null;
  d.flyingHours = 0;
  return d;
}

function makeLegRC7(flightNumber, origin, destination, departureTime, arrivalTime, workType = 'OP', aircraftType) {
  const o = String(origin || '').toUpperCase();
  const d = String(destination || '').toUpperCase();
  if (!AIRPORTS.has(o) || !AIRPORTS.has(d) || o === d) return null;
  const dep = normalizeTimeToken(departureTime);
  const arr = normalizeTimeToken(arrivalTime).replace('(+1)', '');
  const rawArr = normalizeTimeToken(arrivalTime);
  if (!isTimeToken(dep) || !isTimeToken(rawArr)) return null;
  const duration = diffHours(dep, rawArr);
  if (duration < 0.16 || duration > 8.5) return null;
  return { flightNumber: String(flightNumber || '').replace(/\s+/g, '').toUpperCase(), origin: o, destination: d, departureTime: dep, arrivalTime: arr, workType: String(workType || 'OP').toUpperCase(), aircraftType, isNextDay: /\(\+1\)/.test(rawArr) || toMin(rawArr) < toMin(dep), duration };
}

function addLegRC7(day, leg) {
  if (!leg) return;
  const key = `${leg.flightNumber}|${leg.origin}|${leg.destination}|${leg.departureTime}|${leg.arrivalTime}`;
  if (!day.legs.some((old) => `${old.flightNumber}|${old.origin}|${old.destination}|${old.departureTime}|${old.arrivalTime}` === key)) day.legs.push(leg);
}

function aircraftFromTokensRC7(tokens) {
  return tokens.map((t) => String(t || '').toUpperCase()).find((t) => /^\(?(?:32S|31R|39R|328|319|320|321|32N)\)?$/.test(t))?.replace(/[()]/g, '');
}

function parseStrictFlightsRC7(text) {
  const legs = [];
  const src = normalizeLineRC7(text);
  const strict = /\b(LA\s?\d{3,4})\b\s+(?:(?:CC|CP|FO|CM|CMT|CMD)\s+)?(?:(OP|PS|DH)\s+)?([A-Z]{3})\s+(\d{1,2}:\d{2}(?:\(\+1\))?)\s+([A-Z]{3})\s+(\d{1,2}:\d{2}(?:\(\+1\))?)/gi;
  let m;
  while ((m = strict.exec(src)) !== null) {
    const leg = makeLegRC7(m[1], m[3], m[5], m[4], m[6], m[2] || 'OP', findAircraftAfter(src, m.index));
    if (leg) legs.push(leg);
  }
  return legs;
}

function parseAimsLegSeqRC7(flightNumber, seq, nextTokens = []) {
  let tokens = seq.map((t) => String(t || '').trim()).filter((t) => t && !/^\[extra\]$/i.test(t));
  if (tokens.some((t) => String(t).startsWith('(...)'))) tokens = tokens.concat(nextAimsContinuationRC7(nextTokens));
  const upper = tokens.map((t) => t.toUpperCase());
  const airports = [];
  for (let i = 0; i < upper.length; i++) if (AIRPORTS.has(upper[i])) airports.push(i);
  if (airports.length < 2) return null;
  for (let a = 0; a < airports.length - 1; a++) {
    const oi = airports[a];
    const origin = upper[oi];
    const beforeOriginTimes = tokens.slice(0, oi).filter(isTimeToken).map(normalizeTimeToken);
    const dep = beforeOriginTimes.at(-1);
    if (!dep) continue;
    for (let b = a + 1; b < airports.length; b++) {
      const di = airports[b];
      const dest = upper[di];
      if (dest === origin) continue;
      const afterDestTimes = tokens.slice(di + 1).filter(isTimeToken).map(normalizeTimeToken);
      if (!afterDestTimes.length) continue;
      const arr = afterDestTimes[0];
      const leg = makeLegRC7(flightNumber, origin, dest, dep, arr, 'OP', aircraftFromTokensRC7(tokens));
      if (leg) return leg;
    }
  }
  return null;
}

function nextAimsContinuationRC7(tokens) {
  const out = [];
  const stopCodes = new Set(['LA','DOPR','DOP','DOPR','DOP','DO','DOF','DR','OFF','VC','VC','HSB','HSBE','ASB','CBF','EMER','MT','CRM','CRMB','CRMBSB','NS','NSJ','IJ','DM','SAER']);
  for (const token of tokens || []) {
    const upper = String(token || '').toUpperCase();
    if (out.length && stopCodes.has(upper)) break;
    out.push(token);
    if (/^\([A-Z0-9]{3}\)$/.test(upper)) break;
  }
  return out;
}

function buildRosterBlocksRC7(fullText) {
  const lines = cleanTextRC7(fullText).split(/\n+/).map(normalizeLineRC7).filter(Boolean);
  const blocks = [];
  let current = null;
  const dateRe = /^(\d{2})-([A-Za-z]{3})-(\d{4})\b\s*(.*)$/;
  for (const line of lines) {
    if (/^(Roster Report|Date\b|Duty\b|Report\b|Pairing\/Activity|Updated By|Updated Date|A\/C\b|Type\b|Overridde)/i.test(line)) continue;
    const m = line.match(dateRe);
    if (m) {
      if (current) blocks.push(current);
      current = { day: Number(m[1]), month: monthNameToNum(m[2]), year: Number(m[3]), parts: [m[4] || ''] };
      continue;
    }
    if (current && /\b(LA\s?\d{3,4}|DOPR|DOP|DOF?|DR|OFF|VC|HSBE?|ASB|CBF|EMER|MT|CRM|CRMB|CRMBSB|C\d{2,3}F|NSJ?|IJ|DM|SAER|[A-Z]{3}\s+\d{1,2}:\d{2}|\d{1,2}:\d{2}\(\+1\))\b/i.test(line)) current.parts.push(line);
  }
  if (current) blocks.push(current);
  return blocks;
}

function parseRosterReportRC7(fullText, filename = '') {
  const h = headerRC7(fullText, filename);
  const days = [];
  for (const block of buildRosterBlocksRC7(fullText)) {
    if (block.month !== h.month || block.year !== h.year) continue;
    const raw = normalizeLineRC7(block.parts.join(' '));
    const events = parseBlockEventsRC7(block.day, block.month, block.year, h.base, raw);
    days.push(...events);
  }
  if (!days.length) throw new Error('Nenhum evento encontrado no CrewRosterReport.');
  return { ...h, days, rawText: fullText, totals: extractTotals(fullText) };
}

function parseBlockEventsRC7(day, month, year, base, raw) {
  const upper = raw.toUpperCase();
  const events = [];
  const activityRe = /\b(HSBE|HSB|ASB|CBF|EMER|C\d{2,3}F|CRMBSB|CRMB|CRM|MT|NSJ|NS|IJ|DM|SAER)\b/g;
  let match;
  const activityHits = [];
  while ((match = activityRe.exec(upper)) !== null) activityHits.push({ code: operationalCodeRC7(match[1]) || match[1], index: match.index });
  for (let i = 0; i < activityHits.length; i++) {
    const hit = activityHits[i];
    const end = activityHits[i + 1]?.index ?? upper.length;
    const fragment = raw.slice(hit.index, end);
    const d = makeActivityDayRC7(day, month, year, base, hit.code, fragment, raw);
    events.push(d);
  }
  const flightDay = makeDay(day, month, year, base);
  flightDay.rawText = raw;
  for (const leg of parseStrictFlightsRC7(raw)) addLegRC7(flightDay, leg);
  if (flightDay.legs.length) {
    flightDay.type = 'VOO'; flightDay.pairingCode = flightDay.legs[0].flightNumber;
    const first = flightDay.legs[0]; const last = flightDay.legs.at(-1);
    const timesBeforeFirst = raw.slice(0, raw.indexOf(first.flightNumber)).match(/\b\d{1,2}:\d{2}(?:\(\+1\))?\b/g)?.map(normalizeTimeToken) || [];
    flightDay.dutyReport = timesBeforeFirst.at(-1) || first.departureTime;
    const afterLastDest = raw.slice(raw.lastIndexOf(last.destination));
    const afterTimes = afterLastDest.match(/\b\d{1,2}:\d{2}(?:\(\+1\))?\b/g)?.map(normalizeTimeToken) || [];
    flightDay.dutyDebrief = afterTimes.length >= 2 ? afterTimes[1].replace('(+1)','') : addMinutesRC7(last.arrivalTime, 30);
    flightDay.flyingHours = flightDay.legs.reduce((s, l) => s + (l.duration || diffHours(l.departureTime, l.arrivalTime)), 0);
    flightDay.dutyHours = diffHours(flightDay.dutyReport, flightDay.dutyDebrief);
    flightDay.isNextDay = flightDay.legs.some((l) => l.isNextDay) || diffHours(flightDay.dutyReport, flightDay.dutyDebrief) > 18;
    events.push(flightDay);
  }
  if (!events.length) {
    const rest = upper.match(/\b(DOPR|DOP|DOF|DO|DR|OFF|VC)\b/);
    if (rest) { const d = makeDay(day, month, year, base); d.rawText = raw; d.type = rest[1]; d.pairingCode = rest[1]; d.dutyHours = 0; d.flyingHours = 0; events.push(d); }
  }
  return events;
}

function addMinutesRC7(time, minutes) {
  const raw = toMin(time) + minutes;
  const h = Math.floor((raw % 1440) / 60);
  const m = raw % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function buildAimsBlocksRC7(fullText, baseMonth, baseYear) {
  const head = cleanTextRC7(fullText).split(/\n\s*Tripulações\s*\n/i)[0];
  const lines = head.split(/\n+/).map((l) => String(l || '').trim()).filter(Boolean).filter((l) => !/^(Confira na escala|Escala de Tripulante|Tripulante:|Timezone)/i.test(l));
  const blocks = [];
  let current = null;
  for (const line of lines) {
    const marker = parseDateMarkerAimsRC7(line, baseMonth, baseYear);
    if (marker) {
      if (current) blocks.push(current);
      current = { ...marker, tokens: [] };
      continue;
    }
    if (!current) continue;
    for (const token of line.split(/\s+/).filter(Boolean)) {
      if (/^(y|Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/i.test(token)) continue;
      current.tokens.push(token);
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

function parseAimsRC7(fullText, filename = '') {
  const h = headerRC7(fullText, filename);
  const blocks = buildAimsBlocksRC7(fullText, h.month, h.year);
  const days = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.month !== h.month || b.year !== h.year) continue;
    days.push(...parseAimsBlockRC7(b, blocks[i + 1], h.base));
  }
  if (!days.length) throw new Error('Nenhuma programação encontrada no AIMS.');
  return { ...h, days, rawText: fullText, totals: extractTotals(fullText) };
}

function parseAimsBlockRC7(block, nextBlock, base) {
  const tokens = (block.tokens || []).map((t) => String(t || '').trim()).filter(Boolean);
  const upper = tokens.map((t) => t.toUpperCase());
  const events = [];
  const positions = [];
  for (let i = 0; i < upper.length; i++) {
    const code = operationalCodeRC7(upper[i], upper[i + 1]);
    if (code) positions.push({ code, index: i });
  }
  for (let p = 0; p < positions.length; p++) {
    const { code, index } = positions[p];
    const nextOp = positions[p + 1]?.index;
    const nextLa = upper.findIndex((t, idx) => idx > index && t === 'LA');
    let end = tokens.length;
    if (nextOp > index) end = Math.min(end, nextOp);
    if (nextLa > index) end = Math.min(end, nextLa);
    const slice = tokens.slice(index, end);
    events.push(makeActivityDayRC7(block.day, block.month, block.year, base, code, slice.join(' '), tokens.join(' ')));
  }
  const flightDay = makeDay(block.day, block.month, block.year, base);
  flightDay.rawText = tokens.join(' ');
  for (let i = 0; i < upper.length; i++) {
    if (upper[i] === 'LA' && /^\d{3,4}$/.test(upper[i + 1] || '')) {
      const nextLa = upper.findIndex((t, idx) => idx > i + 1 && t === 'LA');
      const seq = tokens.slice(i + 2, nextLa > i ? nextLa : tokens.length);
      addLegRC7(flightDay, parseAimsLegSeqRC7('LA' + upper[i + 1], seq, nextBlock?.tokens || []));
    }
  }
  if (flightDay.legs.length) {
    flightDay.type = 'VOO'; flightDay.pairingCode = flightDay.legs[0].flightNumber;
    const first = flightDay.legs[0]; const last = flightDay.legs.at(-1);
    flightDay.dutyReport = inferAimsDutyReportRC7(tokens, first) || first.departureTime;
    flightDay.dutyDebrief = inferAimsDutyDebriefRC7(tokens, last, nextBlock?.tokens || []) || addMinutesRC7(last.arrivalTime, 30);
    flightDay.isNextDay = flightDay.legs.some((l) => l.isNextDay) || diffHours(flightDay.dutyReport, flightDay.dutyDebrief) > 18;
    flightDay.flyingHours = flightDay.legs.reduce((s, l) => s + (l.duration || diffHours(l.departureTime, l.arrivalTime)), 0);
    flightDay.dutyHours = diffHours(flightDay.dutyReport, flightDay.dutyDebrief);
    events.push(flightDay);
  }
  if (!events.length) {
    const rest = upper.join(' ').match(/\b(DOPR|DOP|DOF|DO|DR|OFF|VC)\b/);
    if (rest) { const d = makeDay(block.day, block.month, block.year, base); d.rawText = tokens.join(' '); d.type = rest[1]; d.pairingCode = rest[1]; d.dutyHours = 0; d.flyingHours = 0; events.push(d); }
  }
  return events;
}

function inferAimsDutyReportRC7(tokens, firstLeg) {
  const upper = tokens.map((t) => String(t).toUpperCase());
  const laIdx = upper.findIndex((t, idx) => t === 'LA' && upper[idx + 1] === firstLeg.flightNumber.replace('LA',''));
  const originIdx = upper.findIndex((t, idx) => idx > laIdx && t === firstLeg.origin);
  const times = tokens.slice(laIdx >= 0 ? laIdx + 2 : 0, originIdx > 0 ? originIdx : tokens.length).filter(isTimeToken).map(normalizeTimeToken);
  return times[0] || null;
}

function inferAimsDutyDebriefRC7(tokens, lastLeg, nextTokens = []) {
  const combined = tokens.concat(nextAimsContinuationRC7(nextTokens));
  const upper = combined.map((t) => String(t).toUpperCase());
  let destIdx = -1;
  for (let i = upper.length - 1; i >= 0; i--) if (upper[i] === lastLeg.destination) { destIdx = i; break; }
  const after = destIdx >= 0 ? combined.slice(destIdx + 1) : [];
  const times = after.filter(isTimeToken).map(normalizeTimeToken);
  return times[1] || null;
}

function finalizeDaysRC7(days, month, year, base) {
  const filtered = (days || []).filter((d) => dateInReferenceMonthRC7(d, month, year));
  const exact = new Map();
  for (const d of filtered) {
    const legKey = (d.legs || []).map((l) => `${l.flightNumber}-${l.origin}-${l.destination}-${l.departureTime}-${l.arrivalTime}`).join(';');
    const key = `${d.date}|${primaryCodeRC7(d)}|${d.dutyReport || ''}|${d.dutyDebrief || ''}|${legKey}`;
    if (!exact.has(key)) exact.set(key, d);
  }

  const exactDays = [...exact.values()];
  const timedKeys = new Set(exactDays.filter(hasWindowRC7).map((d) => `${d.date}|${primaryCodeRC7(d)}`));
  const withoutAllDayDuplicates = exactDays.filter((d) => hasWindowRC7(d) || !timedKeys.has(`${d.date}|${primaryCodeRC7(d)}`));
  const merged = mergeActivitiesIntoFlightDaysRC7(withoutAllDayDuplicates);
  const timedMerged = mergeConsecutiveActivitiesRC7(merged);

  const finalMap = new Map();
  for (const d of timedMerged) {
    const legKey = (d.legs || []).map((l) => `${l.flightNumber}-${l.origin}-${l.destination}-${l.departureTime}-${l.arrivalTime}`).join(';');
    const key = `${d.date}|${primaryCodeRC7(d)}|${d.dutyReport || ''}|${d.dutyDebrief || ''}|${legKey}`;
    if (!finalMap.has(key)) finalMap.set(key, d);
  }
  return [...finalMap.values()].sort(compareDayRC7);
}

function compareDayRC7(a, b) {
  return new Date(a.year, a.month - 1, a.dayNumber).getTime() - new Date(b.year, b.month - 1, b.dayNumber).getTime() || toMin(a.dutyReport || '23:59') - toMin(b.dutyReport || '23:59');
}

function hasWindowRC7(day) {
  return Boolean(day?.dutyReport && day?.dutyDebrief);
}

function isFlightDayRC7(day) {
  return day?.type === 'VOO' && Array.isArray(day.legs) && day.legs.length > 0;
}

function primaryCodeRC7(day) {
  const direct = String(day?.pairingCode || '').toUpperCase();
  if (direct && !/^LA\d{3,4}$/.test(direct)) return direct;
  const raw = `${day?.pairingCode || ''} ${day?.type || ''} ${day?.rawText || ''}`.toUpperCase();
  return raw.match(/\b(C\d{2,3}F|CRM|CBF|EMER|MT|HSBE|HSB|ASB|NSJ|NS|IJ|DM|[A-Z]{1,4}J)\b/)?.[1] || String(day?.type || 'OTHER').toUpperCase();
}

function mergeActivitiesIntoFlightDaysRC7(days) {
  const byDate = new Map();
  for (const d of days) {
    const arr = byDate.get(d.date) || [];
    arr.push(d);
    byDate.set(d.date, arr);
  }
  const output = [];
  for (const group of byDate.values()) {
    const flights = group.filter(isFlightDayRC7).sort(compareDayRC7);
    const others = group.filter((d) => !isFlightDayRC7(d));
    const consumed = new Set();
    for (const flight of flights) {
      const raw = String(flight.rawText || '').toUpperCase();
      for (const activity of others) {
        if (consumed.has(activity)) continue;
        const code = primaryCodeRC7(activity);
        if (!/^(C\d{2,3}F|CRM|CBF|EMER|MT)$/.test(code)) continue;
        // C32F/check A32F deve permanecer como programação separada do voo.
        if (/^C\d{2,3}F$/.test(code)) continue;
        if (raw.includes(code) || windowsOverlapRC7(flight, activity, 180)) {
          flight.rawText = [flight.rawText, activity.rawText || code].filter(Boolean).join('\n');
          flight.dutyReport = minTimeRC7(flight.dutyReport, activity.dutyReport) || flight.dutyReport;
          flight.dutyDebrief = maxTimeRC7(flight.dutyReport, flight.dutyDebrief, activity.dutyDebrief) || flight.dutyDebrief;
          if (!flight.pairingCode || /^LA\d{3,4}$/.test(flight.pairingCode)) flight.pairingCode = code;
          if (flight.dutyReport && flight.dutyDebrief) flight.dutyHours = diffHours(flight.dutyReport, flight.dutyDebrief);
          consumed.add(activity);
        }
      }
      output.push(flight);
    }
    for (const d of others) if (!consumed.has(d)) output.push(d);
  }
  return output;
}

function mergeConsecutiveActivitiesRC7(days) {
  const grouped = new Map();
  const output = [];
  for (const day of days) {
    if (isFlightDayRC7(day)) {
      output.push(day);
      continue;
    }
    const code = primaryCodeRC7(day);
    if (!/^(C\d{2,3}F|CRM|CBF|EMER|MT)$/.test(code)) {
      output.push(day);
      continue;
    }
    const key = `${day.date}|${code}`;
    const arr = grouped.get(key) || [];
    arr.push(day);
    grouped.set(key, arr);
  }

  for (const group of grouped.values()) {
    const timed = group.filter(hasWindowRC7).sort(compareDayRC7);
    if (timed.length <= 1) {
      output.push(...group);
      continue;
    }

    const merged = [];
    for (const day of timed) {
      const last = merged.at(-1);
      if (last && windowsOverlapRC7(last, day, 15)) {
        last.dutyReport = minTimeRC7(last.dutyReport, day.dutyReport) || last.dutyReport;
        last.dutyDebrief = maxTimeRC7(last.dutyReport, last.dutyDebrief, day.dutyDebrief) || last.dutyDebrief;
        last.rawText = [last.rawText, day.rawText].filter(Boolean).join('\n');
        last.dutyHours = diffHours(last.dutyReport, last.dutyDebrief);
      } else {
        merged.push({ ...day, legs: [...(day.legs || [])] });
      }
    }
    output.push(...merged);
  }
  return output.sort(compareDayRC7);
}

function windowsOverlapRC7(a, b, tolerance = 0) {
  if (!hasWindowRC7(a) || !hasWindowRC7(b)) return false;
  const as = toMin(a.dutyReport), ae = normalizeEndRC7(as, toMin(a.dutyDebrief));
  const bs = toMin(b.dutyReport), be = normalizeEndRC7(bs, toMin(b.dutyDebrief));
  return as <= be + tolerance && bs <= ae + tolerance;
}

function normalizeEndRC7(start, end) { return end < start ? end + 1440 : end; }
function minTimeRC7(a, b) { if (!a) return b || null; if (!b) return a || null; return toMin(a) <= toMin(b) ? a : b; }
function maxTimeRC7(anchor, a, b) { if (!a) return b || null; if (!b) return a || null; const s = toMin(anchor || a); return normalizeEndRC7(s, toMin(a)) >= normalizeEndRC7(s, toMin(b)) ? a : b; }

function diagnosticsV10(roster, sourceFormat) {
  const days = roster.days || [];
  const uniqueDays = new Set(days.map((d) => d.date)).size;
  const flights = days.reduce((s, d) => s + (d.legs?.length || 0), 0);
  const reserve = days.filter((d) => d.type === 'ASB').length;
  const standby = days.filter((d) => d.type === 'HSB' || d.type === 'HSBE').length;
  const crm = days.filter((d) => (d.pairingCode || '') === 'CRM').length;
  const falseLegs = days.flatMap((d) => d.legs || []).filter((l) => l.origin === l.destination).length;
  const confidence = falseLegs ? 'baixa' : (uniqueDays >= 20 && flights >= 12 ? 'alta' : uniqueDays >= 10 && days.length >= 10 ? 'média' : 'baixa');
  return { sourceFormat, uniqueDays, totalEvents: days.length, flights, reserve, standby, crm, bogusLegs: falseLegs, confidence, appVersion: CREWCHECK_VERSION_RC7, message: confidence === 'baixa' ? 'Leitura insuficiente: o sistema bloqueou resultados inseguros.' : 'Escala lida pelo Precision Core com concatenação de programações e filtro de mês.' };
}

function parseAnyV10(text, filename = '') {
  const clean = cleanTextRC7(text);
  const attempts = [];
  try { attempts.push(parseRosterReportRC7(clean, filename)); } catch (e) { }
  try { attempts.push(parseAimsRC7(clean, filename)); } catch (e) { }
  if (!attempts.length) throw new Error('Texto extraído não corresponde a CrewRosterReport nem AIMS.');
  attempts.forEach((r) => { r.days = finalizeDaysRC7(r.days, r.month, r.year, r.base); });
  attempts.sort((a,b) => {
    const da = diagnosticsV10(a, 'candidate'); const db = diagnosticsV10(b, 'candidate');
    return (db.flights*10 + db.totalEvents*2 + db.uniqueDays) - (da.flights*10 + da.totalEvents*2 + da.uniqueDays);
  });
  return attempts[0];
}

parsePdfOnServer = async function parsePdfOnServerV10({ filename, dataBase64 }) {
  if (!dataBase64 || typeof dataBase64 !== 'string') throw new Error('PDF não recebido pelo servidor.');
  const bytes = Buffer.from(dataBase64, 'base64');
  if (!bytes.length) throw new Error('PDF vazio.');
  const candidates = [];
  try {
    const pdfjsImport = await import('pdfjs-dist/legacy/build/pdf.js');
    const pdfjs = pdfjsImport.default || pdfjsImport;
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), disableWorker: true, isEvalSupported: false, disableFontFace: true }).promise;
    const pages = [];
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
      const page = await pdf.getPage(pageNo);
      const tc = await page.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false });
      const items = tc.items.map((it) => ({ str: String(it.str || '').trim(), x: Number(it.transform?.[4] || 0), y: Number(it.transform?.[5] || 0), page: pageNo })).filter((it) => it.str);
      pages.push({ pageNo, items });
    }
    const visual = buildServerFullText(pages);
    const linear = pages.map((p) => p.items.map((i) => i.str).join('\n')).join('\n');
    if (visual.trim().length > 50) candidates.push({ source: 'pdfjs-visual', text: visual });
    if (linear.trim().length > 50) candidates.push({ source: 'pdfjs-linear', text: linear });
  } catch (error) { console.warn('v10 pdfjs extraction unavailable:', error?.message || error); }
  try {
    const mod = await import('pdf-parse');
    const pdfParse = mod.default || mod;
    const out = await pdfParse(bytes);
    if (out?.text && out.text.trim().length > 50) candidates.push({ source: 'pdf-parse', text: out.text });
  } catch (error) { console.warn('v10 pdf-parse fallback unavailable:', error?.message || error); }
  const tried = [];
  const parsed = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const key = candidate.text.slice(0, 1000).replace(/\s+/g, ' ');
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      const roster = parseAnyV10(candidate.text, filename);
      const diagnostics = diagnosticsV10(roster, candidate.source);
      parsed.push({ roster, diagnostics, score: diagnostics.flights * 15 + diagnostics.totalEvents * 3 + diagnostics.uniqueDays * 5 + (diagnostics.confidence === 'alta' ? 500 : diagnostics.confidence === 'média' ? 100 : -1000) });
      tried.push(`${candidate.source}: ${diagnostics.uniqueDays} dias, ${diagnostics.totalEvents} eventos, ${diagnostics.flights} voos, ${diagnostics.confidence}`);
    } catch (error) { tried.push(`${candidate.source}: ${error?.message || error}`); }
  }
  parsed.sort((a,b) => b.score - a.score);
  const best = parsed[0];
  if (!best || best.diagnostics.confidence === 'baixa') throw new Error(`Precision Core não validou a escala. Tentativas: ${tried.join(' | ') || 'sem texto extraído'}`);
  best.roster.rawText = best.roster.rawText || candidates[0]?.text || '';
  return { roster: best.roster, diagnostics: best.diagnostics };
};
// --- end CrewCheck RC7 Precision Core ---

// --- CrewCheck v10.4 Parser Matrix + Calendar Sync: server-only column parser for CrewRosterReport + AIMS ---
const CREWCHECK_VERSION_V103 = '10.4.17 · Ticket servidor + fallback local';

function normalizeTokenV103(value) {
  return String(value || '').replace(/\uFFFE/g, ' ').replace(/\s+/g, ' ').trim();
}

function visualRowsV103(pages, tolerance = 3.2) {
  const out = [];
  for (const page of pages || []) {
    const rows = [];
    const items = (page.items || []).filter((item) => normalizeTokenV103(item.str));
    for (const item of items) {
      let row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= tolerance);
      if (!row) { row = { y: item.y, items: [], pageNo: page.pageNo || item.page || 1 }; rows.push(row); }
      row.items.push(item);
    }
    rows.sort((a, b) => b.y - a.y);
    for (const row of rows) {
      row.items.sort((a, b) => a.x - b.x);
      const text = normalizeLineRC7(row.items.map((item) => normalizeTokenV103(item.str)).join(' '));
      if (text) out.push({ pageNo: row.pageNo, y: row.y, text, items: row.items });
    }
  }
  return out;
}

function itemCenterXV103(item) {
  const width = Number(item.width || 0);
  return Number(item.x || 0) + (Number.isFinite(width) && width > 0 ? width / 2 : 0);
}

function isAimsMarkerTokenV103(value) {
  return /^(\d{2})(Jan|Feb|Mar|Apr|May|Ma|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Fev|Abr|Mai|Ago|Set|Out|Dez)$/i.test(String(value || '').trim());
}

function parseAimsMarkerTokenV103(value, baseMonth, baseYear) {
  const match = String(value || '').trim().match(/^(\d{2})(Jan|Feb|Mar|Apr|May|Ma|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Fev|Abr|Mai|Ago|Set|Out|Dez)$/i);
  if (!match) return null;
  const day = Number(match[1]);
  const rawMonth = match[2].toLowerCase();
  let month = rawMonth === 'ma' ? 5 : (monthNameToNum(match[2]) || baseMonth);
  let year = baseYear;
  if (month < baseMonth - 6) year++;
  if (month > baseMonth + 6) year--;
  return { day, month, year };
}

function cleanAimsColumnTokensV103(tokens) {
  const skip = /^(?:y|Mon|Tue|Wed|Thu|Fri|Sat|Sun|Timezone|-3|:|Bras[ií]lia|Confira|na|escala|publicada|pela|empresa|as|atividades|programadas|hor[aá]rios|de|apresenta[cç][aã]o\.?|Escala|Tripulante|Convertida|para|padr[aã]o|AIMS|BP:|Base:)$/i;
  return (tokens || [])
    .map(normalizeTokenV103)
    .filter(Boolean)
    .filter((token) => !skip.test(token));
}

function buildAimsColumnBlocksFromPagesV103(pages, fullText = '', filename = '') {
  const header = headerRC7(fullText, filename);
  const allBlocks = [];
  for (const page of pages || []) {
    const items = (page.items || []).map((item) => ({ ...item, str: normalizeTokenV103(item.str) })).filter((item) => item.str);
    const markers = items
      .filter((item) => isAimsMarkerTokenV103(item.str))
      .sort((a, b) => itemCenterXV103(a) - itemCenterXV103(b));
    if (!markers.length) continue;
    const markerCenters = markers.map(itemCenterXV103);
    for (let index = 0; index < markers.length; index++) {
      const marker = markers[index];
      const markerInfo = parseAimsMarkerTokenV103(marker.str, header.month, header.year);
      if (!markerInfo) continue;
      const left = index === 0 ? -Infinity : (markerCenters[index - 1] + markerCenters[index]) / 2;
      const right = index === markers.length - 1 ? Infinity : (markerCenters[index] + markerCenters[index + 1]) / 2;
      const columnItems = items
        .filter((item) => {
          const cx = itemCenterXV103(item);
          return cx >= left && cx < right;
        })
        .sort((a, b) => b.y - a.y || a.x - b.x);
      const markerPosition = columnItems.findIndex((item) => item === marker || (item.str === marker.str && Math.abs(item.x - marker.x) < 2 && Math.abs(item.y - marker.y) < 2));
      const contentItems = columnItems.slice(Math.max(0, markerPosition + 1));
      const tokens = cleanAimsColumnTokensV103(contentItems.map((item) => item.str));
      allBlocks.push({ ...markerInfo, tokens, rawText: tokens.join(' '), pageNo: page.pageNo || 1, x: marker.x });
    }
  }
  allBlocks.sort((a, b) => (a.year - b.year) || (a.month - b.month) || (a.day - b.day));
  return { header, blocks: allBlocks };
}

function parseAimsColumnsV103(pages, fullText = '', filename = '') {
  const { header, blocks } = buildAimsColumnBlocksFromPagesV103(pages, fullText, filename);
  if (!blocks.length) throw new Error('AIMS em colunas não encontrado.');
  const days = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.month !== header.month || block.year !== header.year) continue;
    const parsed = parseAimsBlockRC7(block, blocks[i + 1], header.base);
    days.push(...parsed.map((day) => ({ ...day, rawText: day.rawText || block.rawText })));
  }
  const roster = { ...header, days: finalizeDaysRC7(days, header.month, header.year, header.base), rawText: fullText, totals: extractTotals(fullText) };
  if (!roster.days.length) throw new Error('Nenhuma programação lida nas colunas AIMS.');
  return roster;
}

function buildRosterRowBlocksV103(pages, fullText = '', filename = '') {
  const header = headerRC7(fullText, filename);
  const rows = visualRowsV103(pages).filter((row) => !/^(Roster Report|Date\b|Duty\b|Report\b|Pairing\/Activity|Updated By|Updated Date|A\/C\b|Type\b|Overridde|n Rank|Work\b|ACY\b|Hotel\b|SDC\b)/i.test(row.text));
  const blocks = [];
  let current = null;
  const dateRe = /^(\d{2})-([A-Za-z]{3})-(\d{4})\b\s*(.*)$/;
  for (const row of rows) {
    const text = normalizeLineRC7(row.text);
    const match = text.match(dateRe);
    if (match) {
      if (current) blocks.push(current);
      current = { day: Number(match[1]), month: monthNameToNum(match[2]), year: Number(match[3]), parts: [match[4] || ''], y: row.y, pageNo: row.pageNo };
      continue;
    }
    if (current && /\b(LA\s?\d{3,4}|DOPR|DOP|DOF?|DR|OFF|VC|HSBE?|ASB|CBF|EMER|MT|CRM|CRMB|CRMBSB|C\d{2,3}F|NSJ?|IJ|DM|SAER|[A-Z]{3}\s+\d{1,2}:\d{2}|\d{1,2}:\d{2}\(\+1\))\b/i.test(text)) {
      current.parts.push(text);
    }
  }
  if (current) blocks.push(current);
  return { header, blocks };
}

function parseRosterRowsV103(pages, fullText = '', filename = '') {
  const { header, blocks } = buildRosterRowBlocksV103(pages, fullText, filename);
  if (!blocks.length) throw new Error('Linhas CrewRosterReport não encontradas.');
  const days = [];
  for (const block of blocks) {
    if (block.month !== header.month || block.year !== header.year) continue;
    const raw = normalizeLineRC7(block.parts.join(' '));
    const parsed = parseBlockEventsRC7(block.day, block.month, block.year, header.base, raw);
    days.push(...parsed);
  }
  const roster = { ...header, days: finalizeDaysRC7(days, header.month, header.year, header.base), rawText: fullText, totals: extractTotals(fullText) };
  if (!roster.days.length) throw new Error('Nenhum evento lido nas linhas CrewRosterReport.');
  return roster;
}

function normalizeRosterForDisplayV103(roster) {
  const fixed = { ...roster, days: (roster.days || []).map((day) => ({ ...day, legs: [...(day.legs || [])] })) };
  for (const day of fixed.days) {
    if (day.pairingCode === 'CRMBSB' || day.pairingCode === 'CRMB' || day.pairingCode === 'CRM') {
      day.pairingCode = 'CRM';
      day.type = 'CRM';
    }
    if (day.type === 'ASB') {
      day.pairingCode = 'ASB';
      day.legs = [];
    }
    if (day.type === 'HSB' || day.type === 'HSBE') {
      day.pairingCode = day.type;
      day.legs = [];
    }
    day.legs = (day.legs || []).filter((leg) => leg.origin && leg.destination && leg.origin !== leg.destination);
    if (day.legs.length) {
      day.type = 'VOO';
      day.pairingCode = day.legs[0].flightNumber;
      const first = day.legs[0];
      const last = day.legs[day.legs.length - 1];
      day.dutyReport = day.dutyReport || first.departureTime;
      day.dutyDebrief = day.dutyDebrief || addMinutesRC7(last.arrivalTime, 30);
      day.flyingHours = day.legs.reduce((sum, leg) => sum + (leg.duration || diffHours(leg.departureTime, leg.arrivalTime)), 0);
      day.dutyHours = day.dutyReport && day.dutyDebrief ? diffHours(day.dutyReport, day.dutyDebrief) : day.dutyHours;
      const raw = String(day.rawText || '') + ' ' + String(day.pairingCode || '');
      const dutyHours = day.dutyReport && day.dutyDebrief ? diffHours(day.dutyReport, day.dutyDebrief) : 0;
      const gapToFirst = day.dutyReport && first.departureTime ? ((toMin(first.departureTime) - toMin(day.dutyReport) + 1440) % 1440) : 0;
      if (/\b(C\d{2,3}F|CRM|CBF|EMER)\b/i.test(raw) && (dutyHours > 16 || gapToFirst > 360)) {
        day.dutyReport = first.departureTime;
        day.dutyDebrief = last.arrivalTime;
        day.isNextDay = Boolean(day.legs.some((leg) => leg.isNextDay) || toMin(last.arrivalTime) < toMin(first.departureTime));
        day.dutyHours = diffHours(day.dutyReport, day.dutyDebrief);
        day.rawText = [day.rawText, 'CrewCheck: voo pós-check normalizado para evitar jornada visual falsa.'].filter(Boolean).join('\n');
      }
    }
  }
  fixed.days = finalizeDaysRC7(fixed.days, fixed.month, fixed.year, fixed.base);
  return fixed;
}

function diagnosticsV103(roster, sourceFormat) {
  const base = diagnosticsV10(roster, sourceFormat);
  return { ...base, appVersion: CREWCHECK_VERSION_V103, message: base.confidence === 'baixa' ? 'Leitura insuficiente: revisar PDF ou tentar o outro formato.' : 'Escala lida pelo Parser Matrix v10.4 com concatenação, deduplicação e auditoria de mês.' };
}

function parserScoreV103(roster, source) {
  const d = diagnosticsV103(roster, source);
  const fullMonthDays = new Date(roster.year, roster.month, 0).getDate();
  const coverage = Math.min(d.uniqueDays, fullMonthDays);
  return d.flights * 20 + d.totalEvents * 4 + coverage * 8 + d.reserve * 15 + d.standby * 12 + d.crm * 10 - d.bogusLegs * 200 + (d.confidence === 'alta' ? 600 : d.confidence === 'média' ? 150 : -500);
}

function parseTextOnlyV103(text, filename = '') {
  const roster = parseAnyV10(text, filename);
  return normalizeRosterForDisplayV103(roster);
}



// --- CrewCheck 10.4.17: parser servidor para escala em formato ticket ---
const TICKET_MONTHS_SERVER = { JAN:1, FEB:2, MAR:3, APR:4, MAY:5, JUN:6, JUL:7, AUG:8, SEP:9, OCT:10, NOV:11, DEC:12 };
const TICKET_WEEKDAYS_SERVER = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/i;

function cleanTicketServerToken(value) {
  return String(value || '')
    .normalize('NFC')
    .replace(/[\uE000-\uF8FF]/g, ' ')
    .replace(/[^\p{L}\p{N}:\/()+_\-.'\s]/gu, ' ')
    .replace(/\bLA\s+(\d{3,4})\b/gi, 'LA$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function ticketLooksLikeServer(text, filename = '') {
  const sample = cleanTicketServerToken(text);
  return (/Tripulante\s*:/i.test(sample) && /(Apresenta|T[ée]?rmino\s*da\s*Jornada|T[ée]?rminodaJornada|\bLA\s?\d{3,4}\b)/i.test(sample)) || /ticket/i.test(filename || '');
}

function parseTicketServerDateBlocks(text, fallbackYear) {
  const rawLines = String(text || '').split(/\r?\n/);
  const lines = rawLines.map(cleanTicketServerToken).filter(Boolean);
  const markers = [];
  for (let i = 0; i < lines.length; i++) {
    if (!TICKET_WEEKDAYS_SERVER.test(lines[i])) continue;
    const day = Number((lines[i + 1] || '').match(/^\d{1,2}$/)?.[0] || 0);
    const month = TICKET_MONTHS_SERVER[String(lines[i + 2] || '').toUpperCase()] || 0;
    if (day >= 1 && day <= 31 && month) markers.push({ index: i, weekday: lines[i], day, month, year: fallbackYear });
  }
  const deduped = markers.filter((m, idx, arr) => !arr.some((p, pi) => pi < idx && p.day === m.day && p.month === m.month && Math.abs(p.index - m.index) <= 3));
  return { lines, markers: deduped };
}

function inferTicketServerHeader(text, filename = '') {
  const clean = cleanTicketServerToken(text);
  const name = clean.match(/Tripulante\s*:\s*([A-ZÀ-Ú][A-ZÀ-Ú\s.'-]{2,}?)(?=\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|Apresenta|LA\d|$))/i)?.[1]
    || clean.match(/Tripulante\s*:\s*([A-ZÀ-Ú][A-ZÀ-Ú\s.'-]{2,})/i)?.[1]
    || 'Tripulante';
  const yearFromFile = String(filename || '').match(/(20\d{2})/)?.[1];
  const year = yearFromFile ? Number(yearFromFile) : new Date().getFullYear();
  return { crewName: name.replace(/([a-zà-ú])([A-ZÀ-Ú])/g, '$1 $2').trim(), crewId: '', base: 'BSB', rank: 'CCM', airline: 'LATAM', year };
}

function ticketServerDate(day, month, year, base) {
  return makeDay(day, month, year, base || 'BSB');
}

function normalizeTicketServerTime(value) {
  const m = String(value || '').match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return `${String(Number(m[1])).padStart(2, '0')}:${m[2]}`;
}

function nextTicketServerDate(day, month, year) {
  const d = new Date(year, month - 1, day + 1);
  return { day: d.getDate(), month: d.getMonth() + 1, year: d.getFullYear() };
}

function stationTimePairsServer(segment) {
  const prepared = cleanTicketServerToken(segment)
    .replace(/\b([A-Z]{3})(\d{1,2}:\d{2})\b/g, '$1 $2')
    .replace(/\b([A-Z]{3})\s+(\d{1,2}:\d{2})\b/g, '$1 $2');
  const pairs = [];
  const re = /\b([A-Z]{3})\s+(\d{1,2}:\d{2})\b/g;
  let m;
  while ((m = re.exec(prepared)) !== null) pairs.push({ station: m[1], time: normalizeTicketServerTime(m[2]) });
  return pairs.filter((p) => p.time);
}

function parseTicketServerBlock(marker, blockLines, header) {
  const raw = blockLines.join('\n');
  const text = cleanTicketServerToken(blockLines.join(' ')).replace(/\b([A-Z]{3})(\d{1,2}:\d{2})\b/g, '$1 $2');
  const days = [];
  if (!text) return days;

  const report = normalizeTicketServerTime(text.match(/Apresenta(?:ção|cao)?\s*:?\s*(\d{1,2}:\d{2})/i)?.[1]);
  const debrief = normalizeTicketServerTime(text.match(/T[ée]?rmino\s*da\s*Jornada\s*:?\s*(\d{1,2}:\d{2})/i)?.[1] || text.match(/T[ée]?rminodaJornada\s*:?\s*(\d{1,2}:\d{2})/i)?.[1]);
  const flightMatches = [...text.matchAll(/\bLA\s?(\d{3,4})\b/gi)];

  if (flightMatches.length) {
    const duty = ticketServerDate(marker.day, marker.month, marker.year, header.base);
    duty.type = 'VOO';
    duty.dutyReport = report;
    duty.dutyDebrief = debrief;
    duty.pairingCode = `LA${flightMatches[0][1]}`;
    duty.rawText = raw;
    duty.legs = [];

    for (let i = 0; i < flightMatches.length; i++) {
      const start = flightMatches[i].index || 0;
      const end = i + 1 < flightMatches.length ? (flightMatches[i + 1].index || text.length) : (text.search(/T[ée]?rmino|T[ée]?rminodaJornada/i) >= 0 ? text.search(/T[ée]?rmino|T[ée]?rminodaJornada/i) : text.length);
      const segment = text.slice(start, end);
      const pairs = stationTimePairsServer(segment);
      if (pairs.length < 2) continue;
      const origin = pairs[0];
      const dest = pairs[1];
      const explicitNext = /\(\s*\d{1,2}\s*\/\s*\d{1,2}\s*\)/.test(segment) || toMin(dest.time) < toMin(origin.time);
      duty.legs.push({
        flightNumber: `LA${flightMatches[i][1]}`,
        origin: origin.station,
        destination: dest.station,
        departureTime: origin.time,
        arrivalTime: dest.time,
        workType: /\bExtra\b/i.test(segment) ? 'PS' : 'OP',
        isNextDay: explicitNext,
        duration: diffHours(origin.time, dest.time),
      });
    }

    if (duty.legs.length) {
      const lastLeg = duty.legs[duty.legs.length - 1];
      duty.dutyReport = duty.dutyReport || duty.legs[0].departureTime;
      duty.dutyDebrief = duty.dutyDebrief || (lastLeg ? addMinutesServer(lastLeg.arrivalTime, 30) : null);
      duty.isNextDay = Boolean(duty.legs.some((leg) => leg.isNextDay) || (duty.dutyReport && duty.dutyDebrief && toMin(duty.dutyDebrief) < toMin(duty.dutyReport)));
      duty.flyingHours = duty.legs.reduce((sum, leg) => sum + (leg.duration || 0), 0);
      duty.dutyHours = duty.dutyReport && duty.dutyDebrief ? diffHours(duty.dutyReport, duty.dutyDebrief) : null;
      days.push(duty);

      const overnightLeg = duty.legs.find((leg) => leg.isNextDay);
      if (overnightLeg) {
        const nd = nextTicketServerDate(marker.day, marker.month, marker.year);
        const continuation = ticketServerDate(nd.day, nd.month, nd.year, header.base);
        continuation.type = 'LAYOVER';
        continuation.pairingCode = `${overnightLeg.destination} / Fim de jornada`;
        continuation.dutyReport = overnightLeg.arrivalTime;
        continuation.dutyDebrief = duty.dutyDebrief || addMinutesServer(overnightLeg.arrivalTime, 30);
        continuation.hotel = overnightLeg.destination;
        continuation.isNextDay = false;
        continuation.rawText = `Continuação da jornada anterior: ${overnightLeg.flightNumber} ${overnightLeg.origin}-${overnightLeg.destination}`;
        continuation.dutyHours = continuation.dutyReport && continuation.dutyDebrief ? diffHours(continuation.dutyReport, continuation.dutyDebrief) : null;
        continuation.flyingHours = 0;
        days.push(continuation);
      }
    }
    return days;
  }

  const codeRe = /\b(HSBE|HSB|ASB|CBF|EMER|C\d{2,3}F|MT|CRM|DOF|DO|DR|OFF|VC|SICK|NSJ|NS|NSS|SWAP|TEMP)\b/g;
  const codeMatches = [...text.toUpperCase().matchAll(codeRe)];
  for (let i = 0; i < codeMatches.length; i++) {
    const code = codeMatches[i][1];
    const start = codeMatches[i].index || 0;
    const end = i + 1 < codeMatches.length ? (codeMatches[i + 1].index || text.length) : text.length;
    const segment = text.slice(start, end);
    const event = ticketServerDate(marker.day, marker.month, marker.year, header.base);
    event.pairingCode = code;
    event.rawText = segment;
    if (code === 'DO' || code === 'DOF' || code === 'DR' || code === 'OFF') event.type = code;
    if (code === 'DOP' || code === 'DOPR' || code === 'VC') event.type = 'DO';
    else if (code === 'VC') event.type = 'OFF';
    else if (code === 'ASB') event.type = 'ASB';
    else if (code === 'HSB' || code === 'HSBE') event.type = code;
    else if (code === 'CRM' || code === 'CBF' || code === 'EMER' || /^C\d{2,3}F$/.test(code)) event.type = 'CRM';
    else event.type = 'OTHER';

    if (!['DOPR','DOP','DO','DOF','DR','OFF','VC','VC'].includes(code)) {
      const pairs = stationTimePairsServer(segment);
      const times = pairs.map((p) => p.time);
      if (times.length >= 2) { event.dutyReport = times[0]; event.dutyDebrief = times[times.length - 1]; }
      else if (times.length === 1) { event.dutyReport = times[0]; event.dutyDebrief = times[0]; }
      event.dutyHours = event.dutyReport && event.dutyDebrief ? diffHours(event.dutyReport, event.dutyDebrief) : null;
    }
    days.push(event);
  }
  return days;
}

function addMinutesServer(time, minutes) {
  const total = (toMin(time) + minutes) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function dedupeTicketServerDays(days) {
  const best = new Map();
  const score = (d) => (d.legs?.length || 0) * 1000 + (d.dutyReport && d.dutyDebrief && d.dutyReport !== d.dutyDebrief ? diffHours(d.dutyReport, d.dutyDebrief) * 60 : 0) + String(d.rawText || '').length / 100;
  for (const d of days) {
    const legSig = (d.legs || []).map((l) => `${l.flightNumber}-${l.origin}-${l.destination}-${l.departureTime}`).join(',');
    const key = `${d.date}|${d.pairingCode || d.type}|${legSig || d.dutyReport || 'allDay'}`;
    if (!best.has(key) || score(d) > score(best.get(key))) best.set(key, d);
  }
  return [...best.values()].sort((a,b)=> new Date(a.year,a.month-1,a.dayNumber).getTime()-new Date(b.year,b.month-1,b.dayNumber).getTime() || (toMin(a.dutyReport || '23:59') - toMin(b.dutyReport || '23:59')));
}

function parseTicketServerRoster(text, filename = '') {
  const header = inferTicketServerHeader(text, filename);
  const { lines, markers } = parseTicketServerDateBlocks(text, header.year);
  if (markers.length < 3) throw new Error('Marcadores de data do ticket não encontrados.');
  const monthCounts = new Map();
  for (const m of markers) monthCounts.set(m.month, (monthCounts.get(m.month) || 0) + 1);
  const month = [...monthCounts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0] || markers[0].month;
  header.month = month;
  const days = [];
  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i];
    const end = i + 1 < markers.length ? markers[i + 1].index : lines.length;
    const blockLines = lines.slice(marker.index + 3, end);
    for (const day of parseTicketServerBlock(marker, blockLines, header)) days.push(day);
  }
  const roster = { ...header, month, days: dedupeTicketServerDays(days), rawText: text, totals: {} };
  if (!roster.days.length) throw new Error('Nenhum evento ticket encontrado.');
  return roster;
}
// --- end CrewCheck 10.4.17 ticket parser servidor ---

parsePdfOnServer = async function parsePdfOnServerV103({ filename, dataBase64 }) {
  if (!dataBase64 || typeof dataBase64 !== 'string') throw new Error('PDF não recebido pelo servidor.');
  const bytes = Buffer.from(dataBase64, 'base64');
  if (!bytes.length) throw new Error('PDF vazio.');
  const candidates = [];
  const tried = [];
  let pages = [];
  let visual = '';
  let linear = '';
  try {
    const pdfjsImport = await import('pdfjs-dist/legacy/build/pdf.js');
    const pdfjs = pdfjsImport.default || pdfjsImport;
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), disableWorker: true, isEvalSupported: false, disableFontFace: true }).promise;
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
      const page = await pdf.getPage(pageNo);
      const tc = await page.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false });
      const items = tc.items.map((it) => ({ str: String(it.str || '').trim(), x: Number(it.transform?.[4] || 0), y: Number(it.transform?.[5] || 0), width: Number(it.width || 0), page: pageNo })).filter((it) => it.str);
      pages.push({ pageNo, items });
    }
    visual = buildServerFullText(pages);
    linear = pages.map((page) => page.items.map((item) => item.str).join('\n')).join('\n');
    if (ticketLooksLikeServer(visual + '\n' + linear, filename)) {
      for (const [source, text] of [['ticket-pdfjs-visual', visual], ['ticket-pdfjs-linear', linear]]) {
        if (text && text.trim().length > 50) {
          try { candidates.push({ source, roster: parseTicketServerRoster(text, filename) }); } catch (error) { tried.push(`${source}: ${error?.message || error}`); }
        }
      }
    }
    if (/Escala de Tripulante Convertida para padr/i.test(visual + linear)) {
      try { candidates.push({ source: 'aims-column-matrix', roster: parseAimsColumnsV103(pages, visual || linear, filename) }); } catch (error) { tried.push(`aims-column-matrix: ${error?.message || error}`); }
    }
    if (/Roster\s+Report/i.test(visual + linear)) {
      try { candidates.push({ source: 'roster-row-matrix', roster: parseRosterRowsV103(pages, visual || linear, filename) }); } catch (error) { tried.push(`roster-row-matrix: ${error?.message || error}`); }
    }
    for (const [source, text] of [['pdfjs-visual', visual], ['pdfjs-linear', linear]]) {
      if (text && text.trim().length > 50) {
        try { candidates.push({ source, roster: parseTextOnlyV103(text, filename) }); } catch (error) { tried.push(`${source}: ${error?.message || error}`); }
      }
    }
  } catch (error) {
    tried.push(`pdfjs: ${error?.message || error}`);
  }
  try {
    const mod = await import('pdf-parse');
    const pdfParse = mod.default || mod;
    const out = await pdfParse(bytes);
    if (out?.text && out.text.trim().length > 50) {
      if (ticketLooksLikeServer(out.text, filename)) {
        try { candidates.push({ source: 'ticket-pdf-parse', roster: parseTicketServerRoster(out.text, filename) }); } catch (error) { tried.push(`ticket-pdf-parse: ${error?.message || error}`); }
      }
      try { candidates.push({ source: 'pdf-parse', roster: parseTextOnlyV103(out.text, filename) }); } catch (error) { tried.push(`pdf-parse: ${error?.message || error}`); }
    }
  } catch (error) {
    tried.push(`pdf-parse: ${error?.message || error}`);
  }
  const parsed = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const roster = normalizeRosterForDisplayV103(candidate.roster);
    const fingerprint = `${roster.month}-${roster.year}-${(roster.days || []).map((day) => `${day.date}:${day.pairingCode}:${day.dutyReport}:${day.dutyDebrief}:${(day.legs || []).map((leg) => leg.flightNumber + leg.origin + leg.destination).join(',')}`).join('|')}`;
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    const diagnostics = diagnosticsV103(roster, candidate.source);
    parsed.push({ roster, diagnostics, score: parserScoreV103(roster, candidate.source) });
    tried.push(`${candidate.source}: ${diagnostics.uniqueDays} dias, ${diagnostics.totalEvents} eventos, ${diagnostics.flights} voos, ${diagnostics.reserve} ASB, ${diagnostics.standby} HSB/HSBE, ${diagnostics.crm} CRM, ${diagnostics.confidence}`);
  }
  parsed.sort((a, b) => b.score - a.score);
  const best = parsed[0];
  if (!best) throw new Error(`Parser Matrix não conseguiu extrair eventos. Tentativas: ${tried.join(' | ') || 'sem texto extraído'}`);
  // Do not show deceptive one-event/one-rest rosters when the header says this is a full monthly roster.
  const expectedDays = new Date(best.roster.year, best.roster.month, 0).getDate();
  if (best.diagnostics.uniqueDays < Math.min(10, expectedDays) || best.diagnostics.totalEvents < 8) {
    throw new Error(`Leitura bloqueada por baixa cobertura (${best.diagnostics.uniqueDays}/${expectedDays} dias, ${best.diagnostics.totalEvents} eventos). Tentativas: ${tried.join(' | ')}`);
  }
  best.roster.rawText = best.roster.rawText || visual || linear || '';
  return { roster: best.roster, diagnostics: { ...best.diagnostics, attempts: tried.slice(0, 12) } };
};
// --- end CrewCheck v10.4 Parser Matrix + Calendar Sync ---
