-- ===================================================================
-- COLISEU TRANSPORTE — Certificados Digitais A1, Roteirização e Permissões
-- Migration: 037_transporte_avancado_certificados_permissoes.sql
-- ===================================================================

-- 1. Certificados Digitais A1 vinculados aos Emitentes
CREATE TABLE IF NOT EXISTS dash_certificados (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    emitente_id INTEGER NOT NULL REFERENCES dash_emitentes(id) ON DELETE CASCADE,
    nome_arquivo VARCHAR(255) NOT NULL,
    arquivo_pfx BYTEA NOT NULL,
    senha VARCHAR(255) NOT NULL,
    cnpj VARCHAR(14),
    razao_social VARCHAR(255),
    valido_de TIMESTAMPTZ,
    valido_ate TIMESTAMPTZ,
    dias_para_vencer INTEGER,
    status VARCHAR(20) DEFAULT 'ATIVO', -- ATIVO, EXPIRADO, REVOGADO
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, emitente_id)
);
CREATE INDEX IF NOT EXISTS idx_dash_certificados_tenant ON dash_certificados(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dash_certificados_venc ON dash_certificados(tenant_id, valido_ate);

-- 2. Tabela de Roteiros de Entrega gerados a partir do MDF-e
CREATE TABLE IF NOT EXISTS dash_roteiros_entrega (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    mdfe_id INTEGER NOT NULL REFERENCES dash_mdfes(id) ON DELETE CASCADE,
    titulo VARCHAR(255) NOT NULL,
    status VARCHAR(30) DEFAULT 'EM_ROTA', -- PLANEJADO, EM_ROTA, CONCLUIDO, CANCELADO
    distancia_total_km NUMERIC(10,2) DEFAULT 0,
    tempo_estimado_minutos INTEGER DEFAULT 0,
    total_paradas INTEGER DEFAULT 0,
    peso_total_kg NUMERIC(12,3) DEFAULT 0,
    valor_total_carga NUMERIC(15,2) DEFAULT 0,
    iniciado_em TIMESTAMPTZ,
    concluido_em TIMESTAMPTZ,
    dados_rota JSONB DEFAULT '{}'::jsonb, -- GeoJSON ou waypoints
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, mdfe_id)
);
CREATE INDEX IF NOT EXISTS idx_dash_roteiros_tenant ON dash_roteiros_entrega(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dash_roteiros_mdfe ON dash_roteiros_entrega(tenant_id, mdfe_id);

-- 3. Pontos / Paradas de Entrega no Roteiro
CREATE TABLE IF NOT EXISTS dash_roteiro_pontos (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    roteiro_id INTEGER NOT NULL REFERENCES dash_roteiros_entrega(id) ON DELETE CASCADE,
    ordem_entrega INTEGER NOT NULL DEFAULT 1,
    tipo_ponto VARCHAR(20) DEFAULT 'DESCARGA', -- CARGA, PASSAGEM, DESCARGA
    documento_tipo VARCHAR(10), -- NFE ou CTE
    documento_chave VARCHAR(44),
    cliente_nome VARCHAR(255) NOT NULL,
    documento_cliente VARCHAR(14),
    endereco_completo TEXT,
    municipio VARCHAR(120) NOT NULL,
    uf VARCHAR(2) NOT NULL,
    cep VARCHAR(10),
    latitude NUMERIC(10,7),
    longitude NUMERIC(10,7),
    peso_kg NUMERIC(12,3) DEFAULT 0,
    valor_produtos NUMERIC(15,2) DEFAULT 0,
    status_entrega VARCHAR(20) DEFAULT 'PENDENTE', -- PENDENTE, ENTREGUE, RECUSADO, REENTREGA
    entregue_em TIMESTAMPTZ,
    recebedor_nome VARCHAR(255),
    recebedor_documento VARCHAR(20),
    observacao TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dash_roteiro_pontos_rot ON dash_roteiro_pontos(tenant_id, roteiro_id, ordem_entrega);

-- 4. Coordenadas aproximadas de capitais e cidades principais para fallback de mapas
CREATE TABLE IF NOT EXISTS dash_coordenadas_municipios (
    codigo_ibge VARCHAR(7) PRIMARY KEY,
    nome VARCHAR(120) NOT NULL,
    uf VARCHAR(2) NOT NULL,
    latitude NUMERIC(10,7) NOT NULL,
    longitude NUMERIC(10,7) NOT NULL
);

-- 5. Permissões granulares do módulo de Transporte por grupo de acesso
--    (cte.gerar, cte.emitir, cte.cancelar, mdfe.emitir, mdfe.encerrar, ciot.emitir, ...)
ALTER TABLE dash_grupos_acesso
    ADD COLUMN IF NOT EXISTS permissoes_transporte JSONB DEFAULT '{}'::jsonb;

-- 6. Coordenadas e endereços completos nas cargas (para o roteiro com mapa)
ALTER TABLE dash_cargas
    ADD COLUMN IF NOT EXISTS endereco_entrega TEXT;
ALTER TABLE dash_cargas
    ADD COLUMN IF NOT EXISTS latitude NUMERIC(10,7);
ALTER TABLE dash_cargas
    ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7);

-- Seeds de capitais e hubs logísticos principais
INSERT INTO dash_coordenadas_municipios (codigo_ibge, nome, uf, latitude, longitude) VALUES
('5107875', 'Sapezal', 'MT', -12.9911, -58.7656),
('5103403', 'Cuiabá', 'MT', -15.6014, -56.0979),
('5107925', 'Sorriso', 'MT', -12.5444, -55.7214),
('5107909', 'Sinop', 'MT', -11.8608, -55.5097),
('5107602', 'Rondonópolis', 'MT', -16.4674, -54.6361),
('3550308', 'São Paulo', 'SP', -23.5505, -46.6333),
('3509502', 'Campinas', 'SP', -22.9099, -47.0626),
('3549904', 'São José dos Campos', 'SP', -23.1896, -45.8841),
('3106200', 'Belo Horizonte', 'MG', -19.9167, -43.9345),
('3170206', 'Uberlândia', 'MG', -18.9186, -48.2772),
('4106902', 'Curitiba', 'PR', -25.4284, -49.2733),
('4113700', 'Londrina', 'PR', -23.3045, -51.1696),
('4314902', 'Porto Alegre', 'RS', -30.0346, -51.2177),
('4205407', 'Florianópolis', 'SC', -27.5954, -48.5480),
('5208707', 'Goiânia', 'GO', -16.6869, -49.2648),
('5218805', 'Rio Verde', 'GO', -17.7923, -50.9192),
('5002704', 'Campo Grande', 'MS', -20.4697, -54.6201),
('5003702', 'Dourados', 'MS', -22.2236, -54.8125),
('5300108', 'Brasília', 'DF', -15.7942, -47.8822),
('3304557', 'Rio de Janeiro', 'RJ', -22.9068, -43.1729)
ON CONFLICT (codigo_ibge) DO NOTHING;
