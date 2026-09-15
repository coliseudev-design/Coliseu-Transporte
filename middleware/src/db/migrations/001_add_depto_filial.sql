-- ================================================================
-- MIGRAÇÃO 001: Filtro por Filial/Departamento
-- Nexus — Versão: 2026-05-11
-- ================================================================
-- Como aplicar LOCALMENTE (teste):
--   psql -h localhost -p 5433 -U nexus_admin -d nexus_dashboard_local -f 001_add_depto_filial.sql
--
-- Como aplicar na VPS (só após testes locais aprovados):
--   Ver script deploy_schema_patch.py ou via SSH
-- ================================================================

-- ----------------------------------------------------------------
-- PARTE 1: Adicionar depto_id nas tabelas de vendas e financeiro
-- (idempotente — usa IF NOT EXISTS e ALTER ... ADD COLUMN IF NOT EXISTS)
-- ----------------------------------------------------------------

ALTER TABLE dash_vendas 
    ADD COLUMN IF NOT EXISTS depto_id INTEGER DEFAULT NULL;

ALTER TABLE dash_vendas_itens 
    ADD COLUMN IF NOT EXISTS depto_id INTEGER DEFAULT NULL;

ALTER TABLE dash_financeiro 
    ADD COLUMN IF NOT EXISTS depto_id INTEGER DEFAULT NULL;

-- ----------------------------------------------------------------
-- PARTE 2: Índices de performance para queries filtradas por filial
-- ----------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_dash_vendas_depto 
    ON dash_vendas(tenant_id, depto_id);

CREATE INDEX IF NOT EXISTS idx_dash_vendas_depto_data 
    ON dash_vendas(tenant_id, depto_id, data_venda);

CREATE INDEX IF NOT EXISTS idx_dash_financeiro_depto 
    ON dash_financeiro(tenant_id, depto_id);

CREATE INDEX IF NOT EXISTS idx_dash_vend_itens_depto 
    ON dash_vendas_itens(tenant_id, depto_id);

-- ----------------------------------------------------------------
-- PARTE 3: Tabela de Filiais (espelho do Identity Server)
-- Receberá os dados via Worker → Middleware sync
-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS dash_filiais (
    id          SERIAL PRIMARY KEY,
    tenant_id   UUID NOT NULL,
    empresa_erp INTEGER NOT NULL,   -- ID_EMPRESA no ERP (ex: 1, 2, 3)
    depto_id    INTEGER NOT NULL,   -- ID_DEPTO no ERP (ex: 1, 2, 3)
    centro_custo INTEGER,           -- ID_CC no ERP
    nome        VARCHAR(200) NOT NULL,
    documento   VARCHAR(30),        -- CNPJ
    is_default  BOOLEAN DEFAULT FALSE,
    ativo       BOOLEAN DEFAULT TRUE,
    sincronizado_em TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, depto_id)
);

CREATE INDEX IF NOT EXISTS idx_dash_filiais_tenant 
    ON dash_filiais(tenant_id);

-- ----------------------------------------------------------------
-- PARTE 4: Permissão de acesso por filial no cadastro de usuários
-- Formato: 'todas' | '1' | '1,3' (IDs de depto_id separados por vírgula)
-- ----------------------------------------------------------------

ALTER TABLE dash_usuarios 
    ADD COLUMN IF NOT EXISTS filial_acesso VARCHAR(100) DEFAULT 'todas';

-- Usuários já existentes recebem acesso a 'todas' por padrão
UPDATE dash_usuarios 
    SET filial_acesso = 'todas' 
    WHERE filial_acesso IS NULL;

-- ----------------------------------------------------------------
-- PARTE 5: Atualizar Materialized Views para incluir depto_id
-- Precisa dropar e recriar pois postgres não suporta ADD COLUMN em mat. views
-- ----------------------------------------------------------------

-- Dropa as views antigas (existência verificada com DROP IF EXISTS)
DROP MATERIALIZED VIEW IF EXISTS mv_dash_vendas_diario;
DROP MATERIALIZED VIEW IF EXISTS mv_dash_financeiro_diario;

-- Recria com depto_id na dimensão de agrupamento
CREATE MATERIALIZED VIEW mv_dash_vendas_diario AS
SELECT 
    tenant_id,
    depto_id,
    DATE(data_venda) AS data_venda,
    COALESCE(SUM(valor_total), 0) AS faturamento,
    COUNT(DISTINCT id_firebird) AS qtd_pedidos,
    COALESCE(SUM(valor_desconto), 0) AS total_descontos,
    COALESCE(AVG(valor_total), 0) AS ticket_medio
FROM dash_vendas
GROUP BY tenant_id, depto_id, DATE(data_venda);

-- Índice único agora inclui depto_id
CREATE UNIQUE INDEX idx_mv_vendas_diario 
    ON mv_dash_vendas_diario(tenant_id, depto_id, data_venda);

CREATE MATERIALIZED VIEW mv_dash_financeiro_diario AS
SELECT 
    tenant_id,
    depto_id,
    COALESCE(DATE(data_vencimento), DATE(data_emissao)) AS data_ref,
    tipo,
    status_pagamento,
    COALESCE(SUM(valor), 0) AS valor_bruto,
    COALESCE(SUM(valor_pago), 0) AS valor_pago
FROM dash_financeiro
GROUP BY tenant_id, depto_id, COALESCE(DATE(data_vencimento), DATE(data_emissao)), tipo, status_pagamento;

CREATE UNIQUE INDEX idx_mv_financeiro_diario 
    ON mv_dash_financeiro_diario(tenant_id, depto_id, data_ref, tipo, status_pagamento);

-- ----------------------------------------------------------------
-- VERIFICAÇÃO FINAL (informativo)
-- ----------------------------------------------------------------
DO $$
DECLARE
    v_col_exists boolean;
BEGIN
    -- Verificar depto_id em dash_vendas
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='dash_vendas' AND column_name='depto_id'
    ) INTO v_col_exists;
    
    IF v_col_exists THEN
        RAISE NOTICE '✅ dash_vendas.depto_id: OK';
    ELSE
        RAISE WARNING '❌ dash_vendas.depto_id: FALHOU';
    END IF;

    -- Verificar dash_filiais
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name='dash_filiais'
    ) INTO v_col_exists;
    
    IF v_col_exists THEN
        RAISE NOTICE '✅ dash_filiais: OK';
    ELSE
        RAISE WARNING '❌ dash_filiais: FALHOU';
    END IF;

    -- Verificar filial_acesso em dash_usuarios
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='dash_usuarios' AND column_name='filial_acesso'
    ) INTO v_col_exists;
    
    IF v_col_exists THEN
        RAISE NOTICE '✅ dash_usuarios.filial_acesso: OK';
    ELSE
        RAISE WARNING '❌ dash_usuarios.filial_acesso: FALHOU';
    END IF;

    RAISE NOTICE '🏢 Migração 001 (Filtro por Filial) concluída!';
END $$;
