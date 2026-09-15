'use strict';

/**
 * cora.js - Rotas da API Banco Cora
 * Nexus ERP | Coliseu Tecnologia e Consultoria Ltda
 */

const express = require('express');
const router = express.Router();
const CoraService = require('../services/CoraService');
const db = require('../db/postgres');
const logger = require('../config/logger');

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/cora/test-connection
// Testa a conexão com o Banco Cora usando as credenciais salvas no banco.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/test-connection', async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        if (!tenantId) return res.status(401).json({ error: 'Tenant não identificado.' });

        const { cora_cert_pem, cora_private_key, cora_client_id } = req.body || {};
        const tempConfig = (cora_cert_pem && cora_private_key) ? {
            cora_cert_pem,
            cora_private_key,
            cora_client_id: cora_client_id || 'int-6niGnUQSRUDauHBRYg0xCP'
        } : null;

        const result = await CoraService.testConnection(tenantId, tempConfig);
        res.json({ success: true, message: 'Conexão com o Banco Cora realizada com sucesso!', data: result });
    } catch (err) {
        logger.error('[Cora] Erro em test-connection', { err: err.message });
        res.status(400).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/cora/emitir-boleto
// Emite um boleto registrado no Banco Cora para um título de dash_financeiro.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/emitir-boleto', async (req, res) => {
    try {
        const tenantId = req.tenant.id;
        const { titleId, vencimento, valor, juros, multa, desconto } = req.body;

        if (!titleId) return res.status(400).json({ error: 'ID do título não informado.' });

        // Busca dados do título e cliente
        const { rows } = await db.query(
            `SELECT f.id, f.id_firebird, f.descricao, f.valor, f.data_vencimento,
                    c.nome AS cliente_nome, c.documento AS cliente_documento,
                    COALESCE(c.email_financeiro, c.email) AS cliente_email,
                    COALESCE(c.celular_secundario, c.telefone) AS cliente_telefone,
                    c.endereco_completo AS cliente_endereco,
                    c.cidade AS cliente_cidade, c.estado AS cliente_estado
             FROM dash_financeiro f
             LEFT JOIN dash_clientes c ON c.id_firebird = f.cliente_id_firebird AND c.tenant_id = f.tenant_id
             WHERE f.id = $1 AND f.tenant_id = $2`,
            [titleId, tenantId]
        );

        if (!rows[0]) return res.status(404).json({ error: 'Título não encontrado.' });
        const titulo = rows[0];

        if (!titulo.cliente_documento) {
            return res.status(400).json({ error: 'Cliente sem CPF/CNPJ cadastrado. Verifique o cadastro do cliente.' });
        }

        const valorCobrar = parseFloat(valor || titulo.valor || 0);
        if (valorCobrar < 5.0) {
            return res.status(400).json({ 
                error: `O Banco Cora exige valor mínimo de R$ 5,00 por boleto (valor atual: R$ ${valorCobrar.toFixed(2)}). Para emitir valores menores utilize o Banco Asaas.` 
            });
        }

        // Busca config do Cora para juros/multa padrão
        const { rows: cfgRows } = await db.query(
            'SELECT cora_juros_padrao, cora_multa_padrao, cora_desconto_padrao FROM dash_integracoes_config WHERE tenant_id = $1',
            [tenantId]
        );
        const cfg = cfgRows[0] || {};

        const result = await CoraService.emitirBoleto(tenantId, {
            cliente: {
                nome: titulo.cliente_nome,
                documento: titulo.cliente_documento,
                email: titulo.cliente_email,
                endereco: titulo.cliente_endereco,
                cidade: titulo.cliente_cidade,
                estado: titulo.cliente_estado
            },
            services: [{
                nome: titulo.descricao || 'Cobrança',
                descricao: titulo.descricao || 'Cobrança via Coliseu Transporte',
                valor: parseFloat(valor || titulo.valor)
            }],
            vencimento: vencimento || (titulo.data_vencimento ? new Date(titulo.data_vencimento).toISOString().split('T')[0] : null),
            juros: parseFloat(juros ?? cfg.cora_juros_padrao ?? 1.0),
            multa: parseFloat(multa ?? cfg.cora_multa_padrao ?? 2.0),
            desconto: parseFloat(desconto ?? cfg.cora_desconto_padrao ?? 0.0)
        });

        // Salva os dados do boleto no título
        const coraId = result.id;
        let bankSlip = result.payment_options?.bank_slip || result.payment_details?.bank_slip || {};
        let pdfUrl = bankSlip.url || bankSlip.pdf_url || result.pdf_url || null;
        let linhaDigitavel = bankSlip.digitable || bankSlip.digitable_line || bankSlip.barcode || null;
        let barCode = bankSlip.barcode || null;
        let nossoNumero = bankSlip.our_number || result.code || coraId;
        let pixEmv = bankSlip.emv || result.payment_options?.pix?.emv || result.pix?.emv || null;

        // Se por algum motivo o POST não retornou o link do PDF/linha digitável/Pix diretamente, consulta a invoice imediatamente
        if ((!pdfUrl || !linhaDigitavel || !pixEmv) && coraId) {
            try {
                const invoiceDetails = await CoraService.consultarBoleto(tenantId, coraId);
                const bs = invoiceDetails?.payment_options?.bank_slip || invoiceDetails?.payment_details?.bank_slip || {};
                pdfUrl = bs.url || bs.pdf_url || invoiceDetails?.pdf_url || pdfUrl;
                linhaDigitavel = bs.digitable || bs.digitable_line || bs.barcode || linhaDigitavel;
                barCode = bs.barcode || barCode;
                nossoNumero = bs.our_number || invoiceDetails?.code || nossoNumero;
                pixEmv = bs.emv || invoiceDetails?.payment_options?.pix?.emv || invoiceDetails?.pix?.emv || pixEmv;
            } catch (errConsult) {
                logger.warn('[Cora] Aviso ao consultar detalhes pós-emissão:', errConsult.message);
            }
        }

        const usuario = (req.user && (req.user.nome || req.user.email)) || 'Operador';

        await db.query(
            `UPDATE dash_financeiro 
             SET asaas_payment_id = $1,
                 bank_slip_url = $2,
                 pdf_url = $3,
                 asaas_bank_slip_url = $4,
                 asaas_linha_digitavel = $5,
                 asaas_bar_code = $6,
                 nosso_numero = $7,
                 portador_nome = 'CORA',
                 status_boleto = 'AGUARDANDO',
                 data_vinculo = NOW(),
                 usuario_vinculo = $8
             WHERE (id = $9 OR id_firebird = $9) AND LOWER(tenant_id::text) = LOWER($10::text)`,
            [coraId, pdfUrl, pdfUrl, pdfUrl, linhaDigitavel, barCode, nossoNumero, usuario, titleId, tenantId]
        );

        // Registra log de auditoria
        await db.query(
            `INSERT INTO dash_financeiro_logs (tenant_id, titulo_id, financeiro_id, tipo_evento, usuario, nosso_numero, numero_documento, descricao, data_evento)
             VALUES ($1::UUID, $2, $3, 'EMISSAO_BOLETO_CORA', $4, $5, $6, $7, NOW())`,
            [
                tenantId,
                titleId,
                titleId,
                usuario,
                nossoNumero,
                nossoNumero,
                `Boleto Banco Cora emitido com sucesso (Nosso N° ${nossoNumero}). Link: ${pdfUrl}`
            ]
        ).catch(() => {});

        const coliseuViewUrl = `/api/cora/boleto/${coraId}?format=html`;

        logger.info('[Cora] Boleto emitido com sucesso', { tenantId, titleId, coraId });
        res.json({
            success: true,
            banco: 'cora',
            boleto: result,
            id: coraId,
            paymentId: coraId,
            nossoNumero: nossoNumero,
            bankSlipUrl: coliseuViewUrl,
            coraBankSlipUrl: pdfUrl,
            coliseuViewUrl: coliseuViewUrl,
            pdf_url: coliseuViewUrl,
            linhaDigitavel: linhaDigitavel,
            barCode: barCode,
            pixCopiaECola: pixEmv
        });

    } catch (err) {
        logger.error('[Cora] Erro ao emitir boleto', { err: err.message });
        res.status(400).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/cora/emitir-pix
// Gera QR Code Pix via Banco Cora.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/emitir-pix', async (req, res) => {
    try {
        const tenantId = req.tenant.id;
        const { titleId, vencimento, valor } = req.body;

        if (!titleId) return res.status(400).json({ error: 'ID do título não informado.' });

        const { rows } = await db.query(
            `SELECT f.id, f.descricao, f.valor, f.data_vencimento,
                    c.nome AS cliente_nome, c.documento AS cliente_documento
             FROM dash_financeiro f
             LEFT JOIN dash_clientes c ON c.id_firebird = f.cliente_id_firebird AND c.tenant_id = f.tenant_id
             WHERE f.id = $1 AND f.tenant_id = $2`,
            [titleId, tenantId]
        );

        if (!rows[0]) return res.status(404).json({ error: 'Título não encontrado.' });
        const titulo = rows[0];

        if (!titulo.cliente_documento) {
            return res.status(400).json({ error: 'Cliente sem CPF/CNPJ cadastrado.' });
        }

        const result = await CoraService.emitirQrCodePix(tenantId, {
            cliente: { nome: titulo.cliente_nome, documento: titulo.cliente_documento },
            services: [{ nome: titulo.descricao || 'Cobrança', descricao: titulo.descricao || 'PIX Coliseu Transporte', valor: parseFloat(valor || titulo.valor) }],
            vencimento: vencimento || (titulo.data_vencimento ? new Date(titulo.data_vencimento).toISOString().split('T')[0] : null)
        });

        res.json({ success: true, qrcode: result });
    } catch (err) {
        logger.error('[Cora] Erro ao emitir PIX', { err: err.message });
        res.status(400).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cora/boleto/:id
// Consulta o status de um boleto pelo ID do Cora ou renderiza no layout Coliseu.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/boleto/:id', async (req, res) => {
    try {
        let tenantId = req.tenant?.id || null;
        const coraId = req.params.id;

        // Busca dados locais do título e cliente
        let titles = [];
        try {
            const { rows } = await db.query(
                `SELECT f.*, 
                        c.nome AS cliente_nome, c.documento AS cliente_documento,
                        c.endereco_completo AS cliente_endereco, c.cidade AS cliente_cidade, c.estado AS cliente_estado
                 FROM dash_financeiro f
                 LEFT JOIN dash_clientes c ON (c.id_firebird = f.cliente_id_firebird OR c.id = f.cliente_id) AND LOWER(c.tenant_id::text) = LOWER(f.tenant_id::text)
                 WHERE (f.asaas_payment_id = $1 OR f.nosso_numero = $1 OR CAST(f.id AS TEXT) = $1 OR CAST(f.id_firebird AS TEXT) = $1 OR f.bank_slip_url LIKE '%' || $1 || '%' OR f.pdf_url LIKE '%' || $1 || '%')
                   AND ($2::text IS NULL OR LOWER(f.tenant_id::text) = LOWER($2::text))
                 ORDER BY f.id DESC
                 LIMIT 1`,
                [coraId, tenantId ? String(tenantId) : null]
            );
            titles = rows || [];
        } catch (dbErr) {
            logger.warn('[Cora] Erro ao buscar título no DB:', dbErr.message);
        }

        if (titles.length > 0 && titles[0].tenant_id) {
            tenantId = titles[0].tenant_id;
        } else if (!tenantId) {
            try {
                const { rows: actRows } = await db.query(
                    `SELECT tenant_id FROM dash_integracoes_config WHERE cora_ativo = true AND cora_cert_pem IS NOT NULL LIMIT 1`
                );
                if (actRows[0]?.tenant_id) {
                    tenantId = actRows[0].tenant_id;
                }
            } catch (_) {}
        }
        if (!tenantId) {
            tenantId = '6ab9b8b2-09b1-4698-aead-bea948a42036'; // Tenant Master Coliseu
        }

        // Busca dados na API da Cora
        let coraResult = null;
        try {
            coraResult = await CoraService.consultarBoleto(tenantId, coraId);
        } catch (e) {
            logger.warn('[Cora] Aviso ao consultar boleto na API:', e.message);
        }

        const titulo = titles[0] || {};
        const bankSlip = coraResult?.payment_options?.bank_slip || coraResult?.payment_details?.bank_slip || {};

        // Extrai o Pix EMV genuíno retornado pelo Banco Cora (NUNCA usar Pix do Asaas aqui)
        const pixEmv = coraResult?.payment_options?.bank_slip?.emv || 
                       bankSlip?.emv || 
                       coraResult?.payment_options?.pix?.emv || 
                       coraResult?.pix?.emv || 
                       coraResult?.payment_details?.bank_slip?.emv || 
                       coraResult?.payment_details?.pix?.emv || 
                       null;

        // Se a requisição pedir PDF (?format=pdf ou terminação .pdf)
        const wantsPdf = req.query.format === 'pdf' || String(coraId).toLowerCase().endsWith('.pdf');
        if (wantsPdf) {
            let empresaCfg = {};
            try {
                const { rows: cfgRows } = await db.query(
                    `SELECT * FROM dash_integracoes_config WHERE LOWER(tenant_id::text) = LOWER($1::text) LIMIT 1`,
                    [tenantId]
                );
                empresaCfg = cfgRows[0] || {};
            } catch (cfgErr) {
                logger.warn('[Cora] Erro ao buscar config da empresa:', cfgErr.message);
            }

            const rawDueDate = coraResult?.payment_terms?.due_date || titulo.data_vencimento || titulo.vencimento;
            const BoletoPdfService = require('../services/BoletoPdfService');
            const pdfBuffer = await BoletoPdfService.gerarBoletoPdf({
                empresa: empresaCfg,
                cliente: {
                    nome: titulo.cliente_nome || coraResult?.customer?.name,
                    documento: titulo.cliente_documento || coraResult?.customer?.document?.identity,
                    endereco_completo: titulo.cliente_endereco || (coraResult?.customer?.address ? `${coraResult.customer.address.street}, ${coraResult.customer.address.number}` : '')
                },
                titulo: {
                    id: titulo.id,
                    id_firebird: titulo.id_firebird,
                    descricao: titulo.descricao,
                    valor: titulo.valor || (coraResult?.total_amount ? coraResult.total_amount / 100 : 0),
                    data_vencimento: rawDueDate,
                    data_emissao: coraResult?.created_at || titulo.data_emissao,
                    multa_percentual: titulo.multa_percentual || coraResult?.payment_terms?.fine?.rate || 2.0,
                    juros_percentual: titulo.juros_percentual || coraResult?.payment_terms?.interest?.rate || 1.0,
                    nosso_numero: bankSlip.our_number || titulo.nosso_numero
                },
                cora: {
                    linhaDigitavel: bankSlip.digitable || bankSlip.digitable_line || titulo.asaas_linha_digitavel,
                    barCode: bankSlip.barcode || titulo.asaas_bar_code,
                    nossoNumero: bankSlip.our_number || titulo.nosso_numero,
                    pdfUrl: bankSlip.url || coraResult?.pdf_url,
                    pixCopiaECola: pixEmv
                }
            });

            res.removeHeader('Content-Security-Policy');
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `inline; filename="boleto_${bankSlip.our_number || titulo.nosso_numero || coraId}.pdf"`);
            return res.send(pdfBuffer);
        }

        // Se a requisição pedir HTML (navegador) ou query ?format=html / ?view=coliseu
        const wantsHtml = req.query.format === 'html' || req.query.view === 'coliseu' || 
                          (req.headers.accept && req.headers.accept.includes('text/html') && req.query.format !== 'json');

        if (wantsHtml) {
            // Busca dados da empresa para cabeçalho
            let empresaCfg = {};
            try {
                const { rows: cfgRows } = await db.query(
                    `SELECT * FROM dash_integracoes_config WHERE LOWER(tenant_id::text) = LOWER($1::text) LIMIT 1`,
                    [tenantId]
                );
                empresaCfg = cfgRows[0] || {};
            } catch (cfgErr) {
                logger.warn('[Cora] Erro ao buscar config da empresa:', cfgErr.message);
            }

            const rawDueDate = coraResult?.payment_terms?.due_date || titulo.data_vencimento || titulo.vencimento;

            const html = CoraService.renderColiseuBoletoHtml({
                empresa: empresaCfg,
                cliente: {
                    nome: titulo.cliente_nome || coraResult?.customer?.name,
                    documento: titulo.cliente_documento || coraResult?.customer?.document?.identity,
                    endereco_completo: titulo.cliente_endereco || (coraResult?.customer?.address ? `${coraResult.customer.address.street}, ${coraResult.customer.address.number}` : '')
                },
                titulo: {
                    id: titulo.id,
                    id_firebird: titulo.id_firebird,
                    descricao: titulo.descricao,
                    valor: titulo.valor || (coraResult?.total_amount ? coraResult.total_amount / 100 : 0),
                    data_vencimento: rawDueDate,
                    data_emissao: coraResult?.created_at || titulo.data_emissao,
                    multa_percentual: titulo.multa_percentual || coraResult?.payment_terms?.fine?.rate || 2.0,
                    juros_percentual: titulo.juros_percentual || coraResult?.payment_terms?.interest?.rate || 1.0,
                    nosso_numero: bankSlip.our_number || titulo.nosso_numero
                },
                cora: {
                    linhaDigitavel: bankSlip.digitable || bankSlip.digitable_line || titulo.asaas_linha_digitavel,
                    barCode: bankSlip.barcode || titulo.asaas_bar_code,
                    nossoNumero: bankSlip.our_number || titulo.nosso_numero,
                    pdfUrl: bankSlip.url || coraResult?.pdf_url,
                    pixCopiaECola: pixEmv
                }
            });

            res.removeHeader('Content-Security-Policy');
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.send(html);
        }

        const coliseuViewUrl = `/api/cora/boleto/${coraId}?format=html`;
        const coliseuPdfUrl = `/api/cora/boleto/${coraId}?format=pdf`;

        res.json({
            ...coraResult,
            coliseuViewUrl,
            coliseu_view_url: coliseuViewUrl,
            coliseuPdfUrl,
            coliseu_pdf_url: coliseuPdfUrl,
            linhaDigitavel: bankSlip.digitable || bankSlip.digitable_line || titulo.asaas_linha_digitavel,
            barCode: bankSlip.barcode || titulo.asaas_bar_code,
            nossoNumero: bankSlip.our_number || titulo.nosso_numero,
            pixCopiaECola: pixEmv
        });
    } catch (err) {
        logger.error('[Cora] Erro na rota GET /boleto/:id', { error: err.message });
        res.status(400).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/cora/boleto/:id
// Cancela um boleto emitido pelo ID do Cora e limpa vínculo no sistema.
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/boleto/:id', async (req, res) => {
    try {
        let tenantId = req.tenant?.id;
        if (!tenantId) {
            try {
                const { rows: actRows } = await db.query(
                    `SELECT tenant_id FROM dash_integracoes_config WHERE cora_ativo = true AND cora_cert_pem IS NOT NULL LIMIT 1`
                );
                if (actRows[0]?.tenant_id) {
                    tenantId = actRows[0].tenant_id;
                }
            } catch (_) {}
        }
        if (!tenantId) tenantId = '6ab9b8b2-09b1-4698-aead-bea948a42036';

        const result = await CoraService.cancelarBoleto(tenantId, req.params.id);

        // Atualiza status e limpa vínculos do boleto cancelado no banco local
        await db.query(
            `UPDATE dash_financeiro 
             SET status_boleto = 'CANCELADO',
                 nosso_numero = NULL,
                 bank_slip_url = NULL,
                 pdf_url = NULL,
                 asaas_bank_slip_url = NULL,
                 asaas_linha_digitavel = NULL,
                 asaas_bar_code = NULL,
                 portador_nome = 'CARTEIRA'
             WHERE (asaas_payment_id = $1 OR CAST(id AS TEXT) = $1 OR CAST(id_firebird AS TEXT) = $1)
               AND ($2::text IS NULL OR LOWER(tenant_id::text) = LOWER($2::text))`,
            [req.params.id, tenantId]
        ).catch(() => {});

        res.json({ success: true, message: 'Boleto Cora cancelado com sucesso no banco e no Coliseu Transporte.', data: result });
    } catch (err) {
        logger.error('[Cora] Erro ao cancelar boleto:', err.message);
        res.status(400).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cora/auditar-boletos
// Lista todos os boletos emitidos via Cora para conferência de Pix e status
// ─────────────────────────────────────────────────────────────────────────────
router.get('/auditar-boletos', async (req, res) => {
    try {
        let tenantId = req.tenant?.id;
        if (!tenantId) {
            try {
                const { rows: actRows } = await db.query(
                    `SELECT tenant_id FROM dash_integracoes_config WHERE cora_ativo = true AND cora_cert_pem IS NOT NULL LIMIT 1`
                );
                if (actRows[0]?.tenant_id) {
                    tenantId = actRows[0].tenant_id;
                }
            } catch (_) {}
        }
        if (!tenantId) tenantId = '6ab9b8b2-09b1-4698-aead-bea948a42036';

        const { rows } = await db.query(
            `SELECT f.id, f.id_firebird, f.descricao, f.valor, f.data_vencimento, f.data_emissao,
                    f.status_pagamento, f.status_boleto, f.asaas_payment_id, f.nosso_numero,
                    f.portador_nome, f.bank_slip_url, f.pdf_url,
                    c.nome AS cliente_nome, c.documento AS cliente_documento
             FROM dash_financeiro f
             LEFT JOIN dash_clientes c ON (c.id_firebird = f.cliente_id_firebird OR c.id = f.cliente_id) AND LOWER(c.tenant_id::text) = LOWER(f.tenant_id::text)
             WHERE (UPPER(f.portador_nome) = 'CORA' OR f.asaas_payment_id LIKE 'inv_%')
               AND ($1::text IS NULL OR LOWER(f.tenant_id::text) = LOWER($1::text))
             ORDER BY f.id DESC
             LIMIT 100`,
            [tenantId]
        );

        res.json({
            success: true,
            total: rows.length,
            boletos: rows.map(t => ({
                id: t.id,
                id_firebird: t.id_firebird,
                cliente: t.cliente_nome,
                documento: t.cliente_documento,
                descricao: t.descricao,
                valor: parseFloat(t.valor || 0),
                vencimento: t.data_vencimento,
                nosso_numero: t.nosso_numero,
                cora_id: t.asaas_payment_id,
                status_nexus: t.status_boleto || t.status_pagamento,
                view_url: `/api/cora/boleto/${t.asaas_payment_id || t.id}?format=html`
            }))
        });
    } catch (err) {
        logger.error('[Cora] Erro ao auditar boletos', { err: err.message });
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cora/extrato
// Consulta extrato/transações com paginação.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/extrato', async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        if (!tenantId) return res.status(401).json({ error: 'Tenant não identificado.' });

        const { startDate, endDate, type, transactionType, page, perPage } = req.query;

        const result = await CoraService.consultarExtrato(tenantId, {
            startDate, endDate, type, transactionType,
            page: page ? parseInt(page) : 0,
            perPage: perPage ? parseInt(perPage) : 100
        });

        res.json(result);
    } catch (err) {
        logger.error('[Cora] Erro ao consultar extrato', { err: err.message });
        res.json({
            success: true,
            banco: 'cora',
            saldo_atual: 0,
            totalCount: 0,
            transactions: [],
            warning: err.message
        });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cora/saldo
// Consulta saldo atual em tempo real da conta Banco Cora.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/saldo', async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        if (!tenantId) return res.status(401).json({ error: 'Tenant não identificado.' });

        const result = await CoraService.consultarSaldo(tenantId);
        res.json(result);
    } catch (err) {
        logger.error('[Cora] Erro ao consultar saldo', { err: err.message });
        res.status(400).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/cora/pagar-boleto
// Inicia o pagamento de um boleto via linha digitável.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/pagar-boleto', async (req, res) => {
    try {
        const tenantId = req.tenant.id;
        const { digitable_line, scheduled_at } = req.body;

        if (!digitable_line) return res.status(400).json({ error: 'Linha digitável não informada.' });

        const result = await CoraService.pagarBoleto(tenantId, digitable_line, scheduled_at || null);
        res.json({ success: true, payment: result });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/cora/registrar-webhook
// Registra o endpoint de webhook do Coliseu Transporte no Banco Cora.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/registrar-webhook', async (req, res) => {
    try {
        const tenantId = req.tenant.id;
        const { webhook_url, cora_cert_pem, cora_private_key, cora_client_id } = req.body || {};

        const tempConfig = (cora_cert_pem && cora_private_key) ? {
            cora_cert_pem,
            cora_private_key,
            cora_client_id: cora_client_id || 'int-6niGnUQSRUDauHBRYg0xCP'
        } : null;

        const url = webhook_url || `https://transporte.coliseusistemas.com.br/api/webhooks/cora/webhook-receive`;
        const result = await CoraService.registrarWebhook(tenantId, url, tempConfig);

        res.json({ success: true, webhook: result });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/cora/sincronizar
// Sincroniza faturas e baixas do Banco Cora manualmente.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/sincronizar', async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        if (!tenantId) return res.status(401).json({ error: 'Tenant não identificado.' });

        const result = await CoraService.sincronizarFaturasCora(tenantId);
        res.json({
            success: true,
            message: `${result.conciliados || 0} boleto(s) Cora conciliado(s) e baixado(s) com sucesso!`,
            ...result
        });
    } catch (err) {
        logger.error('[Cora] Erro ao sincronizar faturas:', { err: err.message });
        res.status(400).json({ error: err.message });
    }
});

router.get('/sincronizar', async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        if (!tenantId) return res.status(401).json({ error: 'Tenant não identificado.' });

        const result = await CoraService.sincronizarFaturasCora(tenantId);
        res.json({
            success: true,
            message: `${result.conciliados || 0} boleto(s) Cora conciliado(s) e baixado(s) com sucesso!`,
            ...result
        });
    } catch (err) {
        logger.error('[Cora] Erro ao sincronizar faturas:', { err: err.message });
        res.status(400).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/webhooks/cora (ROTA PÚBLICA - Recebe notificações do Banco Cora)
// Suporta '/', '/webhook' e '/webhook-receive'
// ─────────────────────────────────────────────────────────────────────────────
const handleCoraWebhookHttp = async (req, res) => {
    try {
        const eventId = req.headers['webhook-event-id'] || req.body?.event_id || req.body?.id || req.body?.eventId;
        const eventType = req.headers['webhook-event-type'] || req.body?.event_type || req.body?.event || req.body?.type;
        const resourceId = req.headers['webhook-resource-id'] || req.body?.resource_id || req.body?.data?.id || req.body?.id;

        logger.info('[Cora Webhook] Recebido', { eventId, eventType, resourceId, body: req.body });

        // Responde 200 imediatamente para o Cora não dar timeout
        res.status(200).json({ received: true });

        // Processa em background
        setImmediate(async () => {
            try {
                await CoraService.processarEventoWebhook({
                    eventId,
                    eventType,
                    resourceId,
                    body: req.body
                });
            } catch (bgErr) {
                logger.error('[Cora Webhook] Erro no processamento background', { err: bgErr.message });
            }
        });

    } catch (err) {
        logger.error('[Cora Webhook] Erro ao processar webhook', { err: err.message });
        res.status(500).json({ error: 'Erro interno' });
    }
};

router.post('/', handleCoraWebhookHttp);
router.post('/webhook', handleCoraWebhookHttp);
router.post('/webhook-receive', handleCoraWebhookHttp);

module.exports = router;
