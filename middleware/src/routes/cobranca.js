'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db/postgres');
const logger = require('../config/logger');
const EmailService = require('../services/emailService');

/**
 * Resolve e normaliza os endereços de e-mail de um cliente.
 * - Combina email_financeiro e email (commercial) sem duplicatas
 * - Converte tudo para minúsculas
 * - Filtra entradas vazias ou inválidas
 * @param {object} row - Linha de resultado do banco com campos de email do cliente
 * @returns {string[]} Array com 1 ou 2 emails válidos em lowercase, sem duplicatas
 */
function resolveEmails(row) {
    const raw = [
        row.email_financeiro,
        row.email_comercial,
        row.email,
        row.cliente_email,
    ];
    const seen = new Set();
    const result = [];
    for (const e of raw) {
        if (!e) continue;
        const normalized = String(e).trim().toLowerCase();
        if (normalized && normalized.includes('@') && !seen.has(normalized)) {
            seen.add(normalized);
            result.push(normalized);
        }
    }
    return result;
}

// ------------------------------------------------------------
// 1. CONFIGURAÇÃO DA RÉGUA DE COBRANÇA
// ------------------------------------------------------------

// GET /api/cobranca/reguas
router.get('/reguas', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { rows } = await db.query(
            'SELECT * FROM dash_reguas WHERE tenant_id = $1 ORDER BY created_at ASC',
            [tenantId]
        );
        res.json({ data: rows });
    } catch (err) {
        next(err);
    }
});

