-- ===================================================================
-- COLISEU TRANSPORTE — Módulo Fiscal (CT-e, MDF-e, Cargas, Frota e CIOT)
-- Migration: 035_transporte_cte_mdfe_ciot.sql
-- ===================================================================

-- 1. EMITENTES / FILIAIS FISCAIS (Transportadoras emissoras por Tenant)
CREATE TABLE IF NOT EXISTS dash_emitentes (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    cnpj VARCHAR(14) NOT NULL,
    inscricao_estadual VARCHAR(20),
    razao_social VARCHAR(255) NOT NULL,
    nome_fantasia VARCHAR(255),
    logradouro VARCHAR(255), numero VARCHAR(20), complemento VARCHAR(120),
    bairro VARCHAR(120), cep VARCHAR(10),
    codigo_municipio VARCHAR(7), municipio VARCHAR(120), uf VARCHAR(2),
    telefone VARCHAR(30), email VARCHAR(180),
    rntrc VARCHAR(20),
    focus_token VARCHAR(255),
    focus_ambiente VARCHAR(12) NOT NULL DEFAULT 'homologacao', -- 'homologacao' ou 'producao'
    focus_empresa_id VARCHAR(64),
    serie_cte VARCHAR(5) DEFAULT '1',
    ultimo_numero_cte INTEGER DEFAULT 0,
    serie_mdfe VARCHAR(5) DEFAULT '1',
    ultimo_numero_mdfe INTEGER DEFAULT 0,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, cnpj)
);
CREATE INDEX IF NOT EXISTS idx_dash_emitentes_tenant ON dash_emitentes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dash_emitentes_cnpj ON dash_emitentes(tenant_id, cnpj);

-- 2. PARTES DO TRANSPORTE (Remetentes, Destinatários, Tomadores, Expedidores)
CREATE TABLE IF NOT EXISTS dash_partes (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    id_firebird INTEGER,
    documento VARCHAR(14) NOT NULL, -- CPF ou CNPJ
    tipo_documento VARCHAR(4) NOT NULL DEFAULT 'CNPJ',
    inscricao_estadual VARCHAR(20),
    indicador_ie VARCHAR(2) NOT NULL DEFAULT '9', -- 1=Contribuinte, 2=Isento, 9=Não-contribuinte
    razao_social VARCHAR(255) NOT NULL,
    nome_fantasia VARCHAR(255),
    logradouro VARCHAR(255), numero VARCHAR(20), complemento VARCHAR(120),
    bairro VARCHAR(120), cep VARCHAR(10),
    codigo_municipio VARCHAR(7), municipio VARCHAR(120), uf VARCHAR(2),
    telefone VARCHAR(30), email VARCHAR(180),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, documento)
);
CREATE INDEX IF NOT EXISTS idx_dash_partes_tenant ON dash_partes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dash_partes_doc ON dash_partes(tenant_id, documento);

-- 3. VEÍCULOS E REBOQUES
CREATE TABLE IF NOT EXISTS dash_veiculos (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    id_firebird INTEGER,
    placa VARCHAR(10) NOT NULL,
    renavam VARCHAR(20),
    chassi VARCHAR(40),
    uf VARCHAR(2),
    tipo_rodado VARCHAR(4) DEFAULT '01', -- 01=Truck, 02=Toco, 03=Cavalo, 04=Van, 05=Utilitario
    tipo_carroceria VARCHAR(4) DEFAULT '00', -- 00=Aberta, 01=Fechada/Bau, 02=Sider, 03=Tanque
    tara_kg NUMERIC(12,3) DEFAULT 0,
    capacidade_kg NUMERIC(12,3) DEFAULT 0,
    capacidade_m3 NUMERIC(12,3) DEFAULT 0,
    tipo_proprietario VARCHAR(2) NOT NULL DEFAULT '1', -- 1=Proprio, 2=Terceiro/TAC
    rntrc VARCHAR(20),
    cpf_cnpj_proprietario VARCHAR(14),
    nome_proprietario VARCHAR(255),
    uf_proprietario VARCHAR(2),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, placa)
);
CREATE INDEX IF NOT EXISTS idx_dash_veiculos_tenant ON dash_veiculos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dash_veiculos_placa ON dash_veiculos(tenant_id, placa);

