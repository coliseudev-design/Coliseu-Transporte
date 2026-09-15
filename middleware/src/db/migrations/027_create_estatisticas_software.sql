-- Migration 027: Ensure dash_estatisticas_software table exists
CREATE TABLE IF NOT EXISTS dash_estatisticas_software (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    cliente_id INTEGER,
    cliente_id_firebird INTEGER,
    usa_nfe VARCHAR(10),
    usa_nfce VARCHAR(10),
    usa_nfse VARCHAR(10),
    usa_mdfe VARCHAR(10),
    usa_cte VARCHAR(10),
    usa_sped VARCHAR(10),
    usa_boleto VARCHAR(10),
    usa_folha VARCHAR(10),
    usa_whats VARCHAR(10),
    usa_pix VARCHAR(10),
    usa_cobranca VARCHAR(10),
    usa_os VARCHAR(10),
    usa_sales VARCHAR(10),
    usa_dash VARCHAR(10),
    usa_coletor VARCHAR(10),
    servidor VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dash_estatisticas_software_tenant ON dash_estatisticas_software(tenant_id);
