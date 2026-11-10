-- ===================================================================
-- COLISEU TRANSPORTE — Reforma Tributária do Consumo (IBS / CBS)
-- Migration: 041_reforma_tributaria_ibs_cbs.sql
-- Adequação à NT 2025.001 / NT 2026.002 CT-e 4.00 e LC 214/2025
-- (Evita Rejeição SEFAZ 310: IBS / CBS não informado, 360 e 365: vTotDFe)
-- ===================================================================

-- 1. Campos da Reforma Tributária em dash_regras_fiscais
ALTER TABLE dash_regras_fiscais ADD COLUMN IF NOT EXISTS ibs_cbs_cst VARCHAR(3) DEFAULT '000';
ALTER TABLE dash_regras_fiscais ADD COLUMN IF NOT EXISTS ibs_cbs_class_trib VARCHAR(6) DEFAULT '000001';
ALTER TABLE dash_regras_fiscais ADD COLUMN IF NOT EXISTS aliquota_ibs NUMERIC(7,4) DEFAULT 0.1000;
ALTER TABLE dash_regras_fiscais ADD COLUMN IF NOT EXISTS aliquota_ibs_mun NUMERIC(7,4) DEFAULT 0.0000;
ALTER TABLE dash_regras_fiscais ADD COLUMN IF NOT EXISTS aliquota_cbs NUMERIC(7,4) DEFAULT 0.9000;
ALTER TABLE dash_regras_fiscais ADD COLUMN IF NOT EXISTS reducao_aliquota_ibs_cbs NUMERIC(7,4) DEFAULT 0.0000;
ALTER TABLE dash_regras_fiscais ADD COLUMN IF NOT EXISTS diferimento_ibs_cbs NUMERIC(7,4) DEFAULT 0.0000;
ALTER TABLE dash_regras_fiscais ADD COLUMN IF NOT EXISTS codigo_situacao_fiscal VARCHAR(20) DEFAULT '000001';
ALTER TABLE dash_regras_fiscais ADD COLUMN IF NOT EXISTS vigente_de DATE DEFAULT CURRENT_DATE;
ALTER TABLE dash_regras_fiscais ADD COLUMN IF NOT EXISTS vigente_ate DATE;

-- Atualiza regras fiscais existentes que estavam com IBS/CBS zerados para o padrão de transição 2026 (IBS UF 0,10% / IBS Mun 0,00% / CBS 0,90%)
UPDATE dash_regras_fiscais
SET ibs_cbs_cst = COALESCE(NULLIF(ibs_cbs_cst, ''), '000'),
    ibs_cbs_class_trib = COALESCE(NULLIF(ibs_cbs_class_trib, ''), '000001'),
    codigo_situacao_fiscal = COALESCE(NULLIF(codigo_situacao_fiscal, ''), '000001'),
    aliquota_ibs = CASE WHEN COALESCE(aliquota_ibs, 0) = 0 THEN 0.1000 ELSE aliquota_ibs END,
    aliquota_ibs_mun = COALESCE(aliquota_ibs_mun, 0.0000),
    aliquota_cbs = CASE WHEN COALESCE(aliquota_cbs, 0) = 0 THEN 0.9000 ELSE aliquota_cbs END,
    reducao_aliquota_ibs_cbs = COALESCE(reducao_aliquota_ibs_cbs, 0.0000),
    diferimento_ibs_cbs = COALESCE(diferimento_ibs_cbs, 0.0000)
WHERE COALESCE(aliquota_ibs, 0) = 0 AND COALESCE(aliquota_cbs, 0) = 0;

-- 2. Campos da Reforma Tributária em dash_ctes
ALTER TABLE dash_ctes ADD COLUMN IF NOT EXISTS ibs_cbs_cst VARCHAR(3) DEFAULT '000';
ALTER TABLE dash_ctes ADD COLUMN IF NOT EXISTS ibs_cbs_class_trib VARCHAR(6) DEFAULT '000001';
ALTER TABLE dash_ctes ADD COLUMN IF NOT EXISTS aliquota_ibs NUMERIC(7,4) DEFAULT 0.1000;
ALTER TABLE dash_ctes ADD COLUMN IF NOT EXISTS aliquota_ibs_mun NUMERIC(7,4) DEFAULT 0.0000;
ALTER TABLE dash_ctes ADD COLUMN IF NOT EXISTS aliquota_cbs NUMERIC(7,4) DEFAULT 0.9000;
ALTER TABLE dash_ctes ADD COLUMN IF NOT EXISTS reducao_aliquota_ibs_cbs NUMERIC(7,4) DEFAULT 0.0000;
ALTER TABLE dash_ctes ADD COLUMN IF NOT EXISTS valor_ibs NUMERIC(15,2) DEFAULT 0;
ALTER TABLE dash_ctes ADD COLUMN IF NOT EXISTS valor_cbs NUMERIC(15,2) DEFAULT 0;
ALTER TABLE dash_ctes ADD COLUMN IF NOT EXISTS valor_total_dfe NUMERIC(15,2) DEFAULT 0;

-- Atualiza rascunhos/rejeitados existentes que estavam com IBS/CBS zerados para o padrão 2026
UPDATE dash_ctes
SET ibs_cbs_cst = COALESCE(NULLIF(ibs_cbs_cst, ''), '000'),
    ibs_cbs_class_trib = COALESCE(NULLIF(ibs_cbs_class_trib, ''), '000001'),
    aliquota_ibs = CASE WHEN COALESCE(aliquota_ibs, 0) = 0 THEN 0.1000 ELSE aliquota_ibs END,
    aliquota_ibs_mun = COALESCE(aliquota_ibs_mun, 0.0000),
    aliquota_cbs = CASE WHEN COALESCE(aliquota_cbs, 0) = 0 THEN 0.9000 ELSE aliquota_cbs END
WHERE status IN ('RASCUNHO', 'REJEITADO', 'PROCESSANDO')
  AND COALESCE(aliquota_ibs, 0) = 0
  AND COALESCE(aliquota_cbs, 0) = 0;
