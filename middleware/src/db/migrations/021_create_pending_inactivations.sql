-- Migration 021: Tabela de fila de inativação para o ERP
-- Quando um produto/serviço é inativado no Nexus, o Worker
-- busca esta fila para refletir a inativação no Firebird (ERP).

CREATE TABLE IF NOT EXISTS pending_inactivations (
    id              SERIAL PRIMARY KEY,
    tenant_id       UUID NOT NULL,
    entidade        VARCHAR(50) NOT NULL,  -- 'produto', 'cliente', etc.
    id_firebird     INTEGER NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDENTE', -- PENDENTE, PROCESSANDO, CONCLUIDO, ERRO
    tentativas      INTEGER NOT NULL DEFAULT 0,
    erro_mensagem   TEXT,
    criado_em       TIMESTAMPTZ DEFAULT NOW(),
    processado_em   TIMESTAMPTZ,
    UNIQUE (tenant_id, entidade, id_firebird)
);

CREATE INDEX IF NOT EXISTS idx_pending_inact_tenant  ON pending_inactivations(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_pending_inact_entidade ON pending_inactivations(entidade, status);
