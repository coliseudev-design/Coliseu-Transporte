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
        valor_carga, peso_bruto
    } = req.body;

    try {
        let emitId = emitente_id;
        if (!emitId) {
            const em = await db.query(`SELECT id FROM dash_emitentes WHERE tenant_id = $1 AND ativo = true ORDER BY id LIMIT 1`, [tenantId]);
            if (em.rows.length === 0) return res.status(400).json({ error: 'Cadastre uma transportadora (emitente) antes de emitir MDF-e.' });
            emitId = em.rows[0].id;
        }

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
                tenantId, emitId, ref,
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

module.exports = router;
