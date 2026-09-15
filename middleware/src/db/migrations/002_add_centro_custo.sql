-- MIGRAÇÃO 002: Adicionar centro_custo ao Financeiro
ALTER TABLE dash_financeiro 
    ADD COLUMN IF NOT EXISTS centro_custo INTEGER DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_dash_financeiro_cc 
    ON dash_financeiro(tenant_id, centro_custo);
