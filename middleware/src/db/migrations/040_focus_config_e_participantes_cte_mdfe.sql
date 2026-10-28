-- =============================================================================
-- Migration 040: Configuração Focus NFe (Homologação e Produção) +
--                Campos Completos de Participantes CT-e / CT-e OS / MDF-e
-- =============================================================================

-- 1. Campos de configuração Focus NFe em dash_integracoes_config
ALTER TABLE dash_integracoes_config
  ADD COLUMN IF NOT EXISTS focus_token_homologacao TEXT,
  ADD COLUMN IF NOT EXISTS focus_token_producao TEXT,
  ADD COLUMN IF NOT EXISTS focus_ambiente VARCHAR(20) DEFAULT 'homologacao',
  ADD COLUMN IF NOT EXISTS focus_regime_tributario VARCHAR(2) DEFAULT '1',
  ADD COLUMN IF NOT EXISTS focus_rntrc VARCHAR(20),
  ADD COLUMN IF NOT EXISTS focus_serie_cte VARCHAR(5) DEFAULT '1',
  ADD COLUMN IF NOT EXISTS focus_serie_mdfe VARCHAR(5) DEFAULT '1',
  ADD COLUMN IF NOT EXISTS focus_cfop_padrao VARCHAR(8) DEFAULT '5353',
  ADD COLUMN IF NOT EXISTS focus_natureza_padrao VARCHAR(255) DEFAULT 'PRESTACAO DE SERVICO DE TRANSPORTE',
  ADD COLUMN IF NOT EXISTS focus_aliquota_icms_padrao NUMERIC(7,4) DEFAULT 12.00,
  ADD COLUMN IF NOT EXISTS focus_codigo_municipio VARCHAR(7),
  ADD COLUMN IF NOT EXISTS focus_municipio VARCHAR(120),
  ADD COLUMN IF NOT EXISTS focus_uf VARCHAR(2),
  ADD COLUMN IF NOT EXISTS focus_inscricao_estadual VARCHAR(30),
  ADD COLUMN IF NOT EXISTS focus_logradouro VARCHAR(255),
  ADD COLUMN IF NOT EXISTS focus_numero VARCHAR(30),
  ADD COLUMN IF NOT EXISTS focus_complemento VARCHAR(120),
  ADD COLUMN IF NOT EXISTS focus_bairro VARCHAR(120),
  ADD COLUMN IF NOT EXISTS focus_cep VARCHAR(10);

-- 2. Campos adicionais em dash_emitentes para tokens separados e parâmetros padrão
ALTER TABLE dash_emitentes
  ADD COLUMN IF NOT EXISTS focus_token_homologacao VARCHAR(255),
  ADD COLUMN IF NOT EXISTS focus_token_producao VARCHAR(255),
  ADD COLUMN IF NOT EXISTS regime_tributario VARCHAR(2) DEFAULT '1',
  ADD COLUMN IF NOT EXISTS cfop_padrao_cte VARCHAR(8) DEFAULT '5353',
  ADD COLUMN IF NOT EXISTS natureza_padrao_cte VARCHAR(255) DEFAULT 'PRESTACAO DE SERVICO DE TRANSPORTE',
  ADD COLUMN IF NOT EXISTS aliquota_icms_padrao NUMERIC(7,4) DEFAULT 12.00,
  ADD COLUMN IF NOT EXISTS complemento VARCHAR(120),
  ADD COLUMN IF NOT EXISTS email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS rntrc_proprietario VARCHAR(20);

-- Copiar focus_token legado para o token do ambiente correspondente se ainda estiver vazio
UPDATE dash_emitentes
SET focus_token_homologacao = COALESCE(focus_token_homologacao, focus_token)
WHERE focus_token IS NOT NULL AND focus_token <> '' AND (focus_ambiente = 'homologacao' OR focus_ambiente IS NULL);

UPDATE dash_emitentes
SET focus_token_producao = COALESCE(focus_token_producao, focus_token)
WHERE focus_token IS NOT NULL AND focus_token <> '' AND focus_ambiente = 'producao';

-- 3. Campos estruturados de participantes e documentos em dash_ctes
ALTER TABLE dash_ctes
  ADD COLUMN IF NOT EXISTS remetente_dados JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS destinatario_dados JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS expedidor_dados JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS recebedor_dados JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS tomador_dados JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS quantidades_carga JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS documentos_json JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS modal_os_dados JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS chave_cte_referenciado VARCHAR(44),
  ADD COLUMN IF NOT EXISTS codigo_municipio_envio VARCHAR(7),
  ADD COLUMN IF NOT EXISTS municipio_envio VARCHAR(120),
  ADD COLUMN IF NOT EXISTS uf_envio VARCHAR(2),
  ADD COLUMN IF NOT EXISTS peso_bruto NUMERIC(15,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peso_cubado NUMERIC(15,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quantidade_volumes NUMERIC(15,4) DEFAULT 1,
  ADD COLUMN IF NOT EXISTS unidade_medida VARCHAR(10) DEFAULT '01';

-- 4. Campos adicionais em dash_mdfes para garantir suporte completo ao schema Focus NFe v2
ALTER TABLE dash_mdfes
  ADD COLUMN IF NOT EXISTS codigo_municipio_carregamento VARCHAR(7),
  ADD COLUMN IF NOT EXISTS municipio_carregamento VARCHAR(120),
  ADD COLUMN IF NOT EXISTS codigo_municipio_descarregamento VARCHAR(7),
  ADD COLUMN IF NOT EXISTS municipio_descarregamento VARCHAR(120),
  ADD COLUMN IF NOT EXISTS cep_carregamento VARCHAR(10),
  ADD COLUMN IF NOT EXISTS cep_descarregamento VARCHAR(10),
  ADD COLUMN IF NOT EXISTS tipo_carga VARCHAR(2) DEFAULT '05',
  ADD COLUMN IF NOT EXISTS produto_predominante_nome VARCHAR(255) DEFAULT 'CARGA GERAL',
  ADD COLUMN IF NOT EXISTS produto_predominante_ncm VARCHAR(10),
  ADD COLUMN IF NOT EXISTS produto_predominante_ean VARCHAR(20),
  ADD COLUMN IF NOT EXISTS ctes_json JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS nfes_json JSONB DEFAULT '[]'::jsonb;
