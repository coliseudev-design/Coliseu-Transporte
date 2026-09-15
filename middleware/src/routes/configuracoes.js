'use strict';

const express = require('express');
const router = express.Router();
const config = require('../config/env');
const logger = require('../config/logger');
const { resolvePublicImageUrl } = require('../utils/imageHandler');

/**
 * @route GET /api/configuracoes/empresa
 * @desc Retorna dados da empresa logada a partir do Identity Server.
 */
router.get('/empresa', async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        if (!tenantId) {
            return res.json({ name: 'Coliseu Transporte' });
        }

        const { identityApiUrl, identityInternalKey, expectedModuleSlug } = config.security;

        if (!identityApiUrl || !identityInternalKey) {
            return res.json({ name: 'Coliseu Transporte' });
        }

        const url = `${identityApiUrl}/internal/companies/${tenantId}/modules/${expectedModuleSlug}/info`;
        
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000); // Timeout rápido para não travar a UI

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-Internal-Api-Key': identityInternalKey
            },
            signal: controller.signal
        });
        clearTimeout(timeout);

        if (response.status === 200) {
            const data = await response.json();
            // Retorna todo o payload (ex: valid, deviceLimit, nomeDaEmpresa) ou pelo menos a estrutura básica
            return res.json({
                name: data.nomeDaEmpresa || 'Coliseu Transporte',
                ...data
            });
        }

        logger.warn('[Configuracoes] Falha ao consultar Identity Server', { status: response.status, tenantId });
        return res.json({ name: 'Coliseu Transporte' });

    } catch (err) {
        logger.error('[Configuracoes] Erro na rota de busca da empresa', { err: err.message });
        // Fallback genérico para não quebrar a UI
        return res.json({ name: 'Coliseu Transporte' });
    }
});

const db = require('../db/postgres');