// POST /api/cobranca/reguas
router.post('/reguas', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { nome, descricao, padrao } = req.body;

        if (!nome) {
            return res.status(400).json({ error: 'O nome da régua é obrigatório.' });
        }

        // Se for padrão, remove o padrão das outras réguas do mesmo tenant
        if (padrao === true) {
            await db.query(
                'UPDATE dash_reguas SET padrao = false WHERE tenant_id = $1',
                [tenantId]
            );
        }

        const { rows } = await db.query(
            `INSERT INTO dash_reguas (tenant_id, nome, descricao, padrao)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [tenantId, nome, descricao, padrao === true]
        );

        res.status(201).json({ data: rows[0] });
    } catch (err) {
        next(err);
    }
});

// PUT /api/cobranca/reguas/:id
router.put('/reguas/:id', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const reguaId = parseInt(req.params.id, 10);
        const { nome, descricao, padrao } = req.body;

        if (padrao === true) {
            await db.query(
                'UPDATE dash_reguas SET padrao = false WHERE tenant_id = $1 AND id != $2',
                [tenantId, reguaId]
            );
        }

        const { rows } = await db.query(
            `UPDATE dash_reguas
             SET nome = COALESCE($1, nome), descricao = COALESCE($2, descricao), padrao = COALESCE($3, padrao)
             WHERE tenant_id = $4 AND id = $5
             RETURNING *`,
            [nome, descricao, padrao, tenantId, reguaId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Régua não encontrada.' });
        }

        res.json({ data: rows[0] });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/cobranca/reguas/:id
router.delete('/reguas/:id', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const reguaId = parseInt(req.params.id, 10);

        const delRes = await db.query(
            'DELETE FROM dash_reguas WHERE tenant_id = $1 AND id = $2',
            [tenantId, reguaId]
        );

        if (delRes.rowCount === 0) {
            return res.status(404).json({ error: 'Régua não encontrada.' });
        }

        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

// GET /api/cobranca/reguas/:id/etapas
router.get('/reguas/:id/etapas', async (req, res, next) => {
    try {
        const reguaId = parseInt(req.params.id, 10);
        const { rows } = await db.query(
            `SELECT * FROM dash_reguas_etapas WHERE regua_id = $1 ORDER BY ordem ASC, dias_relativos ASC`,
            [reguaId]
        );
        res.json({ data: rows });
    } catch (err) {
        next(err);
    }
});

// POST /api/cobranca/reguas/:id/etapas
// Suporta a atualização em lote (bulk sync) das etapas de uma régua para facilitar o reordenamento drag-and-drop
router.post('/reguas/:id/etapas', async (req, res, next) => {
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        const reguaId = parseInt(req.params.id, 10);
        const { etapas } = req.body; // Array de { id, dias_relativos, tipo_acao, canais, template_whatsapp_id, template_email_id, acao_pos_contato, condicao_disparo, ordem }

        // Limpa etapas antigas da régua
        await client.query('DELETE FROM dash_reguas_etapas WHERE regua_id = $1', [reguaId]);

        const inserted = [];
        if (etapas && Array.isArray(etapas)) {
            for (let i = 0; i < etapas.length; i++) {
                const et = etapas[i];
                const { rows } = await client.query(
                    `INSERT INTO dash_reguas_etapas (regua_id, dias_relativos, tipo_acao, canais, template_whatsapp_id, template_email_id, acao_pos_contato, condicao_disparo, ordem)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                     RETURNING *`,
                    [reguaId, parseInt(et.dias_relativos || 0, 10), et.tipo_acao || 'Lembrete', et.canais || 'whatsapp', et.template_whatsapp_id || null, et.template_email_id || null, et.acao_pos_contato, et.condicao_disparo, i]
                );
                inserted.push(rows[0]);
            }
        }

        await client.query('COMMIT');
        res.status(201).json({ data: inserted });
    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
});

// ------------------------------------------------------------
// 2. GESTÃO E LISTAGEM DE TÍTULOS (TABELA & KANBAN)
// ------------------------------------------------------------

// GET /api/cobranca/titulos
router.get('/titulos', async (req, res) => {
    try {
        const tenantId = req.tenant?.id || 'ed1d3a98-4c4d-48db-99c0-8751926eb8e5';
        const { search, regua_id, status } = req.query;

        const where = [
            'LOWER(f.tenant_id::text) = LOWER($1::text)', 
            "(f.tipo IS NULL OR f.tipo = '' OR UPPER(TRIM(f.tipo)) IN ('RECEBER', 'R'))", 
            'COALESCE(f.valor, 0) > 0'
        ];
        const binds = [String(tenantId)];
        let pIndex = 2;

        if (search && String(search).trim() !== '') {
            where.push(`(cl.nome ILIKE $${pIndex} OR cl.documento ILIKE $${pIndex} OR f.cliente_nome ILIKE $${pIndex} OR f.numero_documento ILIKE $${pIndex})`);
            binds.push(`%${search.trim()}%`);
            pIndex++;
        }

        if (regua_id) {
            where.push(`f.regua_id = $${pIndex}`);
            binds.push(parseInt(regua_id, 10));
            pIndex++;
        }

        if (status && status !== 'all' && status !== 'todos') {
            where.push(`UPPER(TRIM(f.status_pagamento)) = UPPER(TRIM($${pIndex}))`);
            binds.push(status);
            pIndex++;
        } else {
            where.push(`(
                (f.data_cancelamento IS NULL)
                AND UPPER(TRIM(COALESCE(f.status_pagamento, 'ABERTO'))) NOT IN (
                    'PAGO', 'QUITADO', 'CANCELADO', 'CANCELADA', 'CANCEL', 'CAN', 
                    'RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'BAIXADO', 'BAIXADA', 
                    'LIQUIDADO', 'LIQUIDADA', 'ESTORNADO', 'ESTORNADA', 'EXCLUIDO', 
                    'EXCLUIDA', 'ANULADO', 'ANULADA', 'INATIVO', 'C'
                )
                AND UPPER(TRIM(COALESCE(f.status_pagamento, ''))) NOT LIKE '%CANCEL%'
                AND UPPER(TRIM(COALESCE(f.status_pagamento, ''))) NOT LIKE '%ESTORN%'
                AND UPPER(TRIM(COALESCE(f.status_pagamento, ''))) NOT LIKE '%ANULA%'
                AND UPPER(TRIM(COALESCE(f.status_pagamento, ''))) NOT LIKE '%EXCLU%'
                AND (f.descricao IS NULL OR (UPPER(f.descricao) NOT LIKE '%[CANCELADO]%' AND UPPER(f.descricao) NOT LIKE '%CANCELADO%'))
                AND COALESCE(f.valor_pago, 0) < f.valor
            )`);
        }

        const querySql = `
            SELECT 
                f.id, f.id_firebird, f.descricao, f.data_emissao, f.data_vencimento, f.data_pagamento, 
                f.valor, f.valor_pago, f.status_pagamento, f.regua_id, f.regua_pausada, f.nosso_numero, f.numero_documento, 
                COALESCE(NULLIF(f.bank_slip_url, ''), NULLIF(f.asaas_bank_slip_url, ''), NULLIF(f.pdf_url, ''), NULLIF(f.invoice_url, '')) AS bank_slip_url,
                f.asaas_bank_slip_url, f.pdf_url, f.asaas_payment_id, f.invoice_url, f.cliente_id_firebird,
                COALESCE(NULLIF(f.cliente_nome, ''), NULLIF(cl.nome, ''), NULLIF(cl.razao_social, ''), 'Cliente') AS cliente_nome, 
                COALESCE(cl.documento, f.cliente_documento) AS cliente_documento, 
                COALESCE(cl.telefone, cl.celular_secundario) AS cliente_telefone,
                COALESCE(NULLIF(TRIM(cl.email_financeiro), ''), NULLIF(TRIM(cl.email), ''), NULLIF(TRIM(f.cliente_email), '')) AS cliente_email,
                COALESCE(NULLIF(TRIM(cl.email_financeiro), ''), NULLIF(TRIM(cl.email), ''), NULLIF(TRIM(f.cliente_email), '')) AS email,
                EXTRACT(DAY FROM NOW() - f.data_vencimento) AS dias_atraso,
                r.nome AS regua_nome
            FROM dash_financeiro f
            LEFT JOIN dash_clientes cl ON (
                (f.cliente_id_firebird IS NOT NULL AND f.cliente_id_firebird > 0 AND cl.id_firebird = f.cliente_id_firebird) OR
                (f.cliente_id IS NOT NULL AND cl.id = f.cliente_id)
            ) AND LOWER(cl.tenant_id::text) = LOWER(f.tenant_id::text)
            LEFT JOIN dash_reguas r ON r.id = f.regua_id AND LOWER(r.tenant_id::text) = LOWER(f.tenant_id::text)
            WHERE ${where.join(' AND ')}
            ORDER BY f.data_vencimento DESC
            LIMIT 5000
        `;

        const { rows } = await db.query(querySql, binds);

        const formatted = rows.map(r => {
            const dias = parseInt(r.dias_atraso || 0, 10);
            return {
                ...r,
                valor: parseFloat(r.valor || 0),
                valor_pago: parseFloat(r.valor_pago || 0),
                dias_atraso: r.status_pagamento === 'PAGO' ? 0 : (dias < 0 ? 0 : dias)
            };
        });

        res.json({ data: formatted });
    } catch (err) {
        console.error('[cobranca/titulos] Erro ao buscar títulos:', err.message);
        res.status(200).json({ data: [], error: err.message });
    }
});

// POST /api/cobranca/titulos/acao-lote
router.post('/titulos/acao-lote', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { ids, acao, regua_id } = req.body; // ids: array de IDs de dash_financeiro

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'Nenhum título selecionado.' });
        }

        if (acao === 'Mudar Régua') {
            if (!regua_id) {
                return res.status(400).json({ error: 'Régua de destino não informada.' });
            }
            await db.query(
                `UPDATE dash_financeiro 
                 SET regua_id = $1 
                 WHERE tenant_id = $2 AND id = ANY($3)`,
                [parseInt(regua_id, 10), tenantId, ids]
            );
        } else if (acao === 'Pausar Cobrança') {
            await db.query(
                `UPDATE dash_financeiro 
                 SET regua_pausada = true 
                 WHERE tenant_id = $1 AND id = ANY($2)`,
                [tenantId, ids]
            );
        } else if (acao === 'Retomar Cobrança') {
            await db.query(
                `UPDATE dash_financeiro 
                 SET regua_pausada = false 
                 WHERE tenant_id = $1 AND id = ANY($2)`,
                [tenantId, ids]
            );
        } else if (acao === 'Disparar Manualmente') {
            // Apenas registra o mock de envio em lote para as cobranças ativas
            for (const id of ids) {
                await db.query(
                    `INSERT INTO dash_cobrancas_logs (tenant_id, financeiro_id, canal, status)
                     VALUES ($1, $2, 'WhatsApp', 'Sucesso')`,
                    [tenantId, id]
                );
            }
        }

        res.json({ success: true, message: `Ação de lote "${acao}" aplicada com sucesso!` });
    } catch (err) {
        next(err);
    }
});

// POST /api/cobranca/disparar-email-lote
// Dispara e-mails de cobrança em lote com opção de anexar boleto PDF
router.post('/disparar-email-lote', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { ids, titulos } = req.body;

        const targetList = Array.isArray(titulos) && titulos.length > 0 ? titulos : (Array.isArray(ids) ? ids.map(id => ({ id })) : []);
        if (targetList.length === 0) {
            return res.status(400).json({ error: 'Nenhum título informado para disparo.' });
        }

        let emailConfig = null;
        try {
            emailConfig = await EmailService.getConfig(tenantId);
        } catch (configErr) {
            return res.status(400).json({ error: configErr.message || 'Configuração SMTP não encontrada.' });
        }

        // Registra campanha para rastreamento nas Estatísticas (reutiliza se fornecida no lote)
        let campanhaId = req.body.campanha_id ? parseInt(req.body.campanha_id, 10) : null;
        if (!campanhaId) {
            try {
                await db.query(`ALTER TABLE dash_campanhas ADD COLUMN IF NOT EXISTS canal VARCHAR(20) DEFAULT 'WHATSAPP'`).catch(() => {});
                await db.query(`ALTER TABLE dash_campanhas ADD COLUMN IF NOT EXISTS assunto TEXT`).catch(() => {});
                await db.query(`ALTER TABLE dash_campanhas ADD COLUMN IF NOT EXISTS conteudo TEXT`).catch(() => {});
                const nomeLote = req.body.nome_campanha || req.body.assunto || req.body.titulos?.[0]?.assunto || 'Lembrete de Cobrança em Lote';
                const assuntoLote = req.body.assunto || req.body.titulos?.[0]?.assunto || 'Cobrança de Títulos em Atraso';
                const mensagemLote = req.body.mensagem || '';
                const campRes = await db.query(
                    `INSERT INTO dash_campanhas (tenant_id, nome, canal, assunto, conteudo)
                     VALUES ($1, $2, 'EMAIL', $3, $4)
                     RETURNING id`,
                    [tenantId, nomeLote, assuntoLote, mensagemLote]
                );
                campanhaId = campRes.rows[0]?.id;
            } catch (campErr) {
                logger.warn('[DispararEmailLote] Aviso ao criar campanha para rastreamento:', campErr.message);
            }
        }

        let enviados = 0;
        let erros = 0;
        const logs = [];

        for (const item of targetList) {
            const titleId = parseInt(item.id, 10);
            if (!titleId) continue;

            let { rows: tRows } = await db.query(
                `SELECT f.id, f.id_firebird, f.descricao, f.valor, f.data_vencimento, f.data_emissao, f.nosso_numero, f.numero_documento, 
                        f.asaas_payment_id, f.bank_slip_url, f.asaas_bank_slip_url, f.invoice_url, f.pdf_url, f.cliente_id,
                        f.asaas_linha_digitavel, f.asaas_bar_code, f.multa_percentual, f.juros_percentual,
                        f.portador_nome,
                        c.email_financeiro,
                        c.email AS email_comercial,
                        f.cliente_email,
                        COALESCE(c.nome, c.razao_social, f.cliente_nome, 'Cliente') AS cliente_nome,
                        COALESCE(c.documento, f.cliente_documento) AS cliente_documento,
                        COALESCE(c.telefone, c.celular_secundario, f.cliente_telefone) AS cliente_telefone,
                        COALESCE(c.endereco_completo, f.cliente_endereco) AS cliente_endereco,
                        c.cidade AS cliente_cidade, c.estado AS cliente_estado,
                        c.id_firebird AS cliente_id_firebird
                 FROM dash_financeiro f
                 LEFT JOIN dash_clientes c ON (c.id_firebird = f.cliente_id_firebird OR c.id = f.cliente_id) AND LOWER(c.tenant_id::text) = LOWER(f.tenant_id::text)
                 WHERE (f.id = $1 OR f.id_firebird = $1) AND ($2 = '00000000-0000-0000-0000-000000000000' OR LOWER(f.tenant_id::text) = LOWER($2::text))
                 LIMIT 1`,
                [titleId, String(tenantId)]
            );

            if (tRows.length === 0) {
                const fallback = await db.query(
                    `SELECT f.id, f.id_firebird, f.descricao, f.valor, f.data_vencimento, f.data_emissao, f.nosso_numero, f.numero_documento, 
                            f.asaas_payment_id, f.bank_slip_url, f.asaas_bank_slip_url, f.invoice_url, f.pdf_url, f.cliente_id,
                            f.asaas_linha_digitavel, f.asaas_bar_code, f.multa_percentual, f.juros_percentual,
                            f.portador_nome,
                            c.email_financeiro,
                            c.email AS email_comercial,
                            f.cliente_email,
                            COALESCE(c.nome, c.razao_social, f.cliente_nome, 'Cliente') AS cliente_nome,
                            COALESCE(c.documento, f.cliente_documento) AS cliente_documento,
                            COALESCE(c.telefone, c.celular_secundario, f.cliente_telefone) AS cliente_telefone,
                            COALESCE(c.endereco_completo, f.cliente_endereco) AS cliente_endereco,
                            c.cidade AS cliente_cidade, c.estado AS cliente_estado,
                            c.id_firebird AS cliente_id_firebird
                     FROM dash_financeiro f
                     LEFT JOIN dash_clientes c ON (c.id_firebird = f.cliente_id_firebird OR c.id = f.cliente_id)
                     WHERE (f.id = $1 OR f.id_firebird = $1)
                     LIMIT 1`,
                    [titleId]
                );
                tRows = fallback.rows;
            }

            if (tRows.length === 0) {
                erros++;
                logs.push({ id: titleId, status: 'erro', error: `Título ID #${titleId} não foi localizado no financeiro.` });
                continue;
            }
            const t = tRows[0];

            // Resolve todos os e-mails válidos do cadastro (comercial + financeiro), em minúsculas
            const emailOverride = item.cliente_email ? item.cliente_email.trim().toLowerCase() : null;
            const destEmails = (emailOverride && emailOverride.includes('@'))
                ? [emailOverride]
                : [t.email_financeiro, t.email_comercial, t.cliente_email]
                    .filter(Boolean)
                    .map(e => String(e).trim().toLowerCase())
                    .filter(e => e.includes('@'));

            if (destEmails.length === 0) {
                erros++;
                logs.push({ id: titleId, status: 'erro', error: 'Cliente sem e-mail válido cadastrado.' });
                continue;
            }

            // Atualiza e-mail no cadastro do cliente se tiver sido editado na tabela
            if (item.cliente_email && item.cliente_email.trim().toLowerCase() !== (t.email_comercial || '').trim().toLowerCase()) {
                if (t.cliente_id_firebird) {
                    await db.query(
                        `UPDATE dash_clientes SET email = $1 WHERE id_firebird = $2 AND LOWER(tenant_id::text) = LOWER($3::text)`,
                        [item.cliente_email.trim().toLowerCase(), t.cliente_id_firebird, String(tenantId)]
                    ).catch(() => {});
                }
            }

            // Descobre URL do Boleto PDF se houver solicitação de anexo
            let attachments = [];
            if (item.anexar_boleto !== false) {
                let boletoUrl = item.bank_slip_url || item.invoice_url || t.bank_slip_url || t.asaas_bank_slip_url || t.pdf_url || t.invoice_url;
                const isCora = (t.portador_nome || '').toUpperCase() === 'CORA';
                
                if (!boletoUrl && t.asaas_payment_id) {
                    try {
                        if (isCora) {
                            const CoraService = require('../services/coraService');
                            const cInfo = await CoraService.consultarBoleto(tenantId, t.asaas_payment_id);
                            boletoUrl = cInfo?.payment_options?.bank_slip?.url || cInfo?.pdf_url || cInfo?.url;
                            if (boletoUrl) {
                                await db.query(`UPDATE dash_financeiro SET bank_slip_url = $1, pdf_url = $1 WHERE id = $2`, [boletoUrl, t.id]).catch(() => {});
                            }
                        } else {
                            const AsaasService = require('../services/asaasService');
                            const pInfo = await AsaasService.getPayment(tenantId, t.asaas_payment_id);
                            if (pInfo && (pInfo.bankSlipUrl || pInfo.invoiceUrl)) {
                                boletoUrl = pInfo.bankSlipUrl || pInfo.invoiceUrl;
                                await db.query(`UPDATE dash_financeiro SET asaas_bank_slip_url = $1 WHERE id = $2`, [boletoUrl, t.id]).catch(() => {});
                            }
                        }
                    } catch (e) {}
                }

                if (!boletoUrl) {
                    try {
                        const AsaasService = require('../services/asaasService');
                        const asaasCfg = await AsaasService.getConfig(tenantId).catch(() => null);
                        if (asaasCfg && asaasCfg.apiKey) {
                            const customerAsaas = await AsaasService.findOrCreateCustomer(tenantId, {
                                name: item.cliente_nome || t.cliente_nome,
                                cpfCnpj: t.cliente_documento,
                                email: destEmails[0],
                                phone: t.cliente_telefone
                            });

                            const dueDateStr = t.data_vencimento ? new Date(t.data_vencimento).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
                            const paymentRes = await AsaasService.createPayment(tenantId, {
                                customerId: customerAsaas.id,
                                value: parseFloat(t.valor || 0),
                                dueDate: dueDateStr,
                                description: `Boleto N° ${t.id_firebird || t.numero_documento || t.id} - ${t.descricao || 'Cobrança Coliseu Transporte'}`
                            });

                            if (paymentRes && (paymentRes.bankSlipUrl || paymentRes.invoiceUrl)) {
                                boletoUrl = paymentRes.bankSlipUrl || paymentRes.invoiceUrl;
                                const nossoNum = paymentRes.nossoNumero || paymentRes.id;
                                await db.query(
                                    `UPDATE dash_financeiro 
                                     SET asaas_payment_id = $1, asaas_bank_slip_url = $2, nosso_numero = $3 
                                     WHERE id = $4`,
                                    [paymentRes.id, boletoUrl, nossoNum, t.id]
                                ).catch(() => {});
                            }
                        }
                    } catch (autoEmitErr) {
                        logger.warn(`[DispararEmailLote] Aviso ao tentar auto-emitir boleto: ${autoEmitErr.message}`);
                    }
                }

                if (boletoUrl) {
                    const docNo = t.nosso_numero || t.numero_documento || t.id_firebird || t.id;
                    const isCora = (t.portador_nome || '').toUpperCase() === 'CORA';
                    let pdfAttached = false;

                    if (isCora) {
                        try {
                            const BoletoPdfService = require('../services/BoletoPdfService');
                            const CoraService = require('../services/CoraService');
                            let coraBs = {};
                            let coraPixEmv = null;
                            if (t.asaas_payment_id) {
                                try {
                                    const coraData = await CoraService.consultarBoleto(tenantId, t.asaas_payment_id);
                                    coraBs = coraData?.payment_options?.bank_slip || coraData?.payment_details?.bank_slip || {};
                                    coraPixEmv = coraBs.emv || coraData?.payment_options?.pix?.emv || coraData?.pix?.emv || null;
                                } catch (_) {}
                            }

                            const pdfBuffer = await BoletoPdfService.gerarBoletoPdf({
                                cliente: {
                                    nome: t.cliente_nome,
                                    documento: t.cliente_documento,
                                    endereco_completo: t.cliente_endereco || (t.cliente_cidade ? `${t.cliente_cidade} - ${t.cliente_estado || ''}` : '—')
                                },
                                titulo: {
                                    id: t.id,
                                    id_firebird: t.id_firebird,
                                    descricao: t.descricao,
                                    valor: parseFloat(t.valor || 0),
                                    data_vencimento: t.data_vencimento,
                                    data_emissao: t.data_emissao,
                                    multa_percentual: t.multa_percentual || 2.0,
                                    juros_percentual: t.juros_percentual || 1.0,
                                    nosso_numero: coraBs.our_number || t.nosso_numero
                                },
                                cora: {
                                    linhaDigitavel: coraBs.digitable || coraBs.digitable_line || t.asaas_linha_digitavel,
                                    barCode: coraBs.barcode || t.asaas_bar_code,
                                    nossoNumero: coraBs.our_number || t.nosso_numero,
                                    pdfUrl: boletoUrl,
                                    pixCopiaECola: coraPixEmv
                                }
                            });

                            attachments.push({
                                filename: `Boleto_${docNo}.pdf`,
                                content: pdfBuffer,
                                contentType: 'application/pdf'
                            });
                            pdfAttached = true;
                        } catch (errPdf) {
                            logger.warn(`[DispararEmailLote] Falha ao gerar PDF Coliseu/Cora: ${errPdf.message}`);
                        }
                    }

                    if (!pdfAttached) {
                        try {
                            if (boletoUrl.startsWith('http://') || boletoUrl.startsWith('https://')) {
                                const controller = new AbortController();
                                const timeoutId = setTimeout(() => controller.abort(), 8000);
                                const pdfRes = await fetch(boletoUrl, { signal: controller.signal });
                                clearTimeout(timeoutId);
                                if (pdfRes.ok) {
                                    const arrBuf = await pdfRes.arrayBuffer();
                                    attachments.push({
                                        filename: `Boleto_${docNo}.pdf`,
                                        content: Buffer.from(arrBuf),
                                        contentType: 'application/pdf'
                                    });
                                } else {
                                    attachments.push({
                                        filename: `Boleto_${docNo}.pdf`,
                                        path: boletoUrl
                                    });
                                }
                            } else {
                                attachments.push({
                                    filename: `Boleto_${docNo}.pdf`,
                                    path: boletoUrl
                                });
                            }
                        } catch (pdfErr) {
                            logger.warn(`[DispararEmailLote] Falha ao baixar PDF do boleto: ${pdfErr.message}`);
                            try {
                                attachments.push({
                                    filename: `Boleto_${docNo}.pdf`,
                                    path: boletoUrl
                                });
                            } catch (_) {}
                        }
                    }
                }
            }

            const formatBRLStr = (v) => parseFloat(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            const formatDTOStr = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '';

            const vars = {
                nomeCliente: item.cliente_nome || t.cliente_nome || 'Cliente',
                nome_cliente: item.cliente_nome || t.cliente_nome || 'Cliente',
                valorCobranca: formatBRLStr(t.valor),
                valor_cobranca: formatBRLStr(t.valor),
                valor: formatBRLStr(t.valor),
                valor_total: formatBRLStr(t.valor),
                dataVencimento: formatDTOStr(t.data_vencimento),
                data_vencimento: formatDTOStr(t.data_vencimento),
                vencimento: formatDTOStr(t.data_vencimento),
                nossoNumero: t.nosso_numero || t.numero_documento || t.id_firebird || t.id,
                nosso_numero: t.nosso_numero || t.numero_documento || t.id_firebird || t.id,
                numero_documento: t.nosso_numero || t.numero_documento || t.id_firebird || t.id,
                linkPagamento: item.bank_slip_url || t.bank_slip_url || t.asaas_bank_slip_url || '#'
            };

            const assuntoMail = EmailService.renderTemplate(item.assunto || 'AVISO DE COBRANÇA: Fatura em Aberto', vars);
            const htmlMail = EmailService.wrapInColiseuHtmlTemplate(assuntoMail, item.mensagem || EmailService.defaultTemplateCobranca(vars), vars);

            try {
                // Envia para todos os e-mails válidos do cliente (principal + financeiro) com pixel de rastreamento
                for (const dest of destEmails) {
                    const emailSendId = require('crypto').randomUUID();

                    // 1. Registra envio em dash_email_sends para tracking de abertura e cliques
                    await db.query(
                        `INSERT INTO dash_email_sends (id, tenant_id, campanha_id, destinatario_nome, destinatario_email, destinatario_documento, assunto, status, enviado_em)
                         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, 'Enviando', NOW())`,
                        [emailSendId, tenantId, campanhaId, vars.nomeCliente, dest, t.cliente_documento || null, assuntoMail]
                    ).catch(e => logger.warn('[DispararEmailLote] Aviso ao criar dash_email_sends:', e.message));

                    // 2. Injeta tracking no HTML (pixel transparente de abertura + links de clique)
                    const trackedHtmlMail = EmailService.injectTracking(htmlMail, emailSendId);

                    try {
                        await EmailService.sendSingle(emailConfig, {
                            para: dest,
                            assunto: assuntoMail,
                            html: trackedHtmlMail,
                            attachments,
                            nomeCliente: vars.nomeCliente
                        });

                        // Sucesso: marca como Enviado
                        await db.query(
                            `UPDATE dash_email_sends SET status = 'Enviado' WHERE id = $1::uuid`,
                            [emailSendId]
                        ).catch(() => {});

                        if (campanhaId) {
                            await db.query(
                                `INSERT INTO dash_campanhas_logs (tenant_id, campanha_id, destinatario_nome, destinatario_telefone, status)
                                 VALUES ($1, $2, $3, $4, 'Sucesso')`,
                                [tenantId, campanhaId, vars.nomeCliente, dest]
                            ).catch(() => {});
                        }
                    } catch (singleSendErr) {
                        // Falha no envio específico
                        await db.query(
                            `UPDATE dash_email_sends SET status = 'Falha', metadata = $1 WHERE id = $2::uuid`,
                            [JSON.stringify({ erro: singleSendErr.message }), emailSendId]
                        ).catch(() => {});

                        if (campanhaId) {
                            await db.query(
                                `INSERT INTO dash_campanhas_logs (tenant_id, campanha_id, destinatario_nome, destinatario_telefone, status, erro)
                                 VALUES ($1, $2, $3, $4, 'Falha', $5)`,
                                [tenantId, campanhaId, vars.nomeCliente, dest, singleSendErr.message]
                            ).catch(() => {});
                        }
                        throw singleSendErr;
                    }
                }

                enviados++;
                logs.push({ id: titleId, status: 'sucesso', destinatarios: destEmails });

                await db.query(
                    `INSERT INTO dash_cobrancas_logs (tenant_id, financeiro_id, canal, status)
                     VALUES ($1, $2, 'E-mail', 'Sucesso')`,
                    [tenantId, titleId]
                ).catch(() => {});

                await db.query(
                    `INSERT INTO dash_cobrancas_historico (tenant_id, financeiro_id, tipo_contato, observacao)
                     VALUES ($1, $2, 'E-mail', $3)`,
                    [tenantId, titleId, `E-mail de cobrança enviado para ${destEmails.join(', ')}${attachments.length > 0 ? ' (Boleto PDF Anexado)' : ''}`]
                ).catch(() => {});

            } catch (sendErr) {
                erros++;
                logger.error('[DispararEmailLote] Falha ao enviar e-mail:', sendErr.message);
                logs.push({ id: titleId, status: 'erro', error: sendErr.message });
            }

        }

        res.json({
            success: enviados > 0,
            campanha_id: campanhaId,
            enviados,
            erros,
            logs
        });
    } catch (err) {
        logger.error('[DispararEmailLote] Erro inesperado na rota:', err);
        return res.status(500).json({ error: err.message || 'Erro interno ao processar disparo de e-mails.' });
    }
});

