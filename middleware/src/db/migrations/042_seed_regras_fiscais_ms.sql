-- Migration 042: Parametrização inicial idempotente das Regras Fiscais para emitentes de MS
-- Importante: NUNCA sobrescreve regras já configuradas pelo cliente (ex.: Simples Nacional CST SN).

DO $$
DECLARE
    t_record RECORD;
    v_cst VARCHAR(10);
    v_aliq_interna NUMERIC(10,4);
    v_aliq_inter NUMERIC(10,4);
BEGIN
    FOR t_record IN
        SELECT DISTINCT ON (tenant_id)
            tenant_id,
            UPPER(COALESCE(uf, '')) AS uf,
            COALESCE(regime_tributario, '3') AS regime_tributario
        FROM dash_emitentes
        WHERE tenant_id IS NOT NULL
        ORDER BY tenant_id, padrao DESC NULLS LAST, id ASC
    LOOP
        v_cst := CASE WHEN TRIM(t_record.regime_tributario) IN ('1', '2', '4') THEN 'SN' ELSE '00' END;
        v_aliq_interna := CASE WHEN v_cst = 'SN' THEN 0.0000 ELSE 17.0000 END;
        v_aliq_inter := CASE WHEN v_cst = 'SN' THEN 0.0000 ELSE 12.0000 END;

        -- Apenas semeia regras específicas de MS se o emitente for de MS e ainda não possuir a regra
        IF t_record.uf = 'MS' THEN
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
                    v_cst, '5353', v_aliq_interna, 0.0000,
                    FALSE, 'PESO', 0.00, TRUE,
                    '000', '000001', 0.1000, 0.0000, 0.9000,
                    0.0000, 0.0000, '000001', '2026-01-01'
                );
            END IF;

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
                    v_cst, '6353', v_aliq_inter, 0.0000,
                    FALSE, 'PESO', 0.00, TRUE,
                    '000', '000001', 0.1000, 0.0000, 0.9000,
                    0.0000, 0.0000, '000001', '2026-01-01'
                );
            END IF;
        END IF;

        -- Regra Global Padrão (apenas se o tenant não tiver nenhuma regra GLOBAL cadastrada)
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
                v_cst, '6353', v_aliq_inter, 0.0000,
                FALSE, 'PESO', 0.00, TRUE,
                '000', '000001', 0.1000, 0.0000, 0.9000,
                0.0000, 0.0000, '000001', '2026-01-01'
            );
        END IF;
    END LOOP;
END $$;
