-- Migration 031: Adicionar colunas de plano de contas padrão e centro de custo
ALTER TABLE dash_integracoes_config 
    ADD COLUMN IF NOT EXISTS padrao_plano_contas_id INTEGER,
    ADD COLUMN IF NOT EXISTS padrao_plano_contas_nome VARCHAR(255);

ALTER TABLE dash_financeiro
    ADD COLUMN IF NOT EXISTS centro_custo_nome VARCHAR(255);
