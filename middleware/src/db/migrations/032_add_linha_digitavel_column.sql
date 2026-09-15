-- Adiciona coluna linha_digitavel em dash_financeiro se não existir
ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS linha_digitavel TEXT;
