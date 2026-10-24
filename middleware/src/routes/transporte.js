'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db/postgres');
const logger = require('../config/logger');
const TransporteService = require('../services/transporteService');

// ─────────────────────────────────────────────────────────────
// 1. CARGAS (Notas Fiscais vindas do ERP Coliseu / Firebird)
// ─────────────────────────────────────────────────────────────

router.get('/cargas', async (req, res) => {
    const tenantId = req.tenant.id;
    const { status, search, limit = 50, offset = 0 } = req.query;

    try {
        let sql = `SELECT * FROM dash_cargas WHERE tenant_id = $1`;
        const params = [tenantId];

        if (status) {
            params.push(status.toUpperCase());
            sql += ` AND status = $${params.length}`;
        }

        if (search) {
            params.push(`%${search}%`);
            sql += ` AND (chave_acesso ILIKE $${params.length} OR numero ILIKE $${params.length} OR remetente_nome ILIKE $${params.length} OR destinatario_nome ILIKE $${params.length})`;
        }

        sql += ` ORDER BY data_emissao DESC, id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(parseInt(limit, 10), parseInt(offset, 10));

        const { rows } = await db.query(sql, params);
        const countRes = await db.query(`SELECT COUNT(*)::int as total FROM dash_cargas WHERE tenant_id = $1`, [tenantId]);

        return res.json({
            success: true,
            data: rows,
            total: countRes.rows[0]?.total || 0
        });
    } catch (err) {
        logger.error('[Transporte API] Erro ao listar cargas:', err.message);
        return res.status(500).json({ error: 'Erro ao buscar cargas' });
    }
});

// ─────────────────────────────────────────────────────────────
// 2. CT-e (Conhecimento de Transporte)
// ─────────────────────────────────────────────────────────────

router.get('/ctes', async (req, res) => {
    const tenantId = req.tenant.id;
    const { status, limit = 50, offset = 0 } = req.query;

    try {
        let sql = `SELECT c.*, e.razao_social as emitente_nome
                   FROM dash_ctes c
                   LEFT JOIN dash_emitentes e ON e.id = c.emitente_id
                   WHERE c.tenant_id = $1`;
        const params = [tenantId];

        if (status) {
            params.push(status.toUpperCase());
            sql += ` AND c.status = $${params.length}`;
        }

        sql += ` ORDER BY c.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(parseInt(limit, 10), parseInt(offset, 10));

        const { rows } = await db.query(sql, params);
        return res.json({ success: true, data: rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.post('/ctes', async (req, res) => {
    const tenantId = req.tenant.id;
    const {
        emitente_id,
        cargas_ids = [],
        natureza_operacao,
        tomador,
        uf_inicio, municipio_inicio, codigo_municipio_inicio,
        uf_fim, municipio_fim, codigo_municipio_fim,
        valor_total, peso_bruto, valor_carga
    } = req.body;

    try {
        const ref = TransporteService.gerarRef('CTE', tenantId, Date.now().toString().slice(-6));

        const { rows } = await db.query(
            `INSERT INTO dash_ctes (
                tenant_id, emitente_id, ref, status, natureza_operacao,
                tomador, uf_inicio, municipio_inicio, codigo_municipio_inicio,
                uf_fim, municipio_fim, codigo_municipio_fim,
                valor_total, valor_receber, peso_bruto, valor_carga
             ) VALUES ($1, $2, $3, 'RASCUNHO', $4, $5, $6, $7, $8, $9, $10, $11, $12, $12, $13, $14)
             RETURNING *`,
            [
                tenantId, emitente_id,
                ref, natureza_operacao || 'PRESTACAO DE SERVICO DE TRANSPORTE',
                tomador || '0',
                uf_inicio, municipio_inicio, codigo_municipio_inicio,
                uf_fim, municipio_fim, codigo_municipio_fim,
                parseFloat(valor_total || 0), parseFloat(peso_bruto || 0), parseFloat(valor_carga || 0)
            ]
        );

        const novoCte = rows[0];

        // Vincula as cargas (NF-e) selecionadas
        if (Array.isArray(cargas_ids) && cargas_ids.length > 0) {
            for (const cargaId of cargas_ids) {
                const cargaRes = await db.query(
                    `SELECT chave_acesso, valor_total, peso_bruto FROM dash_cargas WHERE id = $1 AND tenant_id = $2`,
                    [cargaId, tenantId]
                );
                if (cargaRes.rows.length > 0) {
                    const c = cargaRes.rows[0];
                    await db.query(
                        `INSERT INTO dash_cte_cargas (tenant_id, cte_id, carga_id, chave_nfe, valor_nfe, peso_nfe)
                         VALUES ($1, $2, $3, $4, $5, $6)`,
                        [tenantId, novoCte.id, cargaId, c.chave_acesso, c.valor_total, c.peso_bruto]
                    );
                    await db.query(
                        `UPDATE dash_cargas SET status = 'EM_CTE', cte_id = $1 WHERE id = $2`,
                        [novoCte.id, cargaId]
                    );
                }
            }
        }

        return res.status(201).json({ success: true, data: novoCte });
    } catch (err) {
        logger.error('[Transporte API] Erro ao criar CT-e:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

router.post('/ctes/:id/emitir', async (req, res) => {
    const tenantId = req.tenant.id;
    const cteId = req.params.id;

    try {
        const result = await TransporteService.emitirCte(tenantId, cteId);
        return res.json(result);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.post('/ctes/:id/cancelar', async (req, res) => {
    const tenantId = req.tenant.id;
    const cteId = req.params.id;
    const { justificativa } = req.body;

    try {
        const { rows } = await db.query(`SELECT ref, emitente_id FROM dash_ctes WHERE id = $1 AND tenant_id = $2`, [cteId, tenantId]);
        if (rows.length === 0) return res.status(404).json({ error: 'CT-e não encontrado' });

        const { client } = await TransporteService.getFocusClient(tenantId, rows[0].emitente_id);
        const resFocus = await client.cancelarCte(rows[0].ref, justificativa);

        await db.query(`UPDATE dash_ctes SET status = 'CANCELADO', updated_at = NOW() WHERE id = $1`, [cteId]);
        return res.json({ success: true, focus: resFocus });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// 3. MDF-e (Manifesto Eletrônico de Carga)
// ─────────────────────────────────────────────────────────────

router.get('/mdfes', async (req, res) => {
    const tenantId = req.tenant.id;
    try {
        const { rows } = await db.query(
            `SELECT m.*, e.razao_social as emitente_nome
             FROM dash_mdfes m
             LEFT JOIN dash_emitentes e ON e.id = m.emitente_id
             WHERE m.tenant_id = $1
             ORDER BY m.id DESC LIMIT 50`,
            [tenantId]
        );
        return res.json({ success: true, data: rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.post('/mdfes', async (req, res) => {
    const tenantId = req.tenant.id;
    const {
        emitente_id,
        uf_inicio, uf_fim,
        veiculo_id, veiculo_placa,
        motorista_id, motorista_cpf, motorista_nome,
        ctes_ids = [],
        valor_carga, peso_bruto
    } = req.body;

    try {
        const ref = TransporteService.gerarRef('MDFE', tenantId, Date.now().toString().slice(-6));

        const { rows } = await db.query(
            `INSERT INTO dash_mdfes (
                tenant_id, emitente_id, ref, status,
                uf_inicio, uf_fim,
                veiculo_id, veiculo_placa,
                motorista_id, motorista_cpf, motorista_nome,
                qtd_cte, valor_carga, peso_bruto
             ) VALUES ($1, $2, $3, 'RASCUNHO', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             RETURNING *`,
            [
                tenantId, emitente_id, ref,
                uf_inicio, uf_fim,
                veiculo_id || null, veiculo_placa,
                motorista_id || null, motorista_cpf, motorista_nome,
                ctes_ids.length, parseFloat(valor_carga || 0), parseFloat(peso_bruto || 0)
            ]
        );

        const novoMdfe = rows[0];

        // Vincula os CT-es selecionados ao manifesto
        for (const cteId of ctes_ids) {
            const cteRes = await db.query(`SELECT chave_cte FROM dash_ctes WHERE id = $1 AND tenant_id = $2`, [cteId, tenantId]);
            if (cteRes.rows.length > 0 && cteRes.rows[0].chave_cte) {
                await db.query(
                    `INSERT INTO dash_mdfe_documentos (tenant_id, mdfe_id, tipo_documento, chave)
                     VALUES ($1, $2, 'CTE', $3)`,
                    [tenantId, novoMdfe.id, cteRes.rows[0].chave_cte]
                );
            }
        }

        return res.status(201).json({ success: true, data: novoMdfe });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.post('/mdfes/:id/emitir', async (req, res) => {
    const tenantId = req.tenant.id;
    const mdfeId = req.params.id;

    try {
        const result = await TransporteService.emitirMdfe(tenantId, mdfeId);
        return res.json(result);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.post('/mdfes/:id/encerrar', async (req, res) => {
    const tenantId = req.tenant.id;
    const mdfeId = req.params.id;
    const { siglaUf, nomeMunicipio, dataEncerramento } = req.body;

    try {
        const result = await TransporteService.encerrarMdfe(tenantId, mdfeId, { siglaUf, nomeMunicipio, dataEncerramento });
        return res.json(result);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// 4. FROTA (Veículos e Motoristas)
// ─────────────────────────────────────────────────────────────

router.get('/veiculos', async (req, res) => {
    const tenantId = req.tenant.id;
    try {
        const { rows } = await db.query(`SELECT * FROM dash_veiculos WHERE tenant_id = $1 AND ativo = true ORDER BY placa`, [tenantId]);
        return res.json({ success: true, data: rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.get('/motoristas', async (req, res) => {
    const tenantId = req.tenant.id;
    try {
        const { rows } = await db.query(`SELECT * FROM dash_motoristas WHERE tenant_id = $1 AND ativo = true ORDER BY nome`, [tenantId]);
        return res.json({ success: true, data: rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// 5. CONFIGURAÇÕES FISCAIS / EMITENTES
// ─────────────────────────────────────────────────────────────

router.get('/emitentes', async (req, res) => {
    const tenantId = req.tenant.id;
    try {
        const { rows } = await db.query(`SELECT id, cnpj, razao_social, nome_fantasia, rntrc, focus_ambiente, uf, municipio, ativo FROM dash_emitentes WHERE tenant_id = $1`, [tenantId]);
        return res.json({ success: true, data: rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.post('/emitentes', async (req, res) => {
    const tenantId = req.tenant.id;
    const { cnpj, razao_social, nome_fantasia, inscricao_estadual, rntrc, focus_token, focus_ambiente, uf, municipio, codigo_municipio } = req.body;

    try {
        const { rows } = await db.query(
            `INSERT INTO dash_emitentes (
                tenant_id, cnpj, razao_social, nome_fantasia, inscricao_estadual,
                rntrc, focus_token, focus_ambiente, uf, municipio, codigo_municipio
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (tenant_id, cnpj) DO UPDATE SET
                razao_social = EXCLUDED.razao_social,
                nome_fantasia = EXCLUDED.nome_fantasia,
                focus_token = COALESCE(NULLIF(EXCLUDED.focus_token, ''), dash_emitentes.focus_token),
                focus_ambiente = EXCLUDED.focus_ambiente,
                rntrc = EXCLUDED.rntrc
             RETURNING id, cnpj, razao_social, focus_ambiente`,
            [tenantId, cnpj.replace(/\D/g, ''), razao_social, nome_fantasia, inscricao_estadual, rntrc, focus_token, focus_ambiente || 'homologacao', uf, municipio, codigo_municipio]
        );
        return res.json({ success: true, data: rows[0] });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;