// POST /api/cobranca/testar-email-template
// Envia e-mail de teste individual com as variáveis interpoladas
router.post('/testar-email-template', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { destinatario, assunto, mensagem, amostra } = req.body;

        if (!destinatario || !destinatario.includes('@')) {
            return res.status(400).json({ error: 'Informe um e-mail de teste válido.' });
        }

        let emailConfig = null;
        try {
            emailConfig = await EmailService.getConfig(tenantId);
        } catch (configErr) {
            return res.status(400).json({ error: configErr.message || 'Configuração SMTP não encontrada.' });
        }

        const formatBRLStr = (v) => parseFloat(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const formatDTOStr = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '';

        const vars = {
            nomeCliente: amostra?.cliente || amostra?.nomeCliente || 'EMPRESA EXEMPLO LTDA',
            valorCobranca: formatBRLStr(amostra?.valor || 326.33),
            dataVencimento: formatDTOStr(amostra?.data_vencimento || new Date()),
            nossoNumero: amostra?.nosso_numero || amostra?.numero_documento || '111291',
            linkPagamento: amostra?.bank_slip_url || 'https://asaas.com/exemplo-boleto-teste'
        };

        const assuntoMail = EmailService.renderTemplate(assunto || 'TESTE: Lembrete de Vencimento', vars);
        const htmlMail = EmailService.wrapInColiseuHtmlTemplate(assuntoMail, mensagem || EmailService.defaultTemplateCobranca(vars), vars);

        // Tenta anexar boleto PDF se URL disponível na amostra
        const attachments = [];
        const boletoUrl = amostra?.bank_slip_url;
        let pdfAttached = false;
        const isCora = (amostra?.portador_nome || '').toUpperCase() === 'CORA';

        if (isCora) {
            try {
                const BoletoPdfService = require('../services/BoletoPdfService');
                const CoraService = require('../services/CoraService');
                let coraBs = {};
                let coraPixEmv = null;
                if (amostra?.asaas_payment_id) {
                    try {
                        const coraData = await CoraService.consultarBoleto(tenantId, amostra.asaas_payment_id);
                        coraBs = coraData?.payment_options?.bank_slip || coraData?.payment_details?.bank_slip || {};
                        coraPixEmv = coraBs.emv || coraData?.payment_options?.pix?.emv || coraData?.pix?.emv || null;
                    } catch (_) {}
                }

                const pdfBuffer = await BoletoPdfService.gerarBoletoPdf({
                    cliente: {
                        nome: vars.nomeCliente,
                        documento: vars.cpfCnpj,
                        endereco_completo: vars.endereco || '—'
                    },
                    titulo: {
                        id: amostra?.id,
                        id_firebird: amostra?.id_firebird,
                        descricao: vars.descricao,
                        valor: parseFloat(amostra?.valor || 0),
                        data_vencimento: vars.dataVencimento,
                        data_emissao: amostra?.data_emissao,
                        nosso_numero: coraBs.our_number || vars.nossoNumero
                    },
                    cora: {
                        linhaDigitavel: coraBs.digitable || coraBs.digitable_line || vars.linhaDigitavel,
                        barCode: coraBs.barcode || amostra?.asaas_bar_code,
                        nossoNumero: coraBs.our_number || vars.nossoNumero,
                        pdfUrl: boletoUrl,
                        pixCopiaECola: coraPixEmv
                    }
                });

                attachments.push({
                    filename: `Boleto_${vars.nossoNumero || 'teste'}.pdf`,
                    content: pdfBuffer,
                    contentType: 'application/pdf'
                });
                pdfAttached = true;
            } catch (errPdf) {
                logger.warn(`[TestarEmailTemplate] Falha ao gerar PDF Coliseu/Cora: ${errPdf.message}`);
            }
        }

        if (!pdfAttached && boletoUrl && (boletoUrl.startsWith('http://') || boletoUrl.startsWith('https://'))) {
            try {
                const pdfRes = await fetch(boletoUrl);
                if (pdfRes.ok) {
                    const arrBuf = await pdfRes.arrayBuffer();
                    attachments.push({
                        filename: `Boleto_${vars.nossoNumero || 'teste'}.pdf`,
                        content: Buffer.from(arrBuf),
                        contentType: 'application/pdf'
                    });
                } else {
                    attachments.push({
                        filename: `Boleto_${vars.nossoNumero || 'teste'}.pdf`,
                        path: boletoUrl
                    });
                }
            } catch (pdfErr) {
                logger.warn(`[TestarEmailTemplate] Falha ao baixar PDF do boleto para teste: ${pdfErr.message}`);
                attachments.push({
                    filename: `Boleto_${vars.nossoNumero || 'teste'}.pdf`,
                    path: boletoUrl
                });
            }
        }

        await EmailService.sendSingle(emailConfig, {
            para: destinatario.trim(),
            assunto: `[TESTE DE ENVIO] ${assuntoMail}`,
            html: htmlMail,
            attachments,
            nomeCliente: vars.nomeCliente
        });

        // Registra na campanha para aparecer nas Estatísticas
        try {
            await db.query(`ALTER TABLE dash_campanhas ADD COLUMN IF NOT EXISTS canal VARCHAR(20) DEFAULT 'WHATSAPP'`).catch(() => {});
            await db.query(`ALTER TABLE dash_campanhas ADD COLUMN IF NOT EXISTS assunto TEXT`).catch(() => {});
            await db.query(`ALTER TABLE dash_campanhas ADD COLUMN IF NOT EXISTS conteudo TEXT`).catch(() => {});
            const campRes = await db.query(
                `INSERT INTO dash_campanhas (tenant_id, nome, canal, assunto, conteudo)
                 VALUES ($1, $2, 'EMAIL', $3, $4)
                 RETURNING id`,
                [tenantId, `[TESTE] ${assuntoMail}`, `[TESTE] ${assuntoMail}`, mensagem || '']
            );
            const campanhaId = campRes.rows[0]?.id;
            if (campanhaId) {
                await db.query(
                    `INSERT INTO dash_campanhas_logs (tenant_id, campanha_id, destinatario_nome, destinatario_telefone, status)
                     VALUES ($1, $2, $3, $4, 'Sucesso')`,
                    [tenantId, campanhaId, vars.nomeCliente, destinatario.trim()]
                );
            }
        } catch (campErr) {
            logger.warn('[TestarEmailTemplate] Aviso ao registrar campanha:', campErr.message);
        }

        res.json({
            success: true,
            message: `E-mail de teste disparado com sucesso para ${destinatario.trim()}!${attachments.length > 0 ? ' (Boleto PDF anexado)' : ' (Sem boleto anexo — nenhuma URL disponível)'}`
        });
    } catch (err) {
        logger.error('[TestarEmailTemplate] Falha:', err.message);
        res.status(500).json({ error: `Erro no envio de teste: ${err.message}` });
    }
});

