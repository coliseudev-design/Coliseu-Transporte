-- Migration 013: Atualizar templates por abas, adicionar tags no CRM e flags do financeiro

-- 1. Alterações de Schema nas tabelas
ALTER TABLE dash_oportunidades ADD COLUMN IF NOT EXISTS tags VARCHAR(255);
ALTER TABLE dash_oportunidades ADD COLUMN IF NOT EXISTS status VARCHAR(100) DEFAULT 'Aguardando Contato';
ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS alerta_bloqueio BOOLEAN DEFAULT FALSE;
ALTER TABLE dash_automacoes_logs ADD COLUMN IF NOT EXISTS oportunidade_id INTEGER REFERENCES dash_oportunidades(id) ON DELETE SET NULL;
ALTER TABLE dash_clientes ADD COLUMN IF NOT EXISTS terminais_contratados INTEGER DEFAULT 1;
ALTER TABLE dash_clientes ADD COLUMN IF NOT EXISTS terminais_ativos INTEGER DEFAULT 1;


-- [DESATIVADO] Loop de inserção/atualização de templates por abas removido.
-- Templates agora são gerenciados exclusivamente via interface pelo usuário.
-- Bloco DO $$ de auto-seed desativado para evitar re-criação a cada restart.