// GET /api/configuracoes/integracoes
router.get('/integracoes', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;

        // Auto-migration para colunas de E-mail, Integrações, Dados da Empresa, Documentos e Padronização
        await db.query(`
            ALTER TABLE dash_integracoes_config 
            ADD COLUMN IF NOT EXISTS asaas_access_token TEXT,
            ADD COLUMN IF NOT EXISTS asaas_ambiente VARCHAR(50) DEFAULT 'Sandbox',
            ADD COLUMN IF NOT EXISTS asaas_webhook_secret TEXT,
            ADD COLUMN IF NOT EXISTS asaas_juros_padrao NUMERIC DEFAULT 1,
            ADD COLUMN IF NOT EXISTS asaas_multa_padrao NUMERIC DEFAULT 2,
            ADD COLUMN IF NOT EXISTS asaas_desconto_padrao NUMERIC DEFAULT 0,
            ADD COLUMN IF NOT EXISTS cora_ativo BOOLEAN DEFAULT false,
            ADD COLUMN IF NOT EXISTS cora_client_id VARCHAR(255),
            ADD COLUMN IF NOT EXISTS cora_cert_pem TEXT,
            ADD COLUMN IF NOT EXISTS cora_private_key TEXT,
            ADD COLUMN IF NOT EXISTS cora_juros_padrao NUMERIC DEFAULT 1,
            ADD COLUMN IF NOT EXISTS cora_multa_padrao NUMERIC DEFAULT 2,
            ADD COLUMN IF NOT EXISTS cora_desconto_padrao NUMERIC DEFAULT 0,
            ADD COLUMN IF NOT EXISTS cora_webhook_url TEXT,
            ADD COLUMN IF NOT EXISTS email_provedor VARCHAR(50) DEFAULT 'smtp',
            ADD COLUMN IF NOT EXISTS email_smtp_host VARCHAR(255),
            ADD COLUMN IF NOT EXISTS email_smtp_port INTEGER DEFAULT 587,
            ADD COLUMN IF NOT EXISTS email_smtp_user VARCHAR(255),
            ADD COLUMN IF NOT EXISTS email_smtp_pass TEXT,
            ADD COLUMN IF NOT EXISTS email_smtp_secure BOOLEAN DEFAULT false,
            ADD COLUMN IF NOT EXISTS email_remetente_nome VARCHAR(255),
            ADD COLUMN IF NOT EXISTS email_remetente VARCHAR(255),
            ADD COLUMN IF NOT EXISTS email_brevo_api_key TEXT,
            ADD COLUMN IF NOT EXISTS portador_padrao_id INTEGER,
            ADD COLUMN IF NOT EXISTS portador_padrao_nome VARCHAR(255),
            ADD COLUMN IF NOT EXISTS especie_padrao_id INTEGER,
            ADD COLUMN IF NOT EXISTS especie_padrao_nome VARCHAR(255),
            ADD COLUMN IF NOT EXISTS empresa_codigo INT DEFAULT 1,
            ADD COLUMN IF NOT EXISTS empresa_nome VARCHAR(255) DEFAULT 'BRANDÃO COMÉRCIO DE PEÇAS',
            ADD COLUMN IF NOT EXISTS empresa_razao_social VARCHAR(255) DEFAULT 'BRANDAO & TORMINATO LTDA',
            ADD COLUMN IF NOT EXISTS empresa_cnpj VARCHAR(50) DEFAULT '00.769.702/0001-34',
            ADD COLUMN IF NOT EXISTS empresa_ie VARCHAR(50) DEFAULT '28.292.015-3',
            ADD COLUMN IF NOT EXISTS empresa_im VARCHAR(50),
            ADD COLUMN IF NOT EXISTS empresa_tipo VARCHAR(50) DEFAULT 'MULTI-EMPRESA',
            ADD COLUMN IF NOT EXISTS empresa_regiao VARCHAR(100) DEFAULT 'CAMPO GRANDE',
            ADD COLUMN IF NOT EXISTS empresa_endereco VARCHAR(255) DEFAULT 'AVENIDA EDUARDO ELIAS ZAHRAN',
            ADD COLUMN IF NOT EXISTS empresa_numero VARCHAR(50) DEFAULT '807',
            ADD COLUMN IF NOT EXISTS empresa_bairro VARCHAR(100) DEFAULT 'JARDIM PAULISTA',
            ADD COLUMN IF NOT EXISTS empresa_complemento VARCHAR(100),
            ADD COLUMN IF NOT EXISTS empresa_cep VARCHAR(50) DEFAULT '79004-000',
            ADD COLUMN IF NOT EXISTS empresa_fax VARCHAR(50),
            ADD COLUMN IF NOT EXISTS empresa_fone1 VARCHAR(50) DEFAULT '(67) 3042-3506',
            ADD COLUMN IF NOT EXISTS empresa_fone2 VARCHAR(50),
            ADD COLUMN IF NOT EXISTS empresa_praca VARCHAR(100),
            ADD COLUMN IF NOT EXISTS empresa_responsavel VARCHAR(100),
            ADD COLUMN IF NOT EXISTS empresa_email VARCHAR(150) DEFAULT 'contato@coliseusistemas.com.br',
            ADD COLUMN IF NOT EXISTS empresa_site VARCHAR(150) DEFAULT 'www.coliseusistemas.com.br',
            ADD COLUMN IF NOT EXISTS empresa_logo_url TEXT,
            ADD COLUMN IF NOT EXISTS doc_modelo_pedidos TEXT,
            ADD COLUMN IF NOT EXISTS doc_modelo_extrato TEXT,
            ADD COLUMN IF NOT EXISTS doc_modelo_orcamento TEXT,
            ADD COLUMN IF NOT EXISTS doc_modelo_recibo TEXT,
            ADD COLUMN IF NOT EXISTS doc_termo_garantia TEXT,
            ADD COLUMN IF NOT EXISTS doc_observacao_padrao TEXT,
            -- Padronização (Movimentação e Financeiro)
            ADD COLUMN IF NOT EXISTS padrao_nat_venda VARCHAR(255) DEFAULT 'VENDA DENTRO DO ESTADO',
            ADD COLUMN IF NOT EXISTS padrao_nat_compra VARCHAR(255) DEFAULT 'COMPRA MERC. DENTRO DO ESTADO',
            ADD COLUMN IF NOT EXISTS padrao_nat_dev_saida VARCHAR(255) DEFAULT 'DEVOLUÇÃO VENDAS',
            ADD COLUMN IF NOT EXISTS padrao_nat_dev_entrada VARCHAR(255) DEFAULT 'DEVOLUÇÃO VENDAS',
            ADD COLUMN IF NOT EXISTS padrao_nat_servico_saida VARCHAR(255),
            ADD COLUMN IF NOT EXISTS padrao_nat_servico_entrada VARCHAR(255),
            ADD COLUMN IF NOT EXISTS padrao_departamento VARCHAR(255) DEFAULT 'COLISEU GERAL',
            ADD COLUMN IF NOT EXISTS padrao_codigo_produto VARCHAR(100) DEFAULT 'CODIGO_FAB',
            ADD COLUMN IF NOT EXISTS padrao_numero_pedido VARCHAR(100) DEFAULT 'PEDIDO',
            ADD COLUMN IF NOT EXISTS padrao_rota_pedidos VARCHAR(255),
            ADD COLUMN IF NOT EXISTS padrao_centro_custo VARCHAR(255) DEFAULT 'COLISEU RECEITAS',
            ADD COLUMN IF NOT EXISTS padrao_centro_custo_id INTEGER,
            ADD COLUMN IF NOT EXISTS padrao_caixa VARCHAR(255) DEFAULT 'CAIXA DIARIO - LOJA',
            ADD COLUMN IF NOT EXISTS padrao_caixa_cofre VARCHAR(255) DEFAULT 'CAIXA COFRE',
            ADD COLUMN IF NOT EXISTS padrao_moeda VARCHAR(50) DEFAULT 'REAL',
            ADD COLUMN IF NOT EXISTS padrao_portador VARCHAR(255) DEFAULT 'CARTEIRA',
            ADD COLUMN IF NOT EXISTS padrao_forma_pagto_prazo VARCHAR(255) DEFAULT 'A VENCER',
            ADD COLUMN IF NOT EXISTS padrao_tabela_precos VARCHAR(255),
            ADD COLUMN IF NOT EXISTS padrao_tipo_juros_titulo VARCHAR(100) DEFAULT 'Composto',
            ADD COLUMN IF NOT EXISTS padrao_tipo_juros_venda VARCHAR(100) DEFAULT 'Juros Composto',
            ADD COLUMN IF NOT EXISTS padrao_modelo_resumo_financeiro VARCHAR(255) DEFAULT 'Modelo 1.4 - Vendas e Financeiro II',
            ADD COLUMN IF NOT EXISTS padrao_juros_carencia_dias INT DEFAULT 0,
            ADD COLUMN IF NOT EXISTS padrao_juros_percentual NUMERIC(10,2) DEFAULT 0.00,
            ADD COLUMN IF NOT EXISTS padrao_plano_contas_id INTEGER,
            ADD COLUMN IF NOT EXISTS padrao_plano_contas_nome VARCHAR(255),
            ADD COLUMN IF NOT EXISTS email_marketing_topo_url TEXT,
            ADD COLUMN IF NOT EXISTS email_marketing_rodape_url TEXT,
            ADD COLUMN IF NOT EXISTS email_cobranca_topo_url TEXT,
            ADD COLUMN IF NOT EXISTS email_cobranca_rodape_url TEXT,
            ADD COLUMN IF NOT EXISTS ai_openai_key TEXT,
            ADD COLUMN IF NOT EXISTS ai_openai_active BOOLEAN DEFAULT false,
            ADD COLUMN IF NOT EXISTS ai_deepseek_key TEXT,
            ADD COLUMN IF NOT EXISTS ai_deepseek_active BOOLEAN DEFAULT false,
            ADD COLUMN IF NOT EXISTS ai_gemini_key TEXT,
            ADD COLUMN IF NOT EXISTS ai_gemini_active BOOLEAN DEFAULT false,
            ADD COLUMN IF NOT EXISTS ai_manus_key TEXT,
            ADD COLUMN IF NOT EXISTS ai_manus_active BOOLEAN DEFAULT false,
            ADD COLUMN IF NOT EXISTS ai_prompt_marketing TEXT,
            ADD COLUMN IF NOT EXISTS ai_prompt_cobranca TEXT,
            ADD COLUMN IF NOT EXISTS ai_prompt_contratos TEXT,
            ADD COLUMN IF NOT EXISTS ai_prompt_bi TEXT;
        `).catch(() => {});
        
        let { rows } = await db.query(
            'SELECT * FROM dash_integracoes_config WHERE tenant_id = $1',
            [tenantId]
        );

        // Identifica filial selecionada via query param ou header
        const reqDeptoId = req.query.depto_id || req.headers['x-depto-id'];

        let filialQuery = `SELECT depto_id, nome, documento FROM dash_filiais WHERE tenant_id = $1 AND ativo = true`;
        let filialParams = [tenantId];

        if (reqDeptoId && reqDeptoId !== 'todas' && reqDeptoId !== 'all') {
            const num = parseInt(reqDeptoId, 10);
            if (!isNaN(num)) {
                filialQuery += ` AND depto_id = $2`;
                filialParams.push(num);
            }
        }
        filialQuery += ` ORDER BY is_default DESC LIMIT 1`;

        const filialRes = await db.query(filialQuery, filialParams).catch(() => ({ rows: [] }));

        const realNome = filialRes.rows[0]?.nome || 'COLISEU SISTEMAS';
        const realDoc = filialRes.rows[0]?.documento || '00.000.000/0001-00';
        const realCode = filialRes.rows[0]?.depto_id || 1;

        if (rows.length === 0) {
            // Insere dados iniciais
            const insertRes = await db.query(
                `INSERT INTO dash_integracoes_config (
                    tenant_id, clicksign_ambiente, salario_minimo_anterior, salario_minimo_atual,
                    whatsapp_server_url, whatsapp_token, whatsapp_admin_phone, whatsapp_enabled,
                    whatsapp_api_provider, empresa_codigo, empresa_nome, empresa_razao_social, empresa_cnpj, empresa_ie,
                    empresa_tipo, empresa_regiao, empresa_endereco, empresa_numero, empresa_bairro, empresa_cep, empresa_fone1, empresa_email, empresa_site
                 )
                 VALUES ($1, 'Sandbox', 1412.00, 1502.00, 'https://coliseu.uazapi.com', '7bec3c90-89fe-466a-8a64-88d1d107a594', '5567984028572', true, 'uazapi', $2, $3, $3, $4, 'Isento', 'MULTI-EMPRESA', 'CAMPO GRANDE', 'AVENIDA EDUARDO ELIAS ZAHRAN', '807', 'JARDIM PAULISTA', '79004-000', '(67) 3042-3506', 'contato@coliseusistemas.com.br', 'www.coliseusistemas.com.br')
                 RETURNING *`,
                [tenantId, realCode, realNome, realDoc]
            );
            rows = insertRes.rows;
        } else {
            // Atualiza dynamicamente os dados da empresa selecionada
            rows[0].empresa_codigo = realCode;
            rows[0].empresa_nome = realNome;
            rows[0].empresa_razao_social = realNome;
            rows[0].empresa_cnpj = realDoc;
            rows[0].empresa_tipo = 'MULTI-EMPRESA';
        }

        res.json({ data: rows[0] });
    } catch (err) {
        next(err);
    }
});

