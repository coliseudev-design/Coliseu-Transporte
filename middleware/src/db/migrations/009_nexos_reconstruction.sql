-- ================================================================
-- MIGRATION 009 — RECONSTRUÇÃO DO SISTEMA NEXOS
-- ================================================================

-- ------------------------------------------------------------
-- ALTERAÇÕES EM TABELAS EXISTENTES
-- ------------------------------------------------------------

-- Permitir id_firebird nulo para clientes, produtos e financeiro locais
ALTER TABLE dash_clientes ALTER COLUMN id_firebird DROP NOT NULL;
ALTER TABLE dash_produtos ALTER COLUMN id_firebird DROP NOT NULL;
ALTER TABLE dash_financeiro ALTER COLUMN id_firebird DROP NOT NULL;

-- Colunas adicionais em Clientes
ALTER TABLE dash_clientes ADD COLUMN IF NOT EXISTS responsavel_nome VARCHAR(255);
ALTER TABLE dash_clientes ADD COLUMN IF NOT EXISTS responsavel_rg VARCHAR(50);
ALTER TABLE dash_clientes ADD COLUMN IF NOT EXISTS responsavel_cpf VARCHAR(50);
ALTER TABLE dash_clientes ADD COLUMN IF NOT EXISTS email_financeiro VARCHAR(150);
ALTER TABLE dash_clientes ADD COLUMN IF NOT EXISTS celular_secundario VARCHAR(50);
ALTER TABLE dash_clientes ADD COLUMN IF NOT EXISTS regime_tributario VARCHAR(100);
ALTER TABLE dash_clientes ADD COLUMN IF NOT EXISTS endereco_completo TEXT;
ALTER TABLE dash_clientes ADD COLUMN IF NOT EXISTS tipo_cliente VARCHAR(50) DEFAULT 'B2C'; -- B2B, B2C, Parceiro
ALTER TABLE dash_clientes ADD COLUMN IF NOT EXISTS observacoes TEXT;

-- Colunas adicionais em Produtos
ALTER TABLE dash_produtos ADD COLUMN IF NOT EXISTS tipo VARCHAR(100) DEFAULT 'Serviço'; -- Software Base, Módulo, Licença, Serviço
ALTER TABLE dash_produtos ADD COLUMN IF NOT EXISTS tipo_cobranca VARCHAR(50) DEFAULT 'Avulso/Setup'; -- Recorrente, Avulso/Setup
ALTER TABLE dash_produtos ADD COLUMN IF NOT EXISTS categoria_contabil VARCHAR(100);

-- Colunas adicionais em Financeiro
ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS contrato_id INTEGER;
ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS tipo_parcela VARCHAR(50); -- Setup, Mensal
ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS numero_parcela INTEGER;
ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS valor_atual DECIMAL(15,2);
ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS regua_id INTEGER;
ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS regua_pausada BOOLEAN DEFAULT FALSE;

