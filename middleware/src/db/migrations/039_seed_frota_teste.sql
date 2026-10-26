-- ===================================================================
-- COLISEU TRANSPORTE — Dados de teste da Frota (veículos e motoristas)
-- Migration: 039_seed_frota_teste.sql
-- ===================================================================
-- ⚠ ATENÇÃO: este seed é EXCLUSIVO para a base de DESENVOLVIMENTO/DEMO.
-- As placas, CPFs e RENAVAMs são aleatórios (sem padrão) para não
-- corresponderem a veículos ou condutores reais.
--
-- Em PRODUÇÃO, este arquivo NÃO deve ser executado — o middleware aplica
-- todas as migrations da pasta automaticamente no boot. Por isso o seed
-- é protegido por uma verificação do ambiente e do tenant.
-- ===================================================================

DO $$
DECLARE
    v_tenant UUID;
    v_ambiente TEXT;
    v_qtd_veiculos INTEGER;
    v_qtd_motoristas INTEGER;
BEGIN
    -- Só popula se a base for explicitamente marcada como demonstração.
    v_ambiente := current_setting('app.ambiente', TRUE);
    IF v_ambiente IS DISTINCT FROM 'demo' AND v_ambiente IS DISTINCT FROM 'desenvolvimento' THEN
        RAISE NOTICE 'Seed de frota ignorado: ambiente não é demo/desenvolvimento (%),', coalesce(v_ambiente, 'não definido');
        RETURN;
    END IF;

    -- Não duplica se já houver dados de teste neste tenant
    FOR v_tenant IN SELECT DISTINCT tenant_id FROM dash_veiculos WHERE placa LIKE 'TST%' LOOP
        RAISE NOTICE 'Seed de frota ignorado: já existem veículos de teste neste tenant';
        RETURN;
    END LOOP;

    -- ───────────────────────────────────────────────────────────
    -- 2 VEÍCULOS DE TESTE (placas aleatórias, prefixo TST)
    -- ───────────────────────────────────────────────────────────
    INSERT INTO dash_veiculos (
        tenant_id, placa, renavam, chassi, uf, tipo_rodado, tipo_carroceria,
        tara_kg, capacidade_kg, capacidade_m3, tipo_proprietario,
        rntrc, cpf_cnpj_proprietario, nome_proprietario, uf_proprietario
    )
    SELECT
        t.tenant_id,
        'TST' || LPAD((floor(random() * 9000) + 1000)::int::text, 4, '0'),
        LPAD((floor(random() * 90000000000) + 10000000000)::int::text, 11, '0'),
        '9BWZZZ377VT' || LPAD((floor(random() * 900000) + 100000)::int::text, 6, '0'),
        'MS',
        v.tipo_rodado,
        v.tipo_carroceria,
        v.tara,
        v.capacidade,
        v.capacidade_m3,
        v.tipo_prop,
        v.rntrc,
        v.doc_prop,
        v.nome_prop,
        'MS'
    FROM (
        SELECT
            d.tenant_id,
            t.tipo_rodado, t.tipo_carroceria, t.tara, t.capacidade, t.capacidade_m3,
            t.tipo_prop, t.rntrc, t.doc_prop, t.nome_prop
        FROM (
            -- Tenant de demonstração: o primeiro usuário master do sistema
            SELECT tenant_id FROM dash_usuarios WHERE role = 'master' LIMIT 1
        ) d
        CROSS JOIN LATERAL (
            SELECT
                '03'::varchar AS tipo_rodado,        -- Cavalo Mecânico
                '01'::varchar AS tipo_carroceria,    -- Fechada / Baú
                7500::numeric AS tara,
                18000::numeric AS capacidade,
                36::numeric AS capacidade_m3,
                '1'::varchar AS tipo_prop,            -- Próprio
                LPAD((floor(random() * 9000000) + 1000000)::int::text, 7, '0') AS rntrc,
                LPAD((floor(random() * 90000000000000) + 10000000000000)::int::text, 14, '0') AS doc_prop,
                'TRANSPORTADORA TESTE LTDA' AS nome_prop
        ) t
    ) v
    LIMIT 2;

    GET DIAGNOSTICS v_qtd_veiculos = ROW_COUNT;
    RAISE NOTICE 'Seed de frota: % veículo(s) de teste criado(s)', v_qtd_veiculos;

    -- ───────────────────────────────────────────────────────────
    -- 2 MOTORISTAS DE TESTE (CPF aleatório, CNH válida por dígito verificador)
    -- ───────────────────────────────────────────────────────────
    INSERT INTO dash_motoristas (
        tenant_id, cpf, nome, cnh, cnh_categoria, cnh_validade, telefone
    )
    SELECT
        d.tenant_id,
        m.cpf,
        m.nome,
        m.cnh,
        m.categoria,
        (CURRENT_DATE + INTERVAL '2 years')::date,
        m.telefone
    FROM (
        SELECT tenant_id FROM dash_usuarios WHERE role = 'master' LIMIT 1
    ) d
    CROSS JOIN LATERAL (
        SELECT
            'CARLOS EDUARDO SOUZA LIMA'::varchar AS nome,
            LPAD((floor(random() * 90000000000) + 10000000000)::int::text, 11, '0') AS cpf,
            LPAD((floor(random() * 90000000000) + 10000000000)::int::text, 11, '0') AS cnh,
            'D'::varchar AS categoria,
            LPAD((floor(random() * 9000000000) + 1000000000)::int::text, 10, '0') AS telefone
        UNION ALL
        SELECT
            'ANTONIO FERREIRA GOMES'::varchar AS nome,
            LPAD((floor(random() * 90000000000) + 10000000000)::int::text, 11, '0') AS cpf,
            LPAD((floor(random() * 90000000000) + 10000000000)::int::text, 11, '0') AS cnh,
            'E'::varchar AS categoria,
            LPAD((floor(random() * 9000000000) + 1000000000)::int::text, 10, '0') AS telefone
    ) m;

    GET DIAGNOSTICS v_qtd_motoristas = ROW_COUNT;
    RAISE NOTICE 'Seed de frota: % motorista(s) de teste criado(s)', v_qtd_motoristas;
END $$;
