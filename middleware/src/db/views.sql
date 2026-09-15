-- ================================================================
-- OTIMIZAÇÃO: Visões Materializadas para o Coliseu Transporte
-- ================================================================

-- 1. Visão de Vendas Diárias
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_dash_vendas_diario AS
SELECT 
    tenant_id, 
    DATE(data_venda) AS data_venda, 
    COALESCE(SUM(valor_total), 0) AS faturamento,
    COUNT(DISTINCT id_firebird) AS qtd_pedidos,
    COALESCE(SUM(valor_desconto), 0) AS total_descontos,
    COALESCE(AVG(valor_total), 0) AS ticket_medio
FROM dash_vendas
GROUP BY tenant_id, DATE(data_venda);

-- Índice único essencial para permitir REFRESH CONCURRENTLY
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_vendas_diario ON mv_dash_vendas_diario(tenant_id, data_venda);

-- 2. Visão Financeira Diária
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_dash_financeiro_diario AS
SELECT 
    tenant_id, 
    COALESCE(DATE(data_vencimento), DATE(data_emissao)) AS data_ref,
    tipo,
    status_pagamento,
    COALESCE(SUM(valor), 0) AS valor_bruto,
    COALESCE(SUM(valor_pago), 0) AS valor_pago
FROM dash_financeiro
GROUP BY tenant_id, COALESCE(DATE(data_vencimento), DATE(data_emissao)), tipo, status_pagamento;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_financeiro_diario ON mv_dash_financeiro_diario(tenant_id, data_ref, tipo, status_pagamento);
