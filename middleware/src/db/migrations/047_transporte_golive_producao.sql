-- Migration 047: Blindagem Go-Live Produção (Numeração Fiscal por Série, CIOT Integrador Token e Índices)

ALTER TABLE dash_emitentes
    ADD COLUMN IF NOT EXISTS ultimo_numero_cte INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ultimo_numero_mdfe INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS serie_padrao_cte VARCHAR(5) DEFAULT '1',
    ADD COLUMN IF NOT EXISTS serie_padrao_mdfe VARCHAR(5) DEFAULT '1',
    ADD COLUMN IF NOT EXISTS efrete_integrador_token TEXT,
    ADD COLUMN IF NOT EXISTS ciot_api_url_producao TEXT,
    ADD COLUMN IF NOT EXISTS ciot_api_url_homologacao TEXT;

CREATE INDEX IF NOT EXISTS idx_dash_ctes_tenant_emitente_serie_num
    ON dash_ctes (tenant_id, emitente_id, serie, numero DESC);

CREATE INDEX IF NOT EXISTS idx_dash_mdfes_tenant_emitente_serie_num
    ON dash_mdfes (tenant_id, emitente_id, serie, numero DESC);

CREATE INDEX IF NOT EXISTS idx_dash_cargas_tenant_cte_id
    ON dash_cargas (tenant_id, cte_id)
    WHERE cte_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dash_cargas_tenant_mdfe_id
    ON dash_cargas (tenant_id, mdfe_id)
    WHERE mdfe_id IS NOT NULL;
