'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db/postgres');
const logger = require('../config/logger');

// Middleware para auto-migration das tabelas de cadastros
async function ensureTablesExist(req, res, next) {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS dash_departamentos (
                id SERIAL PRIMARY KEY,
                tenant_id UUID NOT NULL,
                codigo INT,
                descricao VARCHAR(255) NOT NULL,
                gerenciar_estoque BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS dash_centro_custos (
                id SERIAL PRIMARY KEY,
                tenant_id UUID NOT NULL,
                codigo INT,
                descricao VARCHAR(255) NOT NULL,
                tipo VARCHAR(100) DEFAULT 'EMPRESA',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS dash_regioes (
                id SERIAL PRIMARY KEY,
                tenant_id UUID NOT NULL,
                codigo INT,
                cidade VARCHAR(255) NOT NULL,
                distrito VARCHAR(255),
                uf VARCHAR(10),
                localizacao VARCHAR(255),
                cod_ibge VARCHAR(50),
                pais_codigo INT DEFAULT 1058,
                pais_nome VARCHAR(100) DEFAULT 'BRASIL',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS dash_formas_pagamento (
                id SERIAL PRIMARY KEY,
                tenant_id UUID NOT NULL,
                codigo INT,
                descricao VARCHAR(255) NOT NULL,
                num_parcelas INT DEFAULT 1,
                dias_entrada INT DEFAULT 0,
                dias_entre_parcelas INT DEFAULT 30,
                considerar_mesmo_dia BOOLEAN DEFAULT TRUE,
                antecipacao_percentual NUMERIC(10,2) DEFAULT 0.00,
                juros_depois NUMERIC(10,2) DEFAULT 0.00,
                multa NUMERIC(10,2) DEFAULT 0.00,
                desconto_maximo NUMERIC(10,2) DEFAULT 0.00,
                juros_parc_entrada NUMERIC(10,2) DEFAULT 0.00,
                juros_parc_saida NUMERIC(10,2) DEFAULT 0.00,
                juros_itens VARCHAR(10) DEFAULT 'NÃO',
                calcular_juros_titulos_pagar BOOLEAN DEFAULT FALSE,
                tipo VARCHAR(100) DEFAULT 'A PRAZO C/PARC',
                permite_acesso_app BOOLEAN DEFAULT TRUE,
                formula TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS dash_especies_pagamento (
                id SERIAL PRIMARY KEY,
                tenant_id UUID NOT NULL,
                codigo INT,
                descricao VARCHAR(255) NOT NULL,
                tipo VARCHAR(150) DEFAULT 'DEPOSITO A PRAZO (CARTÃO CRÉDITO)',
                numero_dias INT DEFAULT 0,
                doc_pre_impresso VARCHAR(255),
                permite_acesso_app BOOLEAN DEFAULT FALSE,
                disponivel_negociacao BOOLEAN DEFAULT TRUE,
                permite_credito_negociacao BOOLEAN DEFAULT FALSE,
                incluir_comissao_aberto BOOLEAN DEFAULT FALSE,
                pix_online BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);
        next();
    } catch (err) {
        logger.error('[Cadastros] Erro na criação de tabelas:', err);
        next(err);
    }
}

router.use(ensureTablesExist);

// ----------------------------------------------------------------
// 1. DEPARTAMENTOS
// ----------------------------------------------------------------
router.get('/departamentos', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        let { rows: filiais } = await db.query(
            `SELECT id, depto_id AS codigo, COALESCE(nome, 'DEPARTAMENTO') AS descricao, true AS gerenciar_estoque
             FROM dash_filiais
             WHERE tenant_id = $1
             ORDER BY depto_id ASC, id ASC`,
            [tenantId]
        );

        if (filiais.length > 0) {
            return res.json(filiais);
        }

        let { rows } = await db.query(
            'SELECT id, codigo, descricao, gerenciar_estoque FROM dash_departamentos WHERE tenant_id = $1 ORDER BY codigo ASC, id ASC',
            [tenantId]
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

router.post('/departamentos', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { codigo, descricao, gerenciar_estoque } = req.body;

        const maxRes = await db.query('SELECT COALESCE(MAX(codigo), 0) + 1 AS next_cod FROM dash_departamentos WHERE tenant_id = $1', [tenantId]);
        const cod = codigo ? parseInt(codigo, 10) : maxRes.rows[0].next_cod;

        const { rows } = await db.query(
            `INSERT INTO dash_departamentos (tenant_id, codigo, descricao, gerenciar_estoque)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [tenantId, cod, descricao || 'NOVO DEPARTAMENTO', gerenciar_estoque !== undefined ? !!gerenciar_estoque : true]
        );
        res.json(rows[0]);
    } catch (err) {
        next(err);
    }
});

router.put('/departamentos/:id', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { id } = req.params;
        const { codigo, descricao, gerenciar_estoque } = req.body;

        const { rows } = await db.query(
            `UPDATE dash_departamentos
             SET codigo = $1, descricao = $2, gerenciar_estoque = $3, updated_at = NOW()
             WHERE tenant_id = $4 AND id = $5 RETURNING *`,
            [codigo, descricao, gerenciar_estoque, tenantId, id]
        );
        res.json(rows[0]);
    } catch (err) {
        next(err);
    }
});

router.delete('/departamentos/:id', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { id } = req.params;
        await db.query('DELETE FROM dash_departamentos WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

// ----------------------------------------------------------------
// 2. CENTRO DE CUSTOS
// ----------------------------------------------------------------
router.get('/centro-custos', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        let { rows } = await db.query(
            'SELECT * FROM dash_centro_custos WHERE tenant_id = $1 ORDER BY codigo ASC, id ASC',
            [tenantId]
        );

        if (rows.length === 0) {
            const filiaisRes = await db.query(
                `SELECT DISTINCT centro_custo, nome FROM dash_filiais 
                 WHERE tenant_id = $1 AND centro_custo IS NOT NULL 
                 ORDER BY centro_custo ASC`,
                [tenantId]
            ).catch(() => ({ rows: [] }));

            if (filiaisRes.rows.length > 0) {
                for (const f of filiaisRes.rows) {
                    await db.query(
                        `INSERT INTO dash_centro_custos (tenant_id, codigo, descricao, tipo)
                         VALUES ($1, $2, $3, 'EMPRESA')
                         ON CONFLICT DO NOTHING`,
                        [tenantId, f.centro_custo, f.nome]
                    ).catch(() => {});
                }
                const recheck = await db.query(
                    'SELECT * FROM dash_centro_custos WHERE tenant_id = $1 ORDER BY codigo ASC, id ASC',
                    [tenantId]
                );
                rows = recheck.rows;
            }
        }

        if (!rows.some(r => r.codigo === 6 || (r.descricao && r.descricao.toUpperCase() === 'COLISEU RECEITAS'))) {
            await db.query(
                `INSERT INTO dash_centro_custos (tenant_id, codigo, descricao, tipo)
                 VALUES ($1, 6, 'COLISEU RECEITAS', 'RECEITA')
                 ON CONFLICT DO NOTHING`,
                [tenantId]
            ).catch(() => {});

            const recheck = await db.query(
                'SELECT * FROM dash_centro_custos WHERE tenant_id = $1 ORDER BY codigo ASC, id ASC',
                [tenantId]
            );
            rows = recheck.rows;
        }

        res.json(rows);
    } catch (err) {
        next(err);
    }
});

router.post('/centro-custos', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { codigo, descricao, tipo } = req.body;

        const maxRes = await db.query('SELECT COALESCE(MAX(codigo), 0) + 1 AS next_cod FROM dash_centro_custos WHERE tenant_id = $1', [tenantId]);
        const cod = codigo ? parseInt(codigo, 10) : maxRes.rows[0].next_cod;

        const { rows } = await db.query(
            `INSERT INTO dash_centro_custos (tenant_id, codigo, descricao, tipo)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [tenantId, cod, descricao || 'NOVO CENTRO DE CUSTO', tipo || 'EMPRESA']
        );
        res.json(rows[0]);
    } catch (err) {
        next(err);
    }
});

router.put('/centro-custos/:id', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { id } = req.params;
        const { codigo, descricao, tipo } = req.body;

        const { rows } = await db.query(
            `UPDATE dash_centro_custos
             SET codigo = $1, descricao = $2, tipo = $3, updated_at = NOW()
             WHERE tenant_id = $4 AND id = $5 RETURNING *`,
            [codigo, descricao, tipo, tenantId, id]
        );
        res.json(rows[0]);
    } catch (err) {
        next(err);
    }
});

router.delete('/centro-custos/:id', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { id } = req.params;
        await db.query('DELETE FROM dash_centro_custos WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

// ----------------------------------------------------------------
// 3. REGIÕES
// ----------------------------------------------------------------
router.get('/regioes', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        let { rows } = await db.query(
            'SELECT * FROM dash_regioes WHERE tenant_id = $1 ORDER BY codigo ASC, id ASC',
            [tenantId]
        );

        if (rows.length === 0) {
            const seed = await db.query(
                `INSERT INTO dash_regioes (tenant_id, codigo, cidade, distrito, uf, localizacao, cod_ibge, pais_codigo, pais_nome)
                 VALUES ($1, 9939, 'ABDON BATISTA', 'ABDON BATISTA', 'SANTA CATARINA', '', '4200051', 1058, 'BRASIL'),
                        ($1, 1001, 'CAMPO GRANDE', 'CAMPO GRANDE', 'MATO GROSSO DO SUL', 'CENTRO', '5002704', 1058, 'BRASIL')
                 RETURNING *`,
                [tenantId]
            );
            rows = seed.rows;
        }
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

router.post('/regioes', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { codigo, cidade, distrito, uf, localizacao, cod_ibge, pais_codigo, pais_nome } = req.body;

        const maxRes = await db.query('SELECT COALESCE(MAX(codigo), 0) + 1 AS next_cod FROM dash_regioes WHERE tenant_id = $1', [tenantId]);
        const cod = codigo ? parseInt(codigo, 10) : maxRes.rows[0].next_cod;

        const { rows } = await db.query(
            `INSERT INTO dash_regioes (tenant_id, codigo, cidade, distrito, uf, localizacao, cod_ibge, pais_codigo, pais_nome)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [tenantId, cod, cidade || 'CAMPO GRANDE', distrito || cidade || '', uf || 'MS', localizacao || '', cod_ibge || '', pais_codigo || 1058, pais_nome || 'BRASIL']
        );
        res.json(rows[0]);
    } catch (err) {
        next(err);
    }
});

router.put('/regioes/:id', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { id } = req.params;
        const { codigo, cidade, distrito, uf, localizacao, cod_ibge, pais_codigo, pais_nome } = req.body;

        const { rows } = await db.query(
            `UPDATE dash_regioes
             SET codigo = $1, cidade = $2, distrito = $3, uf = $4, localizacao = $5, cod_ibge = $6, pais_codigo = $7, pais_nome = $8, updated_at = NOW()
             WHERE tenant_id = $9 AND id = $10 RETURNING *`,
            [codigo, cidade, distrito, uf, localizacao, cod_ibge, pais_codigo || 1058, pais_nome || 'BRASIL', tenantId, id]
        );
        res.json(rows[0]);
    } catch (err) {
        next(err);
    }
});

router.delete('/regioes/:id', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { id } = req.params;
        await db.query('DELETE FROM dash_regioes WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

// ----------------------------------------------------------------
// 4. FORMAS DE PAGAMENTO
// ----------------------------------------------------------------
router.get('/formas-pagamento', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        let { rows } = await db.query(
            'SELECT * FROM dash_formas_pagamento WHERE tenant_id = $1 ORDER BY codigo ASC, id ASC',
            [tenantId]
        );

        if (rows.length === 0) {
            const seed = await db.query(
                `INSERT INTO dash_formas_pagamento (
                    tenant_id, codigo, descricao, num_parcelas, dias_entrada, dias_entre_parcelas, considerar_mesmo_dia,
                    antecipacao_percentual, juros_depois, multa, desconto_maximo, juros_parc_entrada, juros_parc_saida,
                    juros_itens, calcular_juros_titulos_pagar, tipo, permite_acesso_app, formula
                 )
                 VALUES ($1, 4, '2 X / 30/60 DIAS', 2, 30, 30, true, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 'NÃO', false, 'A PRAZO C/PARC', true, ''),
                        ($1, 1, 'À VISTA (DINHEIRO)', 1, 0, 0, true, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 'NÃO', false, 'À VISTA', true, '')
                 RETURNING *`,
                [tenantId]
            );
            rows = seed.rows;
        }
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

router.post('/formas-pagamento', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const {
            codigo, descricao, num_parcelas, dias_entrada, dias_entre_parcelas, considerar_mesmo_dia,
            antecipacao_percentual, juros_depois, multa, desconto_maximo, juros_parc_entrada, juros_parc_saida,
            juros_itens, calcular_juros_titulos_pagar, tipo, permite_acesso_app, formula
        } = req.body;

        const maxRes = await db.query('SELECT COALESCE(MAX(codigo), 0) + 1 AS next_cod FROM dash_formas_pagamento WHERE tenant_id = $1', [tenantId]);
        const cod = codigo ? parseInt(codigo, 10) : maxRes.rows[0].next_cod;

        const { rows } = await db.query(
            `INSERT INTO dash_formas_pagamento (
                tenant_id, codigo, descricao, num_parcelas, dias_entrada, dias_entre_parcelas, considerar_mesmo_dia,
                antecipacao_percentual, juros_depois, multa, desconto_maximo, juros_parc_entrada, juros_parc_saida,
                juros_itens, calcular_juros_titulos_pagar, tipo, permite_acesso_app, formula
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING *`,
            [
                tenantId, cod, descricao || 'NOVA FORMA DE PAGAMENTO',
                num_parcelas || 1, dias_entrada || 0, dias_entre_parcelas || 30,
                considerar_mesmo_dia !== undefined ? !!considerar_mesmo_dia : true,
                antecipacao_percentual || 0, juros_depois || 0, multa || 0, desconto_maximo || 0,
                juros_parc_entrada || 0, juros_parc_saida || 0, juros_itens || 'NÃO',
                calcular_juros_titulos_pagar !== undefined ? !!calcular_juros_titulos_pagar : false,
                tipo || 'A PRAZO C/PARC', permite_acesso_app !== undefined ? !!permite_acesso_app : true, formula || ''
            ]
        );
        res.json(rows[0]);
    } catch (err) {
        next(err);
    }
});

router.put('/formas-pagamento/:id', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { id } = req.params;
        const {
            codigo, descricao, num_parcelas, dias_entrada, dias_entre_parcelas, considerar_mesmo_dia,
            antecipacao_percentual, juros_depois, multa, desconto_maximo, juros_parc_entrada, juros_parc_saida,
            juros_itens, calcular_juros_titulos_pagar, tipo, permite_acesso_app, formula
        } = req.body;

        const { rows } = await db.query(
            `UPDATE dash_formas_pagamento
             SET codigo = $1, descricao = $2, num_parcelas = $3, dias_entrada = $4, dias_entre_parcelas = $5,
                 considerar_mesmo_dia = $6, antecipacao_percentual = $7, juros_depois = $8, multa = $9,
                 desconto_maximo = $10, juros_parc_entrada = $11, juros_parc_saida = $12, juros_itens = $13,
                 calcular_juros_titulos_pagar = $14, tipo = $15, permite_acesso_app = $16, formula = $17, updated_at = NOW()
             WHERE tenant_id = $18 AND id = $19 RETURNING *`,
            [
                codigo, descricao, num_parcelas, dias_entrada, dias_entre_parcelas, considerar_mesmo_dia,
                antecipacao_percentual, juros_depois, multa, desconto_maximo, juros_parc_entrada, juros_parc_saida,
                juros_itens, calcular_juros_titulos_pagar, tipo, permite_acesso_app, formula, tenantId, id
            ]
        );
        res.json(rows[0]);
    } catch (err) {
        next(err);
    }
});

router.delete('/formas-pagamento/:id', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { id } = req.params;
        await db.query('DELETE FROM dash_formas_pagamento WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

// ----------------------------------------------------------------
// 5. ESPÉCIES DE PAGAMENTO
// ----------------------------------------------------------------
router.get('/especies-pagamento', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        let { rows } = await db.query(
            'SELECT * FROM dash_especies_pagamento WHERE tenant_id = $1 ORDER BY codigo ASC, id ASC',
            [tenantId]
        );

        if (rows.length === 0) {
            const seed = await db.query(
                `INSERT INTO dash_especies_pagamento (
                    tenant_id, codigo, descricao, tipo, numero_dias, doc_pre_impresso,
                    permite_acesso_app, disponivel_negociacao, permite_credito_negociacao, incluir_comissao_aberto, pix_online
                 )
                 VALUES ($1, 6, 'CARTAO CREDITO', 'DEPOSITO A PRAZO (CARTÃO CRÉDITO)', 30, '', false, true, false, false, false),
                        ($1, 1, 'DINHEIRO', 'CAIXA DIRETO (DINHEIRO)', 0, '', true, true, false, false, false),
                        ($1, 7, 'PIX INSTANTÂNEO', 'DEPOSITO INSTANTÂNEO (PIX)', 0, '', true, true, false, false, true)
                 RETURNING *`,
                [tenantId]
            );
            rows = seed.rows;
        }
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

router.post('/especies-pagamento', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const {
            codigo, descricao, tipo, numero_dias, doc_pre_impresso,
            permite_acesso_app, disponivel_negociacao, permite_credito_negociacao, incluir_comissao_aberto, pix_online
        } = req.body;

        const maxRes = await db.query('SELECT COALESCE(MAX(codigo), 0) + 1 AS next_cod FROM dash_especies_pagamento WHERE tenant_id = $1', [tenantId]);
        const cod = codigo ? parseInt(codigo, 10) : maxRes.rows[0].next_cod;

        const { rows } = await db.query(
            `INSERT INTO dash_especies_pagamento (
                tenant_id, codigo, descricao, tipo, numero_dias, doc_pre_impresso,
                permite_acesso_app, disponivel_negociacao, permite_credito_negociacao, incluir_comissao_aberto, pix_online
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
            [
                tenantId, cod, descricao || 'NOVA ESPÉCIE DE PAGAMENTO',
                tipo || 'DEPOSITO A PRAZO (CARTÃO CRÉDITO)', numero_dias || 0, doc_pre_impresso || '',
                permite_acesso_app !== undefined ? !!permite_acesso_app : false,
                disponivel_negociacao !== undefined ? !!disponivel_negociacao : true,
                permite_credito_negociacao !== undefined ? !!permite_credito_negociacao : false,
                incluir_comissao_aberto !== undefined ? !!incluir_comissao_aberto : false,
                pix_online !== undefined ? !!pix_online : false
            ]
        );
        res.json(rows[0]);
    } catch (err) {
        next(err);
    }
});

router.put('/especies-pagamento/:id', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { id } = req.params;
        const {
            codigo, descricao, tipo, numero_dias, doc_pre_impresso,
            permite_acesso_app, disponivel_negociacao, permite_credito_negociacao, incluir_comissao_aberto, pix_online
        } = req.body;

        const { rows } = await db.query(
            `UPDATE dash_especies_pagamento
             SET codigo = $1, descricao = $2, tipo = $3, numero_dias = $4, doc_pre_impresso = $5,
                 permite_acesso_app = $6, disponivel_negociacao = $7, permite_credito_negociacao = $8,
                 incluir_comissao_aberto = $9, pix_online = $10, updated_at = NOW()
             WHERE tenant_id = $11 AND id = $12 RETURNING *`,
            [
                codigo, descricao, tipo, numero_dias, doc_pre_impresso,
                permite_acesso_app, disponivel_negociacao, permite_credito_negociacao,
                incluir_comissao_aberto, pix_online, tenantId, id
            ]
        );
        res.json(rows[0]);
    } catch (err) {
        next(err);
    }
});

router.delete('/especies-pagamento/:id', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { id } = req.params;
        await db.query('DELETE FROM dash_especies_pagamento WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
