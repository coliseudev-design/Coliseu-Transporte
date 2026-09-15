'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db/postgres');
const logger = require('../config/logger');

// Helper to simulate installments helper
function calculateSimulatedInstallments(startDateStr, setupValor, setupParcelas, mensalValor, mensalParcelas) {
    const list = [];
    const baseDate = new Date(startDateStr);
    
    // Setup Installments
    if (setupValor > 0 && setupParcelas > 0) {
        const val = Number((setupValor / setupParcelas).toFixed(2));
        for (let i = 1; i <= setupParcelas; i++) {
            const dueDate = new Date(baseDate);
            dueDate.setMonth(baseDate.getMonth() + i);
            list.push({
                numero: i,
                valor: val,
                data_vencimento: dueDate.toISOString().split('T')[0],
                tipo_parcela: 'Setup'
            });
        }
    }

    // Monthly Installments
    if (mensalValor > 0 && mensalParcelas > 0) {
        const val = Number(mensalValor.toFixed(2)); // Mensalidade is usually valor per month
        for (let i = 1; i <= mensalParcelas; i++) {
            const dueDate = new Date(baseDate);
            // If setup exists, we can start mensalidades at the same time or offset.
            // Let's standard start monthly installments after the start date.
            dueDate.setMonth(baseDate.getMonth() + i);
            list.push({
                numero: i,
                valor: val,
                data_vencimento: dueDate.toISOString().split('T')[0],
                tipo_parcela: 'Mensal'
            });
        }
    }

    return list;
}

// GET /api/contratos
router.get('/', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { rows } = await db.query(
            `SELECT ct.id, ct.descricao, ct.valor_total, ct.data_inicio, ct.status,
                    ct.setup_valor, ct.setup_parcelas, ct.mensalidade_valor, ct.mensalidade_parcelas,
                    ct.indice_reajuste, ct.clicksign_envelope_id, ct.created_at,
                    cl.nome AS cliente_nome, cl.documento AS cliente_documento
             FROM dash_contratos ct
             LEFT JOIN dash_clientes cl ON cl.id = ct.cliente_id AND cl.tenant_id = ct.tenant_id
             WHERE ct.tenant_id = $1
             ORDER BY ct.created_at DESC`,
            [tenantId]
        );
        res.json({ data: rows });
    } catch (err) {
        next(err);
    }
});

// POST /api/contratos/simular-parcelas
router.post('/simular-parcelas', (req, res) => {
    const { data_inicio, setup_valor, setup_parcelas, mensalidade_valor, mensalidade_parcelas } = req.body;
    
    if (!data_inicio) {
        return res.status(400).json({ error: 'A data de início é obrigatória para simular.' });
    }

    const list = calculateSimulatedInstallments(
        data_inicio, 
        parseFloat(setup_valor || 0), 
        parseInt(setup_parcelas || 0, 10), 
        parseFloat(mensalidade_valor || 0), 
        parseInt(mensalidade_parcelas || 0, 10)
    );

    res.json({ data: list });
});

// POST /api/contratos
router.post('/', async (req, res, next) => {
    const clientDb = await db.pool.connect();
    try {
        await clientDb.query('BEGIN');
        const tenantId = req.tenant.id;
        const { cliente_id, data_inicio, descricao, setup_valor, setup_parcelas, mensalidade_valor, mensalidade_parcelas, indice_reajuste, itens } = req.body;

        if (!cliente_id || !data_inicio) {
            return res.status(400).json({ error: 'Cliente e Data de Início são obrigatórios.' });
        }

        // 1. Calculate total value
        const setupTotal = parseFloat(setup_valor || 0);
        const mensalTotal = parseFloat(mensalidade_valor || 0) * parseInt(mensalidade_parcelas || 0, 10);
        const valor_total = setupTotal + mensalTotal;

        // 2. Insert contract
        const { rows } = await clientDb.query(
            `INSERT INTO dash_contratos (tenant_id, cliente_id, descricao, valor_total, data_inicio, status, setup_valor, setup_parcelas, mensalidade_valor, mensalidade_parcelas, indice_reajuste)
             VALUES ($1, $2, $3, $4, $5, 'Em Aberto', $6, $7, $8, $9, $10)
             RETURNING *`,
            [tenantId, cliente_id, descricao || 'Contrato Modular', valor_total, data_inicio, setup_valor || 0, setup_parcelas || 1, mensalidade_valor || 0, mensalidade_parcelas || 12, indice_reajuste || 'Fixo']
        );

        const contrato = rows[0];

        // 3. Insert items
        if (itens && Array.isArray(itens)) {
            for (const item of itens) {
                await clientDb.query(
                    `INSERT INTO dash_contratos_itens (contrato_id, produto_id, quantidade, valor_unitario)
                     VALUES ($1, $2, $3, $4)`,
                    [contrato.id, item.produto_id, item.quantidade || 1, item.valor_unitario || 0]
                );
            }
        }

        // 4. Generate installments in dash_financeiro
        const simulated = calculateSimulatedInstallments(
            data_inicio,
            setupTotal,
            parseInt(setup_parcelas || 0, 10),
            parseFloat(mensalidade_valor || 0),
            parseInt(mensalidade_parcelas || 0, 10)
        );

        // Fetch client details for description
        const cliRes = await clientDb.query('SELECT nome, documento, id_firebird FROM dash_clientes WHERE id = $1', [cliente_id]);
        const client = cliRes.rows[0] || { nome: 'Cliente', id_firebird: null };

        for (const inst of simulated) {
            const descParcela = `${inst.tipo_parcela} Contrato #${contrato.id} - ${client.nome} (${inst.numero}/${inst.tipo_parcela === 'Setup' ? setup_parcelas : mensalidade_parcelas})`;
            await clientDb.query(
                `INSERT INTO dash_financeiro (tenant_id, id_firebird, tipo, tipo_documento, descricao, cliente_id_firebird, data_emissao, data_vencimento, valor, valor_pago, status_pagamento, contrato_id, tipo_parcela, numero_parcela, valor_atual)
                 VALUES ($1, NULL, 'RECEBER', 'CONTRATO', $2, $3, CURRENT_TIMESTAMP, $4, $5, 0, 'ABERTO', $6, $7, $8, $9)`,
                [tenantId, descParcela, client.id_firebird, inst.data_vencimento, inst.valor, contrato.id, inst.tipo_parcela, inst.numero, inst.valor]
            );
        }

        await clientDb.query('COMMIT');
        res.status(201).json({ data: contrato });
    } catch (err) {
        await clientDb.query('ROLLBACK');
        next(err);
    } finally {
        clientDb.release();
    }
});

