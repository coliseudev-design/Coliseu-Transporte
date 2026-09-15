-- ================================================================
-- COLISEU TRANSPORTE DASHBOARD — Schema PostgreSQL (coliseu_dashboard)
-- Migrado da arquitetura D1 para suporte Multi-Tenant na VPS
-- ================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------
-- METADADOS E LOG DE TRANSAÇÕES
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS dash_sync_metadata (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    tabela VARCHAR(100) NOT NULL,
    ultima_sincronizacao TIMESTAMPTZ,
    registros_sincronizados INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'OK',
    erro_mensagem TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, tabela)
);

CREATE TABLE IF NOT EXISTS dash_log_atividades (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    id_firebird INTEGER NOT NULL,
    usuario VARCHAR(200) NOT NULL,
    operacao VARCHAR(50) NOT NULL, -- INSERT, UPDATE, DELETE, SELECT, LOGIN
    tabela VARCHAR(100),
    descricao TEXT,
    data_operacao TIMESTAMPTZ NOT NULL,
    sincronizado_em TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, id_firebird)
);

CREATE INDEX IF NOT EXISTS idx_dash_log_data ON dash_log_atividades(tenant_id, data_operacao);
CREATE INDEX IF NOT EXISTS idx_dash_log_usuario ON dash_log_atividades(tenant_id, usuario);

-- ------------------------------------------------------------
-- CADASTROS BASE SINC. DO ERP
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS dash_clientes (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    id_firebird INTEGER NOT NULL,
    nome VARCHAR(255) NOT NULL,
    documento VARCHAR(50),
    email VARCHAR(150),
    telefone VARCHAR(50),
    cidade VARCHAR(150),
    estado VARCHAR(2),
    classificacao VARCHAR(50),
    data_cadastro TIMESTAMPTZ,
    ativo BOOLEAN DEFAULT TRUE,
    sincronizado_em TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, id_firebird)
);

CREATE INDEX IF NOT EXISTS idx_dash_clientes_nome ON dash_clientes(tenant_id, nome);
CREATE INDEX IF NOT EXISTS idx_dash_clientes_doc ON dash_clientes(tenant_id, documento);

-- Migração: Garante que a coluna classificacao seja adicionada em instalações antigas
ALTER TABLE dash_clientes ADD COLUMN IF NOT EXISTS classificacao VARCHAR(50);

CREATE TABLE IF NOT EXISTS dash_produtos (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    id_firebird INTEGER NOT NULL,
    codigo VARCHAR(50),
    nome VARCHAR(255) NOT NULL,
    descricao TEXT,
    categoria VARCHAR(100),
    marca VARCHAR(100),
    preco DECIMAL(15,2) NOT NULL DEFAULT 0,
    custo DECIMAL(15,2) NOT NULL DEFAULT 0,
    estoque DECIMAL(15,3) NOT NULL DEFAULT 0,
    estoque_minimo DECIMAL(15,3) DEFAULT 0,
    ativo BOOLEAN DEFAULT TRUE,
    sincronizado_em TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, id_firebird)
);

CREATE INDEX IF NOT EXISTS idx_dash_produtos_nome ON dash_produtos(tenant_id, nome);
CREATE INDEX IF NOT EXISTS idx_dash_produtos_cat ON dash_produtos(tenant_id, categoria);

-- Migrações de produtos
ALTER TABLE dash_produtos ADD COLUMN IF NOT EXISTS referencia VARCHAR(100);
ALTER TABLE dash_produtos ADD COLUMN IF NOT EXISTS codigo_fabrica VARCHAR(100);

CREATE TABLE IF NOT EXISTS dash_vendedores (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    id_firebird INTEGER NOT NULL,
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(150),
    ativo BOOLEAN DEFAULT TRUE,
    sincronizado_em TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, id_firebird)
);

CREATE TABLE IF NOT EXISTS dash_fornecedores (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    id_firebird INTEGER NOT NULL,
    nome VARCHAR(255) NOT NULL,
    documento VARCHAR(50),
    cidade VARCHAR(150),
    estado VARCHAR(2),
    sincronizado_em TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, id_firebird)
);

-- ------------------------------------------------------------
-- VENDAS E RELACIONADOS
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS dash_vendas (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    id_firebird INTEGER NOT NULL,
    numero_pedido VARCHAR(50),
    data_venda TIMESTAMPTZ NOT NULL,
    cliente_id_firebird INTEGER,
    vendedor_id_firebird INTEGER,
    valor_total DECIMAL(15,2) NOT NULL DEFAULT 0,
    valor_custo DECIMAL(15,2) NOT NULL DEFAULT 0,
    valor_desconto DECIMAL(15,2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'FATURADO',
    marca VARCHAR(100),
    categoria VARCHAR(100),
    especie VARCHAR(100),
    sincronizado_em TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, id_firebird)
);

