-- ============================================================================
-- Migration 044: Composição da Base Líquida do IBS/CBS (LC 214/2025, art. 12, § 2º, V)
-- e Parametrização de PIS/COFINS no Cadastro do Emitente, Regras Fiscais e CT-e 4.00
-- NOTA: Documentos já AUTORIZADOS permanecem integralmente preservados.
-- ============================================================================

-- 1. Parametrização padrão de PIS/COFINS no emitente (sem presumir alíquotas pelo CRT)
ALTER TABLE dash_emitentes
  ADD COLUMN IF NOT EXISTS pis_cofins_modo VARCHAR(20) DEFAULT 'NAO_APURADO',
  ADD COLUMN IF NOT EXISTS pis_cst VARCHAR(2),
  ADD COLUMN IF NOT EXISTS aliquota_pis NUMERIC(7,4),
  ADD COLUMN IF NOT EXISTS cofins_cst VARCHAR(2),
  ADD COLUMN IF NOT EXISTS aliquota_cofins NUMERIC(7,4),
  ADD COLUMN IF NOT EXISTS excluir_icms_base_pis_cofins BOOLEAN DEFAULT TRUE;

-- 2. Parametrização de PIS/COFINS por regra fiscal (rota/UF/global)
ALTER TABLE dash_regras_fiscais
  ADD COLUMN IF NOT EXISTS pis_cofins_modo VARCHAR(20) DEFAULT 'NAO_APURADO',
  ADD COLUMN IF NOT EXISTS pis_cst VARCHAR(2),
  ADD COLUMN IF NOT EXISTS aliquota_pis NUMERIC(7,4),
  ADD COLUMN IF NOT EXISTS cofins_cst VARCHAR(2),
  ADD COLUMN IF NOT EXISTS aliquota_cofins NUMERIC(7,4),
  ADD COLUMN IF NOT EXISTS excluir_icms_base_pis_cofins BOOLEAN DEFAULT TRUE;

-- 3. Rastreabilidade da base líquida do IBS/CBS, PIS/COFINS e pendências fiscais no CT-e
ALTER TABLE dash_ctes
  ADD COLUMN IF NOT EXISTS ibs_cbs_base_calculo NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS pis_cofins_modo VARCHAR(20) DEFAULT 'NAO_APURADO',
  ADD COLUMN IF NOT EXISTS pis_cst VARCHAR(2),
  ADD COLUMN IF NOT EXISTS aliquota_pis NUMERIC(7,4),
  ADD COLUMN IF NOT EXISTS valor_pis NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cofins_cst VARCHAR(2),
  ADD COLUMN IF NOT EXISTS aliquota_cofins NUMERIC(7,4),
  ADD COLUMN IF NOT EXISTS valor_cofins NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS excluir_icms_base_pis_cofins BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS pendencias_fiscais JSONB DEFAULT '[]'::jsonb;
