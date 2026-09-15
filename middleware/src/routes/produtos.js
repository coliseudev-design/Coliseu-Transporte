'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db/postgres');

// GET /api/produtos/lista?search=&limit=&offset=
router.get('/lista', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const search = req.query.search || '';
        const limit = Math.min(parseInt(req.query.limit, 10) || 100, 1000);
        const offset = parseInt(req.query.offset, 10) || 0;
        const categoria = req.query.categoria;

        const where = ['tenant_id = $1', 'ativo = true'];
        const binds = [tenantId];
        let pIndex = 2;

        if (search) {
            where.push(`(nome ILIKE $${pIndex} OR codigo ILIKE $${pIndex})`);
            binds.push(`%${search}%`);
            pIndex++;
        }

        if (categoria) {
            where.push(`categoria = $${pIndex}`);
            binds.push(categoria);
            pIndex++;
        }

        const whereSql = `WHERE ${where.join(' AND ')}`;

        const totalP = await db.query(`SELECT COUNT(*) AS total FROM dash_produtos ${whereSql}`, binds);

        const limitIdx = pIndex++;
        const offsetIdx = pIndex++;
        
        const { rows } = await db.query(`
            SELECT 
                id_firebird AS id, codigo, nome, abreviacao, categoria, marca, referencia, codigo_fabrica, departamento, unidade, peso,
                comissao_percent, desconto_max_percent, preco, custo, estoque, estoque_minimo, estoque_maximo, apresentacao,
                codigo_barras, modelo_barras, preco_minimo, margem_lucro_min, margem_lucro_max, observacoes,
                tipo, tipo_cobranca, categoria_contabil, (preco * estoque) AS valor_total_estoque
            FROM dash_produtos
            ${whereSql}
            ORDER BY nome
            LIMIT $${limitIdx} OFFSET $${offsetIdx}
        `, [...binds, limit, offset]);

        const formatted = rows.map(r => ({
            ...r,
            preco: parseFloat(r.preco || 0),
            custo: parseFloat(r.custo || 0),
            estoque: parseFloat(r.estoque || 0),
            estoque_minimo: parseFloat(r.estoque_minimo || 0),
            estoque_maximo: parseFloat(r.estoque_maximo || 0),
            peso: parseFloat(r.peso || 0),
            comissao_percent: parseFloat(r.comissao_percent || 0),
            desconto_max_percent: parseFloat(r.desconto_max_percent || 0),
            preco_minimo: parseFloat(r.preco_minimo || 0),
            margem_lucro_min: parseFloat(r.margem_lucro_min || 0),
            margem_lucro_max: parseFloat(r.margem_lucro_max || 0),
            valor_total_estoque: parseFloat(r.valor_total_estoque || 0)
        }));

        res.json({ 
            data: formatted, 
            total: parseInt(totalP.rows[0]?.total || 0, 10), 
            limit, 
            offset 
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/produtos/categorias
router.get('/categorias', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { rows } = await db.query(`
            SELECT 
                COALESCE(NULLIF(categoria, ''), 'Sem categoria') AS categoria, 
                COUNT(*) AS qtd, 
                SUM(preco * estoque) AS valor_estoque
            FROM dash_produtos 
            WHERE tenant_id = $1 AND ativo = true
            GROUP BY COALESCE(NULLIF(categoria, ''), 'Sem categoria')
            ORDER BY categoria
        `, [tenantId]);

        const formatted = rows.map(r => ({
            categoria: r.categoria,
            qtd: parseInt(r.qtd, 10),
            valor_estoque: parseFloat(r.valor_estoque || 0)
        }));

        res.json({ data: formatted });
    } catch (err) {
        next(err);
    }
});

// GET /api/produtos/kpis
router.get('/kpis', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        
        const rP = await db.query(`
            SELECT 
                COUNT(*) AS total,
                COALESCE(SUM(preco * estoque), 0) AS valor_total_estoque,
                COALESCE(MAX(preco), 0) AS mais_caro,
                COALESCE(MIN(preco), 0) AS mais_barato,
                SUM(CASE WHEN estoque <= estoque_minimo THEN 1 ELSE 0 END) AS baixo_estoque
            FROM dash_produtos 
            WHERE tenant_id = $1 AND ativo = true
        `, [tenantId]);

        const caroP = await db.query(`
            SELECT nome FROM dash_produtos 
            WHERE tenant_id = $1 AND ativo = true 
            ORDER BY preco DESC LIMIT 1
        `, [tenantId]);

        const baratoP = await db.query(`
            SELECT nome FROM dash_produtos 
            WHERE tenant_id = $1 AND ativo = true AND preco > 0 
            ORDER BY preco ASC LIMIT 1
        `, [tenantId]);

        res.json({
            kpis: {
                total_produtos: parseInt(rP.rows[0]?.total || 0, 10),
                valor_total_estoque: parseFloat(rP.rows[0]?.valor_total_estoque || 0),
                baixo_estoque: parseInt(rP.rows[0]?.baixo_estoque || 0, 10),
                produto_mais_caro: caroP.rows[0]?.nome || '—',
                produto_mais_barato: baratoP.rows[0]?.nome || '—',
            }
        });
    } catch (err) {
        next(err);
    }
});

