-- ============================================================================
-- Migration 046: Concretização do Módulo de CIOT & Contratos de Transporte
--                - Provedor CIOT/IPEF configurável em dash_emitentes
--                - Tabela Oficial ANTT 5.867 (CCD + CC por eixos, carga e km)
--                - Integração com Frota, NF-e, MDF-e e Financeiro (Contas a Pagar)
-- ============================================================================

-- 1. Configuração do Provedor de CIOT / IPEF na Empresa Emitente
ALTER TABLE dash_emitentes
  ADD COLUMN IF NOT EXISTS ciot_provedor VARCHAR(30) DEFAULT 'HOMOLOGACAO_LOCAL',
  ADD COLUMN IF NOT EXISTS ciot_ambiente VARCHAR(20) DEFAULT 'homologacao',
  ADD COLUMN IF NOT EXISTS ciot_integrador_token TEXT,
  ADD COLUMN IF NOT EXISTS ciot_usuario VARCHAR(120),
  ADD COLUMN IF NOT EXISTS ciot_senha TEXT,
  ADD COLUMN IF NOT EXISTS ciot_cnpj_ipef VARCHAR(14);

-- 2. Expansão Completa dos Contratos de Transporte / Operações de CIOT
ALTER TABLE dash_contratos_transporte
  ADD COLUMN IF NOT EXISTS veiculo_id INTEGER,
  ADD COLUMN IF NOT EXISTS veiculo_placa VARCHAR(10),
  ADD COLUMN IF NOT EXISTS quantidade_eixos INTEGER DEFAULT 2,
  ADD COLUMN IF NOT EXISTS motorista_id INTEGER,
  ADD COLUMN IF NOT EXISTS motorista_nome VARCHAR(160),
  ADD COLUMN IF NOT EXISTS motorista_cpf VARCHAR(14),
  ADD COLUMN IF NOT EXISTS municipio_inicio VARCHAR(120),
  ADD COLUMN IF NOT EXISTS codigo_ibge_inicio VARCHAR(7),
  ADD COLUMN IF NOT EXISTS municipio_fim VARCHAR(120),
  ADD COLUMN IF NOT EXISTS codigo_ibge_fim VARCHAR(7),
  ADD COLUMN IF NOT EXISTS distancia_km NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS categoria_carga_antt VARCHAR(40) DEFAULT 'GERAL',
  ADD COLUMN IF NOT EXISTS alto_desempenho BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS retorno_vazio BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS peso_carga_kg NUMERIC(12,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_carga NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ncm_carga VARCHAR(8),
  ADD COLUMN IF NOT EXISTS chaves_nfe JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS chave_pix VARCHAR(120),
  ADD COLUMN IF NOT EXISTS banco_codigo VARCHAR(10),
  ADD COLUMN IF NOT EXISTS banco_agencia VARCHAR(15),
  ADD COLUMN IF NOT EXISTS banco_conta VARCHAR(25),
  ADD COLUMN IF NOT EXISTS cnpj_ipef VARCHAR(14),
  ADD COLUMN IF NOT EXISTS data_saida DATE,
  ADD COLUMN IF NOT EXISTS data_prevista_entrega DATE,
  ADD COLUMN IF NOT EXISTS valor_inss NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_irrf NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_sest_senat NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_outros_descontos NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ciot_verificador VARCHAR(10),
  ADD COLUMN IF NOT EXISTS ciot_provedor VARCHAR(30) DEFAULT 'HOMOLOGACAO_LOCAL',
  ADD COLUMN IF NOT EXISTS ciot_protocolo_encerramento VARCHAR(40),
  ADD COLUMN IF NOT EXISTS ciot_transmitido_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ciot_encerrado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ciot_erro TEXT,
  ADD COLUMN IF NOT EXISTS piso_isento BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS piso_isencao_motivo TEXT,
  ADD COLUMN IF NOT EXISTS mdfe_id INTEGER,
  ADD COLUMN IF NOT EXISTS gerar_financeiro BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS financeiro_ids JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS observacoes TEXT;

CREATE INDEX IF NOT EXISTS idx_dash_contratos_ciot_status
  ON dash_contratos_transporte (tenant_id, ciot_status);

CREATE INDEX IF NOT EXISTS idx_dash_contratos_ciot_codigo
  ON dash_contratos_transporte (tenant_id, ciot_codigo);

CREATE INDEX IF NOT EXISTS idx_dash_contratos_mdfe_id
  ON dash_contratos_transporte (tenant_id, mdfe_id);
