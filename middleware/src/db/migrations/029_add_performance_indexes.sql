-- Migration 029: Índices de Alta Performance para dash_financeiro e dash_clientes
-- Reduz latência de queries de conciliação e buscas de datas de quitação

CREATE INDEX IF NOT EXISTS idx_dash_fin_tenant_asaas 
    ON dash_financeiro(tenant_id, asaas_payment_id);

CREATE INDEX IF NOT EXISTS idx_dash_fin_tenant_nosso_num 
    ON dash_financeiro(tenant_id, nosso_numero);

CREATE INDEX IF NOT EXISTS idx_dash_fin_tenant_pagamento 
    ON dash_financeiro(tenant_id, data_pagamento);

CREATE INDEX IF NOT EXISTS idx_dash_fin_tenant_cli_fb 
    ON dash_financeiro(tenant_id, cliente_id_firebird);

CREATE INDEX IF NOT EXISTS idx_dash_fin_tenant_status_venc 
    ON dash_financeiro(tenant_id, status_pagamento, data_vencimento);

CREATE INDEX IF NOT EXISTS idx_dash_clientes_tenant_fb 
    ON dash_clientes(tenant_id, id_firebird);
