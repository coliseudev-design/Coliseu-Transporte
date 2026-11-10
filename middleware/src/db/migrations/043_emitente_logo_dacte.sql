-- ============================================================================
-- Migration 043: Logomarca Fiscal do Emitente para impressão em DACTE / DAMDFE / DANFE
-- Sincronizada automaticamente com Focus NFe v2 (/v2/empresas -> arquivo_logo_base64 / delete_logo)
-- ============================================================================

ALTER TABLE dash_emitentes
  ADD COLUMN IF NOT EXISTS logo_base64 TEXT,
  ADD COLUMN IF NOT EXISTS logo_mime VARCHAR(40) DEFAULT 'image/png',
  ADD COLUMN IF NOT EXISTS logo_atualizada_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS logo_focus_sincronizada BOOLEAN DEFAULT FALSE;
