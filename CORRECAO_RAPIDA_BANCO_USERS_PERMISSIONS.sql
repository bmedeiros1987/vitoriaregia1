-- Vitória Régia Pro v9.3 - correção rápida de banco legado
-- Execute somente se quiser corrigir manualmente pelo console SQL.
-- O pacote v9.3 também aplica isso automaticamente ao iniciar.

ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_type TEXT DEFAULT 'morador';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_outsourced BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS unit TEXT;
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
UPDATE users SET permissions = '{}'::jsonb WHERE permissions IS NULL;
UPDATE users SET active = true WHERE active IS NULL;
