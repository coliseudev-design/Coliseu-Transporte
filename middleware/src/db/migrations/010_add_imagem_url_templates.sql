-- Migration 010: Adicionar coluna imagem_url na tabela dash_templates
ALTER TABLE dash_templates ADD COLUMN IF NOT EXISTS imagem_url TEXT;