// ------------------------------------------------------------
// 3. AÇÕES MANUAIS DE COBRANÇA E TIMELINE DO TÍTULO
// ------------------------------------------------------------

// POST /api/cobranca/titulos/:id/ocorrencias
router.post('/titulos/:id/ocorrencias', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const financeiroId = parseInt(req.params.id, 10);
        const { tipo_contato, observacao } = req.body;

        if (!tipo_contato || !observacao) {
            return res.status(400).json({ error: 'Método de contato e observação são obrigatórios.' });
        }

        const { rows } = await db.query(
            `INSERT INTO dash_cobrancas_ocorrencias (tenant_id, financeiro_id, tipo_contato, observacao, operador)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [tenantId, financeiroId, tipo_contato, observacao, req.user?.id || 'Operador']
        );

        res.status(201).json({ data: rows[0] });
    } catch (err) {
        next(err);
    }
});

// POST /api/cobranca/titulos/:id/agendamentos
router.post('/titulos/:id/agendamentos', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const financeiroId = parseInt(req.params.id, 10);
        const { data_agendamento, descricao } = req.body;

        if (!data_agendamento || !descricao) {
            return res.status(400).json({ error: 'Data de agendamento e descrição são obrigatórias.' });
        }

        const { rows } = await db.query(
            `INSERT INTO dash_cobrancas_agendamentos (tenant_id, financeiro_id, data_agendamento, descricao)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [tenantId, financeiroId, data_agendamento, descricao]
        );

        res.status(201).json({ data: rows[0] });
    } catch (err) {
        next(err);
    }
});

