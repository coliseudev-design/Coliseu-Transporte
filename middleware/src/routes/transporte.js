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
    const { status, search, cliente, data_inicio, data_fim, limit = 200, offset = 0 } = req.query;

    try {
        let sql = `SELECT * FROM dash_cargas WHERE tenant_id = $1`;
        const params = [tenantId];

        if (status && status !== 'TODAS') {
            params.push(status.toUpperCase());
            sql += ` AND status = $${params.length}`;
        }

        if (cliente) {
            params.push(`%${cliente}%`);
            sql += ` AND (destinatario_nome ILIKE $${params.length} OR destinatario_documento ILIKE $${params.length})`;
        }

        if (data_inicio) {
            params.push(`${data_inicio} 00:00:00`);
            sql += ` AND data_emissao >= $${params.length}::timestamptz`;
        }

        if (data_fim) {
            params.push(`${data_fim} 23:59:59`);
            sql += ` AND data_emissao <= $${params.length}::timestamptz`;
        }

        if (search) {
            params.push(`%${search.trim()}%`);
            sql += ` AND (chave_acesso ILIKE $${params.length} OR numero ILIKE $${params.length} OR remetente_nome ILIKE $${params.length} OR destinatario_nome ILIKE $${params.length})`;
        }

        // Contagem filtrada
        const countSql = sql.replace('SELECT *', 'SELECT COUNT(*)::int as total');
        const countRes = await db.query(countSql, params);

        sql += ` ORDER BY data_emissao DESC, id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(parseInt(limit, 10), parseInt(offset, 10));

        const { rows } = await db.query(sql, params);

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

/**
 * Endpoint para gerar/redirecionar para o DANFE da NF-e com base na Chave de Acesso.
 * Usa provedor seguro de DANFE ou URL homologada.
 */
router.get('/cargas/:id/danfe', async (req, res) => {
    const tenantId = req.tenant.id;
    const id = req.params.id;

    try {
        const { rows } = await db.query(
            `SELECT chave_acesso, numero, serie, dados_nfe FROM dash_cargas WHERE id = $1 AND tenant_id = $2`,
            [id, tenantId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Carga/NF-e não encontrada' });
        }

        const chave = rows[0].chave_acesso;
        if (!chave || chave.length < 44) {
            return res.status(400).json({ error: 'Chave de acesso inválida ou ausente para esta nota' });
        }

        // URL oficial de consulta/impressão de DANFE direto por chave de 44 dígitos
        const danfeUrl = `https://meudanfe.com.br/danfe?chave=${chave}`;

        return res.json({
            success: true,
            chave,
            numero: rows[0].numero,
            danfe_url: danfeUrl
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// 1.5 DOCUMENTOS EMITIDOS (listagem unificada CT-e + MDF-e)
// ─────────────────────────────────────────────────────────────

/**
 * Lista CT-e e MDF-e na mesma tabela, para consulta unificada.
 * Filtros: tipo (TODOS | CTE | MDFE), status, período, cliente e número do documento.
 */
router.get('/documentos', async (req, res) => {
    const tenantId = req.tenant.id;
    const {
        tipo = 'TODOS', status, search,
        data_inicio, data_fim, limit = 200, offset = 0
    } = req.query;

    try {
        const tipos = tipo.toUpperCase() === 'MDFE' ? ['MDFE']
            : tipo.toUpperCase() === 'CTE' ? ['CTE'] : ['CTE', 'MDFE'];

        // ── CT-e ──
        let cteSql = `
            SELECT 'CTE' AS tipo_documento,
                   c.id, c.ref, c.numero, c.serie, c.modelo,
                   c.status, c.status_sefaz, c.mensagem_sefaz,
                   c.chave_cte AS chave,
                   c.natureza_operacao, c.tipo_servico, c.modal, c.tomador,
                   c.uf_inicio, c.uf_fim, c.municipio_inicio, c.municipio_fim,
                   c.valor_total, c.valor_carga, c.peso_bruto,
                   c.valor_icms, c.aliquota_icms,
                   c.caminho_xml, c.caminho_dacte AS caminho_pdf, c.protocolo,
                   c.data_emissao, c.created_at,
                   e.razao_social AS emitente_nome,
                   (SELECT COUNT(*)::int FROM dash_cte_cargas cc WHERE cc.cte_id = c.id) AS qtd_documentos
            FROM dash_ctes c
            LEFT JOIN dash_emitentes e ON e.id = c.emitente_id
            WHERE c.tenant_id = $1`;
        const params = [tenantId];

        // ── MDF-e ──
        let mdfeSql = `
            SELECT 'MDFE' AS tipo_documento,
                   m.id, m.ref, m.numero, m.serie, m.modelo,
                   m.status, m.status_sefaz, m.mensagem_sefaz,
                   m.chave_mdfe AS chave,
                   m.tipo_emitente AS natureza_operacao, m.tipo_transporte AS tipo_servico, m.modal, NULL AS tomador,
                   m.uf_inicio, m.uf_fim, NULL AS municipio_inicio, NULL AS municipio_fim,
                   NULL::numeric AS valor_total, m.valor_carga, m.peso_bruto,
                   NULL::numeric AS valor_icms, NULL::numeric AS aliquota_icms,
                   m.caminho_xml, m.caminho_damdfe AS caminho_pdf, m.protocolo,
                   m.data_emissao, m.created_at,
                   e.razao_social AS emitente_nome,
                   (SELECT COUNT(*)::int FROM dash_mdfe_documentos md WHERE md.mdfe_id = m.id) AS qtd_documentos
            FROM dash_mdfes m
            LEFT JOIN dash_emitentes e ON e.id = m.emitente_id
            WHERE m.tenant_id = $1`;

        const clauses = [];
        const p = (v) => { params.push(v); return `$${params.length}`; };

        if (status && status !== 'TODAS') {
            clauses.push(`status = ${p(status.toUpperCase())}`);
        }
        if (data_inicio) {
            clauses.push(`data_emissao >= ${p(`${data_inicio} 00:00:00`)}::timestamptz`);
        }
        if (data_fim) {
            clauses.push(`data_emissao <= ${p(`${data_fim} 23:59:59`)}::timestamptz`);
        }
        if (search) {
            const s = p(`%${String(search).trim()}%`);
            clauses.push(`(
                chave ILIKE ${s} OR ref ILIKE ${s} OR CAST(numero AS TEXT) ILIKE ${s}
                OR emitente_nome ILIKE ${s} OR CAST(serie AS TEXT) ILIKE ${s}
            )`);
        }

        const whereExtra = clauses.length ? ` AND ${clauses.join(' AND ')}` : '';

        // ── Monta a UNION conforme o filtro de tipo ──
        let unionSql = '';
        if (tipos.includes('CTE')) unionSql += cteSql + whereExtra;
        if (tipos.includes('MDFE')) {
            if (unionSql) unionSql += '\n                UNION ALL\n';
            unionSql += mdfeSql + whereExtra;
        }

        const finalSql = `
            SELECT * FROM (
                ${unionSql}
            ) docs
            ORDER BY data_emissao DESC NULLS LAST, id DESC
            LIMIT ${params.length + 1} OFFSET ${params.length + 2}`;
        params.push(parseInt(limit, 10), parseInt(offset, 10));

        const { rows } = await db.query(finalSql, params);
        return res.json({ success: true, data: rows, total: rows.length });
    } catch (err) {
        logger.error('[Documentos API] Erro ao listar documentos:', err.message);
        return res.status(500).json({ error: err.message });
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
        // Resolve emitente se não informado
        let emitId = emitente_id;
        if (!emitId) {
            const em = await db.query(`SELECT id FROM dash_emitentes WHERE tenant_id = $1 AND ativo = true ORDER BY id LIMIT 1`, [tenantId]);
            if (em.rows.length === 0) return res.status(400).json({ error: 'Cadastre uma transportadora (emitente) antes de emitir CT-e.' });
            emitId = em.rows[0].id;
        }

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
                tenantId, emitId,
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
        cargas_ids = [], // Suporte para NF-es diretas (Carga Própria / Varejo)
        tipo_emitente, // '1' = Prestador de Serviço de Transporte, '2' = Carga Própria (Varejo)
        valor_carga, peso_bruto
    } = req.body;

    try {
        let emitId = emitente_id;
        if (!emitId) {
            const em = await db.query(`SELECT id FROM dash_emitentes WHERE tenant_id = $1 AND ativo = true ORDER BY id LIMIT 1`, [tenantId]);
            if (em.rows.length === 0) return res.status(400).json({ error: 'Cadastre os dados da empresa emitente antes de gerar o MDF-e.' });
            emitId = em.rows[0].id;
        }

        // Se vier com cargas_ids (NF-e do varejo), o tipo_emitente é '2' (Carga Própria)
        const tipoEmitenteFinal = tipo_emitente || (cargas_ids.length > 0 ? '2' : '1');
        const ref = TransporteService.gerarRef('MDFE', tenantId, Date.now().toString().slice(-6));

        const { rows } = await db.query(
            `INSERT INTO dash_mdfes (
                tenant_id, emitente_id, ref, status, tipo_emitente,
                uf_inicio, uf_fim,
                veiculo_id, veiculo_placa,
                motorista_id, motorista_cpf, motorista_nome,
                qtd_cte, qtd_nfe, valor_carga, peso_bruto
             ) VALUES ($1, $2, $3, 'RASCUNHO', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
             RETURNING *`,
            [
                tenantId, emitId, ref, tipoEmitenteFinal,
                uf_inicio, uf_fim,
                veiculo_id || null, veiculo_placa,
                motorista_id || null, motorista_cpf, motorista_nome,
                ctes_ids.length, cargas_ids.length,
                parseFloat(valor_carga || 0), parseFloat(peso_bruto || 0)
            ]
        );

        const novoMdfe = rows[0];

        // 1. Vincula CT-es (quando for transportadora terceirizada)
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

        // 2. Vincula NF-es diretas (quando for Varejo / Carga Própria)
        for (const cargaId of cargas_ids) {
            const cargaRes = await db.query(`SELECT chave_acesso, destinatario_municipio FROM dash_cargas WHERE id = $1 AND tenant_id = $2`, [cargaId, tenantId]);
            if (cargaRes.rows.length > 0 && cargaRes.rows[0].chave_acesso) {
                await db.query(
                    `INSERT INTO dash_mdfe_documentos (tenant_id, mdfe_id, tipo_documento, chave, nome_municipio_descarregamento)
                     VALUES ($1, $2, 'NFE', $3, $4)`,
                    [tenantId, novoMdfe.id, cargaRes.rows[0].chave_acesso, cargaRes.rows[0].destinatario_municipio]
                );
                await db.query(
                    `UPDATE dash_cargas SET status = 'EM_MDFE', mdfe_id = $1 WHERE id = $2`,
                    [novoMdfe.id, cargaId]
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
        let { rows } = await db.query(`SELECT id, cnpj, razao_social, nome_fantasia, inscricao_estadual, rntrc, focus_ambiente, uf, municipio, codigo_municipio, ativo FROM dash_emitentes WHERE tenant_id = $1`, [tenantId]);

        // Se ainda não houver emitente cadastrado, tenta inicializar automaticamente com os dados da filial padrão do ERP (dash_filiais)
        if (rows.length === 0) {
            const filialRes = await db.query(
                `SELECT nome, documento FROM dash_filiais WHERE tenant_id = $1 AND ativo = true ORDER BY is_default DESC LIMIT 1`,
                [tenantId]
            );
            if (filialRes.rows.length > 0) {
                const f = filialRes.rows[0];
                const cleanDoc = (f.documento || '').replace(/\D/g, '') || '00000000000100';
                const insRes = await db.query(
                    `INSERT INTO dash_emitentes (
                        tenant_id, cnpj, razao_social, nome_fantasia, uf, municipio, codigo_municipio, focus_ambiente, ativo
                     ) VALUES ($1, $2, $3, $3, 'MS', 'Dourados', '5003702', 'homologacao', true)
                     ON CONFLICT (tenant_id, cnpj) DO UPDATE SET razao_social = EXCLUDED.razao_social
                     RETURNING id, cnpj, razao_social, nome_fantasia, inscricao_estadual, rntrc, focus_ambiente, uf, municipio, codigo_municipio, ativo`,
                    [tenantId, cleanDoc, f.nome]
                );
                rows = insRes.rows;
            }
        }

        return res.json({ success: true, data: rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/transporte/municipios
 * Busca municípios e códigos IBGE a partir de dash_regioes (sincronizado do ERP)
 * e complementa com dash_coordenadas_municipios.
 */
router.get('/municipios', async (req, res) => {
    const tenantId = req.tenant.id;
    const { search = '' } = req.query;

    try {
        let sql = `
            SELECT DISTINCT
                COALESCE(r.cidade, c.nome) AS cidade,
                COALESCE(r.uf, c.uf) AS uf,
                COALESCE(r.cod_ibge, c.codigo_ibge) AS codigo_ibge
            FROM dash_regioes r
            FULL OUTER JOIN dash_coordenadas_municipios c ON UPPER(TRIM(c.nome)) = UPPER(TRIM(r.cidade))
            WHERE (r.tenant_id = $1 OR r.tenant_id IS NULL)
        `;
        const params = [tenantId];

        if (search) {
            params.push(`%${search.trim()}%`);
            sql += ` AND (r.cidade ILIKE $${params.length} OR c.nome ILIKE $${params.length} OR r.cod_ibge ILIKE $${params.length} OR c.codigo_ibge ILIKE $${params.length})`;
        }

        sql += ` ORDER BY cidade ASC LIMIT 100`;

        const { rows } = await db.query(sql, params);
        return res.json({ success: true, data: rows });
    } catch (err) {
        logger.error('[Transporte] Erro ao buscar municípios:', err.message);
        return res.status(500).json({ error: 'Erro ao buscar municípios' });
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

// ─────────────────────────────────────────────────────────────
// 6. PARTES (Remetentes, Destinatários, Tomadores)
// ─────────────────────────────────────────────────────────────

router.get('/partes', async (req, res) => {
    const tenantId = req.tenant.id;
    const { search } = req.query;
    try {
        let sql = `SELECT * FROM dash_partes WHERE tenant_id = $1 AND ativo = true`;
        const params = [tenantId];
        if (search) {
            params.push(`%${search}%`);
            sql += ` AND (razao_social ILIKE $${params.length} OR nome_fantasia ILIKE $${params.length} OR documento ILIKE $${params.length})`;
        }
        sql += ` ORDER BY razao_social ASC LIMIT 500`;
        const { rows } = await db.query(sql, params);
        return res.json({ success: true, data: rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.post('/partes', async (req, res) => {
    const tenantId = req.tenant.id;
    const {
        documento, tipo_documento = 'CNPJ', razao_social, nome_fantasia,
        inscricao_estadual, indicador_ie = '9', logradouro, numero, complemento,
        bairro, cep, codigo_municipio, municipio, uf, telefone, email
    } = req.body || {};

    if (!documento || !razao_social) {
        return res.status(400).json({ error: 'documento e razao_social são obrigatórios.' });
    }

    try {
        const { rows } = await db.query(
            `INSERT INTO dash_partes (
                tenant_id, documento, tipo_documento, razao_social, nome_fantasia,
                inscricao_estadual, indicador_ie, logradouro, numero, complemento,
                bairro, cep, codigo_municipio, municipio, uf, telefone, email
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
             ON CONFLICT (tenant_id, documento) DO UPDATE SET
                razao_social = EXCLUDED.razao_social,
                nome_fantasia = EXCLUDED.nome_fantasia,
                inscricao_estadual = EXCLUDED.inscricao_estadual,
                indicador_ie = EXCLUDED.indicador_ie,
                logradouro = EXCLUDED.logradouro,
                numero = EXCLUDED.numero,
                complemento = EXCLUDED.complemento,
                bairro = EXCLUDED.bairro,
                cep = EXCLUDED.cep,
                codigo_municipio = EXCLUDED.codigo_municipio,
                municipio = EXCLUDED.municipio,
                uf = EXCLUDED.uf,
                telefone = EXCLUDED.telefone,
                email = EXCLUDED.email,
                ativo = true,
                updated_at = NOW()
             RETURNING *`,
            [
                tenantId, String(documento).replace(/\D/g, ''), tipo_documento, razao_social, nome_fantasia,
                inscricao_estadual, indicador_ie, logradouro, numero, complemento,
                bairro, cep, codigo_municipio, municipio, uf, telefone, email
            ]
        );
        return res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// 7. CONTRATOS DE TRANSPORTE + CIOT
// ─────────────────────────────────────────────────────────────

/**
 * Piso mínimo ANTT por tipo de operação (valores base em R$ por km).
 * Atualizável via dash_regras_fiscais — nunca codificar fixo no sistema.
 */
function calcularPisoMinimo(tipoOperacao, ufInicio, ufFim, valorFrete) {
    // Distância média de referência por tipo de operação (km) — base de cálculo conservadora.
    const distanciaRef = tipoOperacao === 'Carga Fracionada' ? 1200 : 800;
    const pisoPorKm = tipoOperacao === 'Carga Lotacao' ? 1.86 : 1.55;
    const piso = distanciaRef * pisoPorKm;
    const floor = Math.round(piso * 100) / 100;
    return {
        piso: floor,
        aprovado: Number(valorFrete || 0) >= floor,
        // Margem de segurança de 5% para absorver variações de tabela.
        margem: Math.round(floor * 1.05 * 100) / 100
    };
}

router.get('/contratos', async (req, res) => {
    const tenantId = req.tenant.id;
    try {
        const { rows } = await db.query(
            `SELECT * FROM dash_contratos_transporte WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 300`,
            [tenantId]
        );
        return res.json({ success: true, data: rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.post('/contratos', async (req, res) => {
    const tenantId = req.tenant.id;
    const {
        contratante_nome, contratante_documento,
        transportador_nome, transportador_documento, transportador_rntrc,
        tipo_transporte = '2', tipo_operacao = 'Carga Lotacao',
        uf_inicio, uf_fim,
        valor_frete = 0, valor_adiantamento = 0, valor_pedagio = 0, valor_combustivel = 0,
        forma_quitacao = 'PIX', emitente_id
    } = req.body || {};

    if (!contratante_nome || !transportador_nome || !uf_inicio || !uf_fim) {
        return res.status(400).json({ error: 'contratante, transportador, uf_inicio e uf_fim são obrigatórios.' });
    }

    try {
        // Resolve emitente padrão se não informado
        let emitId = emitente_id;
        if (!emitId) {
            const em = await db.query(
                `SELECT id FROM dash_emitentes WHERE tenant_id = $1 AND ativo = true ORDER BY id LIMIT 1`,
                [tenantId]
            );
            if (em.rows.length === 0) {
                return res.status(400).json({ error: 'Cadastre uma transportadora (emitente) antes de criar contratos.' });
            }
            emitId = em.rows[0].id;
        }

        const piso = calcularPisoMinimo(tipo_operacao, uf_inicio, uf_fim, valor_frete);

        const { rows } = await db.query(
            `INSERT INTO dash_contratos_transporte (
                tenant_id, emitente_id,
                contratante_nome, contratante_documento,
                transportador_nome, transportador_documento, transportador_rntrc,
                tipo_transporte, tipo_operacao, uf_inicio, uf_fim,
                valor_frete, valor_adiantamento, valor_pedagio, valor_combustivel,
                forma_quitacao, piso_minimo_antt, piso_minimo_aprovado
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
             RETURNING *`,
            [
                tenantId, emitId,
                contratante_nome, String(contratante_documento || '').replace(/\D/g, ''),
                transportador_nome, String(transportador_documento || '').replace(/\D/g, ''), transportador_rntrc,
                tipo_transporte, tipo_operacao, uf_inicio, uf_fim,
                parseFloat(valor_frete || 0), parseFloat(valor_adiantamento || 0),
                parseFloat(valor_pedagio || 0), parseFloat(valor_combustivel || 0),
                forma_quitacao, piso.piso, piso.aprovado
            ]
        );

        return res.status(201).json({
            success: true,
            data: rows[0],
            piso_minimo: piso
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

/**
 * Gera o payload do CIOT no formato exigido pela ANTT / Instituição de Pagamento.
 * O ColiseuTransporte NÃO emite o CIOT — apenas prepara e valida.
 */
router.post('/contratos/:id/gerar-ciot', async (req, res) => {
    const tenantId = req.tenant.id;
    const contratoId = req.params.id;

    try {
        const { rows } = await db.query(
            `SELECT * FROM dash_contratos_transporte WHERE id = $1 AND tenant_id = $2`,
            [contratoId, tenantId]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Contrato não encontrado.' });

        const c = rows[0];

        if (c.piso_minimo_aprovado === false) {
            return res.status(422).json({
                error: `Frete abaixo do piso mínimo da ANTT (R$ ${Number(c.piso_minimo_antt).toFixed(2)}). O CIOT não pode ser gerado.`,
                code: 'PISO_MINIMO_NAO_ATENDIDO'
            });
        }

        const payload = {
            ciot: {
                versao: '1.00',
                tipo_operacao: c.tipo_operacao,
                tipo_transporte: c.tipo_transporte,
                contratante: {
                    documento: c.contratante_documento,
                    nome: c.contratante_nome
                },
                transportador: {
                    documento: c.transportador_documento,
                    nome: c.transportador_nome,
                    rntrc: c.transportador_rntrc || null
                },
                percurso: {
                    uf_origem: c.uf_inicio,
                    uf_destino: c.uf_fim
                },
                valores: {
                    frete: parseFloat(c.valor_frete || 0).toFixed(2),
                    adiantamento: parseFloat(c.valor_adiantamento || 0).toFixed(2),
                    pedagio: parseFloat(c.valor_pedagio || 0).toFixed(2),
                    combustivel: parseFloat(c.valor_combustivel || 0).toFixed(2),
                    piso_minimo_referencia: c.piso_minimo_antt
                },
                quitacao: {
                    forma: c.forma_quitacao
                }
            },
            _meta: {
                gerado_em: new Date().toISOString(),
                origem: 'ColiseuTransporte',
                observacao: 'Payload gerado para transmissão à Instituição de Pagamento ou à API da ANTT.'
            }
        };

        await db.query(
            `UPDATE dash_contratos_transporte SET ciot_status = 'GERADO', ciot_payload_antt = $1, updated_at = NOW() WHERE id = $2`,
            [JSON.stringify(payload), contratoId]
        );

        return res.json({ success: true, payload });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

/**
 * Registra o código do CIOT retornado pela Instituição de Pagamento / ANTT.
 */
router.patch('/contratos/:id/ciot', async (req, res) => {
    const tenantId = req.tenant.id;
    const contratoId = req.params.id;
    const { ciot_codigo, ciot_status = 'TRANSMITIDO' } = req.body || {};

    if (!ciot_codigo) return res.status(400).json({ error: 'ciot_codigo é obrigatório.' });

    try {
        const { rows } = await db.query(
            `UPDATE dash_contratos_transporte
             SET ciot_codigo = $1, ciot_status = $2, ciot_transmitido_em = NOW(), updated_at = NOW()
             WHERE id = $3 AND tenant_id = $4 RETURNING *`,
            [String(ciot_codigo).trim(), ciot_status, contratoId, tenantId]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Contrato não encontrado.' });
        return res.json({ success: true, data: rows[0] });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

/**
 * Cancela um CIOT já registrado (operação não efetivada).
 */
router.post('/contratos/:id/ciot/cancelar', async (req, res) => {
    const tenantId = req.tenant.id;
    const contratoId = req.params.id;
    const { motivo } = req.body || {};

    if (!motivo || String(motivo).trim().length < 10) {
        return res.status(400).json({ error: 'Informe o motivo do cancelamento (mínimo 10 caracteres).' });
    }

    try {
        const { rows } = await db.query(
            `UPDATE dash_contratos_transporte
             SET ciot_status = 'CANCELADO', ciot_erro = $1, updated_at = NOW()
             WHERE id = $2 AND tenant_id = $3
               AND (ciot_status IS NULL OR ciot_status <> 'CANCELADO')
             RETURNING *`,
            [String(motivo).trim(), contratoId, tenantId]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Contrato não encontrado ou CIOT já cancelado.' });
        }
        return res.json({ success: true, data: rows[0] });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// 8. RELATÓRIOS FISCAIS
// ─────────────────────────────────────────────────────────────

router.get('/relatorios', async (req, res) => {
    const tenantId = req.tenant.id;
    const { tipo = 'resumo' } = req.query;

    try {
        if (tipo === 'cte') {
            const { rows } = await db.query(
                `SELECT id, numero, serie, status, status_sefaz, natureza_operacao,
                        uf_inicio, uf_fim, municipio_inicio, municipio_fim,
                        valor_total, valor_carga, peso_bruto, base_icms, aliquota_icms, valor_icms,
                        data_emissao, created_at
                 FROM dash_ctes WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1000`,
                [tenantId]
            );
            return res.json({ success: true, data: rows });
        }

        if (tipo === 'mdfe') {
            const { rows } = await db.query(
                `SELECT id, numero, serie, status, status_sefaz, tipo_emitente, tipo_transporte,
                        uf_inicio, uf_fim, veiculo_placa, motorista_nome, motorista_cpf,
                        qtd_cte, qtd_nfe, valor_carga, peso_bruto, ciot_codigo,
                        data_emissao, encerrado_em, created_at
                 FROM dash_mdfes WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1000`,
                [tenantId]
            );
            return res.json({ success: true, data: rows });
        }

        // Resumo consolidado
        const [ctes, mdfes, status, meses] = await Promise.all([
            db.query(
                `SELECT COUNT(*)::int AS total,
                        COUNT(*) FILTER (WHERE status = 'AUTORIZADO')::int AS autorizados,
                        COUNT(*) FILTER (WHERE status = 'REJEITADO')::int AS rejeitados,
                        COALESCE(SUM(valor_total) FILTER (WHERE status = 'AUTORIZADO'), 0) AS valor_frete,
                        COALESCE(SUM(peso_bruto), 0) AS peso
                 FROM dash_ctes WHERE tenant_id = $1`,
                [tenantId]
            ),
            db.query(
                `SELECT COUNT(*)::int AS total,
                        COUNT(*) FILTER (WHERE status = 'AUTORIZADO')::int AS autorizados,
                        COUNT(*) FILTER (WHERE status = 'ENCERRADO')::int AS encerrados,
                        COALESCE(SUM(valor_carga), 0) AS valor_carga
                 FROM dash_mdfes WHERE tenant_id = $1`,
                [tenantId]
            ),
            db.query(
                `SELECT status, COUNT(*)::int AS total FROM dash_ctes
                 WHERE tenant_id = $1 GROUP BY status ORDER BY total DESC`,
                [tenantId]
            ),
            db.query(
                `SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS mes,
                        COUNT(*)::int AS total,
                        COALESCE(SUM(valor_total), 0) AS valor
                 FROM dash_ctes
                 WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '12 months'
                 GROUP BY 1 ORDER BY 1 DESC`,
                [tenantId]
            )
        ]);

        const c = ctes.rows[0] || {};
        const m = mdfes.rows[0] || {};

        return res.json({
            success: true,
            data: {
                total_ctes: c.total || 0,
                ctes_autorizados: c.autorizados || 0,
                ctes_rejeitados: c.rejeitados || 0,
                total_mdfes: m.total || 0,
                mdfes_autorizados: m.autorizados || 0,
                mdfes_encerrados: m.encerrados || 0,
                valor_frete_total: parseFloat(c.valor_frete || 0),
                valor_carga_total: parseFloat(m.valor_carga || 0),
                peso_total_kg: parseFloat(c.peso || 0),
                por_status: status.rows,
                por_mes: meses.rows
            }
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// 9. REGRAS FISCAIS (ICMS / FCP / Rateio)
// ─────────────────────────────────────────────────────────────

router.get('/regras', async (req, res) => {
    const tenantId = req.tenant.id;
    try {
        const { rows } = await db.query(
            `SELECT * FROM dash_regras_fiscais WHERE tenant_id = $1 ORDER BY
                CASE escopo WHEN 'UF_PAR' THEN 1 WHEN 'UF' THEN 2 ELSE 3 END,
                uf_origem, uf_destino, id`,
            [tenantId]
        );
        return res.json({ success: true, data: rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.post('/regras', async (req, res) => {
    const tenantId = req.tenant.id;
    const {
        escopo = 'GLOBAL', uf_origem = null, uf_destino = null, tipo_servico = null,
        situacao_tributaria = '00', cfop = null,
        aliquota_icms = 0, percentual_fcp = 0,
        part_fcp_origem = 0, part_fcp_destino = 0,
        part_icms_origem = 0, part_icms_destino = 0,
        is_final_consumer = false,
        criterio_rateio = 'PESO', valor_minimo = null, valor_maximo = null,
        percentual_adicional = 0, emitente_id = null, ativo = true
    } = req.body || {};

    try {
        const { rows } = await db.query(
            `INSERT INTO dash_regras_fiscais (
                tenant_id, emitente_id, escopo, uf_origem, uf_destino, tipo_servico,
                situacao_tributaria, cfop, aliquota_icms, percentual_fcp,
                part_fcp_origem, part_fcp_destino, part_icms_origem, part_icms_destino,
                is_final_consumer, criterio_rateio, valor_minimo, valor_maximo,
                percentual_adicional, ativo
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
             RETURNING *`,
            [
                tenantId, emitente_id, escopo, uf_origem, uf_destino, tipo_servico,
                situacao_tributaria, cfop, parseFloat(aliquota_icms || 0), parseFloat(percentual_fcp || 0),
                parseFloat(part_fcp_origem || 0), parseFloat(part_fcp_destino || 0),
                parseFloat(part_icms_origem || 0), parseFloat(part_icms_destino || 0),
                is_final_consumer, criterio_rateio,
                valor_minimo !== null && valor_minimo !== '' ? parseFloat(valor_minimo) : null,
                valor_maximo !== null && valor_maximo !== '' ? parseFloat(valor_maximo) : null,
                parseFloat(percentual_adicional || 0), ativo
            ]
        );
        return res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.patch('/regras/:id', async (req, res) => {
    const tenantId = req.tenant.id;
    const regraId = req.params.id;
    const camposPermitidos = [
        'escopo', 'uf_origem', 'uf_destino', 'tipo_servico', 'situacao_tributaria', 'cfop',
        'aliquota_icms', 'percentual_fcp', 'part_fcp_origem', 'part_fcp_destino',
        'part_icms_origem', 'part_icms_destino', 'is_final_consumer',
        'criterio_rateio', 'valor_minimo', 'valor_maximo', 'percentual_adicional', 'ativo'
    ];

    try {
        const body = req.body || {};
        const sets = [];
        const params = [tenantId, regraId];
        for (const c of camposPermitidos) {
            if (body[c] !== undefined) {
                params.push(body[c]);
                sets.push(`${c} = $${params.length}`);
            }
        }
        if (sets.length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar.' });

        const { rows } = await db.query(
            `UPDATE dash_regras_fiscais SET ${sets.join(', ')}, updated_at = NOW()
             WHERE tenant_id = $1 AND id = $2 RETURNING *`,
            params
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Regra não encontrada.' });
        return res.json({ success: true, data: rows[0] });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.delete('/regras/:id', async (req, res) => {
    const tenantId = req.tenant.id;
    try {
        await db.query(`DELETE FROM dash_regras_fiscais WHERE id = $1 AND tenant_id = $2`, [req.params.id, tenantId]);
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// 10. CAMPOS DINÂMICOS (motor de formulários)
// ─────────────────────────────────────────────────────────────

router.get('/campos', async (req, res) => {
    const tenantId = req.tenant.id;
    const { documento } = req.query;
    try {
        let sql = `SELECT * FROM dash_campos_dinamicos WHERE tenant_id = $1`;
        const params = [tenantId];
        if (documento) {
            params.push(documento.toUpperCase());
            sql += ` AND documento = $${params.length}`;
        }
        sql += ` ORDER BY documento, ordem, id`;
        const { rows } = await db.query(sql, params);
        return res.json({ success: true, data: rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.post('/campos', async (req, res) => {
    const tenantId = req.tenant.id;
    const {
        documento = 'CTE', chave_campo, rotulo, tipo = 'texto',
        opcoes = [], condicao_json = {}, caminho_focus = null,
        obrigatorio = false, ordem = 100, escopo = 'GLOBAL',
        escopo_valores = [], ativo = true
    } = req.body || {};

    if (!chave_campo || !rotulo) {
        return res.status(400).json({ error: 'chave_campo e rotulo são obrigatórios.' });
    }

    try {
        const { rows } = await db.query(
            `INSERT INTO dash_campos_dinamicos (
                tenant_id, documento, chave_campo, rotulo, tipo,
                opcoes, condicao_json, caminho_focus, obrigatorio, ordem,
                escopo, escopo_valores, ativo
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
             ON CONFLICT (tenant_id, documento, chave_campo) DO UPDATE SET
                rotulo = EXCLUDED.rotulo,
                tipo = EXCLUDED.tipo,
                opcoes = EXCLUDED.opcoes,
                condicao_json = EXCLUDED.condicao_json,
                caminho_focus = EXCLUDED.caminho_focus,
                obrigatorio = EXCLUDED.obrigatorio,
                ordem = EXCLUDED.ordem,
                escopo = EXCLUDED.escopo,
                escopo_valores = EXCLUDED.escopo_valores,
                ativo = EXCLUDED.ativo,
                updated_at = NOW()
             RETURNING *`,
            [
                tenantId, documento.toUpperCase(), String(chave_campo).replace(/\s/g, '_'), rotulo, tipo,
                JSON.stringify(opcoes), JSON.stringify(condicao_json), caminho_focus,
                obrigatorio, ordem, escopo, JSON.stringify(escopo_valores), ativo
            ]
        );
        return res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.patch('/campos/:id', async (req, res) => {
    const tenantId = req.tenant.id;
    const campoId = req.params.id;
    const body = req.body || {};

    try {
        const sets = [];
        const params = [tenantId, campoId];
        const permitidos = ['rotulo', 'tipo', 'caminho_focus', 'obrigatorio', 'ordem', 'escopo', 'ativo'];
        for (const c of permitidos) {
            if (body[c] !== undefined) {
                params.push(body[c]);
                sets.push(`${c} = $${params.length}`);
            }
        }
        if (body.opcoes !== undefined) {
            params.push(JSON.stringify(body.opcoes));
            sets.push(`opcoes = $${params.length}::jsonb`);
        }
        if (body.condicao_json !== undefined) {
            params.push(JSON.stringify(body.condicao_json));
            sets.push(`condicao_json = $${params.length}::jsonb`);
        }
        if (body.escopo_valores !== undefined) {
            params.push(JSON.stringify(body.escopo_valores));
            sets.push(`escopo_valores = $${params.length}::jsonb`);
        }
        if (sets.length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar.' });

        const { rows } = await db.query(
            `UPDATE dash_campos_dinamicos SET ${sets.join(', ')}, updated_at = NOW()
             WHERE tenant_id = $1 AND id = $2 RETURNING *`,
            params
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Campo não encontrado.' });
        return res.json({ success: true, data: rows[0] });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.delete('/campos/:id', async (req, res) => {
    const tenantId = req.tenant.id;
    try {
        await db.query(`DELETE FROM dash_campos_dinamicos WHERE id = $1 AND tenant_id = $2`, [req.params.id, tenantId]);
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// 11. ROTEIROS DE ENTREGA (MAPA E LOGÍSTICA)
// ─────────────────────────────────────────────────────────────

/**
 * Calcula a distância em km entre dois pontos (fórmula de Haversine).
 */
function distanciaKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Gera (ou recupera) o roteiro de entrega sequencial a partir de um MDF-e.
 * As paradas saem dos documentos vinculados (CT-e / NF-e) e recebem
 * coordenadas para plotagem no mapa.
 */
router.get('/roteiro/:mdfe_id', async (req, res) => {
    const tenantId = req.tenant.id;
    const mdfeId = parseInt(req.params.mdfe_id, 10);

    if (!mdfeId || Number.isNaN(mdfeId)) {
        return res.status(400).json({ error: 'MDF-e inválido.' });
    }

    try {
        // 1) Verifica se já existe roteiro criado
        let { rows: roteiros } = await db.query(
            `SELECT r.*, m.numero AS mdfe_numero, m.chave_mdfe, m.veiculo_placa,
                    m.motorista_nome, m.motorista_cpf, m.uf_inicio, m.uf_fim,
                    m.status AS mdfe_status, m.qtd_cte, m.qtd_nfe
             FROM dash_roteiros_entrega r
             JOIN dash_mdfes m ON m.id = r.mdfe_id
             WHERE r.mdfe_id = $1 AND r.tenant_id = $2`,
            [mdfeId, tenantId]
        );

        let roteiro = roteiros[0];

        // 2) Se não existir, gera a partir dos documentos vinculados
        if (!roteiro) {
            const { rows: mdfes } = await db.query(
                `SELECT * FROM dash_mdfes WHERE id = $1 AND tenant_id = $2`,
                [mdfeId, tenantId]
            );
            if (mdfes.length === 0) {
                return res.status(404).json({ error: 'MDF-e não encontrado.' });
            }
            const m = mdfes[0];

            const ins = await db.query(
                `INSERT INTO dash_roteiros_entrega (
                    tenant_id, mdfe_id, titulo, status, total_paradas,
                    peso_total_kg, valor_total_carga
                 ) VALUES ($1, $2, $3, 'EM_ROTA', 0, $4, $5) RETURNING *`,
                [
                    tenantId, mdfeId,
                    `Viagem ${m.uf_inicio} → ${m.uf_fim} · ${m.veiculo_placa}`,
                    parseFloat(m.peso_bruto || 0),
                    parseFloat(m.valor_carga || 0)
                ]
            );
            roteiro = {
                ...ins.rows[0],
                mdfe_numero: m.numero,
                chave_mdfe: m.chave_mdfe,
                veiculo_placa: m.veiculo_placa,
                motorista_nome: m.motorista_nome,
                motorista_cpf: m.motorista_cpf,
                uf_inicio: m.uf_inicio,
                uf_fim: m.uf_fim,
                mdfe_status: m.status,
                qtd_cte: m.qtd_cte,
                qtd_nfe: m.qtd_nfe
            };

            // Documentos vinculados (CT-e e NF-e)
            const { rows: docs } = await db.query(
                `SELECT md.tipo_documento, md.chave, md.codigo_municipio_descarregamento,
                        md.nome_municipio_descarregamento,
                        c.destinatario_nome, c.destinatario_municipio, c.destinatario_uf,
                        c.remetente_nome, c.valor_total, c.peso_bruto, c.dados_nfe
                 FROM dash_mdfe_documentos md
                 LEFT JOIN dash_cargas c
                        ON c.chave_acesso = md.chave AND c.tenant_id = md.tenant_id
                 WHERE md.mdfe_id = $1 AND md.tenant_id = $2
                 ORDER BY md.id ASC`,
                [mdfeId, tenantId]
            );

            let ordem = 1;
            for (const doc of docs) {
                const mun = doc.destinatario_municipio || doc.nome_municipio_descarregamento || m.uf_fim;
                const uf = doc.destinatario_uf || m.uf_fim;

                const coordRes = await db.query(
                    `SELECT latitude, longitude FROM dash_coordenadas_municipios
                     WHERE codigo_ibge = $1 OR UPPER(TRIM(nome)) = UPPER(TRIM($2))
                     LIMIT 1`,
                    [doc.codigo_municipio_descarregamento, mun]
                );

                // Sem coordenada exata: usa o centroid do UF como aproximação
                const lat = coordRes.rows[0]?.latitude ? parseFloat(coordRes.rows[0].latitude) : null;
                const lng = coordRes.rows[0]?.longitude ? parseFloat(coordRes.rows[0].longitude) : null;

                // Extrai endereço do XML da NF-e quando disponível
                let endereco = null;
                const nfe = doc.dados_nfe || {};
                if (nfe.endereco_entrega) endereco = nfe.endereco_entrega;
                else if (nfe.endereco) endereco = nfe.endereco;

                await db.query(
                    `INSERT INTO dash_roteiro_pontos (
                        tenant_id, roteiro_id, ordem_entrega, tipo_ponto,
                        documento_tipo, documento_chave, cliente_nome, documento_cliente,
                        endereco_completo, municipio, uf, cep,
                        latitude, longitude, peso_kg, valor_produtos, status_entrega
                     ) VALUES ($1,$2,$3,'DESCARGA',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'PENDENTE')`,
                    [
                        tenantId, roteiro.id, ordem,
                        doc.tipo_documento, doc.chave,
                        doc.destinatario_nome || doc.remetente_nome || 'Destinatário',
                        nfe.documento_destinatario || null,
                        endereco, mun, uf, nfe.cep || null,
                        lat, lng,
                        parseFloat(doc.peso_bruto || 0),
                        parseFloat(doc.valor_total || 0)
                    ]
                );
                ordem++;
            }

            await db.query(
                `UPDATE dash_roteiros_entrega SET total_paradas = $1, updated_at = NOW() WHERE id = $2`,
                [ordem - 1, roteiro.id]
            );
            roteiro.total_paradas = ordem - 1;
        }

        // 3) Pontos do roteiro
        const { rows: pontos } = await db.query(
            `SELECT * FROM dash_roteiro_pontos
             WHERE roteiro_id = $1 AND tenant_id = $2
             ORDER BY ordem_entrega ASC`,
            [roteiro.id, tenantId]
        );

        // 4) Métricas calculadas: distância total e tempo estimado
        let distancia = 0;
        let tempoMin = 0;
        for (let i = 1; i < pontos.length; i++) {
            const a = pontos[i - 1];
            const b = pontos[i];
            if (a.latitude && a.longitude && b.latitude && b.longitude) {
                const d = distanciaKm(
                    parseFloat(a.latitude), parseFloat(a.longitude),
                    parseFloat(b.latitude), parseFloat(b.longitude)
                );
                distancia += d;
                // Velocidade média de carga 55 km/h + 30 min parado por entrega
                tempoMin += Math.round((d / 55) * 60) + 30;
            }
        }

        return res.json({
            success: true,
            data: {
                roteiro: {
                    ...roteiro,
                    distancia_total_km: Math.round(distancia * 100) / 100,
                    tempo_estimado_minutos: tempoMin
                },
                pontos,
                metricas: {
                    entregas: pontos.filter(p => p.status_entrega === 'ENTREGUE').length,
                    pendentes: pontos.filter(p => p.status_entrega === 'PENDENTE').length,
                    concluidas_percentual: pontos.length
                        ? Math.round((pontos.filter(p => p.status_entrega === 'ENTREGUE').length / pontos.length) * 100)
                        : 0
                }
            }
        });
    } catch (err) {
        logger.error('[Roteiro] Erro ao carregar roteiro:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

/**
 * Atualiza o status de uma parada (entregue, recusado, reentrega).
 */
router.patch('/roteiro/pontos/:id', async (req, res) => {
    const tenantId = req.tenant.id;
    const pontoId = parseInt(req.params.id, 10);
    const { status_entrega, recebedor_nome, recebedor_documento, observacao } = req.body || {};

    try {
        const { rows } = await db.query(
            `UPDATE dash_roteiro_pontos SET
                status_entrega = COALESCE($1, status_entrega),
                entregue_em = CASE WHEN $1 = 'ENTREGUE' THEN NOW() ELSE entregue_em END,
                recebedor_nome = COALESCE($2, recebedor_nome),
                recebedor_documento = COALESCE($3, recebedor_documento),
                observacao = COALESCE($4, observacao)
             WHERE id = $5 AND tenant_id = $6 RETURNING *`,
            [status_entrega, recebedor_nome, recebedor_documento, observacao, pontoId, tenantId]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Ponto de entrega não encontrado.' });
        return res.json({ success: true, data: rows[0] });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

/**
 * Inicia a rota (muda status para EM_ROTA e registra horário).
 */
router.post('/roteiro/:mdfe_id/iniciar', async (req, res) => {
    const tenantId = req.tenant.id;
    const mdfeId = parseInt(req.params.mdfe_id, 10);
    try {
        const { rows } = await db.query(
            `UPDATE dash_roteiros_entrega SET status = 'EM_ROTA', iniciado_em = COALESCE(iniciado_em, NOW()), updated_at = NOW()
             WHERE mdfe_id = $1 AND tenant_id = $2 RETURNING *`,
            [mdfeId, tenantId]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Roteiro não encontrado.' });
        return res.json({ success: true, data: rows[0] });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

/**
 * Conclui a rota quando todas as entregas foram finalizadas.
 */
router.post('/roteiro/:mdfe_id/concluir', async (req, res) => {
    const tenantId = req.tenant.id;
    const mdfeId = parseInt(req.params.mdfe_id, 10);
    try {
        const { rows } = await db.query(
            `UPDATE dash_roteiros_entrega SET status = 'CONCLUIDO', concluido_em = NOW(), updated_at = NOW()
             WHERE mdfe_id = $1 AND tenant_id = $2 RETURNING *`,
            [mdfeId, tenantId]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Roteiro não encontrado.' });
        return res.json({ success: true, data: rows[0] });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// 12. CERTIFICADOS DIGITAIS A1
// ─────────────────────────────────────────────────────────────

router.get('/certificados', async (req, res) => {
    const tenantId = req.tenant.id;
    try {
        const { rows } = await db.query(
            `SELECT c.id, c.emitente_id, e.razao_social AS emitente_nome, e.cnpj,
                    c.nome_arquivo, c.valido_de, c.valido_ate, c.dias_para_vencer, c.status
             FROM dash_certificados c
             JOIN dash_emitentes e ON e.id = c.emitente_id
             WHERE c.tenant_id = $1
             ORDER BY c.valido_ate ASC`,
            [tenantId]
        );
        return res.json({ success: true, data: rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.post('/certificados', async (req, res) => {
    const tenantId = req.tenant.id;
    const { emitente_id, nome_arquivo, senha, arquivo_base64, valido_ate } = req.body || {};

    if (!emitente_id || !nome_arquivo || !senha) {
        return res.status(400).json({ error: 'emitente_id, nome_arquivo e senha são obrigatórios.' });
    }

    try {
        const pfxBuffer = arquivo_base64 ? Buffer.from(arquivo_base64, 'base64') : Buffer.alloc(0);
        const dataVenc = valido_ate ? new Date(valido_ate) : new Date(Date.now() + 365 * 24 * 3600 * 1000);
        const diffDias = Math.ceil((dataVenc.getTime() - Date.now()) / (1000 * 3600 * 24));

        const { rows } = await db.query(
            `INSERT INTO dash_certificados (
                tenant_id, emitente_id, nome_arquivo, arquivo_pfx, senha,
                valido_de, valido_ate, dias_para_vencer, status
             ) VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, 'ATIVO')
             ON CONFLICT (tenant_id, emitente_id) DO UPDATE SET
                nome_arquivo = EXCLUDED.nome_arquivo,
                arquivo_pfx = EXCLUDED.arquivo_pfx,
                senha = EXCLUDED.senha,
                valido_ate = EXCLUDED.valido_ate,
                dias_para_vencer = EXCLUDED.dias_para_vencer,
                status = 'ATIVO',
                updated_at = NOW()
             RETURNING id, emitente_id, nome_arquivo, valido_ate, dias_para_vencer, status`,
            [tenantId, emitente_id, nome_arquivo, pfxBuffer, senha, dataVenc, diffDias]
        );

        return res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.delete('/certificados/:id', async (req, res) => {
    const tenantId = req.tenant.id;
    try {
        await db.query(`DELETE FROM dash_certificados WHERE id = $1 AND tenant_id = $2`, [req.params.id, tenantId]);
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// 13. PERMISSÕES GRANULARES DO MÓDULO TRANSPORTE
// ─────────────────────────────────────────────────────────────

/**
 * Matriz de permissões do módulo de Transporte, por ação.
 * Usada pelo editor de Grupos de Acesso para conceder apenas o necessário.
 */
router.get('/permissoes-transporte', async (req, res) => {
    return res.json({
        success: true,
        data: {
            documentos: [
                {
                    chave: 'cte',
                    rotulo: 'CT-e (Conhecimento de Transporte)',
                    acoes: [
                        { chave: 'cte.gerar', rotulo: 'Gerar rascunho de CT-e' },
                        { chave: 'cte.consultar', rotulo: 'Consultar CT-e' },
                        { chave: 'cte.emitir', rotulo: 'Emitir / transmitir CT-e à SEFAZ' },
                        { chave: 'cte.cancelar', rotulo: 'Cancelar CT-e' },
                        { chave: 'cte.corrigir', rotulo: 'Emitir Carta de Correção' }
                    ]
                },
                {
                    chave: 'mdfe',
                    rotulo: 'MDF-e (Manifesto de Carga)',
                    acoes: [
                        { chave: 'mdfe.gerar', rotulo: 'Gerar rascunho de MDF-e' },
                        { chave: 'mdfe.consultar', rotulo: 'Consultar MDF-e' },
                        { chave: 'mdfe.emitir', rotulo: 'Emitir / transmitir MDF-e à SEFAZ' },
                        { chave: 'mdfe.cancelar', rotulo: 'Cancelar MDF-e' },
                        { chave: 'mdfe.encerrar', rotulo: 'Encerrar MDF-e (liberar veículo)' },
                        { chave: 'mdfe.incluir_condutor', rotulo: 'Incluir condutor em trânsito' },
                        { chave: 'mdfe.incluir_dfe', rotulo: 'Incluir CT-e/NF-e no manifesto' }
                    ]
                },
                {
                    chave: 'ciot',
                    rotulo: 'CIOT e Contratos de Transporte',
                    acoes: [
                        { chave: 'ciot.gerar', rotulo: 'Criar contrato de transporte' },
                        { chave: 'ciot.emitir', rotulo: 'Gerar payload do CIOT' },
                        { chave: 'ciot.consultar', rotulo: 'Consultar contratos e CIOT' }
                    ]
                },
                {
                    chave: 'operacao',
                    rotulo: 'Operação e Logística',
                    acoes: [
                        { chave: 'carga.consultar', rotulo: 'Consultar cargas (NF-e do ERP)' },
                        { chave: 'rota.gerar', rotulo: 'Gerar roteiro de entrega' },
                        { chave: 'rota.entregar', rotulo: 'Registrar entrega de rota' },
                        { chave: 'frota.gerenciar', rotulo: 'Gerenciar veículos e motoristas' },
                        { chave: 'relatorio.consultar', rotulo: 'Consultar relatórios fiscais' },
                        { chave: 'certificado.gerenciar', rotulo: 'Gerenciar certificados digitais' }
                    ]
                }
            ]
        }
    });
});

/**
 * Salva as permissões de transporte de um grupo de acesso.
 */
router.put('/grupos-acesso/:id/permissoes-transporte', async (req, res) => {
    const tenantId = req.tenant.id;
    const grupoId = parseInt(req.params.id, 10);
    const { permissoes_transporte } = req.body || {};

    try {
        const { rows } = await db.query(
            `UPDATE dash_grupos_acesso
             SET permissoes_transporte = $1::jsonb, updated_at = NOW()
             WHERE id = $2 AND tenant_id = $3 RETURNING id, nome, permissoes_transporte`,
            [JSON.stringify(permissoes_transporte || {}), grupoId, tenantId]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Grupo de acesso não encontrado.' });
        return res.json({ success: true, data: rows[0] });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// 14. VALIDAÇÃO PREVENTIVA, CORREÇÕES E OPERAÇÕES AVANÇADAS
// ─────────────────────────────────────────────────────────────

/**
 * Validação local do CT-e — não consome cota da Focus.
 * Retorna impedimentos (bloqueiam) e alertas (exigem confirmação).
 */
router.post('/ctes/:id/validar', async (req, res) => {
    const tenantId = req.tenant.id;
    try {
        const resultado = await TransporteService.validarCte(tenantId, parseInt(req.params.id, 10));
        return res.json({ success: true, ...resultado });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

/**
 * Carta de Correção Eletrônica (CC-e) do CT-e autorizado.
 */
router.post('/ctes/:id/carta-correcao', async (req, res) => {
    const tenantId = req.tenant.id;
    const { correcao } = req.body || {};
    try {
        const result = await TransporteService.cartaCorrecaoCte(tenantId, parseInt(req.params.id, 10), correcao);
        return res.json(result);
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
});

/**
 * Inclui condutor em MDF-e em trânsito.
 */
router.post('/mdfes/:id/incluir-condutor', async (req, res) => {
    const tenantId = req.tenant.id;
    const { nome, cpf } = req.body || {};
    try {
        const result = await TransporteService.incluirCondutor(tenantId, parseInt(req.params.id, 10), { nome, cpf });
        return res.json(result);
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
});

/**
 * Inclui CT-e/NF-e em MDF-e já autorizado.
 */
router.post('/mdfes/:id/incluir-dfe', async (req, res) => {
    const tenantId = req.tenant.id;
    const { protocolo, codigo_municipio_carregamento, documentos } = req.body || {};
    try {
        const result = await TransporteService.incluirDfe(tenantId, parseInt(req.params.id, 10), {
            protocolo,
            codigo_municipio_carregamento,
            documentos
        });
        return res.json(result);
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
});

/**
 * Reconciliação de documentos presos em PROCESSANDO (job periódico).
 */
router.post('/reconciliar', async (req, res) => {
    const tenantId = req.tenant?.id || null;
    try {
        const result = await TransporteService.reconciliarProcessando(tenantId);
        return res.json({ success: true, ...result });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

/**
 * Timeline unificada de eventos fiscais de um documento (CT-e ou MDF-e).
 */
router.get('/timeline/:tipo/:id', async (req, res) => {
    const tenantId = req.tenant.id;
    const tipo = req.params.tipo.toUpperCase();
    const docId = parseInt(req.params.id, 10);

    try {
        const tabela = tipo === 'MDFE' ? 'dash_mdfes' : 'dash_ctes';
        const { rows } = await db.query(
            `SELECT * FROM ${tabela} WHERE id = $1 AND tenant_id = $2`,
            [docId, tenantId]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Documento não encontrado.' });

        const doc = rows[0];
        const eventos = [];

        // Evento de criação
        eventos.push({
            tipo: 'CRIACAO',
            status: 'CONCLUIDO',
            titulo: 'Rascunho criado',
            descricao: `Documento ${tipo} ${doc.numero ? 'nº ' + doc.numero : ''} criado no sistema.`,
            data: doc.created_at
        });

        // Envio à Focus
        const retorno = doc.retorno_focus || {};
        if (retorno.processando_autorizacao || doc.status === 'PROCESSANDO') {
            eventos.push({
                tipo: 'ENVIO',
                status: 'CONCLUIDO',
                titulo: 'Enviado para autorização',
                descricao: `Payload transmitido à Focus NFe (ref: ${doc.ref}).`,
                data: doc.updated_at
            });
        }

        // Resposta oficial da SEFAZ
        if (doc.status_sefaz) {
            eventos.push({
                tipo: doc.status === 'AUTORIZADO' ? 'AUTORIZACAO' : doc.status === 'REJEITADO' ? 'REJEICAO' : 'RESPOSTA',
                status: doc.status === 'AUTORIZADO' ? 'SUCESSO' : doc.status === 'REJEITADO' ? 'ERRO' : 'PENDENTE',
                titulo: doc.status === 'AUTORIZADO' ? 'Autorizado pela SEFAZ' :
                        doc.status === 'REJEITADO' ? 'Rejeitado pela SEFAZ' : 'Retorno da SEFAZ',
                descricao: `${doc.status_sefaz} — ${doc.mensagem_sefaz || ''}`,
                data: doc.updated_at
            });
        }

        // Cancelamento
        if (doc.status === 'CANCELADO') {
            eventos.push({
                tipo: 'CANCELAMENTO',
                status: 'CONCLUIDO',
                titulo: 'Documento cancelado',
                descricao: 'Evento de cancelamento registrado na SEFAZ.',
                data: doc.updated_at
            });
        }

        // Encerramento (MDF-e)
        if (tipo === 'MDFE' && doc.encerrado_em) {
            eventos.push({
                tipo: 'ENCERRAMENTO',
                status: 'CONCLUIDO',
                titulo: 'Viagem encerrada',
                descricao: `Encerramento registrado em ${doc.encerramento_municipio || ''}/${doc.encerramento_uf || ''}.`,
                data: doc.encerrado_em
            });
        }

        // Eventos adicionais gravados pela Focus (CC-e, inclusão de condutor/DF-e)
        if (retorno.carta_correcao) {
            eventos.push({
                tipo: 'CARTA_CORRECAO',
                status: 'CONCLUIDO',
                titulo: 'Carta de Correção registrada',
                descricao: 'CC-e emitida e vinculada ao CT-e.',
                data: doc.updated_at
            });
        }
        if (retorno.inclusao_condutor) {
            eventos.push({
                tipo: 'INCLUSAO_CONDUTOR',
                status: 'CONCLUIDO',
                titulo: 'Condutor incluído',
                descricao: 'Novo condutor registrado durante a viagem.',
                data: doc.updated_at
            });
        }
        if (retorno.inclusao_dfe) {
            eventos.push({
                tipo: 'INCLUSAO_DFE',
                status: 'CONCLUIDO',
                titulo: 'DF-e incluído no manifesto',
                descricao: 'CT-e/NF-e vinculados ao MDF-e autorizado.',
                data: doc.updated_at
            });
        }

        eventos.sort((a, b) => new Date(a.data || 0) - new Date(b.data || 0));

        return res.json({
            success: true,
            data: {
                documento: doc,
                tipo,
                eventos
            }
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;
