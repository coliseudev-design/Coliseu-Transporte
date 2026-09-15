'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db/postgres');
const logger = require('../config/logger');
const scheduler = require('../utils/scheduler');

// GET /api/automacoes
router.get('/', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        
        const { rows } = await db.query(
            `SELECT a.*, 
                    t.nome AS template_nome, t.categoria AS template_categoria, t.subcategoria AS template_subcategoria,
                    te.nome AS template_email_nome, te.categoria AS template_email_categoria
             FROM dash_automacoes a
             LEFT JOIN dash_templates t ON t.id = a.template_id AND t.tenant_id = a.tenant_id
             LEFT JOIN dash_templates te ON te.id = a.template_email_id AND te.tenant_id = a.tenant_id
             WHERE a.tenant_id = $1
             ORDER BY a.created_at DESC`,
            [tenantId]
        );

        res.json({ data: rows });
    } catch (err) {
        next(err);
    }
});

// GET /api/automacoes/template/:templateId
router.get('/template/:templateId', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const templateId = parseInt(req.params.templateId, 10);

        const { rows } = await db.query(
            `SELECT a.*, t.nome AS template_nome, t.categoria AS template_categoria, t.subcategoria AS template_subcategoria
             FROM dash_automacoes a
             LEFT JOIN dash_templates t ON t.id = a.template_id AND t.tenant_id = a.tenant_id
             WHERE a.tenant_id = $1 AND (a.template_id = $2 OR a.template_email_id = $2)`,
            [tenantId, templateId]
        );

        if (rows.length === 0) {
            return res.json({ data: null });
        }

        res.json({ data: rows[0] });
    } catch (err) {
        next(err);
    }
});

// POST /api/automacoes
router.post('/', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { template_id, template_email_id, ativo, gatilho, tempo_segundos, dias_vencimento, canal, meta } = req.body;

        if (!gatilho) {
            return res.status(400).json({ error: 'gatilho é obrigatório.' });
        }

        // Upsert automation rule by gatilho
        const existing = await db.query(
            'SELECT id FROM dash_automacoes WHERE tenant_id = $1 AND gatilho = $2 LIMIT 1',
            [tenantId, gatilho]
        );

        let rows;
        if (existing.rowCount > 0) {
            const upd = await db.query(
                `UPDATE dash_automacoes
                 SET 
                    template_id = $1,
                    template_email_id = $2,
                    ativo = $3,
                    tempo_segundos = $4,
                    dias_vencimento = $5,
                    canal = $6,
                    meta = $7,
                    updated_at = NOW()
                 WHERE tenant_id = $8 AND id = $9
                 RETURNING *`,
                [
                    template_id ? parseInt(template_id, 10) : null,
                    template_email_id ? parseInt(template_email_id, 10) : null,
                    ativo === undefined ? false : !!ativo,
                    parseInt(tempo_segundos, 10) || 0,
                    parseInt(dias_vencimento, 10) || 0,
                    canal || 'whatsapp',
                    meta ? (typeof meta === 'object' ? JSON.stringify(meta) : meta) : null,
                    tenantId,
                    existing.rows[0].id
                ]
            );
            rows = upd.rows;
        } else {
            const ins = await db.query(
                `INSERT INTO dash_automacoes (tenant_id, template_id, template_email_id, ativo, gatilho, tempo_segundos, dias_vencimento, canal, meta, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
                 RETURNING *`,
                [
                    tenantId, 
                    template_id ? parseInt(template_id, 10) : null, 
                    template_email_id ? parseInt(template_email_id, 10) : null, 
                    ativo === undefined ? false : !!ativo, 
                    gatilho, 
                    parseInt(tempo_segundos, 10) || 0, 
                    parseInt(dias_vencimento, 10) || 0,
                    canal || 'whatsapp',
                    meta ? (typeof meta === 'object' ? JSON.stringify(meta) : meta) : null
                ]
            );
            rows = ins.rows;
        }

        res.status(201).json({ data: rows[0] });
    } catch (err) {
        next(err);
    }
});