CREATE INDEX IF NOT EXISTS idx_dash_vendas_data ON dash_vendas(tenant_id, data_venda);
CREATE INDEX IF NOT EXISTS idx_dash_vendas_status ON dash_vendas(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_dash_vendas_vend ON dash_vendas(tenant_id, vendedor_id_firebird);

CREATE TABLE IF NOT EXISTS dash_vendas_itens (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    id_firebird INTEGER NOT NULL,
    venda_id_firebird INTEGER NOT NULL,
    produto_id_firebird INTEGER,
    quantidade DECIMAL(15,3) NOT NULL DEFAULT 1,
    preco_unitario DECIMAL(15,2) NOT NULL DEFAULT 0,
    custo_unitario DECIMAL(15,2) NOT NULL DEFAULT 0,
    valor_total DECIMAL(15,2) NOT NULL DEFAULT 0,
    vendedor VARCHAR(150),
    produto VARCHAR(200),
    marca VARCHAR(100),
    categoria VARCHAR(100),
    sincronizado_em TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, id_firebird)
);

-- Migrações: adiciona colunas que podem não existir em instalações antigas
ALTER TABLE dash_vendas ADD COLUMN IF NOT EXISTS marca VARCHAR(100);
ALTER TABLE dash_vendas ADD COLUMN IF NOT EXISTS categoria VARCHAR(100);
ALTER TABLE dash_vendas ADD COLUMN IF NOT EXISTS especie VARCHAR(100);
ALTER TABLE dash_vendas_itens ADD COLUMN IF NOT EXISTS vendedor VARCHAR(150);
ALTER TABLE dash_vendas_itens ADD COLUMN IF NOT EXISTS produto VARCHAR(200);
ALTER TABLE dash_vendas_itens ADD COLUMN IF NOT EXISTS marca VARCHAR(100);
ALTER TABLE dash_vendas_itens ADD COLUMN IF NOT EXISTS categoria VARCHAR(100);
ALTER TABLE dash_vendas_itens ALTER COLUMN produto_id_firebird DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dash_vend_itens_venda ON dash_vendas_itens(tenant_id, venda_id_firebird);
CREATE INDEX IF NOT EXISTS idx_dash_vend_itens_prod ON dash_vendas_itens(tenant_id, produto_id_firebird);

CREATE TABLE IF NOT EXISTS dash_comissoes (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    id_firebird INTEGER NOT NULL,
    vendedor_id_firebird INTEGER NOT NULL,
    venda_id_firebird INTEGER,
    periodo VARCHAR(50),
    valor_vendas DECIMAL(15,2) DEFAULT 0,
    percentual DECIMAL(5,2) DEFAULT 0,
    valor_comissao DECIMAL(15,2) DEFAULT 0,
    data_referencia TIMESTAMPTZ,
    sincronizado_em TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, id_firebird)
);

CREATE INDEX IF NOT EXISTS idx_dash_comissoes_vend ON dash_comissoes(tenant_id, vendedor_id_firebird);
CREATE INDEX IF NOT EXISTS idx_dash_comissoes_data ON dash_comissoes(tenant_id, data_referencia);

CREATE TABLE IF NOT EXISTS dash_devolucoes (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    id_firebird INTEGER NOT NULL,
    venda_id_firebird INTEGER,
    produto_id_firebird INTEGER,
    data_devolucao TIMESTAMPTZ NOT NULL,
    motivo TEXT,
    quantidade DECIMAL(15,3) DEFAULT 1,
    valor DECIMAL(15,2) NOT NULL DEFAULT 0,
    sincronizado_em TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, id_firebird)
);

CREATE INDEX IF NOT EXISTS idx_dash_devolucoes_data ON dash_devolucoes(tenant_id, data_devolucao);

-- ------------------------------------------------------------
-- FINANCEIRO E COMPRAS
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS dash_financeiro (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    id_firebird INTEGER NOT NULL,
    tipo VARCHAR(20) NOT NULL, -- 'RECEBER' ou 'PAGAR'
    tipo_documento VARCHAR(50) DEFAULT NULL, -- Ex: 'TITULO COMUM', 'TITULO RENEGOCIADO'...
    descricao TEXT,
    cliente_id_firebird INTEGER,
    fornecedor_id_firebird INTEGER,
    data_emissao TIMESTAMPTZ,
    data_vencimento TIMESTAMPTZ NOT NULL,
    data_pagamento TIMESTAMPTZ,
    valor DECIMAL(15,2) NOT NULL DEFAULT 0,
    valor_pago DECIMAL(15,2) DEFAULT 0,
    status_pagamento VARCHAR(50) DEFAULT 'ABERTO', -- ABERTO, PAGO, CANCELADO
    depto_id INTEGER,
    centro_custo INTEGER,
    caixa_id_firebird INTEGER,
    sincronizado_em TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, id_firebird)
);