// GET /api/cobranca/titulos/:id/historico
router.get('/titulos/:id/historico', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const financeiroId = parseInt(req.params.id, 10);

        const ocorrencias = await db.query(
            `SELECT id, tipo_contato, observacao, operador, created_at
             FROM dash_cobrancas_ocorrencias
             WHERE tenant_id = $1 AND financeiro_id = $2
             ORDER BY created_at DESC`,
            [tenantId, financeiroId]
        );

        const agendamentos = await db.query(
            `SELECT id, data_agendamento, descricao, concluido, created_at
             FROM dash_cobrancas_agendamentos
             WHERE tenant_id = $1 AND financeiro_id = $2
             ORDER BY data_agendamento ASC`,
            [tenantId, financeiroId]
        );

        const logsAutomacao = await db.query(
            `SELECT l.id, l.canal, l.data_envio, l.status, l.erro,
                    e.dias_relativos, e.tipo_acao
             FROM dash_cobrancas_logs l
             LEFT JOIN dash_reguas_etapas e ON e.id = l.etapa_id
             WHERE l.tenant_id = $1 AND l.financeiro_id = $2
             ORDER BY l.data_envio DESC`,
            [tenantId, financeiroId]
        );

        res.json({
            ocorrencias: ocorrencias.rows,
            agendamentos: agendamentos.rows,
            automacoes: logsAutomacao.rows
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/cobranca/agendamentos
router.get('/agendamentos', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { rows } = await db.query(
            `SELECT a.*, f.descricao AS titulo_descricao, f.valor AS titulo_valor, f.data_vencimento AS titulo_vencimento,
                    cl.nome AS cliente_nome, cl.telefone AS cliente_telefone
             FROM dash_cobrancas_agendamentos a
             JOIN dash_financeiro f ON f.id = a.financeiro_id AND f.tenant_id = a.tenant_id
             LEFT JOIN dash_clientes cl ON cl.id_firebird = f.cliente_id_firebird AND cl.tenant_id = f.tenant_id
             WHERE a.tenant_id = $1
             ORDER BY a.data_agendamento ASC`,
            [tenantId]
        );
        res.json({ data: rows });
    } catch (err) {
        next(err);
    }
});

// PUT /api/cobranca/agendamentos/:id
router.put('/agendamentos/:id', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const id = parseInt(req.params.id, 10);
        const { concluido } = req.body;
        const { rows } = await db.query(
            `UPDATE dash_cobrancas_agendamentos 
             SET concluido = $1
             WHERE tenant_id = $2 AND id = $3
             RETURNING *`,
            [concluido, tenantId, id]
        );
        res.json({ data: rows[0] });
    } catch (err) {
        next(err);
    }
});