// PUT /api/automacoes/:id
router.put('/:id', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const id = parseInt(req.params.id, 10);
        const { template_id, template_email_id, ativo, gatilho, tempo_segundos, dias_vencimento, canal, meta } = req.body;

        const { rows } = await db.query(
            `UPDATE dash_automacoes
             SET 
                template_id = CASE WHEN $1::text = '__CLEAR__' THEN NULL WHEN $1 IS NOT NULL THEN $1::integer ELSE template_id END,
                template_email_id = CASE WHEN $2::text = '__CLEAR__' THEN NULL WHEN $2 IS NOT NULL THEN $2::integer ELSE template_email_id END,
                ativo = COALESCE($3, ativo),
                gatilho = COALESCE($4, gatilho),
                tempo_segundos = COALESCE($5, tempo_segundos),
                dias_vencimento = COALESCE($6, dias_vencimento),
                canal = COALESCE($7, canal),
                meta = COALESCE($8, meta),
                updated_at = NOW()
             WHERE tenant_id = $9 AND id = $10
             RETURNING *`,
            [
                template_id === undefined ? null : (template_id === null ? '__CLEAR__' : String(template_id)),
                template_email_id === undefined ? null : (template_email_id === null ? '__CLEAR__' : String(template_email_id)),
                ativo === undefined ? null : !!ativo,
                gatilho || null,
                tempo_segundos === undefined ? null : parseInt(tempo_segundos, 10),
                dias_vencimento === undefined ? null : parseInt(dias_vencimento, 10),
                canal === undefined ? null : canal,
                meta === undefined ? null : (typeof meta === 'object' ? JSON.stringify(meta) : meta),
                tenantId,
                id
            ]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Configuração de automação não encontrada.' });
        }

        res.json({ data: rows[0] });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/automacoes/:id
router.delete('/:id', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const id = parseInt(req.params.id, 10);

        const delRes = await db.query(
            'DELETE FROM dash_automacoes WHERE tenant_id = $1 AND id = $2',
            [tenantId, id]
        );

        if (delRes.rowCount === 0) {
            return res.status(404).json({ error: 'Configuração de automação não encontrada.' });
        }

        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

// POST /api/automacoes/toggle-all
router.post('/toggle-all', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { ativo, subcategoria } = req.body;
        const targetAtivo = !!ativo;

        if (subcategoria === 'marketing') {
            const marketingTriggers = ['tempo_em_tempo', 'aniversario', 'pos_compra', 'compra_marca'];
            await db.query(
                `UPDATE dash_automacoes 
                 SET ativo = $1, updated_at = NOW() 
                 WHERE tenant_id = $2 AND gatilho = ANY($3::text[])`,
                [targetAtivo, tenantId, marketingTriggers]
            );
        } else {
            await db.query(
                `UPDATE dash_automacoes 
                 SET ativo = $1, updated_at = NOW() 
                 WHERE tenant_id = $2`,
                [targetAtivo, tenantId]
            );
        }

        const { rows } = await db.query(
            `SELECT * FROM dash_automacoes WHERE tenant_id = $1`,
            [tenantId]
        );

        res.json({ success: true, ativo: targetAtivo, data: rows });
    } catch (err) {
        next(err);
    }
});

// POST /api/automacoes/run
router.post('/run', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { subcategoria } = req.body;

        await scheduler.checkAutomations(subcategoria || null, tenantId);

        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

// GET /api/automacoes/logs
router.get('/logs', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;

        await db.query(`
            ALTER TABLE dash_automacoes_logs ALTER COLUMN automacao_id DROP NOT NULL;
            ALTER TABLE dash_automacoes_logs ADD COLUMN IF NOT EXISTS tipo VARCHAR(50);
            ALTER TABLE dash_automacoes_logs ADD COLUMN IF NOT EXISTS canal VARCHAR(50);
            ALTER TABLE dash_automacoes_logs ADD COLUMN IF NOT EXISTS destinatario VARCHAR(150);
            ALTER TABLE dash_automacoes_logs ADD COLUMN IF NOT EXISTS subcategoria VARCHAR(50);
        `).catch(() => {});

        const { rows } = await db.query(
            `SELECT l.*, 
                    COALESCE(l.tipo, a.gatilho, 'EMISSAO_LOTE') AS tipo,
                    COALESCE(l.canal, a.canal, 'EMAIL') AS canal,
                    COALESCE(l.destinatario, c.email, c.telefone, 'Cliente') AS destinatario,
                    COALESCE(l.subcategoria, t.subcategoria, 'cobranca') AS subcategoria,
                    t.nome AS template_nome,
                    COALESCE(c.nome, f.cliente_nome, 'Cliente') AS cliente_nome,
                    o.titulo AS oportunidade_titulo,
                    v.numero_pedido AS venda_numero_pedido
             FROM dash_automacoes_logs l
             LEFT JOIN dash_automacoes a ON a.id = l.automacao_id AND a.tenant_id = l.tenant_id
             LEFT JOIN dash_templates t ON t.id = a.template_id AND t.tenant_id = a.tenant_id
             LEFT JOIN dash_clientes c ON (c.id = l.cliente_id OR c.id_firebird = l.cliente_id) AND c.tenant_id = l.tenant_id
             LEFT JOIN dash_financeiro f ON f.id = l.financeiro_id AND f.tenant_id = l.tenant_id
             LEFT JOIN dash_oportunidades o ON o.id = l.oportunidade_id AND o.tenant_id = l.tenant_id
             LEFT JOIN dash_vendas v ON v.id = l.venda_id AND v.tenant_id = l.tenant_id
             WHERE l.tenant_id = $1
             ORDER BY l.enviado_em DESC
             LIMIT 200`,
            [tenantId]
        );

        res.json({ data: rows });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
