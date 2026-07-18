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

const originalDatabaseUrl = process.env.DATABASE_URL || '';
const sanitizedDatabaseUrl = sanitizeDatabaseUrl(originalDatabaseUrl);
if (sanitizedDatabaseUrl && sanitizedDatabaseUrl !== originalDatabaseUrl) {
  process.env.DATABASE_URL = sanitizedDatabaseUrl;
  console.log('[telegram-calls] Parâmetros SSL da DATABASE_URL normalizados para compatibilidade com o Render.');
}

await import('./telegram-concierge-preload.mjs');
await import('./telegram-call-details-preload.mjs');
await import('./telegram-callmebot-preload.mjs');
