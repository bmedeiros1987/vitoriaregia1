-- Vitória Régia Pro v9.4
-- Migração emergencial para bancos PostgreSQL antigos.
-- Pode ser executada no Query Editor da Aiven/PostgreSQL.
-- Não apaga dados existentes.

BEGIN;

ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'morador';
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS user_type TEXT DEFAULT 'morador';
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS is_outsourced BOOLEAN DEFAULT false;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS unit TEXT;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS resident_id INTEGER;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS employee_id INTEGER;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"app":true,"email":true,"telegram":false,"whatsapp":false,"browser":true}'::jsonb;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN DEFAULT false;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT now();

UPDATE users SET role=COALESCE(NULLIF(role,''),'morador');
UPDATE users SET user_type=COALESCE(NULLIF(user_type,''),COALESCE(NULLIF(role,''),'morador'));
UPDATE users SET permissions=COALESCE(permissions,'{}'::jsonb);
UPDATE users SET active=COALESCE(active,true);
UPDATE users SET notification_preferences=COALESCE(notification_preferences,'{"app":true,"email":true,"telegram":false,"whatsapp":false,"browser":true}'::jsonb);

ALTER TABLE IF EXISTS residents ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT;
ALTER TABLE IF EXISTS residents ADD COLUMN IF NOT EXISTS access_profile TEXT DEFAULT 'morador';
ALTER TABLE IF EXISTS residents ADD COLUMN IF NOT EXISTS access_permissions JSONB DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS residents ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;
ALTER TABLE IF EXISTS residents ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"app":true,"email":true,"telegram":false,"whatsapp":false,"browser":true}'::jsonb;

ALTER TABLE IF EXISTS packages ADD COLUMN IF NOT EXISTS pickup_code TEXT;
ALTER TABLE IF EXISTS packages ADD COLUMN IF NOT EXISTS delivery_preference TEXT DEFAULT 'nao_informado';
ALTER TABLE IF EXISTS packages ADD COLUMN IF NOT EXISTS notification_channels JSONB DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS packages ADD COLUMN IF NOT EXISTS resident_response_at TIMESTAMP;

ALTER TABLE IF EXISTS visitors ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE IF EXISTS visitors ADD COLUMN IF NOT EXISTS recurring BOOLEAN DEFAULT false;
ALTER TABLE IF EXISTS visitors ADD COLUMN IF NOT EXISTS weekdays JSONB DEFAULT '[]'::jsonb;
ALTER TABLE IF EXISTS visitors ADD COLUMN IF NOT EXISTS valid_from DATE;
ALTER TABLE IF EXISTS visitors ADD COLUMN IF NOT EXISTS valid_until DATE;
ALTER TABLE IF EXISTS visitors ADD COLUMN IF NOT EXISTS announce_required BOOLEAN DEFAULT true;
ALTER TABLE IF EXISTS visitors ADD COLUMN IF NOT EXISTS announcement_channel TEXT DEFAULT 'interfone';
ALTER TABLE IF EXISTS visitors ADD COLUMN IF NOT EXISTS notification_channels JSONB DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS visitors ADD COLUMN IF NOT EXISTS photo_data TEXT;
ALTER TABLE IF EXISTS visitors ADD COLUMN IF NOT EXISTS reservation_id INTEGER;
ALTER TABLE IF EXISTS visitors ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE IF EXISTS reservations ADD COLUMN IF NOT EXISTS area_id INTEGER;
ALTER TABLE IF EXISTS reservations ADD COLUMN IF NOT EXISTS start_time TEXT DEFAULT '19:00';
ALTER TABLE IF EXISTS reservations ADD COLUMN IF NOT EXISTS end_time TEXT DEFAULT '23:00';
ALTER TABLE IF EXISTS reservations ADD COLUMN IF NOT EXISTS fee_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE IF EXISTS reservations ADD COLUMN IF NOT EXISTS boleto_id INTEGER;
ALTER TABLE IF EXISTS reservations ADD COLUMN IF NOT EXISTS document_text TEXT;
ALTER TABLE IF EXISTS reservations ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN DEFAULT false;
ALTER TABLE IF EXISTS reservations ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE IF EXISTS reservations ADD COLUMN IF NOT EXISTS created_by INTEGER;
ALTER TABLE IF EXISTS reservations ADD COLUMN IF NOT EXISTS approved_by INTEGER;
ALTER TABLE IF EXISTS reservations ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;
ALTER TABLE IF EXISTS reservations ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMP;

ALTER TABLE IF EXISTS finance ADD COLUMN IF NOT EXISTS unit TEXT;
ALTER TABLE IF EXISTS finance ADD COLUMN IF NOT EXISTS resident_id INTEGER;
ALTER TABLE IF EXISTS finance ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'geral';
ALTER TABLE IF EXISTS finance ADD COLUMN IF NOT EXISTS boleto_id INTEGER;

ALTER TABLE IF EXISTS notifications ADD COLUMN IF NOT EXISTS channels JSONB DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS notifications ADD COLUMN IF NOT EXISTS action_url TEXT;
ALTER TABLE IF EXISTS notifications ADD COLUMN IF NOT EXISTS payload JSONB DEFAULT '{}'::jsonb;

ALTER TABLE IF EXISTS emergency_types ADD COLUMN IF NOT EXISTS notify_all BOOLEAN DEFAULT false;

ALTER TABLE IF EXISTS system_updates ADD COLUMN IF NOT EXISTS package_data BYTEA;
ALTER TABLE IF EXISTS system_updates ADD COLUMN IF NOT EXISTS validation_token_hash TEXT;
ALTER TABLE IF EXISTS system_updates ADD COLUMN IF NOT EXISTS payload_sha256 TEXT;
ALTER TABLE IF EXISTS system_updates ADD COLUMN IF NOT EXISTS manifest JSONB DEFAULT '{}'::jsonb;

COMMIT;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name='users'
  AND column_name IN ('permissions','user_type','notification_preferences','force_password_change')
ORDER BY column_name;
