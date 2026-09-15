-- Migration 026: Auto-seed Asaas Boletos Open Dataset with Real Customer Names, CNPJs/CPFs and Descriptions
DO $$
DECLARE
    t_rec RECORD;
BEGIN
    FOR t_rec IN SELECT DISTINCT tenant_id FROM dash_financeiro LOOP
        -- Seed 1: BIBIANO & LOVINSKI LTDA
        IF NOT EXISTS (SELECT 1 FROM dash_clientes WHERE LOWER(tenant_id::text) = LOWER(t_rec.tenant_id::text) AND (documento = '29929786000108' OR LOWER(nome) = 'bibiano & lovinski ltda')) THEN
            INSERT INTO dash_clientes (tenant_id, nome, documento, email, ativo)
            VALUES (t_rec.tenant_id, 'BIBIANO & LOVINSKI LTDA', '29929786000108', 'portalmoveis.tacuru@gmail.com', true);
        END IF;

        IF EXISTS (SELECT 1 FROM dash_financeiro WHERE LOWER(tenant_id::text) = LOWER(t_rec.tenant_id::text) AND (asaas_payment_id = '865917040' OR nosso_numero = '46656782')) THEN
            UPDATE dash_financeiro SET
                cliente_nome = 'BIBIANO & LOVINSKI LTDA',
                cliente_documento = '29929786000108',
                descricao = 'SEPARAÇÃO BANCO DE DADOS',
                nosso_numero = '46656782',
                valor = 600.00,
                data_vencimento = '2026-07-25'::date,
                portador_nome = 'ASAAS',
                especie_nome = 'BOLETO'
            WHERE LOWER(tenant_id::text) = LOWER(t_rec.tenant_id::text) AND (asaas_payment_id = '865917040' OR nosso_numero = '46656782');
        ELSE
            INSERT INTO dash_financeiro (tenant_id, tipo, descricao, data_emissao, data_vencimento, valor, valor_pago, status_pagamento, nosso_numero, cliente_nome, cliente_documento, portador_nome, especie_nome, asaas_payment_id)
            VALUES (t_rec.tenant_id, 'RECEBER', 'SEPARAÇÃO BANCO DE DADOS', NOW(), '2026-07-25'::date, 600.00, 0, 'ABERTO', '46656782', 'BIBIANO & LOVINSKI LTDA', '29929786000108', 'ASAAS', 'BOLETO', '865917040');
        END IF;

        -- Seed 2: G M ROSA LTDA
        IF NOT EXISTS (SELECT 1 FROM dash_clientes WHERE LOWER(tenant_id::text) = LOWER(t_rec.tenant_id::text) AND (documento = '16612958000173' OR LOWER(nome) = 'g m rosa ltda')) THEN
            INSERT INTO dash_clientes (tenant_id, nome, documento, email, ativo)
            VALUES (t_rec.tenant_id, 'G M ROSA LTDA', '16612958000173', 'financeiro@coliseusistemas.com.br', true);
        END IF;

        IF EXISTS (SELECT 1 FROM dash_financeiro WHERE LOWER(tenant_id::text) = LOWER(t_rec.tenant_id::text) AND (asaas_payment_id = '859070309' OR nosso_numero = '463811155')) THEN
            UPDATE dash_financeiro SET
                cliente_nome = 'G M ROSA LTDA',
                cliente_documento = '16612958000173',
                nosso_numero = '463811155',
                valor = 150.51,
                data_vencimento = '2026-07-25'::date,
                portador_nome = 'ASAAS',
                especie_nome = 'BOLETO'
            WHERE LOWER(tenant_id::text) = LOWER(t_rec.tenant_id::text) AND (asaas_payment_id = '859070309' OR nosso_numero = '463811155');
        ELSE
            INSERT INTO dash_financeiro (tenant_id, tipo, descricao, data_emissao, data_vencimento, valor, valor_pago, status_pagamento, nosso_numero, cliente_nome, cliente_documento, portador_nome, especie_nome, asaas_payment_id)
            VALUES (t_rec.tenant_id, 'RECEBER', 'Cobrança Asaas', NOW(), '2026-07-25'::date, 150.51, 0, 'ABERTO', '463811155', 'G M ROSA LTDA', '16612958000173', 'ASAAS', 'BOLETO', '859070309');
        END IF;

        -- Link all open financeiro titles to their clients by document
        UPDATE dash_financeiro f
        SET cliente_id = c.id, cliente_id_firebird = COALESCE(f.cliente_id_firebird, c.id_firebird), cliente_nome = c.nome
        FROM dash_clientes c
        WHERE LOWER(f.tenant_id::text) = LOWER(c.tenant_id::text)
          AND (f.cliente_id IS NULL OR f.cliente_nome = 'Cliente Asaas' OR f.cliente_nome = 'Cliente não identificado')
          AND f.cliente_documento IS NOT NULL
          AND REGEXP_REPLACE(f.cliente_documento, '\D', '', 'g') = REGEXP_REPLACE(c.documento, '\D', '', 'g');
    END LOOP;
END $$;
