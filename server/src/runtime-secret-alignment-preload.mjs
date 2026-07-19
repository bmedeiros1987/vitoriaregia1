import { createHash } from 'node:crypto';

function sanitizeDatabaseUrl(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return raw;
  try {
    const url = new URL(raw);
    for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(key);
    return url.toString();
  } catch {
    return raw
      .replace(/([?&])(sslmode|sslcert|sslkey|sslrootcert)=[^&]*/gi, '$1')
      .replace(/\?&/g, '?')
      .replace(/&&+/g, '&')
      .replace(/[?&]$/, '');
  }
}

if (!String(process.env.APP_VERSION || '').trim()) {
  process.env.APP_VERSION = 'Vitória Régia One v14.0.1';
}

if (!String(process.env.JWT_SECRET || '').trim()) {
  const databaseUrl = sanitizeDatabaseUrl(process.env.DATABASE_URL || 'postgres://localhost/vitoriaregia');
  process.env.JWT_SECRET = createHash('sha256')
    .update(`${databaseUrl}|vitoria-regia-jwt-v14`)
    .digest('hex');
  console.log('[runtime] JWT_SECRET alinhado entre o núcleo e as integrações.');
}
