'use strict';

const { Pool } = require('pg');
const config = require('../config/env');
const logger = require('../config/logger');

// PostgreSQL Pool for Dashboard
const pool = new Pool({
    host: config.postgres.host,
    port: config.postgres.port,
    database: config.postgres.database,
    user: config.postgres.user,
    password: config.postgres.password,
    ssl: config.postgres.ssl ? { rejectUnauthorized: false } : false,
    max: 20, // Max number of clients
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
    logger.error('[DB] Erro inesperado em cliente ocioso do PostgreSQL', err);
});

/**
 * Executa uma query no PostgreSQL.
 * @param {string} text - Query SQL
 * @param {any[]} params - Parâmetros
 * @returns {Promise<import('pg').QueryResult<any>>}
 */
async function query(text, params) {
    const start = Date.now();
    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        // Debug mode queries are extremely noisy, comment out or trace-level
        // logger.debug('[DB] Executed query', { text: text.substring(0, 100), duration, rows: res.rowCount });
        return res;
    } catch (err) {
        logger.error('[DB] Falha ao executar query', { text: text.substring(0, 150), error: err.message });
        throw err;
    }
}

/**
 * Usado para checagem rápida de saúde (/health/readiness) e conectividade.
 */
async function checkConnection() {
    try {
        await pool.query('SELECT 1 AS ok');
        return true;
    } catch (err) {
        logger.error('[DB] Falha ao conectar ao PostgreSQL', { error: err.message });
        return false;
    }
}

let startupMaintenanceExecuted = false;

/**
 * Executa migrações estruturais idempotentes APENAS UMA VEZ na inicialização do servidor.
 */
