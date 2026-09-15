-- Migration 020: Cria tabelas ADM para o WorkerADM
-- Tabelas para ocorrências, itens de ocorrências e contas/plano de contas

-- ============================================================
-- ADM_OCORRENCIAS
-- ============================================================
CREATE TABLE IF NOT EXISTS adm_ocorrencias (
    id              SERIAL PRIMARY KEY,
    tenant_id       UUID NOT NULL,
    id_firebird     INTEGER,
    numero          INTEGER,
    data_abertura   TIMESTAMPTZ,
    data_fechamento TIMESTAMPTZ,
    status          VARCHAR(50),
    tipo            VARCHAR(100),
    descricao       TEXT,
    cliente_id_firebird INTEGER,
    responsavel     VARCHAR(255),
    prioridade      VARCHAR(50),
    sincronizado_em TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (tenant_id, id_firebird)
);

CREATE INDEX IF NOT EXISTS idx_adm_ocorrencias_tenant ON adm_ocorrencias(tenant_id);
CREATE INDEX IF NOT EXISTS idx_adm_ocorrencias_firebird ON adm_ocorrencias(tenant_id, id_firebird);

-- ============================================================
-- ADM_OCORRENCIAS_ITENS
-- ============================================================
CREATE TABLE IF NOT EXISTS adm_ocorrencias_itens (
    id                    SERIAL PRIMARY KEY,
    tenant_id             UUID NOT NULL,
    id_firebird           INTEGER,
    ocorrencia_id_firebird INTEGER,
    descricao             TEXT,
    quantidade            NUMERIC(15,4),
    valor_unitario        NUMERIC(15,4),
    valor_total           NUMERIC(15,4),
    sincronizado_em       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (tenant_id, id_firebird)
);

CREATE INDEX IF NOT EXISTS idx_adm_ocorrencias_itens_tenant ON adm_ocorrencias_itens(tenant_id);
CREATE INDEX IF NOT EXISTS idx_adm_ocorrencias_itens_ocorrencia ON adm_ocorrencias_itens(tenant_id, ocorrencia_id_firebird);

-- ============================================================
-- REL_IC_CONTAS_PLANO_RES (Plano de Contas)
-- ============================================================
CREATE TABLE IF NOT EXISTS rel_ic_contas_plano_res (
    id                    SERIAL PRIMARY KEY,
    tenant_id             UUID NOT NULL,
    id_firebird           INTEGER,
    codigo                VARCHAR(50),
    descricao             VARCHAR(500),
    tipo                  VARCHAR(50),
    nivel                 INTEGER,
    conta_pai_id_firebird INTEGER,
    ativo                 BOOLEAN DEFAULT TRUE,
    sincronizado_em       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (tenant_id, id_firebird)
);

CREATE INDEX IF NOT EXISTS idx_rel_ic_contas_tenant ON rel_ic_contas_plano_res(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rel_ic_contas_firebird ON rel_ic_contas_plano_res(tenant_id, id_firebird);
