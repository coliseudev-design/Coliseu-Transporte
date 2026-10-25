-- ===================================================================
-- COLISEU TRANSPORTE — Regras Fiscais parametrizáveis + ajustes CIOT
-- Migration: 036_regras_fiscais_e_ciot.sql
-- ===================================================================

-- Tabela de regras fiscais (ICMS, FCP, partilha e critério de rateio)
-- Escopo: GLOBAL < UF < UF_ORIGEM x UF_DESTINO (a mais específica prevalece)
CREATE TABLE IF NOT EXISTS dash_regras_fiscais (
    id                   SERIAL PRIMARY KEY,
    tenant_id            UUID NOT NULL,
    emitente_id          INTEGER REFERENCES dash_emitentes(id) ON DELETE CASCADE,
    escopo               VARCHAR(20) NOT NULL DEFAULT 'GLOBAL', -- GLOBAL | UF | UF_PAR
    uf_origem            VARCHAR(2),
    uf_destino           VARCHAR(2),
    tipo_servico         VARCHAR(3),                            -- NULL = todos
    situacao_tributaria  VARCHAR(4) NOT NULL DEFAULT '00',      -- CST do ICMS
    cfop                 VARCHAR(8),
    aliquota_icms        NUMERIC(7,4) NOT NULL DEFAULT 0,
    percentual_fcp       NUMERIC(7,4) NOT NULL DEFAULT 0,
    part_fcp_origem      NUMERIC(7,4) NOT NULL DEFAULT 0,
    part_fcp_destino     NUMERIC(7,4) NOT NULL DEFAULT 0,
    part_icms_origem     NUMERIC(7,4) NOT NULL DEFAULT 0,
    part_icms_destino    NUMERIC(7,4) NOT NULL DEFAULT 0,
    is_final_consumer    BOOLEAN NOT NULL DEFAULT FALSE,       -- aplica DIFAL
    criterio_rateio      VARCHAR(30) NOT NULL DEFAULT 'PESO',  -- PESO | VALOR | VOLUME | FIXO | COMBINADO
    valor_minimo         NUMERIC(15,2),
    valor_maximo         NUMERIC(15,2),
    percentual_adicional NUMERIC(7,4) NOT NULL DEFAULT 0,
    ativo                BOOLEAN NOT NULL DEFAULT TRUE,
    created_at           TIMESTAMPTZ DEFAULT NOW(),
    updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dash_regras_tenant ON dash_regras_fiscais(tenant_id, ativo);
CREATE INDEX IF NOT EXISTS idx_dash_regras_rota    ON dash_regras_fiscais(tenant_id, uf_origem, uf_destino);

-- Coluna de controle de transmissão do CIOT
ALTER TABLE dash_contratos_transporte
    ADD COLUMN IF NOT EXISTS ciot_transmitido_em TIMESTAMPTZ;

-- Semente: regra padrão global para o ICMS do serviço de transporte
-- (os valores devem ser revisados pelo fiscal antes de usar em produção)
INSERT INTO dash_regras_fiscais (
    tenant_id, escopo, uf_origem, situacao_tributaria, cfop,
    aliquota_icms, percentual_fcp, criterio_rateio, ativo
)
SELECT
    '00000000-0000-0000-0000-000000000000'::uuid,
    'GLOBAL', NULL, '00', '5353',
    12.0000, 0.0000, 'PESO', TRUE
WHERE NOT EXISTS (
    SELECT 1 FROM dash_regras_fiscais
    WHERE tenant_id = '00000000-0000-0000-0000-000000000000'::uuid
      AND escopo = 'GLOBAL'
);
