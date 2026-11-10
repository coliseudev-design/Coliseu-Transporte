-- Migration 042: Parametrização automática das Regras Fiscais de Transporte conforme Legislação Vigente SEFAZ/MS
-- Base Legal:
--   1. Lei Estadual MS nº 1.810/1997 (Art. 41, III) e RICMS/MS (Decreto nº 9.203/1998):
--      - Prestação Interna Intermunicipal no MS (MS -> MS): Alíquota ICMS = 17,00%, CST = 00, CFOP = 5353, FCP = 0,00%.
--   2. Resolução do Senado Federal nº 22/1989:
--      - Prestação Interestadual iniciada no MS (Centro-Oeste -> Qualquer UF): Alíquota ICMS = 12,00%, CST = 00, CFOP = 6353.
--   3. Reforma Tributária do Consumo — LC 214/2025 e NT 2025.001 / NT 2026.002 (Transição 2026):
--      - CST IBS/CBS = 000 (Tributação Integral), cClassTrib = 000001, Alíquota IBS UF = 0,10%, IBS Mun = 0,00%, CBS = 0,90%.

DO $$
DECLARE
    t_record RECORD;
BEGIN
    FOR t_record IN SELECT DISTINCT tenant_id FROM dash_emitentes WHERE tenant_id IS NOT NULL
    LOOP
        -- 1. Regra Interna Mato Grosso do Sul (MS -> MS): ICMS 17%, CFOP 5353, IBS 0,10%, CBS 0,90%
        IF NOT EXISTS (
            SELECT 1 FROM dash_regras_fiscais
            WHERE tenant_id = t_record.tenant_id AND escopo = 'UF_PAR' AND uf_origem = 'MS' AND uf_destino = 'MS'
        ) THEN
            INSERT INTO dash_regras_fiscais (
                tenant_id, escopo, uf_origem, uf_destino, tipo_servico,
                situacao_tributaria, cfop, aliquota_icms, percentual_fcp,
                is_final_consumer, criterio_rateio, percentual_adicional, ativo,
                ibs_cbs_cst, ibs_cbs_class_trib, aliquota_ibs, aliquota_ibs_mun, aliquota_cbs,
                reducao_aliquota_ibs_cbs, diferimento_ibs_cbs, codigo_situacao_fiscal, vigente_de
            ) VALUES (
                t_record.tenant_id, 'UF_PAR', 'MS', 'MS', '0',
                '00', '5353', 17.0000, 0.0000,
                FALSE, 'PESO', 0.00, TRUE,
                '000', '000001', 0.1000, 0.0000, 0.9000,
                0.0000, 0.0000, '000001', '2026-01-01'
            );
        ELSE
            UPDATE dash_regras_fiscais
            SET situacao_tributaria = '00',
                cfop = COALESCE(NULLIF(cfop, ''), '5353'),
                aliquota_icms = 17.0000,
                ibs_cbs_cst = COALESCE(NULLIF(ibs_cbs_cst, ''), '000'),
                ibs_cbs_class_trib = COALESCE(NULLIF(ibs_cbs_class_trib, ''), '000001'),
                aliquota_ibs = CASE WHEN COALESCE(aliquota_ibs, 0) = 0 THEN 0.1000 ELSE aliquota_ibs END,
                aliquota_ibs_mun = COALESCE(aliquota_ibs_mun, 0.0000),
                aliquota_cbs = CASE WHEN COALESCE(aliquota_cbs, 0) = 0 THEN 0.9000 ELSE aliquota_cbs END,
                codigo_situacao_fiscal = COALESCE(NULLIF(codigo_situacao_fiscal, ''), '000001'),
                updated_at = NOW()
            WHERE tenant_id = t_record.tenant_id AND escopo = 'UF_PAR' AND uf_origem = 'MS' AND uf_destino = 'MS';
        END IF;

        -- 2. Regra Por UF de Origem MS (Saídas Interestaduais de MS): ICMS 12%, CFOP 6353, IBS 0,10%, CBS 0,90%
        IF NOT EXISTS (
            SELECT 1 FROM dash_regras_fiscais
            WHERE tenant_id = t_record.tenant_id AND escopo = 'UF' AND uf_origem = 'MS'
        ) THEN
            INSERT INTO dash_regras_fiscais (
                tenant_id, escopo, uf_origem, uf_destino, tipo_servico,
                situacao_tributaria, cfop, aliquota_icms, percentual_fcp,
                is_final_consumer, criterio_rateio, percentual_adicional, ativo,
                ibs_cbs_cst, ibs_cbs_class_trib, aliquota_ibs, aliquota_ibs_mun, aliquota_cbs,
                reducao_aliquota_ibs_cbs, diferimento_ibs_cbs, codigo_situacao_fiscal, vigente_de
            ) VALUES (
                t_record.tenant_id, 'UF', 'MS', NULL, '0',
                '00', '6353', 12.0000, 0.0000,
                FALSE, 'PESO', 0.00, TRUE,
                '000', '000001', 0.1000, 0.0000, 0.9000,
                0.0000, 0.0000, '000001', '2026-01-01'
            );
        END IF;

        -- 3. Regra Global Padrão (Fallback Geral): ICMS 12%, CFOP 6353, IBS 0,10%, CBS 0,90%
        IF NOT EXISTS (
            SELECT 1 FROM dash_regras_fiscais
            WHERE tenant_id = t_record.tenant_id AND escopo = 'GLOBAL'
        ) THEN
            INSERT INTO dash_regras_fiscais (
                tenant_id, escopo, uf_origem, uf_destino, tipo_servico,
                situacao_tributaria, cfop, aliquota_icms, percentual_fcp,
                is_final_consumer, criterio_rateio, percentual_adicional, ativo,
                ibs_cbs_cst, ibs_cbs_class_trib, aliquota_ibs, aliquota_ibs_mun, aliquota_cbs,
                reducao_aliquota_ibs_cbs, diferimento_ibs_cbs, codigo_situacao_fiscal, vigente_de
            ) VALUES (
                t_record.tenant_id, 'GLOBAL', NULL, NULL, '0',
                '00', '6353', 12.0000, 0.0000,
                FALSE, 'PESO', 0.00, TRUE,
                '000', '000001', 0.1000, 0.0000, 0.9000,
                0.0000, 0.0000, '000001', '2026-01-01'
            );
        END IF;
    END LOOP;
END $$;
