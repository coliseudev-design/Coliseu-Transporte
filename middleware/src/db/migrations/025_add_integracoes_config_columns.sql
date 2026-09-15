-- Migration 025: Add all missing columns to dash_integracoes_config
-- Asaas integration columns
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS asaas_access_token TEXT;
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS asaas_ambiente VARCHAR(50) DEFAULT 'Sandbox';
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS asaas_webhook_secret TEXT;
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS asaas_juros_padrao NUMERIC DEFAULT 1;
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS asaas_multa_padrao NUMERIC DEFAULT 2;
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS asaas_desconto_padrao NUMERIC DEFAULT 0;

-- Email integration columns
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS email_provedor VARCHAR(50);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS email_smtp_host VARCHAR(255);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS email_smtp_port INTEGER;
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS email_smtp_user VARCHAR(255);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS email_smtp_pass TEXT;
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS email_smtp_secure BOOLEAN DEFAULT false;
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS email_remetente_nome VARCHAR(255);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS email_remetente VARCHAR(255);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS email_brevo_api_key TEXT;

-- Portador / Especie padrão columns
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS portador_padrao_id INTEGER;
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS portador_padrao_nome VARCHAR(255);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS especie_padrao_id INTEGER;
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS especie_padrao_nome VARCHAR(255);

-- Company (empresa) columns
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS empresa_codigo INTEGER;
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS empresa_nome VARCHAR(255);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS empresa_razao_social VARCHAR(255);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS empresa_cnpj VARCHAR(30);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS empresa_ie VARCHAR(50);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS empresa_im VARCHAR(50);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS empresa_tipo VARCHAR(50);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS empresa_regiao VARCHAR(100);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS empresa_endereco TEXT;
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS empresa_numero VARCHAR(30);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS empresa_bairro VARCHAR(100);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS empresa_complemento VARCHAR(100);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS empresa_cep VARCHAR(20);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS empresa_fax VARCHAR(30);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS empresa_fone1 VARCHAR(30);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS empresa_fone2 VARCHAR(30);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS empresa_praca VARCHAR(100);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS empresa_responsavel VARCHAR(100);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS empresa_email VARCHAR(255);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS empresa_site VARCHAR(255);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS empresa_logo_url TEXT;

-- Document model columns
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS doc_modelo_pedidos TEXT;
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS doc_modelo_extrato TEXT;
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS doc_modelo_orcamento TEXT;
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS doc_modelo_recibo TEXT;
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS doc_termo_garantia TEXT;
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS doc_observacao_padrao TEXT;

-- Padrao (default) config columns
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS padrao_nat_venda VARCHAR(100);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS padrao_nat_compra VARCHAR(100);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS padrao_nat_dev_saida VARCHAR(100);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS padrao_nat_dev_entrada VARCHAR(100);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS padrao_nat_servico_saida VARCHAR(100);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS padrao_nat_servico_entrada VARCHAR(100);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS padrao_departamento VARCHAR(100);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS padrao_codigo_produto VARCHAR(100);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS padrao_numero_pedido VARCHAR(100);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS padrao_rota_pedidos VARCHAR(100);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS padrao_centro_custo VARCHAR(100);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS padrao_caixa VARCHAR(100);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS padrao_caixa_cofre VARCHAR(100);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS padrao_moeda VARCHAR(20);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS padrao_portador VARCHAR(100);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS padrao_forma_pagto_prazo VARCHAR(100);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS padrao_tabela_precos VARCHAR(100);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS padrao_tipo_juros_titulo VARCHAR(50);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS padrao_tipo_juros_venda VARCHAR(50);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS padrao_modelo_resumo_financeiro VARCHAR(100);
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS padrao_juros_carencia_dias INTEGER DEFAULT 0;
ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS padrao_juros_percentual NUMERIC DEFAULT 0;
