-- Migration 017: Add Meta WhatsApp config columns and WhatsApp message log table

ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS whatsapp_api_provider VARCHAR(50) DEFAULT 'uazapi';
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS whatsapp_meta_business_id VARCHAR(100);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS whatsapp_meta_phone_id VARCHAR(100);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS whatsapp_meta_token TEXT;
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS whatsapp_meta_verify_token VARCHAR(100);

-- Populate existing rows with default provider
UPDATE dash_integracoes_config SET whatsapp_api_provider = 'uazapi' WHERE whatsapp_api_provider IS NULL OR whatsapp_api_provider = '';

CREATE TABLE IF NOT EXISTS dash_whatsapp_mensagens (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    whatsapp_message_id VARCHAR(255),
    sender VARCHAR(50) NOT NULL,
    recipient VARCHAR(50) NOT NULL,
    text_body TEXT,
    direction VARCHAR(20) DEFAULT 'INBOUND', -- INBOUND or OUTBOUND
    status VARCHAR(50) DEFAULT 'RECEIVED',
    provider VARCHAR(50) NOT NULL, -- 'uazapi' or 'meta'
    payload JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dash_wa_msg_tenant ON dash_whatsapp_mensagens(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dash_wa_msg_sender ON dash_whatsapp_mensagens(sender);
CREATE INDEX IF NOT EXISTS idx_dash_wa_msg_created ON dash_whatsapp_mensagens(created_at);
