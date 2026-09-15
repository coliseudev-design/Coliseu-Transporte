-- Migration 024: Add missing columns to dash_financeiro and dash_sync_metadata
-- Each ADD COLUMN is separate to avoid batch failures

-- dash_financeiro: client fields
ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS cliente_id INTEGER;
ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS cliente_nome VARCHAR(255);

-- dash_financeiro: portador / especie / plano
ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS portador_id INTEGER;
ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS especie_id INTEGER;
ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS plano_contas_id INTEGER;
ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS plano_contas_nome VARCHAR(255);
ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS observacoes TEXT;
ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS origem VARCHAR(50) DEFAULT 'NEXUS';
ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS grupo_id VARCHAR(100);

-- dash_financeiro: Asaas boleto fields
ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS asaas_customer_id VARCHAR(100);
ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS asaas_bank_slip_url TEXT;
ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS asaas_linha_digitavel TEXT;
ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS asaas_bar_code TEXT;
ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS data_vinculo TIMESTAMP WITH TIME ZONE;
ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS usuario_vinculo VARCHAR(100);
ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS cliente_email VARCHAR(255);
ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS cliente_documento VARCHAR(30);
ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS cliente_telefone VARCHAR(30);
ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS cliente_endereco TEXT;
ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS cliente_cidade VARCHAR(100);

-- dash_sync_metadata: payload / operacao columns for ERP sync queue
ALTER TABLE dash_sync_metadata ADD COLUMN IF NOT EXISTS operacao VARCHAR(50);
ALTER TABLE dash_sync_metadata ADD COLUMN IF NOT EXISTS payload JSONB;
