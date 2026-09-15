-- Migration 028: Add asaas_customer_id to dash_clientes
ALTER TABLE dash_clientes ADD COLUMN IF NOT EXISTS asaas_customer_id VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_dash_clientes_asaas_customer ON dash_clientes(tenant_id, asaas_customer_id);
