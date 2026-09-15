-- Migration 030: Fix dash_sync_metadata unique constraint to allow operation queue
ALTER TABLE dash_sync_metadata DROP CONSTRAINT IF EXISTS dash_sync_metadata_tenant_id_tabela_key;
DROP INDEX IF EXISTS dash_sync_metadata_tenant_id_tabela_key;
CREATE UNIQUE INDEX IF NOT EXISTS dash_sync_metadata_status_unique ON dash_sync_metadata(tenant_id, tabela) WHERE operacao IS NULL;