// POST /api/configuracoes/test-ai-connection
router.post('/test-ai-connection', async (req, res, next) => {
    try {
        let { provider, ai_api_key } = req.body;
        const tenantId = req.tenant.id;
        
        // Se a chave vier vazia ou mascarada, busca a chave correspondente no banco
        if (!ai_api_key || ai_api_key.includes('...') || ai_api_key.includes('*')) {
            const dbRes = await db.query('SELECT * FROM dash_integracoes_config WHERE tenant_id = $1 LIMIT 1', [tenantId]);
            const config = dbRes.rows[0] || {};
            
            if (provider === 'openai') ai_api_key = config.ai_openai_key || config.ai_api_key;
            else if (provider === 'deepseek') ai_api_key = config.ai_deepseek_key || config.ai_api_key;
            else if (provider === 'gemini') ai_api_key = config.ai_gemini_key;
            else if (provider === 'manus') ai_api_key = config.ai_manus_key;
            else ai_api_key = config.ai_api_key;
        }

        if (!ai_api_key) {
            return res.status(400).json({ error: 'A chave de API é obrigatória para o teste. Configure e salve primeiro se necessário.' });
        }

        if (provider === 'gemini') {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${ai_api_key}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        role: 'user',
                        parts: [{ text: 'respond in 1 word: ok' }]
                    }]
                })
            });

            if (response.status === 200) {
                const resJson = await response.json();
                const text = resJson.candidates?.[0]?.content?.parts?.[0]?.text || '';
                res.json({ success: true, message: 'Gemini conectado com sucesso!', response: text.trim() });
            } else {
                const errBody = await response.text();
                if (response.status === 429 || errBody.toLowerCase().includes('quota') || errBody.toLowerCase().includes('limit') || errBody.toLowerCase().includes('billing')) {
                    res.json({ 
                        success: true, 
                        message: 'Gemini autenticado com sucesso! Obs: A cota/saldo da sua chave está esgotada no Google AI Studio (Erro 429), mas a credencial é válida e foi salva.' 
                    });
                } else {
                    res.status(400).json({ error: `Erro na API do Gemini (${response.status}): ${response.statusText}. Detalhe: ${errBody.substring(0, 150)}` });
                }
            }
        } 
        else if (provider === 'manus') {
            const response = await fetch('https://api.manus.ai/v2/task.create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-manus-api-key': ai_api_key
                },
                body: JSON.stringify({
                    message: {
                        content: 'hello'
                    }
                })
            });

            if (response.status === 200 || response.status === 201) {
                res.json({ success: true, message: 'Manus API conectada com sucesso!', response: 'Task criada' });
            } else {
                const errBody = await response.text();
                res.status(400).json({ error: `Erro na API do Manus (${response.status}): ${response.statusText}. Detalhe: ${errBody.substring(0, 150)}` });
            }
        } 
        else if (provider === 'openai') {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${ai_api_key}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [{ role: 'user', content: 'respond in 1 word: ok' }],
                    max_tokens: 5
                })
            });

            if (response.status === 200) {
                const resJson = await response.json();
                const text = resJson.choices?.[0]?.message?.content || '';
                res.json({ success: true, message: 'OpenAI conectada com sucesso!', response: text.trim() });
            } else {
                const errBody = await response.text();
                res.status(400).json({ error: `Erro na API da OpenAI (${response.status}): ${response.statusText}. Detalhe: ${errBody.substring(0, 150)}` });
            }
        } 
        else {
            // Default: DeepSeek
            const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${ai_api_key}`
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [
                        { role: 'user', content: 'responda em 1 palavra: ok' }
                    ],
                    max_tokens: 5
                })
            });

            if (response.status === 200) {
                const resJson = await response.json();
                const text = resJson.choices?.[0]?.message?.content || '';
                res.json({ success: true, message: 'DeepSeek conectada com sucesso!', response: text.trim() });
            } else {
                const errBody = await response.text();
                res.status(400).json({ error: `Erro na API da DeepSeek (${response.status}): ${response.statusText}. Detalhe: ${errBody.substring(0, 150)}` });
            }
        }
    } catch (err) {
        logger.error('[AI Test Connection] Falha ao testar conexão:', err.message);
        res.status(500).json({ error: `Erro de conexão: ${err.message}` });
    }
});


// GET /api/configuracoes/ai-usage
router.get('/ai-usage', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        
        await db.query(`
            CREATE TABLE IF NOT EXISTS dash_ai_usage_logs (
                id SERIAL PRIMARY KEY,
                tenant_id UUID NOT NULL,
                provider VARCHAR(100) NOT NULL,
                model VARCHAR(100) NOT NULL,
                tokens_prompt INT DEFAULT 0,
                tokens_completion INT DEFAULT 0,
                cost NUMERIC(10, 6) DEFAULT 0.000000,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `).catch(() => {});

        const { rows: confRows } = await db.query(
            'SELECT ai_deepseek_key, ai_api_key FROM dash_integracoes_config WHERE tenant_id = $1 LIMIT 1',
            [tenantId]
        ).catch(() => ({ rows: [] }));

        const deepseekKey = confRows[0]?.ai_deepseek_key || confRows[0]?.ai_api_key || null;

        const { rows: statsRows } = await db.query(
            `SELECT provider, COALESCE(SUM(cost), 0.000000) as spent
             FROM dash_ai_usage_logs
             WHERE tenant_id = $1
             GROUP BY provider`,
            [tenantId]
        );

        const spentMap = {
            openai: 0,
            deepseek: 0,
            gemini: 0,
            manus: 0
        };

        statsRows.forEach(row => {
            if (spentMap[row.provider] !== undefined) {
                spentMap[row.provider] = parseFloat(row.spent);
            }
        });

        let deepseekBalance = 'Indisponível';
        if (deepseekKey && !deepseekKey.includes('...') && !deepseekKey.includes('*')) {
            try {
                const balRes = await fetch('https://api.deepseek.com/user/balance', {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${deepseekKey}`
                    }
                });
                if (balRes.ok) {
                    const balJson = await balRes.json();
                    if (balJson.is_available && balJson.balance_infos?.[0]) {
                        const info = balJson.balance_infos[0];
                        deepseekBalance = `${parseFloat(info.total_balance).toFixed(2)} ${info.currency}`;
                    }
                }
            } catch (errBal) {
                logger.warn('[AI Usage] Failed to fetch DeepSeek live balance:', errBal.message);
            }
        }

        res.json({
            openai: {
                spent: spentMap.openai,
                balance: 'Ver no Painel OpenAI'
            },
            deepseek: {
                spent: spentMap.deepseek,
                balance: deepseekBalance
            },
            gemini: {
                spent: spentMap.gemini,
                balance: 'Ver no Google Cloud Billing'
            },
            manus: {
                spent: spentMap.manus,
                balance: 'Ver no Painel Manus'
            }
        });
    } catch (err) {
        logger.error('[AI Usage] Error getting AI usage stats:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/configuracoes/integracoes
router.post('/integracoes', async (req, res, next) => {
    const client = await db.pool.connect();
    try {
        // Garantir que todas as colunas mais recentes existam no banco antes de salvar
        await client.query(`
            ALTER TABLE dash_integracoes_config 
            ADD COLUMN IF NOT EXISTS email_marketing_topo_url TEXT,
            ADD COLUMN IF NOT EXISTS email_marketing_rodape_url TEXT,
            ADD COLUMN IF NOT EXISTS email_cobranca_topo_url TEXT,
            ADD COLUMN IF NOT EXISTS email_cobranca_rodape_url TEXT,
            ADD COLUMN IF NOT EXISTS ai_openai_key TEXT,
            ADD COLUMN IF NOT EXISTS ai_openai_active BOOLEAN DEFAULT false,
            ADD COLUMN IF NOT EXISTS ai_deepseek_key TEXT,
            ADD COLUMN IF NOT EXISTS ai_deepseek_active BOOLEAN DEFAULT false,
            ADD COLUMN IF NOT EXISTS ai_gemini_key TEXT,
            ADD COLUMN IF NOT EXISTS ai_gemini_active BOOLEAN DEFAULT false,
            ADD COLUMN IF NOT EXISTS ai_manus_key TEXT,
            ADD COLUMN IF NOT EXISTS ai_manus_active BOOLEAN DEFAULT false,
            ADD COLUMN IF NOT EXISTS ai_prompt_marketing TEXT,
            ADD COLUMN IF NOT EXISTS ai_prompt_cobranca TEXT,
            ADD COLUMN IF NOT EXISTS ai_prompt_contratos TEXT,
            ADD COLUMN IF NOT EXISTS ai_prompt_bi TEXT;
        `).catch(() => {});

        await client.query('BEGIN');
        const tenantId = req.tenant.id;
        const {
            ai_api_key,
            ai_system_prompt,
            ai_openai_key,
            ai_openai_active,
            ai_deepseek_key,
            ai_deepseek_active,
            ai_gemini_key,
            ai_gemini_active,
            ai_manus_key,
            ai_manus_active,
            ai_prompt_marketing,
            ai_prompt_cobranca,
            ai_prompt_contratos,
            ai_prompt_bi,
            whatsapp_instancia_id,
            whatsapp_token,
            clicksign_token,
            clicksign_ambiente,
            salario_minimo_atual,
            lembrete_preventivo_script,
            aviso_vencimento_script,
            atraso_inicial_script,
            atraso_critico_script,
            whatsapp_server_url,
            whatsapp_enabled,
            whatsapp_admin_phone,
            whatsapp_api_provider,
            whatsapp_meta_business_id,
            whatsapp_meta_phone_id,
            whatsapp_meta_token,
            whatsapp_meta_verify_token,
            whatsapp_permitir_multiplos_envios_dia,
            asaas_access_token,
            asaas_ambiente,
            asaas_webhook_secret,
            asaas_juros_padrao,
            asaas_multa_padrao,
            asaas_desconto_padrao,
            cora_ativo,
            cora_client_id,
            cora_cert_pem,
            cora_private_key,
            cora_juros_padrao,
            cora_multa_padrao,
            cora_desconto_padrao,
            cora_webhook_url,
            // Configurações de E-mail
            email_provedor,
            email_smtp_host,
            email_smtp_port,
            email_smtp_user,
            email_smtp_pass,
            email_smtp_secure,
            email_remetente_nome,
            email_remetente,
            email_brevo_api_key,
            email_marketing_topo_url,
            email_marketing_rodape_url,
            email_cobranca_topo_url,
            email_cobranca_rodape_url,
            // Portador e Espécie Padrão
            portador_padrao_id,
            portador_padrao_nome,
            especie_padrao_id,
            especie_padrao_nome,
            // Dados da Empresa
            empresa_codigo,
            empresa_nome,
            empresa_razao_social,
            empresa_cnpj,
            empresa_ie,
            empresa_im,
            empresa_tipo,
            empresa_regiao,
            empresa_endereco,
            empresa_numero,
            empresa_bairro,
            empresa_complemento,
            empresa_cep,
            empresa_fax,
            empresa_fone1,
            empresa_fone2,
            empresa_praca,
            empresa_responsavel,
            empresa_email,
            empresa_site,
            empresa_logo_url,
            // Modelos de Documentos
            doc_modelo_pedidos,
            doc_modelo_extrato,
            doc_modelo_orcamento,
            doc_modelo_recibo,
            doc_termo_garantia,
            doc_observacao_padrao,
            // Padronização (Movimentação e Financeiro)
            padrao_nat_venda,
            padrao_nat_compra,
            padrao_nat_dev_saida,
            padrao_nat_dev_entrada,
            padrao_nat_servico_saida,
            padrao_nat_servico_entrada,
            padrao_departamento,
            padrao_codigo_produto,
            padrao_numero_pedido,
            padrao_rota_pedidos,
            padrao_centro_custo,
            padrao_centro_custo_id,
            padrao_caixa,
            padrao_caixa_cofre,
            padrao_moeda,
            padrao_portador,
            padrao_forma_pagto_prazo,
            padrao_tabela_precos,
            padrao_tipo_juros_titulo,
            padrao_tipo_juros_venda,
            padrao_modelo_resumo_financeiro,
            padrao_juros_carencia_dias,
            padrao_juros_percentual,
            padrao_plano_contas_id,
            padrao_plano_contas_nome
        } = req.body;

        // Sync filial name & document if provided
        if (empresa_codigo && empresa_nome) {
            await client.query(
                `UPDATE dash_filiais SET nome = $1, documento = $2 WHERE tenant_id = $3 AND depto_id = $4`,
                [empresa_nome, empresa_cnpj || null, tenantId, parseInt(empresa_codigo, 10)]
            ).catch(() => {});
        }

        // 1. Fetch old config to check wage change and preserve sensitive/email values
        const oldRes = await client.query(
            'SELECT * FROM dash_integracoes_config WHERE tenant_id = $1',
            [tenantId]
        );
        const oldConf = oldRes.rows[0];

        const rawRemetenteNome = email_remetente_nome !== undefined ? email_remetente_nome : req.body.remetente_nome;
        const finalRemetenteNome = (rawRemetenteNome !== undefined && rawRemetenteNome !== null && rawRemetenteNome !== '')
            ? rawRemetenteNome 
            : (oldConf?.email_remetente_nome || 'Coliseu Transporte');

        const rawRemetenteEmail = email_remetente !== undefined ? email_remetente : req.body.remetente_email;
        const finalRemetenteEmail = (rawRemetenteEmail !== undefined && rawRemetenteEmail !== null && rawRemetenteEmail !== '')
            ? rawRemetenteEmail 
            : (oldConf?.email_remetente || null);

        const finalSmtpPass = (email_smtp_pass && !String(email_smtp_pass).includes('...') && !String(email_smtp_pass).includes('•') && !String(email_smtp_pass).includes('*'))
            ? email_smtp_pass
            : (oldConf?.email_smtp_pass || null);

        const finalOpenaiKey = (ai_openai_key && !String(ai_openai_key).includes('...') && !String(ai_openai_key).includes('•') && !String(ai_openai_key).includes('*'))
            ? ai_openai_key
            : (oldConf?.ai_openai_key || null);

        const finalDeepseekKey = (ai_deepseek_key && !String(ai_deepseek_key).includes('...') && !String(ai_deepseek_key).includes('•') && !String(ai_deepseek_key).includes('*'))
            ? ai_deepseek_key
            : (oldConf?.ai_deepseek_key || null);

        const finalGeminiKey = (ai_gemini_key && !String(ai_gemini_key).includes('...') && !String(ai_gemini_key).includes('•') && !String(ai_gemini_key).includes('*'))
            ? ai_gemini_key
            : (oldConf?.ai_gemini_key || null);

        const finalManusKey = (ai_manus_key && !String(ai_manus_key).includes('...') && !String(ai_manus_key).includes('•') && !String(ai_manus_key).includes('*'))
            ? ai_manus_key
            : (oldConf?.ai_manus_key || null);

        const finalOpenaiActive = ai_openai_active !== undefined ? (ai_openai_active === true || ai_openai_active === 'true') : (oldConf?.ai_openai_active || false);
        const finalDeepseekActive = ai_deepseek_active !== undefined ? (ai_deepseek_active === true || ai_deepseek_active === 'true') : (oldConf?.ai_deepseek_active || false);
        const finalGeminiActive = ai_gemini_active !== undefined ? (ai_gemini_active === true || ai_gemini_active === 'true') : (oldConf?.ai_gemini_active || false);
        const finalManusActive = ai_manus_active !== undefined ? (ai_manus_active === true || ai_manus_active === 'true') : (oldConf?.ai_manus_active || false);

        let newSalarioAnterior = oldConf ? parseFloat(oldConf.salario_minimo_anterior || 1412.00) : 1412.00;
        let newSalarioAtual = salario_minimo_atual !== undefined ? parseFloat(salario_minimo_atual) : (oldConf ? parseFloat(oldConf.salario_minimo_atual || 1502.00) : 1502.00);

        let recalculouContratos = false;
        let contratosContados = 0;

        if (oldConf && salario_minimo_atual !== undefined && parseFloat(salario_minimo_atual) !== parseFloat(oldConf.salario_minimo_atual)) {
            newSalarioAnterior = parseFloat(oldConf.salario_minimo_atual);
            newSalarioAtual = parseFloat(salario_minimo_atual);

            if (newSalarioAnterior > 0 && newSalarioAtual > 0) {
                // Recalcula parcelas em aberto
                const ratio = newSalarioAtual / newSalarioAnterior;
                
                // Executa update em lote
                const upRes = await client.query(
                    `UPDATE dash_financeiro
                     SET valor_atual = valor * $1
                     WHERE tenant_id = $2
                       AND TRIM(status_pagamento) = 'ABERTO'
                       AND contrato_id IN (
                           SELECT id FROM dash_contratos WHERE tenant_id = $2 AND indice_reajuste = 'Salário Mínimo'
                       )`,
                    [ratio, tenantId]
                );
                recalculouContratos = true;
                contratosContados = upRes.rowCount;
            }
        }

        // 2. Insert or update configurations
        const { rows } = await client.query(
            `INSERT INTO dash_integracoes_config (
                tenant_id, ai_api_key, ai_system_prompt, whatsapp_instancia_id, whatsapp_token, clicksign_token, 
                clicksign_ambiente, salario_minimo_anterior, salario_minimo_atual, 
                lembrete_preventivo_script, aviso_vencimento_script, atraso_inicial_script, atraso_critico_script,
                whatsapp_server_url, whatsapp_enabled, whatsapp_admin_phone,
                whatsapp_api_provider, whatsapp_meta_business_id, whatsapp_meta_phone_id, whatsapp_meta_token, whatsapp_meta_verify_token,
                whatsapp_permitir_multiplos_envios_dia,
                asaas_access_token, asaas_ambiente, asaas_webhook_secret, asaas_juros_padrao, asaas_multa_padrao, asaas_desconto_padrao,
                cora_ativo, cora_client_id, cora_cert_pem, cora_private_key, cora_juros_padrao, cora_multa_padrao, cora_desconto_padrao, cora_webhook_url,
                email_provedor, email_smtp_host, email_smtp_port, email_smtp_user, email_smtp_pass, email_smtp_secure,
                email_remetente_nome, email_remetente, email_brevo_api_key,
                portador_padrao_id, portador_padrao_nome, especie_padrao_id, especie_padrao_nome,
                empresa_codigo, empresa_nome, empresa_razao_social, empresa_cnpj, empresa_ie, empresa_im, empresa_tipo, empresa_regiao,
                empresa_endereco, empresa_numero, empresa_bairro, empresa_complemento, empresa_cep, empresa_fax, empresa_fone1, empresa_fone2,
                empresa_praca, empresa_responsavel, empresa_email, empresa_site, empresa_logo_url,
                doc_modelo_pedidos, doc_modelo_extrato, doc_modelo_orcamento, doc_modelo_recibo, doc_termo_garantia, doc_observacao_padrao,
                padrao_nat_venda, padrao_nat_compra, padrao_nat_dev_saida, padrao_nat_dev_entrada, padrao_nat_servico_saida, padrao_nat_servico_entrada,
                padrao_departamento, padrao_codigo_produto, padrao_numero_pedido, padrao_rota_pedidos, padrao_centro_custo, padrao_caixa, padrao_caixa_cofre,
                padrao_moeda, padrao_portador, padrao_forma_pagto_prazo, padrao_tabela_precos, padrao_tipo_juros_titulo, padrao_tipo_juros_venda,
                padrao_modelo_resumo_financeiro, padrao_juros_carencia_dias, padrao_juros_percentual,
                padrao_plano_contas_id, padrao_plano_contas_nome,
                email_marketing_topo_url, email_marketing_rodape_url, email_cobranca_topo_url, email_cobranca_rodape_url,
                ai_openai_key, ai_openai_active, ai_deepseek_key, ai_deepseek_active,
                ai_gemini_key, ai_gemini_active, ai_manus_key, ai_manus_active,
                ai_prompt_marketing, ai_prompt_cobranca, ai_prompt_contratos, ai_prompt_bi,
                padrao_centro_custo_id
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52, $53, $54, $55, $56, $57, $58, $59, $60, $61, $62, $63, $64, $65, $66, $67, $68, $69, $70, $71, $72, $73, $74, $75, $76, $77, $78, $79, $80, $81, $82, $83, $84, $85, $86, $87, $88, $89, $90, $91, $92, $93, $94, $95, $96, $97, $98, $99, $100, $101, $102, $103, $104, $105, $106, $107, $108, $109, $110, $111, $112, $113, $114, $115, $116, $117)
             ON CONFLICT (tenant_id) DO UPDATE SET
                ai_api_key = EXCLUDED.ai_api_key,
                ai_system_prompt = EXCLUDED.ai_system_prompt,
                whatsapp_instancia_id = EXCLUDED.whatsapp_instancia_id,
                whatsapp_token = EXCLUDED.whatsapp_token,
                clicksign_token = EXCLUDED.clicksign_token,
                clicksign_ambiente = EXCLUDED.clicksign_ambiente,
                salario_minimo_anterior = EXCLUDED.salario_minimo_anterior,
                salario_minimo_atual = EXCLUDED.salario_minimo_atual,
                lembrete_preventivo_script = EXCLUDED.lembrete_preventivo_script,
                aviso_vencimento_script = EXCLUDED.aviso_vencimento_script,
                atraso_inicial_script = EXCLUDED.atraso_inicial_script,
                atraso_critico_script = EXCLUDED.atraso_critico_script,
                whatsapp_server_url = EXCLUDED.whatsapp_server_url,
                whatsapp_enabled = EXCLUDED.whatsapp_enabled,
                whatsapp_admin_phone = EXCLUDED.whatsapp_admin_phone,
                whatsapp_api_provider = EXCLUDED.whatsapp_api_provider,
                whatsapp_meta_business_id = EXCLUDED.whatsapp_meta_business_id,
                whatsapp_meta_phone_id = EXCLUDED.whatsapp_meta_phone_id,
                whatsapp_meta_token = EXCLUDED.whatsapp_meta_token,
                whatsapp_meta_verify_token = EXCLUDED.whatsapp_meta_verify_token,
                whatsapp_permitir_multiplos_envios_dia = EXCLUDED.whatsapp_permitir_multiplos_envios_dia,
                asaas_access_token = EXCLUDED.asaas_access_token,
                asaas_ambiente = EXCLUDED.asaas_ambiente,
                asaas_webhook_secret = EXCLUDED.asaas_webhook_secret,
                asaas_juros_padrao = EXCLUDED.asaas_juros_padrao,
                asaas_multa_padrao = EXCLUDED.asaas_multa_padrao,
                asaas_desconto_padrao = EXCLUDED.asaas_desconto_padrao,
                cora_ativo = EXCLUDED.cora_ativo,
                cora_client_id = EXCLUDED.cora_client_id,
                cora_cert_pem = EXCLUDED.cora_cert_pem,
                cora_private_key = EXCLUDED.cora_private_key,
                cora_juros_padrao = EXCLUDED.cora_juros_padrao,
                cora_multa_padrao = EXCLUDED.cora_multa_padrao,
                cora_desconto_padrao = EXCLUDED.cora_desconto_padrao,
                cora_webhook_url = EXCLUDED.cora_webhook_url,
                email_provedor = EXCLUDED.email_provedor,
                email_smtp_host = EXCLUDED.email_smtp_host,
                email_smtp_port = EXCLUDED.email_smtp_port,
                email_smtp_user = EXCLUDED.email_smtp_user,
                email_smtp_pass = EXCLUDED.email_smtp_pass,
                email_smtp_secure = EXCLUDED.email_smtp_secure,
                email_remetente_nome = EXCLUDED.email_remetente_nome,
                email_remetente = EXCLUDED.email_remetente,
                email_brevo_api_key = EXCLUDED.email_brevo_api_key,
                portador_padrao_id = EXCLUDED.portador_padrao_id,
                portador_padrao_nome = EXCLUDED.portador_padrao_nome,
                especie_padrao_id = EXCLUDED.especie_padrao_id,
                especie_padrao_nome = EXCLUDED.especie_padrao_nome,
                empresa_codigo = EXCLUDED.empresa_codigo,
                empresa_nome = EXCLUDED.empresa_nome,
                empresa_razao_social = EXCLUDED.empresa_razao_social,
                empresa_cnpj = EXCLUDED.empresa_cnpj,
                empresa_ie = EXCLUDED.empresa_ie,
                empresa_im = EXCLUDED.empresa_im,
                empresa_tipo = EXCLUDED.empresa_tipo,
                empresa_regiao = EXCLUDED.empresa_regiao,
                empresa_endereco = EXCLUDED.empresa_endereco,
                empresa_numero = EXCLUDED.empresa_numero,
                empresa_bairro = EXCLUDED.empresa_bairro,
                empresa_complemento = EXCLUDED.empresa_complemento,
                empresa_cep = EXCLUDED.empresa_cep,
                empresa_fax = EXCLUDED.empresa_fax,
                empresa_fone1 = EXCLUDED.empresa_fone1,
                empresa_fone2 = EXCLUDED.empresa_fone2,
                empresa_praca = EXCLUDED.empresa_praca,
                empresa_responsavel = EXCLUDED.empresa_responsavel,
                empresa_email = EXCLUDED.empresa_email,
                empresa_site = EXCLUDED.empresa_site,
                empresa_logo_url = EXCLUDED.empresa_logo_url,
                doc_modelo_pedidos = EXCLUDED.doc_modelo_pedidos,
                doc_modelo_extrato = EXCLUDED.doc_modelo_extrato,
                doc_modelo_orcamento = EXCLUDED.doc_modelo_orcamento,
                doc_modelo_recibo = EXCLUDED.doc_modelo_recibo,
                doc_termo_garantia = EXCLUDED.doc_termo_garantia,
                doc_observacao_padrao = EXCLUDED.doc_observacao_padrao,
                padrao_nat_venda = EXCLUDED.padrao_nat_venda,
                padrao_nat_compra = EXCLUDED.padrao_nat_compra,
                padrao_nat_dev_saida = EXCLUDED.padrao_nat_dev_saida,
                padrao_nat_dev_entrada = EXCLUDED.padrao_nat_dev_entrada,
                padrao_nat_servico_saida = EXCLUDED.padrao_nat_servico_saida,
                padrao_nat_servico_entrada = EXCLUDED.padrao_nat_servico_entrada,
                padrao_departamento = EXCLUDED.padrao_departamento,
                padrao_codigo_produto = EXCLUDED.padrao_codigo_produto,
                padrao_numero_pedido = EXCLUDED.padrao_numero_pedido,
                padrao_rota_pedidos = EXCLUDED.padrao_rota_pedidos,
                padrao_centro_custo = EXCLUDED.padrao_centro_custo,
                padrao_centro_custo_id = EXCLUDED.padrao_centro_custo_id,
                padrao_caixa = EXCLUDED.padrao_caixa,
                padrao_caixa_cofre = EXCLUDED.padrao_caixa_cofre,
                padrao_moeda = EXCLUDED.padrao_moeda,
                padrao_portador = EXCLUDED.padrao_portador,
                padrao_forma_pagto_prazo = EXCLUDED.padrao_forma_pagto_prazo,
                padrao_tabela_precos = EXCLUDED.padrao_tabela_precos,
                padrao_tipo_juros_titulo = EXCLUDED.padrao_tipo_juros_titulo,
                padrao_tipo_juros_venda = EXCLUDED.padrao_tipo_juros_venda,
                padrao_modelo_resumo_financeiro = EXCLUDED.padrao_modelo_resumo_financeiro,
                padrao_juros_carencia_dias = EXCLUDED.padrao_juros_carencia_dias,
                padrao_juros_percentual = EXCLUDED.padrao_juros_percentual,
                padrao_plano_contas_id = EXCLUDED.padrao_plano_contas_id,
                padrao_plano_contas_nome = EXCLUDED.padrao_plano_contas_nome,
                email_marketing_topo_url = EXCLUDED.email_marketing_topo_url,
                email_marketing_rodape_url = EXCLUDED.email_marketing_rodape_url,
                email_cobranca_topo_url = EXCLUDED.email_cobranca_topo_url,
                email_cobranca_rodape_url = EXCLUDED.email_cobranca_rodape_url,
                ai_openai_key = EXCLUDED.ai_openai_key,
                ai_openai_active = EXCLUDED.ai_openai_active,
                ai_deepseek_key = EXCLUDED.ai_deepseek_key,
                ai_deepseek_active = EXCLUDED.ai_deepseek_active,
                ai_gemini_key = EXCLUDED.ai_gemini_key,
                ai_gemini_active = EXCLUDED.ai_gemini_active,
                ai_manus_key = EXCLUDED.ai_manus_key,
                ai_manus_active = EXCLUDED.ai_manus_active,
                ai_prompt_marketing = EXCLUDED.ai_prompt_marketing,
                ai_prompt_cobranca = EXCLUDED.ai_prompt_cobranca,
                ai_prompt_contratos = EXCLUDED.ai_prompt_contratos,
                ai_prompt_bi = EXCLUDED.ai_prompt_bi,
                updated_at = NOW()
             RETURNING *`,
            [
                tenantId,
                ai_api_key,
                ai_system_prompt,
                whatsapp_instancia_id,
                whatsapp_token,
                clicksign_token,
                clicksign_ambiente || 'Sandbox',
                newSalarioAnterior,
                newSalarioAtual,
                lembrete_preventivo_script,
                aviso_vencimento_script,
                atraso_inicial_script,
                atraso_critico_script,
                whatsapp_server_url,
                whatsapp_enabled !== undefined ? (whatsapp_enabled === true || whatsapp_enabled === 'true') : true,
                whatsapp_admin_phone,
                whatsapp_api_provider || 'uazapi',
                whatsapp_meta_business_id,
                whatsapp_meta_phone_id,
                whatsapp_meta_token,
                whatsapp_meta_verify_token,
                whatsapp_permitir_multiplos_envios_dia !== undefined ? (whatsapp_permitir_multiplos_envios_dia === true || whatsapp_permitir_multiplos_envios_dia === 'true') : false,
                asaas_access_token,
                asaas_ambiente || 'Sandbox',
                asaas_webhook_secret,
                asaas_juros_padrao !== undefined ? parseFloat(asaas_juros_padrao) : 1.00,
                asaas_multa_padrao !== undefined ? parseFloat(asaas_multa_padrao) : 2.00,
                asaas_desconto_padrao !== undefined ? parseFloat(asaas_desconto_padrao) : 0.00,
                // Banco Cora
                cora_ativo !== undefined ? (cora_ativo === true || cora_ativo === 'true') : false,
                cora_client_id || 'int-6niGnUQSRUDauHBRYg0xCP',
                cora_cert_pem || null,
                cora_private_key || null,
                cora_juros_padrao !== undefined ? parseFloat(cora_juros_padrao) : 1.00,
                cora_multa_padrao !== undefined ? parseFloat(cora_multa_padrao) : 2.00,
                cora_desconto_padrao !== undefined ? parseFloat(cora_desconto_padrao) : 0.00,
                cora_webhook_url || null,
                // E-mail
                email_provedor || 'smtp',
                email_smtp_host || null,
                email_smtp_port ? parseInt(email_smtp_port) : 587,
                email_smtp_user || null,
                finalSmtpPass,
                email_smtp_secure !== undefined ? (email_smtp_secure === true || email_smtp_secure === 'true') : false,
                finalRemetenteNome,
                finalRemetenteEmail,
                email_brevo_api_key || null,
                // Portador e Espécie Padrão
                portador_padrao_id ? parseInt(portador_padrao_id) : null,
                portador_padrao_nome || null,
                especie_padrao_id ? parseInt(especie_padrao_id) : null,
                especie_padrao_nome || null,
                // Dados da Empresa
                empresa_codigo ? parseInt(empresa_codigo) : 1,
                empresa_nome || 'COLISEU SISTEMAS',
                empresa_razao_social || 'COLISEU SISTEMAS',
                empresa_cnpj || '00.000.000/0001-00',
                empresa_ie || 'Isento',
                empresa_im || null,
                empresa_tipo || 'MULTI-EMPRESA',
                empresa_regiao || 'CAMPO GRANDE',
                empresa_endereco || 'AVENIDA EDUARDO ELIAS ZAHRAN',
                empresa_numero || '807',
                empresa_bairro || 'JARDIM PAULISTA',
                empresa_complemento || null,
                empresa_cep || '79004-000',
                empresa_fax || null,
                empresa_fone1 || '(67) 3042-3506',
                empresa_fone2 || null,
                empresa_praca || null,
                empresa_responsavel || null,
                empresa_email || 'contato@coliseusistemas.com.br',
                empresa_site || 'www.coliseusistemas.com.br',
                empresa_logo_url || null,
                // Modelos de Documentos
                doc_modelo_pedidos || null,
                doc_modelo_extrato || null,
                doc_modelo_orcamento || null,
                doc_modelo_recibo || null,
                doc_termo_garantia || null,
                doc_observacao_padrao || null,
                // Padronização
                padrao_nat_venda || 'VENDA DENTRO DO ESTADO',
                padrao_nat_compra || 'COMPRA MERC. DENTRO DO ESTADO',
                padrao_nat_dev_saida || 'DEVOLUÇÃO VENDAS',
                padrao_nat_dev_entrada || 'DEVOLUÇÃO VENDAS',
                padrao_nat_servico_saida || null,
                padrao_nat_servico_entrada || null,
                padrao_departamento || 'COLISEU GERAL',
                padrao_codigo_produto || 'CODIGO_FAB',
                padrao_numero_pedido || 'PEDIDO',
                padrao_rota_pedidos || null,
                padrao_centro_custo || 'COLISEU RECEITAS',
                padrao_caixa || 'CAIXA DIARIO - LOJA',
                padrao_caixa_cofre || 'CAIXA COFRE',
                padrao_moeda || 'REAL',
                padrao_portador || 'CARTEIRA',
                padrao_forma_pagto_prazo || 'A VENCER',
                padrao_tabela_precos || null,
                padrao_tipo_juros_titulo || 'Composto',
                padrao_tipo_juros_venda || 'Juros Composto',
                padrao_modelo_resumo_financeiro || 'Modelo 1.4 - Vendas e Financeiro II',
                padrao_juros_carencia_dias ? parseInt(padrao_juros_carencia_dias) : 0,
                padrao_juros_percentual ? parseFloat(padrao_juros_percentual) : 0.00,
                padrao_plano_contas_id ? parseInt(padrao_plano_contas_id) : null,
                padrao_plano_contas_nome || null,
                resolvePublicImageUrl(email_marketing_topo_url) || null,
                resolvePublicImageUrl(email_marketing_rodape_url) || null,
                resolvePublicImageUrl(email_cobranca_topo_url) || null,
                resolvePublicImageUrl(email_cobranca_rodape_url) || null,
                finalOpenaiKey,
                finalOpenaiActive,
                finalDeepseekKey,
                finalDeepseekActive,
                finalGeminiKey,
                finalGeminiActive,
                finalManusKey,
                finalManusActive,
                ai_prompt_marketing || null,
                ai_prompt_cobranca || null,
                ai_prompt_contratos || null,
                ai_prompt_bi || null,
                padrao_centro_custo_id ? parseInt(padrao_centro_custo_id) : (padrao_centro_custo === 'COLISEU RECEITAS' ? 6 : null)
            ]
        );

        await client.query('COMMIT');
        res.json({
            success: true,
            data: rows[0],
            recalculation: {
                applied: recalculouContratos,
                installmentsCount: contratosContados,
                message: recalculouContratos 
                    ? `Ajuste efetuado em ${contratosContados} parcelas vinculadas ao salário mínimo.` 
                    : 'Nenhuma alteração de reajuste detectada.'
            }
        });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        logger.error('[Configuracoes] Erro ao salvar configurações de integrações:', err.message, err.stack);
        res.status(500).json({ error: err.message || 'Erro interno ao salvar configurações de integrações.' });
    } finally {
        client.release();
    }
});

// DELETE /api/configuracoes/reset-automacoes
router.delete('/reset-automacoes', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        
        await db.query(
            'DELETE FROM dash_automacoes_logs WHERE tenant_id = $1',
            [tenantId]
        );
        
        res.json({ success: true, message: 'Histórico de envios de automações resetado com sucesso!' });
    } catch (err) {
        next(err);
    }
});

