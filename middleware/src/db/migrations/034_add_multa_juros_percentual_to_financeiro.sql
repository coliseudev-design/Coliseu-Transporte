-- Migration 034: Adiciona colunas multa_percentual e juros_percentual na tabela dash_financeiro
ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS multa_percentual NUMERIC(5,2) DEFAULT 2.00;
ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS juros_percentual NUMERIC(5,2) DEFAULT 1.00;
