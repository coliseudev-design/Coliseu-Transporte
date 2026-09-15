-- Migration 015: Add columns for Uazapi integration settings in dash_integracoes_config and set defaults

ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS whatsapp_server_url TEXT;
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS whatsapp_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS whatsapp_admin_phone VARCHAR(50);

-- Populate existing rows with default values if they are empty
UPDATE dash_integracoes_config 
SET whatsapp_server_url = 'https://coliseu.uazapi.com'
WHERE whatsapp_server_url IS NULL OR whatsapp_server_url = '';

UPDATE dash_integracoes_config 
SET whatsapp_token = '7bec3c90-89fe-466a-8a64-88d1d107a594'
WHERE whatsapp_token IS NULL OR whatsapp_token = '' OR whatsapp_token = '7bec3c90-89fe-4664-8a64-88d1d107a594';

UPDATE dash_integracoes_config 
SET whatsapp_admin_phone = '5567984028572'
WHERE whatsapp_admin_phone IS NULL OR whatsapp_admin_phone = '';

UPDATE dash_integracoes_config 
SET whatsapp_enabled = TRUE
WHERE whatsapp_enabled IS NULL;
