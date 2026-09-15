-- Migration 022: Add Cora Bank Integration Config
-- Banco Cora: Produção - Coliseu Tecnologia e Consultoria Ltda
-- Client ID: int-6niGnUQSRUDauHBRYg0xCP | Agência: 0001 | Conta: 7264541-2

ALTER TABLE dash_integracoes_config
ADD COLUMN IF NOT EXISTS cora_ativo BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS cora_client_id VARCHAR(255) DEFAULT 'int-6niGnUQSRUDauHBRYg0xCP',
ADD COLUMN IF NOT EXISTS cora_cert_pem TEXT,
ADD COLUMN IF NOT EXISTS cora_private_key TEXT,
ADD COLUMN IF NOT EXISTS cora_juros_padrao NUMERIC(5,2) DEFAULT 1.00,
ADD COLUMN IF NOT EXISTS cora_multa_padrao NUMERIC(5,2) DEFAULT 2.00,
ADD COLUMN IF NOT EXISTS cora_desconto_padrao NUMERIC(5,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS cora_webhook_url VARCHAR(500),
ADD COLUMN IF NOT EXISTS cora_token_cache TEXT,
ADD COLUMN IF NOT EXISTS cora_token_expires_at TIMESTAMPTZ;