-- 4. MOTORISTAS E CONDUTORES
CREATE TABLE IF NOT EXISTS dash_motoristas (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    id_firebird INTEGER,
    cpf VARCHAR(11) NOT NULL,
    nome VARCHAR(255) NOT NULL,
    cnh VARCHAR(20),
    cnh_categoria VARCHAR(4),
    cnh_validade DATE,
    telefone VARCHAR(30),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, cpf)
);
CREATE INDEX IF NOT EXISTS idx_dash_motoristas_tenant ON dash_motoristas(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dash_motoristas_cpf ON dash_motoristas(tenant_id, cpf);

-- 5. CARGAS / NOTAS FISCAIS SINCRONIZADAS DO ERP COLISEU (FIREBIRD)
CREATE TABLE IF NOT EXISTS dash_cargas (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    id_firebird INTEGER,
    tipo_documento VARCHAR(10) NOT NULL DEFAULT 'NFE', -- NFE, CTE, DECLARACAO
    chave_acesso VARCHAR(44),
    numero VARCHAR(20),
    serie VARCHAR(5),
    data_emissao TIMESTAMPTZ,
    remetente_documento VARCHAR(14),
    remetente_nome VARCHAR(255),
    remetente_municipio VARCHAR(120),
    remetente_uf VARCHAR(2),
    destinatario_documento VARCHAR(14),
    destinatario_nome VARCHAR(255),
    destinatario_municipio VARCHAR(120),
    destinatario_uf VARCHAR(2),
    valor_total NUMERIC(15,2) NOT NULL DEFAULT 0,
    valor_produtos NUMERIC(15,2) DEFAULT 0,
    peso_bruto NUMERIC(12,3) DEFAULT 0,
    peso_liquido NUMERIC(12,3) DEFAULT 0,
    volume_m3 NUMERIC(12,3) DEFAULT 0,
    volumes INTEGER DEFAULT 1,
    especie VARCHAR(100) DEFAULT 'VOLUMES',
    produto_predominante VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDENTE', -- PENDENTE, EM_CTE, EM_MDFE, CANCELADA
    cte_id INTEGER,
    mdfe_id INTEGER,
    dados_nfe JSONB NOT NULL DEFAULT '{}'::jsonb,
    sincronizado_em TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, chave_acesso)
);
CREATE INDEX IF NOT EXISTS idx_dash_cargas_tenant ON dash_cargas(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dash_cargas_status ON dash_cargas(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_dash_cargas_chave ON dash_cargas(tenant_id, chave_acesso);
CREATE INDEX IF NOT EXISTS idx_dash_cargas_data ON dash_cargas(tenant_id, data_emissao DESC);

-- 6. CONHECIMENTOS DE TRANSPORTE (CT-e)
CREATE TABLE IF NOT EXISTS dash_ctes (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    emitente_id INTEGER NOT NULL REFERENCES dash_emitentes(id),
    ref VARCHAR(60) NOT NULL,
    chave_cte VARCHAR(44),
    numero INTEGER,
    serie VARCHAR(5),
    modelo VARCHAR(3) DEFAULT '57',
    status VARCHAR(30) NOT NULL DEFAULT 'RASCUNHO', -- RASCUNHO, PROCESSANDO, AUTORIZADO, REJEITADO, CANCELADO
    status_sefaz VARCHAR(10),
    mensagem_sefaz TEXT,
    erros JSONB,
    natureza_operacao VARCHAR(255) DEFAULT 'PRESTACAO DE SERVICO DE TRANSPORTE',
    tipo_servico VARCHAR(3) DEFAULT '0', -- 0=Normal, 1=Subcontratação, 2=Redespacho, 3=Redesp. Intermediário
    modal VARCHAR(3) DEFAULT '1', -- 1=Rodoviário
    tomador VARCHAR(4) DEFAULT '0', -- 0=Remetente, 1=Expedidor, 2=Recebedor, 3=Destinatário, 4=Outros
    tomador_documento VARCHAR(14),
    uf_inicio VARCHAR(2),
    uf_fim VARCHAR(2),
    codigo_municipio_inicio VARCHAR(7),
    codigo_municipio_fim VARCHAR(7),
    municipio_inicio VARCHAR(120),
    municipio_fim VARCHAR(120),
    valor_total NUMERIC(15,2) NOT NULL DEFAULT 0,
    valor_receber NUMERIC(15,2) NOT NULL DEFAULT 0,
    valor_carga NUMERIC(15,2) NOT NULL DEFAULT 0,
    peso_bruto NUMERIC(12,3) NOT NULL DEFAULT 0,
    base_icms NUMERIC(15,2) DEFAULT 0,
    aliquota_icms NUMERIC(7,4) DEFAULT 0,
    valor_icms NUMERIC(15,2) DEFAULT 0,
    icms_situacao_tributaria VARCHAR(4) DEFAULT '00',
    payload_focus JSONB NOT NULL DEFAULT '{}'::jsonb,
    retorno_focus JSONB DEFAULT '{}'::jsonb,
    caminho_xml TEXT,
    caminho_dacte TEXT,
    protocolo VARCHAR(40),
    data_emissao TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, emitente_id, ref)
);
CREATE INDEX IF NOT EXISTS idx_dash_ctes_tenant ON dash_ctes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dash_ctes_status ON dash_ctes(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_dash_ctes_ref ON dash_ctes(tenant_id, ref);
CREATE INDEX IF NOT EXISTS idx_dash_ctes_chave ON dash_ctes(tenant_id, chave_cte);

-- Vínculo N:N de Cargas (NF-e) dentro do CT-e
CREATE TABLE IF NOT EXISTS dash_cte_cargas (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    cte_id INTEGER NOT NULL REFERENCES dash_ctes(id) ON DELETE CASCADE,
    carga_id INTEGER NOT NULL REFERENCES dash_cargas(id) ON DELETE CASCADE,
    chave_nfe VARCHAR(44) NOT NULL,
    valor_nfe NUMERIC(15,2) DEFAULT 0,
    peso_nfe NUMERIC(12,3) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, cte_id, carga_id)
);
CREATE INDEX IF NOT EXISTS idx_dash_cte_cargas_cte ON dash_cte_cargas(tenant_id, cte_id);

-- 7. MANIFESTOS ELETRÔNICOS DE DOCUMENTOS FISCAIS (MDF-e)
CREATE TABLE IF NOT EXISTS dash_mdfes (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    emitente_id INTEGER NOT NULL REFERENCES dash_emitentes(id),
    ref VARCHAR(60) NOT NULL,
    chave_mdfe VARCHAR(44),
    numero INTEGER,
    serie VARCHAR(5),
    modelo VARCHAR(3) DEFAULT '58',
    status VARCHAR(30) NOT NULL DEFAULT 'RASCUNHO', -- RASCUNHO, PROCESSANDO, AUTORIZADO, REJEITADO, CANCELADO, ENCERRADO
    status_sefaz VARCHAR(10),
    mensagem_sefaz TEXT,
    erros JSONB,
    tipo_emitente VARCHAR(2) DEFAULT '1', -- 1=Prestador de Serviço, 2=Carga Própria
    tipo_transporte VARCHAR(2) DEFAULT '1', -- 1=ETC, 2=TAC, 3=CTC
    modal VARCHAR(2) DEFAULT '1', -- 1=Rodoviário
    uf_inicio VARCHAR(2) NOT NULL,
    uf_fim VARCHAR(2) NOT NULL,
    data_hora_previsto_inicio_viagem TIMESTAMPTZ DEFAULT NOW(),
    veiculo_id INTEGER REFERENCES dash_veiculos(id),
    veiculo_placa VARCHAR(10) NOT NULL,
    motorista_id INTEGER REFERENCES dash_motoristas(id),
    motorista_cpf VARCHAR(11) NOT NULL,
    motorista_nome VARCHAR(255) NOT NULL,
    qtd_cte INTEGER DEFAULT 0,
    qtd_nfe INTEGER DEFAULT 0,
    valor_carga NUMERIC(15,2) DEFAULT 0,
    peso_bruto NUMERIC(12,3) DEFAULT 0,
    ciot_codigo VARCHAR(50),
    payload_focus JSONB NOT NULL DEFAULT '{}'::jsonb,
    retorno_focus JSONB DEFAULT '{}'::jsonb,
    caminho_xml TEXT,
    caminho_damdfe TEXT,
    protocolo VARCHAR(40),
    encerrado_em TIMESTAMPTZ,
    encerramento_uf VARCHAR(2),
    encerramento_municipio VARCHAR(120),
    data_emissao TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, emitente_id, ref)
);
CREATE INDEX IF NOT EXISTS idx_dash_mdfes_tenant ON dash_mdfes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dash_mdfes_status ON dash_mdfes(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_dash_mdfes_ref ON dash_mdfes(tenant_id, ref);
CREATE INDEX IF NOT EXISTS idx_dash_mdfes_placa ON dash_mdfes(tenant_id, veiculo_placa, status);

-- Vínculo N:N de CT-es / NF-es no MDF-e
CREATE TABLE IF NOT EXISTS dash_mdfe_documentos (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    mdfe_id INTEGER NOT NULL REFERENCES dash_mdfes(id) ON DELETE CASCADE,
    tipo_documento VARCHAR(10) NOT NULL, -- CTE ou NFE
    chave VARCHAR(44) NOT NULL,
    codigo_municipio_descarregamento VARCHAR(7),
    nome_municipio_descarregamento VARCHAR(120),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, mdfe_id, chave)
);
CREATE INDEX IF NOT EXISTS idx_dash_mdfe_docs_mdfe ON dash_mdfe_documentos(tenant_id, mdfe_id);

