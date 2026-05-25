-- Vitória Régia Pro v9.3
-- Correção rápida para bancos PostgreSQL criados por versões antigas.
-- Use somente se precisar corrigir o erro:
-- column "permissions" of relation "users" does not exist

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'morador';
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_type TEXT DEFAULT 'morador';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_outsourced BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS unit TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS resident_id INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"app":true,"email":true,"telegram":false,"whatsapp":false,"browser":true}'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT now();

UPDATE users
SET
  role = COALESCE(NULLIF(role,''),'morador'),
  user_type = COALESCE(NULLIF(user_type,''), COALESCE(NULLIF(role,''),'morador')),
  permissions = COALESCE(permissions, '{}'::jsonb),
  active = COALESCE(active, true),
  notification_preferences = COALESCE(notification_preferences, '{"app":true,"email":true,"telegram":false,"whatsapp":false,"browser":true}'::jsonb)
WHERE true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email) WHERE email IS NOT NULL;

COMMIT;
