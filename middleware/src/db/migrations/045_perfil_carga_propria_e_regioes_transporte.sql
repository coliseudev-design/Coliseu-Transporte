-- ============================================================================
-- Migration 045: Perfil Operacional Carga Própria (MDF-e sem CT-e),
--                Enriquecimento Fiscal/IBGE de NF-es do ERP e Regiões de Entrega
-- ============================================================================

-- 1. Perfil Operacional Padrão na Empresa Emitente
--    CARGA_PROPRIA  -> Varejo/Atacado/Indústria que entrega mercadoria própria (MDF-e tpEmit=2 sem CT-e)
--    TRANSPORTADORA -> Prestadora de serviço de frete comercial (CT-e + MDF-e tpEmit=1)
--    HIBRIDO        -> Opera nos dois regimes conforme a viagem
ALTER TABLE dash_emitentes
  ADD COLUMN IF NOT EXISTS perfil_operacional VARCHAR(20) DEFAULT 'HIBRIDO',
  ADD COLUMN IF NOT EXISTS mdfe_tipo_emitente_padrao VARCHAR(2) DEFAULT '1';

-- 2. Colunas de Enriquecimento Logístico e Fiscal nas Cargas (NF-es do ERP)
ALTER TABLE dash_cargas
  ADD COLUMN IF NOT EXISTS modelo_documento VARCHAR(4) DEFAULT '55',
  ADD COLUMN IF NOT EXISTS destinatario_codigo_ibge VARCHAR(7),
  ADD COLUMN IF NOT EXISTS destinatario_bairro VARCHAR(120),
  ADD COLUMN IF NOT EXISTS destinatario_cep VARCHAR(10),
  ADD COLUMN IF NOT EXISTS remetente_codigo_ibge VARCHAR(7),
  ADD COLUMN IF NOT EXISTS produto_ncm VARCHAR(10),
  ADD COLUMN IF NOT EXISTS regiao_nome VARCHAR(120),
  ADD COLUMN IF NOT EXISTS cliente_id_firebird INTEGER,
  ADD COLUMN IF NOT EXISTS venda_id_firebird INTEGER;

-- Backfill automático do modelo_documento (55 = NF-e, 65 = NFC-e) pela Chave de Acesso de 44 dígitos
UPDATE dash_cargas
SET modelo_documento = SUBSTRING(REGEXP_REPLACE(chave_acesso, '\D', '', 'g') FROM 21 FOR 2)
WHERE chave_acesso IS NOT NULL
  AND LENGTH(REGEXP_REPLACE(chave_acesso, '\D', '', 'g')) = 44
  AND (modelo_documento IS NULL OR modelo_documento = '');

CREATE INDEX IF NOT EXISTS idx_dash_cargas_tenant_regiao
  ON dash_cargas (tenant_id, regiao_nome);

CREATE INDEX IF NOT EXISTS idx_dash_cargas_tenant_destino
  ON dash_cargas (tenant_id, destinatario_uf, destinatario_municipio);

CREATE INDEX IF NOT EXISTS idx_dash_cargas_tenant_modelo_status
  ON dash_cargas (tenant_id, modelo_documento, status);

-- 3. Regiões / Rotas Logísticas de Entrega (Agrupamento de Cidades por Região)
CREATE TABLE IF NOT EXISTS dash_transporte_regioes (
  id SERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  nome VARCHAR(120) NOT NULL,
  descricao VARCHAR(255),
  uf_padrao VARCHAR(2),
  cor VARCHAR(24) DEFAULT 'sky',
  cidades JSONB NOT NULL DEFAULT '[]'::jsonb,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_dash_transporte_regioes_tenant_nome UNIQUE (tenant_id, nome)
);

CREATE INDEX IF NOT EXISTS idx_dash_transporte_regioes_tenant
  ON dash_transporte_regioes (tenant_id, ativo);