-- ------------------------------------------------------------
-- CRIAÇÃO DE NOVAS TABELAS DO MÓDULO CRM & VENDAS
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS dash_oportunidades (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    titulo VARCHAR(255) NOT NULL,
    empresa_nome VARCHAR(255),
    contato_principal VARCHAR(255),
    telefone VARCHAR(50),
    email VARCHAR(150),
    valor_estimated DECIMAL(15,2) DEFAULT 0,
    prioridade VARCHAR(50) DEFAULT 'Média', -- Baixa, Média, Alta, Urgente
    origem VARCHAR(100), -- Indicação, Site, Prospecção
    estagio VARCHAR(100) DEFAULT 'Novos Leads', -- Novos Leads, Contato Inicial, Proposta Enviada, Em Negociação, Ganho, Perdidos/Frios
    motivo_perda TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dash_oportunidades_atividades (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    oportunidade_id INTEGER NOT NULL REFERENCES dash_oportunidades(id) ON DELETE CASCADE,
    tipo VARCHAR(50) NOT NULL, -- Ligação, Reunião, E-mail, Tarefa
    descricao TEXT,
    data_hora TIMESTAMPTZ,
    concluida BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dash_oportunidades_interacoes (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    oportunidade_id INTEGER NOT NULL REFERENCES dash_oportunidades(id) ON DELETE CASCADE,
    tipo VARCHAR(50) NOT NULL, -- MUDANCA_ESTAGIO, WHATSAPP, EMAIL, NOTA, CONVERSAO, PERDA, OUTRO
    descricao TEXT,
    criado_por VARCHAR(200),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- CRIAÇÃO DE TABELAS DE CONTRATOS
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS dash_contratos (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    cliente_id INTEGER REFERENCES dash_clientes(id) ON DELETE SET NULL,
    descricao TEXT,
    valor_total DECIMAL(15,2) DEFAULT 0,
    data_inicio DATE NOT NULL,
    status VARCHAR(50) DEFAULT 'Em Aberto', -- Em Aberto, Enviado, Falta Assinar, Finalizado
    setup_valor DECIMAL(15,2) DEFAULT 0,
    setup_parcelas INTEGER DEFAULT 1,
    mensalidade_valor DECIMAL(15,2) DEFAULT 0,
    mensalidade_parcelas INTEGER DEFAULT 12,
    indice_reajuste VARCHAR(50) DEFAULT 'Fixo', -- Fixo, Salário Mínimo, IPCA
    clicksign_envelope_id VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dash_contratos_itens (
    id SERIAL PRIMARY KEY,
    contrato_id INTEGER NOT NULL REFERENCES dash_contratos(id) ON DELETE CASCADE,
    produto_id INTEGER REFERENCES dash_produtos(id) ON DELETE SET NULL,
    quantidade DECIMAL(15,3) DEFAULT 1,
    valor_unitario DECIMAL(15,2) DEFAULT 0
);

-- ------------------------------------------------------------
-- CRIAÇÃO DE TABELAS DO MOTOR DE COBRANÇA (RÉGUA)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS dash_reguas (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    nome VARCHAR(255) NOT NULL,
    descricao TEXT,
    padrao BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dash_reguas_etapas (
    id SERIAL PRIMARY KEY,
    regua_id INTEGER NOT NULL REFERENCES dash_reguas(id) ON DELETE CASCADE,
    dias_relativos INTEGER NOT NULL, -- ex: -3, 0, 5
    tipo_acao VARCHAR(50) NOT NULL, -- Lembrete, Cobrança, Negativação
    canais VARCHAR(255) NOT NULL, -- ex: 'whatsapp,email'
    template_whatsapp_id INTEGER,
    template_email_id INTEGER,
    acao_pos_contato VARCHAR(100),
    condicao_disparo TEXT,
    ordem INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS dash_reguas_condicoes (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    nome VARCHAR(255) NOT NULL,
    regua_destino_id INTEGER NOT NULL REFERENCES dash_reguas(id) ON DELETE CASCADE,
    filtro_json JSONB,
    prioridade INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS dash_cobrancas_logs (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    financeiro_id INTEGER NOT NULL,
    regua_id INTEGER,
    etapa_id INTEGER,
    canal VARCHAR(50),
    data_envio TIMESTAMPTZ DEFAULT NOW(),
    status VARCHAR(50) DEFAULT 'Sucesso', -- Sucesso, Falha
    erro TEXT
);

CREATE TABLE IF NOT EXISTS dash_cobrancas_agendamentos (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    financeiro_id INTEGER NOT NULL,
    data_agendamento TIMESTAMPTZ NOT NULL,
    descricao TEXT,
    concluido BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dash_cobrancas_ocorrencias (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    financeiro_id INTEGER NOT NULL,
    tipo_contato VARCHAR(50) NOT NULL, -- WhatsApp, E-mail, Telefone
    observacao TEXT,
    operador VARCHAR(250),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- CRIAÇÃO DE TABELAS DE TESOURARIA
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS dash_contas_bancarias (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    apelido VARCHAR(150) NOT NULL,
    banco VARCHAR(100),
    agencia VARCHAR(50),
    conta VARCHAR(50),
    tipo VARCHAR(50) DEFAULT 'Corrente', -- Corrente, Poupança, Caixinha
    saldo_inicial DECIMAL(15,2) DEFAULT 0,
    saldo_atual DECIMAL(15,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dash_plano_contas (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    nome VARCHAR(150) NOT NULL,
    tipo VARCHAR(50) NOT NULL, -- Receita, Despesa Fixa, Despesa Variável
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dash_movimentacoes (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    conta_bancaria_id INTEGER NOT NULL REFERENCES dash_contas_bancarias(id) ON DELETE CASCADE,
    financeiro_id INTEGER,
    tipo VARCHAR(20) NOT NULL, -- Entrada, Saída
    valor DECIMAL(15,2) NOT NULL,
    data_movimentacao DATE NOT NULL,
    plano_contas_id INTEGER REFERENCES dash_plano_contas(id) ON DELETE SET NULL,
    forma_pagamento VARCHAR(50),
    observacao TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- CRIAÇÃO DE TABELAS DE ACERVOS (TEMPLATES DE DOCUMENTOS)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS dash_templates (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    nome VARCHAR(255) NOT NULL,
    categoria VARCHAR(100) NOT NULL, -- Proposta, Carta, E-mail de Cobrança, Mensagem WhatsApp, E-mail de Proposta
    conteudo TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- CRIAÇÃO DE TABELAS DE MARKETING (CAMPANHAS)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS dash_campanhas (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    nome VARCHAR(255) NOT NULL,
    template_id INTEGER REFERENCES dash_templates(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dash_campanhas_logs (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    campanha_id INTEGER NOT NULL REFERENCES dash_campanhas(id) ON DELETE CASCADE,
    destinatario_nome VARCHAR(255),
    destinatario_telefone VARCHAR(50),
    status VARCHAR(50) DEFAULT 'Sucesso',
    erro TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- CRIAÇÃO DE TABELA DE CONFIGURAÇÕES DE INTEGRAÇÕES
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS dash_integracoes_config (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL UNIQUE,
    ai_api_key TEXT,
    whatsapp_instancia_id VARCHAR(255),
    whatsapp_token TEXT,
    clicksign_token TEXT,
    clicksign_ambiente VARCHAR(50) DEFAULT 'Sandbox',
    salario_minimo_anterior DECIMAL(15,2) DEFAULT 0,
    salario_minimo_atual DECIMAL(15,2) DEFAULT 0,
    lembrete_preventivo_script TEXT,
    aviso_vencimento_script TEXT,
    atraso_inicial_script TEXT,
    atraso_critico_script TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