CREATE INDEX IF NOT EXISTS idx_dash_financeiro_tipo ON dash_financeiro(tenant_id, tipo);
CREATE INDEX IF NOT EXISTS idx_dash_financeiro_status ON dash_financeiro(tenant_id, status_pagamento);
CREATE INDEX IF NOT EXISTS idx_dash_financeiro_venc ON dash_financeiro(tenant_id, data_vencimento);

-- Migração: adiciona tipo_documento para instalações já existentes
ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS tipo_documento VARCHAR(50) DEFAULT NULL;
ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS depto_id INTEGER;
ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS centro_custo INTEGER;
ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS caixa_id_firebird INTEGER;
ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS multa_percentual NUMERIC(5,2) DEFAULT 2.00;
ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS juros_percentual NUMERIC(5,2) DEFAULT 1.00;

CREATE TABLE IF NOT EXISTS dash_compras (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    id_firebird INTEGER NOT NULL,
    numero_pedido VARCHAR(50),
    fornecedor_id_firebird INTEGER NOT NULL,
    data_pedido TIMESTAMPTZ NOT NULL,
    data_entrega TIMESTAMPTZ,
    valor_total DECIMAL(15,2) NOT NULL DEFAULT 0,
    status VARCHAR(50) DEFAULT 'FINALIZADO',
    sincronizado_em TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, id_firebird)
);

CREATE INDEX IF NOT EXISTS idx_dash_compras_data ON dash_compras(tenant_id, data_pedido);

CREATE TABLE IF NOT EXISTS dash_caixas (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    id_firebird INTEGER NOT NULL,
    descricao VARCHAR(150),
    sincronizado_em TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, id_firebird)
);

-- ------------------------------------------------------------
-- SISTEMA WEB (Autenticação/Auditoria internas)
-- ------------------------------------------------------------
-- A maioria da auth agora vem do Identity Server. Contudo, em casos específicos de configuração custom 
-- ou override de permissões no escopo do dashboard mantemos esta tabela base com o tenant_id.

CREATE TABLE IF NOT EXISTS dash_usuarios (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    email VARCHAR(200) NOT NULL,
    nome VARCHAR(200) NOT NULL,
    senha_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'viewer', -- admin, gerente, vendedor, viewer
    layout_version VARCHAR(10) DEFAULT 'v1.0',
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, email)
);

-- Garantir que colunas novas existam caso a tabela já estivesse lá
ALTER TABLE dash_usuarios ADD COLUMN IF NOT EXISTS senha_hash VARCHAR(255);
ALTER TABLE dash_usuarios ADD COLUMN IF NOT EXISTS layout_version VARCHAR(10) DEFAULT 'v1.0';
-- Colocar uma hash genérica pra quem não tinha senha (evitar nulo caso houvesse dados)
UPDATE dash_usuarios SET senha_hash = '' WHERE senha_hash IS NULL;

-- Seed: Criar conta mestre default
INSERT INTO dash_usuarios (tenant_id, email, nome, role, ativo, senha_hash)
VALUES (
    '00000000-0000-0000-0000-000000000000', 
    'admin@coliseutransporte.com.br', 
    'Super Admin', 
    'admin', 
    true, 
    -- bcrypt hash de AdminNexus2026! 
    '$2b$10$WyhOyq71XTg7APhFkX8TXOR1dXWmPi6WWs4nbeAJk2AMGTCd24.za'
) ON CONFLICT (tenant_id, email) DO NOTHING;

-- Seed: Criar conta para o Tenant do teste (senha: AdminNexus2026!)
INSERT INTO dash_usuarios (tenant_id, email, nome, role, ativo, senha_hash)
VALUES (
    'ed1d3a98-4c4d-48db-99c0-8751926eb8e5', 
    'cliente@teste.com.br', 
    'Empresa Cliente', 
    'admin', 
    true, 
    '$2b$10$WyhOyq71XTg7APhFkX8TXOR1dXWmPi6WWs4nbeAJk2AMGTCd24.za'
) ON CONFLICT (tenant_id, email) DO UPDATE SET
    nome = EXCLUDED.nome,
    role = EXCLUDED.role,
    ativo = EXCLUDED.ativo,
    senha_hash = EXCLUDED.senha_hash;

-- Correção crítica: garante tenant correto para o usuário de teste
-- (pode ter sido inserido com tenant_id '00000000...' em versões antigas)
UPDATE dash_usuarios 
SET tenant_id = 'ed1d3a98-4c4d-48db-99c0-8751926eb8e5'
WHERE email = 'cliente@teste.com.br' 
  AND tenant_id != 'ed1d3a98-4c4d-48db-99c0-8751926eb8e5';

CREATE TABLE IF NOT EXISTS dash_auditoria (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    usuario_email VARCHAR(200),
    acao VARCHAR(100) NOT NULL,
    tabela VARCHAR(100),
    registro_id INTEGER,
    dados_antigos JSONB,
    dados_novos JSONB,
    ip_address VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