// ------------------------------------------------------------
// 4. MOTOR AUTOMÁTICO (DAILY WORKER JOB)
// ------------------------------------------------------------

// POST /api/cobranca/engine/process
// Roda o Job Manualmente ou simulado
router.post('/engine/process', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        let logsProcesso = [];

        // PASSO 1: Vinculação Automática das Parcelas sem Régua
        // Obtém régua padrão/padrao para o tenant
        const regDefaultRes = await db.query(
            "SELECT id FROM dash_reguas WHERE tenant_id = $1 AND padrao = true LIMIT 1",
            [tenantId]
        );
        const defaultReguaId = regDefaultRes.rows[0]?.id;

        if (!defaultReguaId) {
            return res.status(400).json({ error: 'Nenhuma Régua Padrão configurada para o tenant. Configure uma régua padrão antes de rodar o motor.' });
        }

        // Localiza parcelas pendentes ou atrasadas sem régua
        const parcelasSemRegua = await db.query(
            `SELECT id, valor 
             FROM dash_financeiro 
             WHERE tenant_id = $1 
               AND tipo = 'RECEBER' 
               AND status_pagamento = 'ABERTO' 
               AND regua_id IS NULL`,
            [tenantId]
        );

        logsProcesso.push(`Passo 1: Localizado ${parcelasSemRegua.rowCount} parcelas sem régua.`);

        for (const parc of parcelasSemRegua.rows) {
            // Regra JSON de exemplo: no mundo real, leríamos dash_reguas_condicoes
            // Aqui fazemos fallback para a régua padrão
            await db.query(
                `UPDATE dash_financeiro SET regua_id = $1 WHERE id = $2`,
                [defaultReguaId, parc.id]
            );
        }
        if (parcelasSemRegua.rowCount > 0) {
            logsProcesso.push(`Passo 1: Vinculou ${parcelasSemRegua.rowCount} parcelas à régua padrão (ID: ${defaultReguaId}).`);
        }

        // PASSO 2: Disparo Automático de Mensagens baseado nas Etapas
        const parcelasCobranca = await db.query(
            `SELECT f.id, f.valor, f.data_vencimento, f.regua_id, f.descricao,
                    cl.nome AS cliente_nome, cl.telefone AS cliente_telefone, cl.email AS cliente_email, cl.documento AS cliente_documento,
                    EXTRACT(DAY FROM CURRENT_DATE - f.data_vencimento::date) AS dias_atraso
             FROM dash_financeiro f
             LEFT JOIN dash_clientes cl ON cl.id_firebird = f.cliente_id_firebird AND cl.tenant_id = f.tenant_id
             WHERE f.tenant_id = $1 
               AND f.tipo = 'RECEBER' 
               AND f.status_pagamento = 'ABERTO' 
               AND f.regua_id IS NOT NULL 
               AND f.regua_pausada = false`,
            [tenantId]
        );

        logsProcesso.push(`Passo 2: Avaliando ${parcelasCobranca.rowCount} parcelas com régua ativa.`);

        let disparosRealizados = 0;

        for (const parc of parcelasCobranca.rows) {
            const diasAtraso = parseInt(parc.dias_atraso || 0, 10);
            
            // Busca etapas correspondentes à faixa de atraso específica
            const etapasRes = await db.query(
                `SELECT * FROM dash_reguas_etapas 
                 WHERE regua_id = $1 AND dias_relativos = $2`,
                [parc.regua_id, diasAtraso]
            );

            for (const etapa of etapasRes.rows) {
                // Prevenção de duplicidade: checar se essa etapa específica já foi disparada hoje para esta parcela
                const checkLog = await db.query(
                    `SELECT id FROM dash_cobrancas_logs
                     WHERE financeiro_id = $1 AND etapa_id = $2
                       AND data_envio >= CURRENT_DATE`,
                    [parc.id, etapa.id]
                );

                if (checkLog.rowCount === 0) {
                    // Executa envio simulado / mock
                    const canaisList = (etapa.canais || 'whatsapp').split(',');
                    for (const canal of canaisList) {
                        const cClean = canal.trim().toLowerCase();
                        if (cClean === 'whatsapp' || cClean === 'email') {
                            await db.query(
                                `INSERT INTO dash_cobrancas_logs (tenant_id, financeiro_id, regua_id, etapa_id, canal, status)
                                 VALUES ($1, $2, $3, $4, $5, 'Sucesso')`,
                                [tenantId, parc.id, parc.regua_id, etapa.id, cClean === 'whatsapp' ? 'WhatsApp' : 'E-mail']
                            );
                            disparosRealizados++;
                        }
                    }
                }
            }
        }

        logsProcesso.push(`Passo 2: Job concluído. ${disparosRealizados} comunicações de régua automáticas enviadas.`);

        res.json({
            success: true,
            logs: logsProcesso
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