// Helper auto-migration para tabela de cedentes bancários
async function initCedentesTable() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS dash_cedentes_bancarios (
            id SERIAL PRIMARY KEY,
            tenant_id UUID NOT NULL,
            nome VARCHAR(255) NOT NULL,
            provedor_banco VARCHAR(100) NOT NULL DEFAULT 'asaas',
            ambiente VARCHAR(50) DEFAULT 'Produção',
            api_token TEXT,
            client_id TEXT,
            client_secret TEXT,
            convenio VARCHAR(100),
            agencia VARCHAR(50),
            conta VARCHAR(50),
            portador_id_erp INT,
            portador_nome_erp VARCHAR(255) DEFAULT 'ASAAS',
            juros_am NUMERIC(10,2) DEFAULT 1.00,
            multa_pct NUMERIC(10,2) DEFAULT 2.00,
            desconto_pct NUMERIC(10,2) DEFAULT 0.00,
            ativo BOOLEAN DEFAULT TRUE,
            is_default BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
    `).catch(() => {});
}

// GET /api/configuracoes/cedentes
router.get('/cedentes', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        await initCedentesTable();

        let { rows } = await db.query(
            `SELECT * FROM dash_cedentes_bancarios WHERE tenant_id = $1 ORDER BY is_default DESC, id ASC`,
            [tenantId]
        );

        // Se não houver nenhum cadastrado, cria uma entrada padrão com Asaas
        if (rows.length === 0) {
            const configRes = await db.query(
                `SELECT asaas_api_token, asaas_ambiente, asaas_juros_padrao, asaas_multa_padrao, asaas_desconto_padrao 
                 FROM dash_integracoes_config WHERE tenant_id = $1 LIMIT 1`,
                [tenantId]
            ).catch(() => ({ rows: [] }));

            const cfg = configRes.rows[0] || {};

            const inserted = await db.query(
                `INSERT INTO dash_cedentes_bancarios 
                 (tenant_id, nome, provedor_banco, ambiente, api_token, portador_nome_erp, juros_am, multa_pct, desconto_pct, ativo, is_default)
                 VALUES ($1, 'Banco Asaas Principal', 'asaas', $2, $3, 'ASAAS', $4, $5, $6, true, true)
                 RETURNING *`,
                [
                    tenantId,
                    cfg.asaas_ambiente || 'Produção',
                    cfg.asaas_api_token || '',
                    cfg.asaas_juros_padrao || 1.0,
                    cfg.asaas_multa_padrao || 2.0,
                    cfg.asaas_desconto_padrao || 0.0
                ]
            );
            rows = inserted.rows;
        }

        // Verifica se Banco Cora já está cadastrado em dash_cedentes_bancarios
        const hasCora = rows.some(r => r.provedor_banco === 'cora');
        if (!hasCora) {
            const coraConfigRes = await db.query(
                `SELECT cora_ativo, cora_client_id, cora_juros_padrao, cora_multa_padrao, cora_desconto_padrao, cora_cert_pem 
                 FROM dash_integracoes_config WHERE tenant_id = $1 LIMIT 1`,
                [tenantId]
            ).catch(() => ({ rows: [] }));

            const cCfg = coraConfigRes.rows[0];
            if (cCfg && (cCfg.cora_ativo || cCfg.cora_cert_pem)) {
                const coraInserted = await db.query(
                    `INSERT INTO dash_cedentes_bancarios 
                     (tenant_id, nome, provedor_banco, ambiente, client_id, portador_nome_erp, juros_am, multa_pct, desconto_pct, ativo, is_default, agencia, conta)
                     VALUES ($1, 'Banco Cora Conta Digital', 'cora', 'Produção', $2, 'CORA', $3, $4, $5, $6, false, '0001', '7264541-2')
                     RETURNING *`,
                    [
                        tenantId,
                        cCfg.cora_client_id || 'int-6niGnUQSRUDauHBRYg0xCP',
                        cCfg.cora_juros_padrao || 1.0,
                        cCfg.cora_multa_padrao || 2.0,
                        cCfg.cora_desconto_padrao || 0.0,
                        cCfg.cora_ativo !== false
                    ]
                ).catch(() => null);

                if (coraInserted && coraInserted.rows[0]) {
                    rows.push(coraInserted.rows[0]);
                }
            }
        }

        res.json({ data: rows });
    } catch (err) {
        next(err);
    }
});

// POST /api/configuracoes/cedentes
router.post('/cedentes', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        await initCedentesTable();

        const {
            nome, provedor_banco, ambiente, api_token, client_id, client_secret,
            convenio, agencia, conta, portador_nome_erp, juros_am, multa_pct, desconto_pct, ativo, is_default
        } = req.body;

        if (!nome) {
            return res.status(400).json({ error: 'Nome do cedente é obrigatório.' });
        }

        if (is_default) {
            await db.query(`UPDATE dash_cedentes_bancarios SET is_default = false WHERE tenant_id = $1`, [tenantId]);
        }

        const { rows } = await db.query(
            `INSERT INTO dash_cedentes_bancarios 
             (tenant_id, nome, provedor_banco, ambiente, api_token, client_id, client_secret, convenio, agencia, conta, portador_nome_erp, juros_am, multa_pct, desconto_pct, ativo, is_default)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
             RETURNING *`,
            [
                tenantId,
                nome,
                provedor_banco || 'asaas',
                ambiente || 'Produção',
                api_token || '',
                client_id || '',
                client_secret || '',
                convenio || '',
                agencia || '',
                conta || '',
                portador_nome_erp || 'ASAAS',
                juros_am ? parseFloat(juros_am) : 1.0,
                multa_pct ? parseFloat(multa_pct) : 2.0,
                desconto_pct ? parseFloat(desconto_pct) : 0.0,
                ativo !== false,
                !!is_default
            ]
        );

        res.json({ success: true, data: rows[0] });
    } catch (err) {
        next(err);
    }
});

// PUT /api/configuracoes/cedentes/:id
router.put('/cedentes/:id', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const cedenteId = req.params.id;

        const {
            nome, provedor_banco, ambiente, api_token, client_id, client_secret,
            convenio, agencia, conta, portador_nome_erp, juros_am, multa_pct, desconto_pct, ativo, is_default
        } = req.body;

        if (is_default) {
            await db.query(`UPDATE dash_cedentes_bancarios SET is_default = false WHERE tenant_id = $1`, [tenantId]);
        }

        const { rows } = await db.query(
            `UPDATE dash_cedentes_bancarios
             SET nome = COALESCE($1, nome),
                 provedor_banco = COALESCE($2, provedor_banco),
                 ambiente = COALESCE($3, ambiente),
                 api_token = COALESCE($4, api_token),
                 client_id = COALESCE($5, client_id),
                 client_secret = COALESCE($6, client_secret),
                 convenio = COALESCE($7, convenio),
                 agencia = COALESCE($8, agencia),
                 conta = COALESCE($9, conta),
                 portador_nome_erp = COALESCE($10, portador_nome_erp),
                 juros_am = COALESCE($11, juros_am),
                 multa_pct = COALESCE($12, multa_pct),
                 desconto_pct = COALESCE($13, desconto_pct),
                 ativo = COALESCE($14, ativo),
                 is_default = COALESCE($15, is_default),
                 updated_at = NOW()
             WHERE tenant_id = $16 AND id = $17
             RETURNING *`,
            [
                nome, provedor_banco, ambiente, api_token, client_id, client_secret,
                convenio, agencia, conta, portador_nome_erp,
                juros_am !== undefined ? parseFloat(juros_am) : null,
                multa_pct !== undefined ? parseFloat(multa_pct) : null,
                desconto_pct !== undefined ? parseFloat(desconto_pct) : null,
                ativo, is_default, tenantId, cedenteId
            ]
        );

        res.json({ success: true, data: rows[0] });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/configuracoes/cedentes/:id
router.delete('/cedentes/:id', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const cedenteId = req.params.id;

        await db.query(`DELETE FROM dash_cedentes_bancarios WHERE tenant_id = $1 AND id = $2`, [tenantId, cedenteId]);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