async function runStartupMaintenance() {
    if (startupMaintenanceExecuted) return true;
    startupMaintenanceExecuted = true;
    try {
        await query('SELECT 1 AS ok', []);
        logger.info('[DB] Conectado ao PostgreSQL (coliseu_dashboard) — verificando estrutura base...');
        
        // Auto-migration: Garante que as novas tabelas e colunas existam em produção
        try {
            await query(`
                CREATE TABLE IF NOT EXISTS dash_caixas (
                    id SERIAL PRIMARY KEY,
                    tenant_id UUID NOT NULL,
                    id_firebird INTEGER NOT NULL,
                    descricao VARCHAR(150),
                    sincronizado_em TIMESTAMPTZ DEFAULT NOW(),
                    UNIQUE(tenant_id, id_firebird)
                );
            `, []);
            
            await query(`
                ALTER TABLE dash_vendas ADD COLUMN IF NOT EXISTS especie VARCHAR(100);
            `, []);
            
            await query(`ALTER TABLE dash_vendas ADD COLUMN IF NOT EXISTS depto_id INTEGER;`, []);
            await query(`ALTER TABLE dash_vendas_itens ADD COLUMN IF NOT EXISTS depto_id INTEGER;`, []);
            
            logger.info('[DB] Auto-migration (dash_caixas e especie) verificada/aplicada com sucesso.');
        } catch (migErr1) {
            logger.warn('[DB] Base tables not found yet, skipping initial auto-migration.', { erro: migErr1.message });
        }
        
        try {
            await query(`ALTER TABLE dash_produtos ADD COLUMN IF NOT EXISTS preco DECIMAL(15,2) DEFAULT 0;`, []);
            await query(`ALTER TABLE dash_produtos ADD COLUMN IF NOT EXISTS custo DECIMAL(15,2) DEFAULT 0;`, []);
            await query(`ALTER TABLE dash_produtos ADD COLUMN IF NOT EXISTS estoque DECIMAL(15,3) DEFAULT 0;`, []);
            await query(`ALTER TABLE dash_produtos ADD COLUMN IF NOT EXISTS estoque_minimo DECIMAL(15,3) DEFAULT 0;`, []);
            await query(`ALTER TABLE dash_produtos ADD COLUMN IF NOT EXISTS abreviacao VARCHAR(255);`, []);
            await query(`ALTER TABLE dash_produtos ADD COLUMN IF NOT EXISTS referencia VARCHAR(100);`, []);
            await query(`ALTER TABLE dash_produtos ADD COLUMN IF NOT EXISTS codigo_fabrica VARCHAR(100);`, []);
            await query(`ALTER TABLE dash_produtos ADD COLUMN IF NOT EXISTS departamento VARCHAR(100);`, []);
            await query(`ALTER TABLE dash_produtos ADD COLUMN IF NOT EXISTS unidade VARCHAR(20) DEFAULT 'UN';`, []);
            await query(`ALTER TABLE dash_produtos ADD COLUMN IF NOT EXISTS peso DECIMAL(15,4) DEFAULT 0;`, []);
            await query(`ALTER TABLE dash_produtos ADD COLUMN IF NOT EXISTS comissao_percent DECIMAL(5,2) DEFAULT 0;`, []);
            await query(`ALTER TABLE dash_produtos ADD COLUMN IF NOT EXISTS desconto_max_percent DECIMAL(5,2) DEFAULT 0;`, []);
            await query(`ALTER TABLE dash_produtos ADD COLUMN IF NOT EXISTS estoque_maximo DECIMAL(15,3) DEFAULT 0;`, []);
            await query(`ALTER TABLE dash_produtos ADD COLUMN IF NOT EXISTS apresentacao VARCHAR(255);`, []);
            await query(`ALTER TABLE dash_produtos ADD COLUMN IF NOT EXISTS codigo_barras VARCHAR(100);`, []);
            await query(`ALTER TABLE dash_produtos ADD COLUMN IF NOT EXISTS modelo_barras VARCHAR(50) DEFAULT 'EAN13';`, []);
            await query(`ALTER TABLE dash_produtos ADD COLUMN IF NOT EXISTS preco_minimo DECIMAL(15,2) DEFAULT 0;`, []);
            await query(`ALTER TABLE dash_produtos ADD COLUMN IF NOT EXISTS margem_lucro_min DECIMAL(7,2) DEFAULT 0;`, []);
            await query(`ALTER TABLE dash_produtos ADD COLUMN IF NOT EXISTS margem_lucro_max DECIMAL(7,2) DEFAULT 0;`, []);
            await query(`ALTER TABLE dash_produtos ADD COLUMN IF NOT EXISTS observacoes TEXT;`, []);
            
            await query(`ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS caixa_id_firebird INTEGER;`, []);
            await query(`ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS depto_id INTEGER;`, []);
            await query(`ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS centro_custo INTEGER;`, []);
            await query(`ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS tipo_documento VARCHAR(50);`, []);

            await query(`ALTER TABLE dash_vendas ADD COLUMN IF NOT EXISTS data_vencimento TIMESTAMPTZ DEFAULT NULL;`, []);
            await query(`ALTER TABLE dash_vendas ADD COLUMN IF NOT EXISTS cfop INTEGER DEFAULT NULL;`, []);
            await query(`ALTER TABLE dash_vendas ADD COLUMN IF NOT EXISTS numero_nota INTEGER DEFAULT NULL;`, []);
            await query(`ALTER TABLE dash_vendas ADD COLUMN IF NOT EXISTS data_hora_proc TIMESTAMPTZ DEFAULT NULL;`, []);
            await query(`ALTER TABLE dash_vendas ADD COLUMN IF NOT EXISTS es INTEGER DEFAULT NULL;`, []);
            await query(`ALTER TABLE dash_vendas ADD COLUMN IF NOT EXISTS processo INTEGER DEFAULT NULL;`, []);
            await query(`ALTER TABLE dash_financeiro ALTER COLUMN origem TYPE VARCHAR(50);`, []);
            await query(`ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS asaas_payment_id VARCHAR(100);`, []);
            await query(`ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS asaas_customer_id VARCHAR(100);`, []);
            await query(`ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS asaas_bank_slip_url TEXT;`, []);
            await query(`ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS asaas_linha_digitavel VARCHAR(100);`, []);
            await query(`ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS asaas_bar_code VARCHAR(100);`, []);
            await query(`ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS nosso_numero VARCHAR(50);`, []);
            await query(`ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS numero_documento VARCHAR(100);`, []);
            await query(`ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS cliente_id INTEGER;`, []);
            await query(`ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS cliente_nome VARCHAR(255);`, []);
            await query(`ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS cliente_documento VARCHAR(50);`, []);
            await query(`ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS portador_nome VARCHAR(100);`, []);
            await query(`ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS especie_nome VARCHAR(100);`, []);
            await query(`ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS data_vinculo TIMESTAMPTZ;`, []);
            await query(`ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS usuario_vinculo VARCHAR(100);`, []);
            await query(`ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS alerta_bloqueio BOOLEAN DEFAULT FALSE;`, []);
            await query(`ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS plano_contas_nome VARCHAR(255);`, []);
            await query(`ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS historico TEXT;`, []);
            await query(`ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS tipo_movimento VARCHAR(100);`, []);
            await query(`ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS parcela INTEGER DEFAULT 1;`, []);
            await query(`ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS dias_carencia INTEGER DEFAULT 0;`, []);

            await query(`ALTER TABLE dash_clientes ADD COLUMN IF NOT EXISTS razao_social TEXT;`, []);
            await query(`ALTER TABLE dash_clientes ADD COLUMN IF NOT EXISTS nome_fantasia TEXT;`, []);
            await query(`ALTER TABLE dash_clientes ADD COLUMN IF NOT EXISTS classe VARCHAR(100) DEFAULT 'Geral';`, []);

            await query(`
                CREATE TABLE IF NOT EXISTS dash_fornecedores (
                    id SERIAL PRIMARY KEY,
                    tenant_id UUID NOT NULL,
                    id_firebird INTEGER NOT NULL,
                    nome TEXT NOT NULL,
                    razao_social TEXT,
                    nome_fantasia TEXT,
                    classe VARCHAR(100) DEFAULT 'Geral',
                    documento VARCHAR(50),
                    email TEXT,
                    telefone VARCHAR(50),
                    cidade VARCHAR(100),
                    estado VARCHAR(10),
                    classificacao VARCHAR(50) DEFAULT 'Ativo',
                    ativo BOOLEAN DEFAULT true,
                    data_cadastro TIMESTAMPTZ DEFAULT NOW(),
                    sincronizado_em TIMESTAMPTZ DEFAULT NOW(),
                    UNIQUE(tenant_id, id_firebird)
                );
            `, []);
            await query(`ALTER TABLE dash_fornecedores ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT true;`, []);
            await query(`ALTER TABLE dash_fornecedores ADD COLUMN IF NOT EXISTS data_cadastro TIMESTAMPTZ DEFAULT NOW();`, []);
            await query(`ALTER TABLE dash_fornecedores ADD COLUMN IF NOT EXISTS classificacao VARCHAR(50) DEFAULT 'Ativo';`, []);
            await query(`ALTER TABLE dash_fornecedores ADD COLUMN IF NOT EXISTS email TEXT;`, []);
            await query(`ALTER TABLE dash_fornecedores ADD COLUMN IF NOT EXISTS telefone VARCHAR(50);`, []);
            await query(`ALTER TABLE dash_fornecedores ADD COLUMN IF NOT EXISTS razao_social TEXT;`, []);
            await query(`ALTER TABLE dash_fornecedores ADD COLUMN IF NOT EXISTS nome_fantasia TEXT;`, []);
            await query(`ALTER TABLE dash_fornecedores ADD COLUMN IF NOT EXISTS classe VARCHAR(100) DEFAULT 'Geral';`, []);

            await query(`
                CREATE TABLE IF NOT EXISTS pending_payments (
                    id SERIAL PRIMARY KEY,
                    tenant_id UUID NOT NULL,
                    titulo_id INTEGER,
                    id_firebird INTEGER,
                    nosso_numero VARCHAR(100),
                    numero_documento VARCHAR(100),
                    valor_pago DECIMAL(15,2) NOT NULL,
                    data_pagamento TIMESTAMPTZ NOT NULL,
                    forma_pagamento VARCHAR(50) DEFAULT 'BOLETO_ASAAS',
                    status VARCHAR(50) DEFAULT 'PENDENTE',
                    tentativas INTEGER DEFAULT 0,
                    erro_mensagem TEXT,
                    criado_em TIMESTAMPTZ DEFAULT NOW(),
                    processado_em TIMESTAMPTZ
                );

                DO $$ 
                BEGIN 
                    ALTER TABLE pending_payments ALTER COLUMN id_firebird DROP NOT NULL;
                EXCEPTION WHEN OTHERS THEN NULL;
                END $$;

                CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_payments_tenant_titulo ON pending_payments(tenant_id, titulo_id) WHERE titulo_id IS NOT NULL;
                CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_payments_tenant_titulo_all ON pending_payments(tenant_id, titulo_id);
                CREATE INDEX IF NOT EXISTS idx_pending_payments_tenant_status ON pending_payments(tenant_id, status);

                DO $$ 
                BEGIN 
                    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_pending_payments_tenant_titulo') THEN
                        ALTER TABLE pending_payments ADD CONSTRAINT uq_pending_payments_tenant_titulo UNIQUE (tenant_id, titulo_id);
                    END IF;
                EXCEPTION WHEN OTHERS THEN NULL;
                END $$;
            `, []);

            await query(`
                ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS categoria_pagamento VARCHAR(100);
                ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS billing_type VARCHAR(100);
                ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS data_vinculo TIMESTAMPTZ;
                ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS usuario_vinculo VARCHAR(150);
                ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS asaas_nosso_numero VARCHAR(100);
            `, []);

            await query(`
                CREATE INDEX IF NOT EXISTS idx_dash_fin_tenant_asaas ON dash_financeiro(tenant_id, asaas_payment_id);
                CREATE INDEX IF NOT EXISTS idx_dash_fin_tenant_nosso_num ON dash_financeiro(tenant_id, nosso_numero);
                CREATE INDEX IF NOT EXISTS idx_dash_fin_tenant_pagamento ON dash_financeiro(tenant_id, data_pagamento);
                CREATE INDEX IF NOT EXISTS idx_dash_fin_tenant_cli_fb ON dash_financeiro(tenant_id, cliente_id_firebird);
                CREATE INDEX IF NOT EXISTS idx_dash_fin_tenant_status_venc ON dash_financeiro(tenant_id, status_pagamento, data_vencimento);
                CREATE INDEX IF NOT EXISTS idx_dash_clientes_tenant_fb ON dash_clientes(tenant_id, id_firebird);
            `, []);

            await query(`
                ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS bank_slip_url TEXT;
                ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS pdf_url TEXT;
                ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS invoice_url TEXT;
                ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS cliente_email TEXT;
                ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS cliente_telefone VARCHAR(50);
                ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS regua_id INTEGER;
                ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS regua_pausada BOOLEAN DEFAULT FALSE;
                ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS status_boleto VARCHAR(50);
            `, []);

            await query(`
                CREATE TABLE IF NOT EXISTS dash_estatisticas_software (
                    id SERIAL PRIMARY KEY,
                    tenant_id UUID NOT NULL,
                    cliente_id INTEGER,
                    cliente_id_firebird INTEGER,
                    versao_software VARCHAR(100),
                    versao_atualizacao VARCHAR(100),
                    servidor VARCHAR(100),
                    certificado_vencimento TIMESTAMPTZ,
                    usa_nfe VARCHAR(10),
                    usa_nfce VARCHAR(10),
                    usa_nfse VARCHAR(10),
                    usa_mdfe VARCHAR(10),
                    usa_cte VARCHAR(10),
                    usa_sped VARCHAR(10),
                    usa_boleto VARCHAR(10),
                    usa_folha VARCHAR(10),
                    usa_whats VARCHAR(10),
                    usa_pix VARCHAR(10),
                    usa_cobranca VARCHAR(10),
                    usa_pontuacao VARCHAR(10),
                    usa_os VARCHAR(10),
                    usa_sales VARCHAR(10),
                    usa_dash VARCHAR(10),
                    usa_coletor VARCHAR(10),
                    softwares JSONB,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );

                ALTER TABLE dash_automacoes ADD COLUMN IF NOT EXISTS template_email_id INTEGER;
                ALTER TABLE dash_automacoes ADD COLUMN IF NOT EXISTS canal VARCHAR(50) DEFAULT 'whatsapp';
                ALTER TABLE dash_automacoes ADD COLUMN IF NOT EXISTS meta JSONB DEFAULT '{}';

                ALTER TABLE dash_estatisticas_software ADD COLUMN IF NOT EXISTS versao_software VARCHAR(100);
                ALTER TABLE dash_estatisticas_software ADD COLUMN IF NOT EXISTS versao_atualizacao VARCHAR(100);
                ALTER TABLE dash_estatisticas_software ADD COLUMN IF NOT EXISTS certificado_vencimento TIMESTAMPTZ;
                ALTER TABLE dash_estatisticas_software ADD COLUMN IF NOT EXISTS usa_pontuacao VARCHAR(10);
                ALTER TABLE dash_estatisticas_software ADD COLUMN IF NOT EXISTS usa_cte VARCHAR(10);
                ALTER TABLE dash_estatisticas_software ADD COLUMN IF NOT EXISTS usa_mdfe VARCHAR(10);
                ALTER TABLE dash_estatisticas_software ADD COLUMN IF NOT EXISTS usa_sales VARCHAR(10);
                ALTER TABLE dash_estatisticas_software ADD COLUMN IF NOT EXISTS usa_dash VARCHAR(10);
                ALTER TABLE dash_estatisticas_software ADD COLUMN IF NOT EXISTS usa_coletor VARCHAR(10);
                ALTER TABLE dash_estatisticas_software ADD COLUMN IF NOT EXISTS softwares JSONB;
                CREATE UNIQUE INDEX IF NOT EXISTS idx_dash_estatisticas_software_tenant_fb ON dash_estatisticas_software(tenant_id, cliente_id_firebird);
            `, []);

            await query(`
                ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS moeda VARCHAR(20) DEFAULT 'REAL';
                ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS padrao_centro_custo_id INTEGER;
                ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS asaas_webhook_secret TEXT;
                ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS focus_webhook_secret TEXT;
                ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS whatsapp_meta_app_secret TEXT;
            `, []);

            await query(`
                CREATE TABLE IF NOT EXISTS dash_plataforma_config (
                    chave VARCHAR(100) PRIMARY KEY,
                    valor TEXT,
                    updated_by VARCHAR(180),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );
            `, []).catch(() => {});

            await query(`
                ALTER TABLE dash_emitentes ADD COLUMN IF NOT EXISTS focus_token_homologacao TEXT;
                ALTER TABLE dash_emitentes ADD COLUMN IF NOT EXISTS focus_token_producao TEXT;
                ALTER TABLE dash_emitentes ADD COLUMN IF NOT EXISTS focus_empresa_id VARCHAR(64);
                ALTER TABLE dash_emitentes ADD COLUMN IF NOT EXISTS focus_sincronizado_em TIMESTAMPTZ;
                ALTER TABLE dash_emitentes ADD COLUMN IF NOT EXISTS focus_ultimo_erro TEXT;
                ALTER TABLE dash_emitentes ADD COLUMN IF NOT EXISTS focus_hooks_ativos BOOLEAN DEFAULT FALSE;
                ALTER TABLE dash_emitentes ADD COLUMN IF NOT EXISTS mde_ultima_versao BIGINT DEFAULT 0;
                ALTER TABLE dash_emitentes ADD COLUMN IF NOT EXISTS inscricao_municipal VARCHAR(30);
                ALTER TABLE dash_emitentes ADD COLUMN IF NOT EXISTS certificado_valido_ate TIMESTAMPTZ;
                ALTER TABLE dash_emitentes ALTER COLUMN focus_token TYPE TEXT;
                ALTER TABLE dash_emitentes ALTER COLUMN focus_token_homologacao TYPE TEXT;
                ALTER TABLE dash_emitentes ALTER COLUMN focus_token_producao TYPE TEXT;
            `, []).catch(() => {});

            await query(`
                ALTER TABLE dash_certificados ALTER COLUMN senha TYPE TEXT;
                ALTER TABLE dash_certificados ADD COLUMN IF NOT EXISTS focus_sincronizado BOOLEAN DEFAULT FALSE;
                ALTER TABLE dash_certificados ADD COLUMN IF NOT EXISTS focus_sincronizado_em TIMESTAMPTZ;
            `, []).catch(() => {});
        } catch (migErr) {
            logger.warn('[DB] Migração silenciosa falhou ou já executada', { erro: migErr.message });
        }

        return true;
    } catch (err) {
        logger.error('[DB] Falha na manutenção inicial do PostgreSQL', { error: err.message });
        return false;
    }
}

module.exports = {
    query,
    pool,
    checkConnection,
    runStartupMaintenance
};
