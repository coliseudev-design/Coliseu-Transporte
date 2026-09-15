-- Adicionando coluna de classificacao na tabela dash_clientes
ALTER TABLE dash_clientes ADD COLUMN IF NOT EXISTS classificacao VARCHAR(50);
