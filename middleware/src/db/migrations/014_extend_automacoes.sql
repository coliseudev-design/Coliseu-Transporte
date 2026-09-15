-- Migration 014: Estender automacoes com canal e meta, e adicionar novos templates/automacoes padrao

-- 1. Adicionar colunas na tabela dash_automacoes se nao existirem
ALTER TABLE dash_automacoes ADD COLUMN IF NOT EXISTS canal VARCHAR(50) DEFAULT 'whatsapp';
ALTER TABLE dash_automacoes ADD COLUMN IF NOT EXISTS meta JSONB DEFAULT '{}';

-- [DESATIVADO] Loop de inserção de templates MKT_ANIVERSARIO, MKT_POS_COMPRA, MKT_MARCA_X removido.
-- Templates e automações agora são gerenciados exclusivamente via interface.
-- Bloco DO $$ de auto-seed desativado para evitar re-criação a cada restart.
