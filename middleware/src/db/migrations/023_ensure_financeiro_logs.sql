-- Migration 023: Ensure schema for dash_financeiro_logs and dash_automacoes_logs
-- Each statement is separate for safety (avoid batch failure on ALTER TABLE)

CREATE TABLE IF NOT EXISTS dash_financeiro_logs (
    id SERIAL PRIMARY KEY,
    tenant_id UUID,
    titulo_id INT,
    financeiro_id INT,
    tipo_evento VARCHAR(50),
    data_evento TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    usuario VARCHAR(100) DEFAULT 'Sistema',
    nosso_numero VARCHAR(100),
    numero_documento VARCHAR(100),
    descricao TEXT,
    detalhes JSONB
);

ALTER TABLE dash_financeiro_logs ADD COLUMN IF NOT EXISTS titulo_id INT;
ALTER TABLE dash_financeiro_logs ADD COLUMN IF NOT EXISTS financeiro_id INT;
ALTER TABLE dash_financeiro_logs ADD COLUMN IF NOT EXISTS detalhes JSONB;

ALTER TABLE dash_automacoes_logs ADD COLUMN IF NOT EXISTS tipo VARCHAR(50);
ALTER TABLE dash_automacoes_logs ADD COLUMN IF NOT EXISTS canal VARCHAR(50);
ALTER TABLE dash_automacoes_logs ADD COLUMN IF NOT EXISTS destinatario VARCHAR(150);
ALTER TABLE dash_automacoes_logs ADD COLUMN IF NOT EXISTS subcategoria VARCHAR(50);