// POST /api/produtos
router.post('/', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { 
            nome, codigo, abreviacao, categoria, marca, referencia, codigo_fabrica, departamento, unidade, peso,
            comissao_percent, desconto_max_percent, preco, custo, estoque, estoque_minimo, estoque_maximo, apresentacao,
            codigo_barras, modelo_barras, preco_minimo, margem_lucro_min, margem_lucro_max, observacoes,
            tipo, tipo_cobranca, categoria_contabil 
        } = req.body;

        if (!nome) {
            return res.status(400).json({ error: 'O nome / descrição é obrigatório.' });
        }

        const { rows } = await db.query(
            `INSERT INTO dash_produtos (
                tenant_id, id_firebird, codigo, nome, abreviacao, categoria, marca, referencia, codigo_fabrica, departamento, unidade, peso,
                comissao_percent, desconto_max_percent, preco, custo, estoque, estoque_minimo, estoque_maximo, apresentacao,
                codigo_barras, modelo_barras, preco_minimo, margem_lucro_min, margem_lucro_max, observacoes,
                tipo, tipo_cobranca, categoria_contabil, ativo
             )
             VALUES (
                $1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, true
             )
             RETURNING id_firebird AS id, *`,
            [
                tenantId, 
                codigo || `PRD-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
                nome, 
                abreviacao || null,
                categoria || 'Sem categoria', 
                marca || '—', 
                referencia || null,
                codigo_fabrica || null,
                departamento || null,
                unidade || 'UN',
                peso || 0,
                comissao_percent || 0,
                desconto_max_percent || 0,
                preco || 0, 
                custo || 0, 
                estoque || 0, 
                estoque_minimo || 0,
                estoque_maximo || 0,
                apresentacao || null,
                codigo_barras || null,
                modelo_barras || 'EAN13',
                preco_minimo || 0,
                margem_lucro_min || 0,
                margem_lucro_max || 0,
                observacoes || null,
                tipo || 'PRODUTO', 
                tipo_cobranca || 'Avulso/Setup', 
                categoria_contabil || 'Receita Operacional'
            ]
        );

        res.status(201).json({ data: rows[0] });
    } catch (err) {
        next(err);
    }
});

// PUT /api/produtos/:id
router.put('/:id', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const id = parseInt(req.params.id, 10);
        const { 
            nome, codigo, abreviacao, categoria, marca, referencia, codigo_fabrica, departamento, unidade, peso,
            comissao_percent, desconto_max_percent, preco, custo, estoque, estoque_minimo, estoque_maximo, apresentacao,
            codigo_barras, modelo_barras, preco_minimo, margem_lucro_min, margem_lucro_max, observacoes,
            tipo, tipo_cobranca, categoria_contabil 
        } = req.body;

        const { rows } = await db.query(
            `UPDATE dash_produtos
             SET codigo = COALESCE($1, codigo), nome = COALESCE($2, nome), abreviacao = COALESCE($3, abreviacao),
                 categoria = COALESCE($4, categoria), marca = COALESCE($5, marca), referencia = COALESCE($6, referencia),
                 codigo_fabrica = COALESCE($7, codigo_fabrica), departamento = COALESCE($8, departamento), unidade = COALESCE($9, unidade),
                 peso = COALESCE($10, peso), comissao_percent = COALESCE($11, comissao_percent), desconto_max_percent = COALESCE($12, desconto_max_percent),
                 preco = COALESCE($13, preco), custo = COALESCE($14, custo), estoque = COALESCE($15, estoque),
                 estoque_minimo = COALESCE($16, estoque_minimo), estoque_maximo = COALESCE($17, estoque_maximo),
                 apresentacao = COALESCE($18, apresentacao), codigo_barras = COALESCE($19, codigo_barras),
                 modelo_barras = COALESCE($20, modelo_barras), preco_minimo = COALESCE($21, preco_minimo),
                 margem_lucro_min = COALESCE($22, margem_lucro_min), margem_lucro_max = COALESCE($23, margem_lucro_max),
                 observacoes = COALESCE($24, observacoes), tipo = COALESCE($25, tipo), tipo_cobranca = COALESCE($26, tipo_cobranca),
                 categoria_contabil = COALESCE($27, categoria_contabil)
             WHERE tenant_id = $28 AND (id = $29 OR id_firebird = $29)
             RETURNING id_firebird AS id, *`,
            [
                codigo, nome, abreviacao, categoria, marca, referencia, codigo_fabrica, departamento, unidade,
                peso, comissao_percent, desconto_max_percent, preco, custo, estoque, estoque_minimo, estoque_maximo,
                apresentacao, codigo_barras, modelo_barras, preco_minimo, margem_lucro_min, margem_lucro_max,
                observacoes, tipo, tipo_cobranca, categoria_contabil, tenantId, id
            ]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Produto não encontrado.' });
        }

        res.json({ data: rows[0] });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/produtos/:id
// Inativa o produto no Nexus (ativo=false) e enfileira inativação no ERP via pending_inactivations.
router.delete('/:id', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const id = parseInt(req.params.id, 10);

        // 1. Busca o produto para pegar o id_firebird real
        const found = await db.query(
            'SELECT id, id_firebird, nome FROM dash_produtos WHERE tenant_id = $1 AND (id = $2 OR id_firebird = $2)',
            [tenantId, id]
        );

        if (found.rowCount === 0) {
            return res.status(404).json({ error: 'Produto não encontrado.' });
        }

        const produto = found.rows[0];
        const idFirebird = produto.id_firebird;

        // 2. Inativa no Nexus (soft delete)
        await db.query(
            'UPDATE dash_produtos SET ativo = false WHERE tenant_id = $1 AND id = $2',
            [tenantId, produto.id]
        );

        // 3. Enfileira inativação no ERP (se tiver id_firebird — produtos criados pelo Nexus não têm)
        let erp_queued = false;
        if (idFirebird) {
            try {
                await db.query(`
                    INSERT INTO pending_inactivations (tenant_id, entidade, id_firebird, status)
                    VALUES ($1, 'produto', $2, 'PENDENTE')
                    ON CONFLICT (tenant_id, entidade, id_firebird) DO UPDATE SET
                        status = 'PENDENTE',
                        tentativas = 0,
                        erro_mensagem = NULL,
                        criado_em = NOW()
                `, [tenantId, idFirebird]);
                erp_queued = true;
            } catch (queueErr) {
                // Fila falhou mas inativação local foi feita — não bloqueia a resposta
                console.error('[Produtos] Falha ao enfileirar inativação ERP:', queueErr.message);
            }
        }

        res.json({
            success: true,
            message: `Produto "${produto.nome}" inativado com sucesso.`,
            erp_queued,
            erp_note: idFirebird
                ? (erp_queued ? 'Inativação no ERP enfileirada — será processada pelo Worker.' : 'Falha ao enfileirar inativação no ERP.')
                : 'Produto sem ID no ERP — inativação apenas local.'
        });
    } catch (err) {
        next(err);
    }
});


module.exports = router;