-- 8. CONTRATOS DE FRETE E BASE PARA CIOT (ANTT)
CREATE TABLE IF NOT EXISTS dash_contratos_transporte (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    emitente_id INTEGER NOT NULL REFERENCES dash_emitentes(id),
    contratante_documento VARCHAR(14) NOT NULL,
    contratante_nome VARCHAR(255) NOT NULL,
    transportador_documento VARCHAR(14) NOT NULL,
    transportador_nome VARCHAR(255) NOT NULL,
    transportador_rntrc VARCHAR(20),
    tipo_transporte VARCHAR(2) DEFAULT '2', -- 1=ETC, 2=TAC, 3=CTC
    tipo_operacao VARCHAR(30) DEFAULT 'Carga Lotacao',
    uf_inicio VARCHAR(2) NOT NULL,
    uf_fim VARCHAR(2) NOT NULL,
    valor_frete NUMERIC(15,2) NOT NULL DEFAULT 0,
    valor_adiantamento NUMERIC(15,2) DEFAULT 0,
    valor_pedagio NUMERIC(15,2) DEFAULT 0,
    valor_combustivel NUMERIC(15,2) DEFAULT 0,
    forma_quitacao VARCHAR(20) DEFAULT 'PIX', -- PIX, DEPOSITO, CARTAO_FRETE
    piso_minimo_antt NUMERIC(15,2),
    piso_minimo_aprovado BOOLEAN DEFAULT TRUE,
    ciot_status VARCHAR(20) DEFAULT 'PENDENTE', -- PENDENTE, GERADO, TRANSMITIDO
    ciot_codigo VARCHAR(50),
    ciot_payload_antt JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dash_contratos_tenant ON dash_contratos_transporte(tenant_id);

-- 9. CAMPOS DINÂMICOS (Gerador de formulários sem deploy)
CREATE TABLE IF NOT EXISTS dash_campos_dinamicos (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    documento VARCHAR(10) NOT NULL, -- CTE ou MDFE
    chave_campo VARCHAR(80) NOT NULL,
    rotulo VARCHAR(160) NOT NULL,
    tipo VARCHAR(20) NOT NULL DEFAULT 'texto', -- texto, numero, moeda, data, select
    opcoes JSONB DEFAULT '[]'::jsonb,
    condicao_json JSONB DEFAULT '{}'::jsonb,
    caminho_focus VARCHAR(120),
    obrigatorio BOOLEAN NOT NULL DEFAULT FALSE,
    ordem INTEGER NOT NULL DEFAULT 0,
    escopo VARCHAR(20) NOT NULL DEFAULT 'GLOBAL', -- GLOBAL | UF_ORIGEM | UF_DESTINO | TIPO_SERVICO
    escopo_valores JSONB DEFAULT '[]'::jsonb,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, documento, chave_campo)
);
CREATE INDEX IF NOT EXISTS idx_dash_campos_doc ON dash_campos_dinamicos(tenant_id, documento, ativo, ordem);
