-- Migration 030: Adicionar colunas para artes de topo e rodapé de e-mail marketing e e-mail de cobrança em dash_integracoes_config
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS email_marketing_topo_url TEXT;
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS email_marketing_rodape_url TEXT;
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS email_cobranca_topo_url TEXT;
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS email_cobranca_rodape_url TEXT;