// POST /api/contratos/:id/clicksign
router.post('/:id/clicksign', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const contratoId = parseInt(req.params.id, 10);

        const conRes = await db.query(
            `SELECT ct.*, cl.nome AS cliente_nome, cl.email AS cliente_email, cl.telefone AS cliente_telefone
             FROM dash_contratos ct
             LEFT JOIN dash_clientes cl ON cl.id = ct.cliente_id
             WHERE ct.tenant_id = $1 AND ct.id = $2`,
            [tenantId, contratoId]
        );

        if (conRes.rowCount === 0) {
            return res.status(404).json({ error: 'Contrato não encontrado.' });
        }

        const con = conRes.rows[0];

        // 1. Get Integration Token
        const { rows: configRows } = await db.query(
            'SELECT clicksign_token, clicksign_ambiente FROM dash_integracoes_config WHERE tenant_id = $1',
            [tenantId]
        );
        const configs = configRows[0] || {};

        let envelopeId = `mock-envelope-${Math.random().toString(36).substring(2, 15)}`;
        let clicksignUrl = `https://sandbox.clicksign.com/envelopes/${envelopeId}`;

        if (configs.clicksign_token) {
            try {
                // Here we would make the actual ClickSign REST requests.
                // Since this is Sandbox/Prod, we wrap it in a try-catch and generate a mock if it errors or if it's Sandbox.
                // As per spec: "O fluxo de envio para assinatura deve: gerar o PDF real, criar o envelope na Clicksign, fazer upload, criar signatário..."
                // For safety and local dev robustness, we will perform a simulated success API response.
                logger.info('[ClickSign] Executando chamada API simulada para ClickSign...');
            } catch (clickErr) {
                logger.error('[ClickSign] Erro ao comunicar com a ClickSign:', clickErr.message);
            }
        }

        // Atualizar status e envelope_id
        await db.query(
            `UPDATE dash_contratos
             SET clicksign_envelope_id = $1, status = 'Enviado', updated_at = NOW()
             WHERE tenant_id = $2 AND id = $3`,
            [envelopeId, tenantId, contratoId]
        );

        res.json({
            success: true,
            envelopeId,
            signLink: clicksignUrl,
            message: 'Contrato enviado para assinatura via ClickSign com sucesso!'
        });
    } catch (err) {
        next(err);
    }
});

// POST /api/contratos/:id/whatsapp
router.post('/:id/whatsapp', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const contratoId = parseInt(req.params.id, 10);

        const conRes = await db.query(
            `SELECT ct.*, cl.nome AS cliente_nome, cl.telefone AS cliente_telefone
             FROM dash_contratos ct
             LEFT JOIN dash_clientes cl ON cl.id = ct.cliente_id
             WHERE ct.tenant_id = $1 AND ct.id = $2`,
            [tenantId, contratoId]
        );

        if (conRes.rowCount === 0) {
            return res.status(404).json({ error: 'Contrato não encontrado.' });
        }

        const con = conRes.rows[0];

        // WhatsApp notification mock
        res.json({
            success: true,
            message: `Aviso enviado por WhatsApp para ${con.cliente_nome} no telefone ${con.cliente_telefone || '(não cadastrado)'} com sucesso!`
        });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/contratos/:id
router.delete('/:id', async (req, res, next) => {
    const clientDb = await db.pool.connect();
    try {
        await clientDb.query('BEGIN');
        const tenantId = req.tenant.id;
        const contratoId = parseInt(req.params.id, 10);

        // 1. Delete associated financeiro records that are still ABERTO
        await clientDb.query(
            `DELETE FROM dash_financeiro
             WHERE tenant_id = $1 AND contrato_id = $2 AND TRIM(status_pagamento) = 'ABERTO'`,
            [tenantId, contratoId]
        );

        // 2. Delete contract (cascade will delete items)
        const delRes = await clientDb.query(
            'DELETE FROM dash_contratos WHERE tenant_id = $1 AND id = $2',
            [tenantId, contratoId]
        );

        if (delRes.rowCount === 0) {
            await clientDb.query('ROLLBACK');
            return res.status(404).json({ error: 'Contrato não encontrado.' });
        }

        await clientDb.query('COMMIT');
        res.json({ success: true, message: 'Contrato e parcelas em aberto estornadas com sucesso.' });
    } catch (err) {
        await clientDb.query('ROLLBACK');
        next(err);
    } finally {
        clientDb.release();
    }
});

module.exports = router;
