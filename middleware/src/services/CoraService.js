'use strict';

/**
 * CoraService.js - Banco Cora API Integration
 * Produção: https://matls-clients.api.cora.com.br/
 * Client ID: int-6niGnUQSRUDauHBRYg0xCP
 * Titular: Coliseu Tecnologia e Consultoria Ltda
 * Agência: 0001 | Conta: 7264541-2
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const db = require('../db/postgres');
const logger = require('../config/logger');

// Cache da logo oficial Coliseu em base64 para garantir carregamento instantâneo e offline/impressão
let COLISEU_LOGO_BASE64 = '';
try {
    const candidatePaths = [
        path.resolve(__dirname, '../../../frontend/public/logo-nexus.png'),
        path.resolve(__dirname, '../../frontend/public/logo-nexus.png'),
        '/app/frontend/public/logo-nexus.png',
        '/app/public/logo-nexus.png'
    ];
    for (const p of candidatePaths) {
        if (fs.existsSync(p)) {
            COLISEU_LOGO_BASE64 = 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
            break;
        }
    }
} catch (e) {
    // Silencioso se não encontrar no path local
}

const CORA_BASE_URL = 'https://matls-clients.api.cora.com.br';
const CORA_TOKEN_URL = 'https://matls-clients.api.cora.com.br/token';
const CORA_CLIENT_ID = 'int-6niGnUQSRUDauHBRYg0xCP';

// Cache em memória para o token Cora (evita rate limit 429 e consultas excessivas)
const _coraTokenCache = new Map();
const _coraInFlightPromises = new Map();

class CoraService {

    /**
     * Busca a configuração do Cora para um tenant.
     */
    async getConfig(tenantId) {
        const { rows } = await db.query(
            `SELECT cora_ativo, cora_client_id, cora_cert_pem, cora_private_key,
                    cora_juros_padrao, cora_multa_padrao, cora_desconto_padrao,
                    cora_webhook_url, cora_token_cache, cora_token_expires_at
             FROM dash_integracoes_config WHERE tenant_id = $1`,
            [tenantId]
        );
        if (!rows[0]) throw new Error('Configuração do Banco Cora não encontrada para este tenant.');
        return rows[0];
    }

    /**
     * Cria um agente HTTPS com mTLS usando cert e private key do banco.
     */
    _createMtlsAgent(certPem, privateKey) {
        return new https.Agent({
            cert: certPem,
            key: privateKey,
            rejectUnauthorized: true
        });
    }

    /**
     * Obtém o Bearer token via Client Credentials + mTLS.
     * Token é cacheado por 23h no banco de dados.
     */
    async getToken(tenantId, explicitConfig = null) {
        const now = Date.now();

        // 1. Verifica cache em memória (se tiver pelo menos 2 minutos de validade restante)
        if (!explicitConfig && _coraTokenCache.has(tenantId)) {
            const cached = _coraTokenCache.get(tenantId);
            if (cached && cached.expiresAtMs > now + 120000) {
                return cached.token;
            }
        }

        const cfg = explicitConfig || await this.getConfig(tenantId);

        if (!cfg.cora_cert_pem || !cfg.cora_private_key) {
            throw new Error('Certificado e chave privada do Banco Cora não configurados. Acesse Configurações > Módulos & APIs > Banco Cora.');
        }

        // 2. Verifica cache persistido no banco (se tiver pelo menos 2 minutos de validade restante)
        if (!explicitConfig && cfg.cora_token_cache && cfg.cora_token_expires_at) {
            const dbExpiresAtMs = new Date(cfg.cora_token_expires_at).getTime();
            if (dbExpiresAtMs > now + 120000) {
                _coraTokenCache.set(tenantId, {
                    token: cfg.cora_token_cache,
                    expiresAtMs: dbExpiresAtMs
                });
                return cfg.cora_token_cache;
            }
        }

        // 3. Reutiliza requisição de token em andamento para evitar chamadas concorrentes
        if (!explicitConfig && _coraInFlightPromises.has(tenantId)) {
            return await _coraInFlightPromises.get(tenantId);
        }

        const fetchTokenPromise = (async () => {
            const clientId = cfg.cora_client_id || CORA_CLIENT_ID;
            const agent = this._createMtlsAgent(cfg.cora_cert_pem, cfg.cora_private_key);

            const body = new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: clientId
            }).toString();

            const axios = require('axios');
            const response = await axios.post(CORA_TOKEN_URL, body, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                httpsAgent: agent
            }).catch(err => {
                const status = err.response?.status || 'Unknown';
                const detail = typeof err.response?.data === 'object' ? JSON.stringify(err.response.data) : (err.response?.data || err.message);
                throw new Error(`Cora Auth Error ${status}: ${detail}`);
            });

            const data = response.data;
            const token = data.access_token;
            // Cora retorna expires_in em segundos (ex: 3600 para 1 hora)
            const expiresInSeconds = parseInt(data.expires_in, 10) || 3600;
            // Margem preventiva de 5 minutos (ou 1 minuto se o token for curto)
            const marginSeconds = expiresInSeconds > 600 ? 300 : 60;
            const validDurationMs = Math.max(60, expiresInSeconds - marginSeconds) * 1000;
            const expiresAtMs = Date.now() + validDurationMs;
            const expiresAt = new Date(expiresAtMs);

            // Salva em memória
            _coraTokenCache.set(tenantId, {
                token,
                expiresAtMs
            });

            // Salva no banco de dados se não for teste avulso
            if (!explicitConfig) {
                await db.query(
                    `UPDATE dash_integracoes_config SET cora_token_cache = $1, cora_token_expires_at = $2 WHERE tenant_id = $3`,
                    [token, expiresAt.toISOString(), tenantId]
                ).catch(dbErr => {
                    logger.warn('[CoraService] Aviso ao salvar cache do token no banco:', dbErr.message);
                });
            }

            logger.info('[CoraService] Token renovado com sucesso', { tenantId, expiresAt: expiresAt.toISOString(), expiresInSeconds });
            return token;
        })();

        if (!explicitConfig) {
            _coraInFlightPromises.set(tenantId, fetchTokenPromise);
        }

        try {
            return await fetchTokenPromise;
        } finally {
            if (!explicitConfig) {
                _coraInFlightPromises.delete(tenantId);
            }
        }
    }

    /**
     * Faz requisição autenticada para a API do Cora.
     */
    async _request(tenantId, method, path, body = null, extraHeaders = {}, explicitConfig = null) {
        const cfg = explicitConfig || await this.getConfig(tenantId);
        const token = await this.getToken(tenantId, explicitConfig);
        const agent = this._createMtlsAgent(cfg.cora_cert_pem, cfg.cora_private_key);

        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...extraHeaders
        };

        if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
            headers['Idempotency-Key'] = randomUUID();
        }

        const url = `${CORA_BASE_URL}${path}`;
        const axios = require('axios');
        const response = await axios({
            url,
            method,
            headers,
            data: body,
            httpsAgent: agent,
            validateStatus: () => true
        });

        const responseData = response.data;

        // Se o token for rejeitado pela API (401), invalida o cache e tenta novamente uma única vez
        if (response.status === 401 && !extraHeaders._retried) {
            logger.warn('[CoraService] Token rejeitado pela API Cora (401). Invalidando cache e tentando novamente...', { tenantId });
            _coraTokenCache.delete(tenantId);
            await db.query(
                `UPDATE dash_integracoes_config SET cora_token_cache = NULL, cora_token_expires_at = NULL WHERE tenant_id = $1`,
                [tenantId]
            ).catch(() => {});
            return await this._request(tenantId, method, path, body, { ...extraHeaders, _retried: true }, explicitConfig);
        }

        if (response.status < 200 || response.status >= 300) {
            logger.error('[CoraService] Erro na requisição', { method, path, status: response.status, body: responseData });
            let errorMsg = `HTTP ${response.status}`;
            if (typeof responseData === 'object' && responseData !== null) {
                if (responseData.errors && Array.isArray(responseData.errors)) {
                    errorMsg = responseData.errors.map(e => e.message || e.field || JSON.stringify(e)).join(' | ');
                } else if (responseData.message) {
                    errorMsg = responseData.message;
                    if (responseData.errors) errorMsg += `: ${JSON.stringify(responseData.errors)}`;
                } else if (responseData.error) {
                    errorMsg = typeof responseData.error === 'string' ? responseData.error : JSON.stringify(responseData.error);
                } else {
                    errorMsg = JSON.stringify(responseData);
                }
            } else if (responseData) {
                errorMsg = String(responseData);
            }
            throw new Error(`Cora API Error ${response.status}: ${errorMsg}`);
        }

        return responseData;
    }

    /**
     * Testa a conexão com o Banco Cora (valida autenticação mTLS e permissão da API).
     */
    async testConnection(tenantId, explicitConfig = null) {
        // Testa consulta de faturas na API Cora mTLS
        const data = await this._request(tenantId, 'GET', '/v2/invoices?perPage=1', null, {}, explicitConfig);
        return {
            success: true,
            conta: '7264541-2',
            agencia: '0001',
            titular: 'Coliseu Tecnologia e Consultoria Ltda',
            raw: data
        };
    }

    /**
     * Emite um boleto registrado no Banco Cora.
     * @param {string} tenantId
     * @param {Object} opts - { cliente, services, vencimento, juros, multa, desconto }
     */
    async emitirBoleto(tenantId, opts) {
        const { cliente, services, vencimento, juros, multa, desconto, notification } = opts;

        const dueDateStr = vencimento ? String(vencimento).split('T')[0] : new Date().toISOString().split('T')[0];
        const valorCentavos = Math.round(parseFloat(services[0]?.valor || 0) * 100);

        const paymentTerms = {
            due_date: dueDateStr
        };

        const multaNum = multa !== undefined && multa !== null ? parseFloat(multa) : 2.0;
        if (multaNum > 0) {
            paymentTerms.fine = {
                rate: parseFloat(multaNum.toFixed(2))
            };
        }

        const jurosNum = juros !== undefined && juros !== null ? parseFloat(juros) : 1.0;
        if (jurosNum > 0) {
            paymentTerms.interest = {
                rate: parseFloat(jurosNum.toFixed(2))
            };
        }

        const descontoNum = desconto !== undefined && desconto !== null ? parseFloat(desconto) : 0.0;
        if (descontoNum > 0) {
            paymentTerms.discount = {
                type: 'PERCENT',
                value: parseFloat(descontoNum.toFixed(2))
            };
        }

        const cleanDoc = (cliente.documento || '').replace(/\D/g, '');
        const cleanCep = (cliente.cep || '79000000').replace(/\D/g, '');

        // Sanitiza e-mail: extrai apenas o primeiro e-mail estritamente válido se houver múltiplos separados por ';' ou ',' ou espaço
        let sanitizedEmail = undefined;
        if (cliente.email && typeof cliente.email === 'string') {
            const parts = cliente.email.split(/[;,\s\/]+/).map(p => p.trim()).filter(Boolean);
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            const found = parts.find(p => emailRegex.test(p));
            if (found) {
                sanitizedEmail = found.toLowerCase();
            }
        }

        const payload = {
            code: `NEXUS-${Date.now()}`.substring(0, 30),
            customer: {
                name: String(cliente.nome || 'Cliente').substring(0, 100),
                ...(sanitizedEmail ? { email: sanitizedEmail } : {}),
                document: {
                    identity: cleanDoc,
                    type: cleanDoc.length === 11 ? 'CPF' : 'CNPJ'
                },
                address: {
                    street: String(cliente.endereco || 'Rua Principal').substring(0, 100),
                    number: String(cliente.numero || 'SN').substring(0, 20),
                    district: String(cliente.bairro || 'Centro').substring(0, 50),
                    city: String(cliente.cidade || 'Campo Grande').substring(0, 50),
                    state: String(cliente.estado || 'MS').substring(0, 2).toUpperCase(),
                    zip_code: cleanCep.length === 8 ? cleanCep : '79000000'
                }
            },
            services: services.map(s => ({
                name: String(s.nome || 'Cobrança').substring(0, 50),
                description: String(s.descricao || s.nome || 'Cobrança via Nexus ERP').substring(0, 100),
                amount: Math.round(parseFloat(s.valor || 0) * 100)
            })),
            payment_terms: paymentTerms,
            payment_forms: ['BANK_SLIP', 'PIX'],
            ...(notification ? { notification } : {})
        };

        logger.info('[CoraService] Enviando payload emitirBoleto:', {
            code: payload.code,
            doc: cleanDoc,
            valorCentavos,
            due_date: dueDateStr,
            terms: paymentTerms
        });

        return await this._request(tenantId, 'POST', '/v2/invoices', payload);
    }

    /**
     * Gera QR Code Pix via Banco Cora.
     */
    async emitirQrCodePix(tenantId, opts) {
        const { cliente, services, vencimento } = opts;

        const payload = {
            customer: {
                name: cliente.nome,
                document: { identity: cliente.documento.replace(/\D/g, ''), type: cliente.documento.replace(/\D/g, '').length === 11 ? 'CPF' : 'CNPJ' }
            },
            services: services.map(s => ({
                name: s.nome,
                description: (s.descricao || s.nome).substring(0, 100),
                amount: Math.round(parseFloat(s.valor) * 100)
            })),
            payment_terms: { due_date: vencimento }
        };

        return await this._request(tenantId, 'POST', '/v2/qr-codes', payload);
    }

    /**
     * Consulta o status de um boleto.
     */
    async consultarBoleto(tenantId, id) {
        return await this._request(tenantId, 'GET', `/v2/invoices/${id}`);
    }

    /**
     * Cancela um boleto emitido.
     */
    async cancelarBoleto(tenantId, id) {
        return await this._request(tenantId, 'DELETE', `/v2/invoices/${id}`);
    }

    /**
     * Consulta o saldo em tempo real da conta Banco Cora via endpoint oficial.
     * Endpoint: GET /third-party/account/balance
     */
    async consultarSaldo(tenantId, explicitConfig = null) {
        try {
            const data = await this._request(tenantId, 'GET', '/third-party/account/balance', null, {}, explicitConfig);
            const balanceCents = data?.balance ?? 0;
            const blockedCents = data?.blockedBalance ?? 0;
            return {
                success: true,
                saldo_atual: balanceCents / 100,
                saldo_bloqueado: blockedCents / 100,
                raw: data
            };
        } catch (err) {
            logger.warn('[CoraService] Falha ao obter saldo via /third-party/account/balance', { message: err.message });
            return { success: false, saldo_atual: null, error: err.message };
        }
    }

    /**
     * Consulta extrato e transações oficiais da conta Banco Cora.
     * Endpoint oficial: GET /bank-statement/statement?start=YYYY-MM-DD&end=YYYY-MM-DD
     * Saldo em tempo real: GET /third-party/account/balance
     * @param {string} tenantId
     * @param {Object} params - { startDate, endDate, type, page, perPage }
     */
    async consultarExtrato(tenantId, params = {}) {
        const { startDate, endDate, type, page, perPage } = params;

        let rawEntries = [];
        let saldoAtual = null;
        let aggregations = null;
        let rawData = null;

        // 1. Busca primeiro o saldo oficial em tempo real da conta
        try {
            const balanceRes = await this.consultarSaldo(tenantId);
            if (balanceRes.success && balanceRes.saldo_atual !== null) {
                saldoAtual = balanceRes.saldo_atual;
            }
        } catch (bErr) {
            logger.warn('[CoraService] Não foi possível consultar saldo prévio', { message: bErr.message });
        }

        // 2. Consulta o extrato oficial via /bank-statement/statement
        try {
            const qs = new URLSearchParams();
            if (startDate) qs.set('start', startDate);
            if (endDate) qs.set('end', endDate);
            if (page) qs.set('page', page);
            if (perPage) qs.set('perPage', perPage);

            const queryStr = qs.toString() ? `?${qs.toString()}` : '';
            const data = await this._request(tenantId, 'GET', `/bank-statement/statement${queryStr}`);
            rawData = data;

            if (Array.isArray(data?.entries)) {
                rawEntries = data.entries.map(entry => {
                    const isCredit = entry.type === 'CREDIT';
                    const valorReais = (entry.amount || 0) / 100;
                    const dt = entry.createdAt ? entry.createdAt.split('T')[0] : '';
                    const tx = entry.transaction || {};
                    const counterParty = tx.counterParty?.name || '';
                    const txType = tx.type || 'TRANSACAO';

                    let desc = tx.description || '';
                    if (!desc) {
                        desc = isCredit ? `Recebimento ${txType}` : `Pagamento ${txType}`;
                    }
                    const fullDesc = counterParty ? `${desc} - ${counterParty}` : desc;

                    return {
                        id: entry.id || tx.id,
                        date: dt,
                        value: isCredit ? valorReais : -valorReais,
                        type: entry.type, // 'CREDIT' | 'DEBIT'
                        description: fullDesc,
                        cliente_nome: counterParty || undefined,
                        numero_fatura: tx.id || entry.id,
                        paymentId: tx.id || entry.id,
                        balance: null,
                        status: 'CONFIRMED',
                        category: txType,
                        conciliado: false,
                        titulo_local: null,
                        banco: 'cora'
                    };
                });

                if (saldoAtual === null && data.end?.balance !== undefined) {
                    saldoAtual = data.end.balance / 100;
                }
                aggregations = data.aggregations || null;
            }
        } catch (err) {
            logger.warn('[CoraService] /bank-statement/statement falhou, tentando fallback', { message: err.message });

            // Fallback: consulta faturas/invoices
            try {
                const invoicesData = await this._request(tenantId, 'GET', '/v2/invoices?perPage=50');
                rawData = invoicesData;
                const items = Array.isArray(invoicesData?.items) ? invoicesData.items : [];

                rawEntries = items.map(inv => {
                    const amountCents = inv.total_amount || (inv.services || []).reduce((sum, s) => sum + (s.amount || 0), 0) || 0;
                    const valorReais = amountCents / 100;
                    const dt = inv.payment_terms?.due_date || (inv.created_at ? inv.created_at.split('T')[0] : '');
                    const isPaid = inv.status === 'PAID';
                    const customerName = inv.customer?.name || '';
                    const serviceName = inv.services?.[0]?.name || 'Cobrança';

                    return {
                        id: inv.id || inv.code,
                        date: dt,
                        value: valorReais,
                        type: 'CREDIT',
                        description: `Boleto/Pix Cora - ${serviceName} (${customerName})`,
                        cliente_nome: customerName || undefined,
                        numero_fatura: inv.code || inv.id,
                        paymentId: inv.id,
                        balance: null,
                        status: isPaid ? 'CONFIRMED' : inv.status || 'PENDING',
                        category: 'BOLETO_CORA',
                        conciliado: false,
                        titulo_local: null,
                        banco: 'cora'
                    };
                });
            } catch (invErr) {
                logger.error('[CoraService] Falha no fallback de invoices Cora', { message: invErr.message });
            }
        }

        if (saldoAtual === null) saldoAtual = 0;

        // Filtra por tipo se solicitado
        const transactions = rawEntries.filter(tx => {
            if (type && type !== 'ALL') {
                return tx.type === type;
            }
            return true;
        });

        return {
            success: true,
            banco: 'cora',
            saldo_atual: saldoAtual,
            totalCount: transactions.length,
            transactions,
            aggregations,
            raw: rawData || { entries: [] }
        };
    }

    /**
     * Pagamento de boleto via linha digitável.
     */
    async pagarBoleto(tenantId, digitableLine, scheduledAt = null) {
        const payload = { digitable_line: digitableLine };
        if (scheduledAt) payload.scheduled_at = scheduledAt;
        return await this._request(tenantId, 'POST', '/v2/payments', payload);
    }

    /**
     * Registra ou atualiza o webhook (endpoint) no Banco Cora.
     */
    async registrarWebhook(tenantId, webhookUrl, explicitConfig = null) {
        // Verifica endpoints já registrados
        const endpoints = await this._request(tenantId, 'GET', '/endpoints', null, {}, explicitConfig).catch(() => []);
        const existing = Array.isArray(endpoints) ? endpoints.find(e => e.url === webhookUrl) : null;
        if (existing) {
            return existing;
        }

        const payload = {
            url: webhookUrl,
            resource: 'invoices',
            trigger: '*'
        };
        return await this._request(tenantId, 'POST', '/endpoints', payload, {}, explicitConfig);
    }

    /**
     * Lista faturas do Banco Cora via API v2.
     * Endpoint: GET /v2/invoices?page=1&perPage=100
     */
    async listarFaturas(tenantId, params = {}) {
        const qs = new URLSearchParams();
        if (params.page) qs.set('page', params.page);
        qs.set('perPage', String(params.perPage || 100));
        if (params.status) qs.set('status', params.status);

        const queryStr = qs.toString() ? `?${qs.toString()}` : '';
        const data = await this._request(tenantId, 'GET', `/v2/invoices${queryStr}`);
        const items = Array.isArray(data?.items) ? data.items : (Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []));
        return {
            items,
            total: data?.total || items.length,
            raw: data
        };
    }

    /**
     * Sincroniza faturas e quitações do Banco Cora para a tesouraria do Nexus.
     * Identifica cobranças pagas (PAID), canceladas (CANCELED) ou vencidas (OVERDUE),
     * atualiza o dash_financeiro e enfileira em pending_payments para baixa no ERP Coliseu (Firebird).
     */
    async sincronizarFaturasCora(tenantId, options = {}) {
        try {
            const cfg = await this.getConfig(tenantId).catch(() => null);
            if (!cfg || !cfg.cora_ativo || !cfg.cora_cert_pem || !cfg.cora_private_key) {
                return { success: false, reason: 'Banco Cora não configurado ou inativo para este tenant.' };
            }

            logger.info('[CoraSync] Sincronizando faturas Cora com a tesouraria Coliseu Transporte...', { tenantId });

            // Auto-registro preventivo do webhook se ainda não registrado
            try {
                const targetWebhookUrl = cfg.cora_webhook_url || 'https://transporte.coliseusistemas.com.br/api/webhooks/cora/webhook-receive';
                this.registrarWebhook(tenantId, targetWebhookUrl).catch(() => {});
            } catch (_) {}

            // Busca faturas recentes na API do Cora paginadas (até 5 páginas de 100 = 500 faturas mais recentes)
            const invoicesMap = new Map();

            // 1. Busca faturas gerais paginadas
            for (let p = 1; p <= 5; p++) {
                try {
                    const resGeral = await this.listarFaturas(tenantId, { page: p, perPage: 100 });
                    const items = resGeral.items || [];
                    if (items.length === 0) break;
                    items.forEach(inv => {
                        if (inv && inv.id) invoicesMap.set(inv.id, inv);
                    });
                    if (items.length < 100) break;
                } catch (errGeral) {
                    logger.warn(`[CoraSync] Aviso ao listar faturas gerais Cora página ${p}:`, errGeral.message);
                    break;
                }
            }

            // 2. Busca faturas expressamente com status PAID para garantir todas as quitações
            for (let p = 1; p <= 3; p++) {
                try {
                    const resPaid = await this.listarFaturas(tenantId, { status: 'PAID', page: p, perPage: 100 });
                    const items = resPaid.items || [];
                    if (items.length === 0) break;
                    items.forEach(inv => {
                        if (inv && inv.id) invoicesMap.set(inv.id, inv);
                    });
                    if (items.length < 100) break;
                } catch (errPaid) {
                    logger.warn(`[CoraSync] Aviso ao filtrar status=PAID página ${p}:`, errPaid.message);
                    break;
                }
            }

            const allInvoices = Array.from(invoicesMap.values());
            if (allInvoices.length === 0) {
                logger.info('[CoraSync] Nenhuma fatura retornada pela API Cora.', { tenantId });
                return { success: true, totalInvoices: 0, conciliados: 0, detalhes: [] };
            }

            let conciliados = 0;
            const detalhes = [];

            for (const inv of allInvoices) {
                const coraId = inv.id;
                const status = (inv.status || '').toUpperCase();
                const amountCents = inv.total_amount || (inv.services || []).reduce((sum, s) => sum + (s.amount || 0), 0) || 0;
                const valorReais = amountCents / 100;
                const bankSlip = inv.payment_options?.bank_slip || inv.payment_details?.bank_slip || {};
                const nossoNumero = bankSlip.our_number || inv.code || null;
                const digitable = bankSlip.digitable || bankSlip.digitable_line || bankSlip.barcode || null;
                const barCode = bankSlip.barcode || null;
                const pdfUrl = bankSlip.url || bankSlip.pdf_url || inv.pdf_url || null;
                const paidAt = inv.paid_at || inv.payment_details?.paid_at || inv.payments?.[0]?.paid_at || inv.updated_at || new Date().toISOString();
                const customerDoc = (inv.customer?.document?.identity || '').replace(/\D/g, '');
                const customerName = inv.customer?.name || '';

                // Extrai dígitos de identificação do code se houver (ex: NEXUS-12345)
                let codeDigits = null;
                if (inv.code) {
                    const match = String(inv.code).match(/\d+/g);
                    if (match) codeDigits = match.join('');
                }

                // 1. Localiza o título no banco de dados local dash_financeiro
                let matchedTitle = null;

                // 1a. Busca direta por asaas_payment_id, nosso_numero, numero_documento ou id_firebird
                const { rows: matchRows } = await db.query(
                    `SELECT f.id, f.id_firebird, f.tenant_id, f.nosso_numero, f.numero_documento, f.valor, f.valor_pago, f.status_pagamento, f.status_boleto, f.asaas_payment_id, f.descricao
                     FROM dash_financeiro f
                     WHERE (LOWER(f.tenant_id::text) = LOWER($1::text) OR $1 = '00000000-0000-0000-0000-000000000000')
                       AND (
                         f.asaas_payment_id = $2
                         OR ($3::text IS NOT NULL AND $3::text != '' AND f.nosso_numero IS NOT NULL AND (f.nosso_numero = $3 OR f.nosso_numero = $4))
                         OR ($3::text IS NOT NULL AND $3::text != '' AND f.numero_documento IS NOT NULL AND (f.numero_documento = $3 OR f.numero_documento = $4))
                         OR ($5::text IS NOT NULL AND f.id_firebird::text = $5)
                       )
                     ORDER BY f.id DESC LIMIT 1`,
                    [tenantId, coraId, nossoNumero || '', String(nossoNumero || '').replace(/^0+/, ''), codeDigits]
                ).catch(() => ({ rows: [] }));

                if (matchRows.length > 0) {
                    matchedTitle = matchRows[0];
                }

                // 1b. Fallback por CPF/CNPJ do Cliente + Valor (com tolerância de centavos)
                if (!matchedTitle && customerDoc && valorReais > 0) {
                    const { rows: docRows } = await db.query(
                        `SELECT f.id, f.id_firebird, f.tenant_id, f.nosso_numero, f.numero_documento, f.valor, f.valor_pago, f.status_pagamento, f.status_boleto, f.asaas_payment_id, f.descricao
                         FROM dash_financeiro f
                         LEFT JOIN dash_clientes c ON (
                           (f.cliente_id IS NOT NULL AND c.id = f.cliente_id) OR
                           (f.cliente_id_firebird IS NOT NULL AND (c.id_firebird = f.cliente_id_firebird OR c.id = f.cliente_id_firebird))
                         ) AND LOWER(c.tenant_id::text) = LOWER(f.tenant_id::text)
                         WHERE (LOWER(f.tenant_id::text) = LOWER($1::text) OR $1 = '00000000-0000-0000-0000-000000000000')
                           AND ABS(COALESCE(f.valor, 0) - $2) < 0.05
                           AND (
                             REPLACE(REPLACE(REPLACE(COALESCE(c.documento, f.cliente_documento, ''), '.', ''), '-', ''), '/', '') = $3
                           )
                           AND (f.portador_nome ILIKE '%CORA%' OR f.portador_nome IS NULL OR f.portador_nome = '' OR f.asaas_payment_id IS NULL)
                         ORDER BY f.id DESC LIMIT 1`,
                        [tenantId, valorReais, customerDoc]
                    ).catch(() => ({ rows: [] }));

                    if (docRows.length > 0) {
                        matchedTitle = docRows[0];
                    }
                }

                // 1c. Fallback por Nome do Cliente + Valor
                if (!matchedTitle && customerName && valorReais > 0) {
                    const cleanCustName = customerName.toLowerCase().replace(/[^a-z0-9]/g, '');
                    if (cleanCustName.length >= 4) {
                        const { rows: nameRows } = await db.query(
                            `SELECT f.id, f.id_firebird, f.tenant_id, f.nosso_numero, f.numero_documento, f.valor, f.valor_pago, f.status_pagamento, f.status_boleto, f.asaas_payment_id, f.descricao
                             FROM dash_financeiro f
                             LEFT JOIN dash_clientes c ON (
                               (f.cliente_id IS NOT NULL AND c.id = f.cliente_id) OR
                               (f.cliente_id_firebird IS NOT NULL AND (c.id_firebird = f.cliente_id_firebird OR c.id = f.cliente_id_firebird))
                             ) AND LOWER(c.tenant_id::text) = LOWER(f.tenant_id::text)
                             WHERE (LOWER(f.tenant_id::text) = LOWER($1::text) OR $1 = '00000000-0000-0000-0000-000000000000')
                               AND ABS(COALESCE(f.valor, 0) - $2) < 0.05
                               AND (
                                 LOWER(COALESCE(c.nome, c.razao_social, f.cliente_nome, '')) ILIKE '%' || $3 || '%'
                               )
                               AND (f.portador_nome ILIKE '%CORA%' OR f.portador_nome IS NULL OR f.portador_nome = '' OR f.asaas_payment_id IS NULL)
                             ORDER BY f.id DESC LIMIT 1`,
                            [tenantId, valorReais, customerName.trim().substring(0, 20)]
                        ).catch(() => ({ rows: [] }));

                        if (nameRows.length > 0) {
                            matchedTitle = nameRows[0];
                        }
                    }
                }

                if (!matchedTitle) {
                    continue;
                }

                // 2. Se status for PAID / QUITADO no Cora
                if (status === 'PAID') {
                    const currentSt = (matchedTitle.status_pagamento || '').trim().toUpperCase();
                    const isAlreadyPaid = ['PAGO', 'QUITADO', 'RECEBIDO', 'CONFIRMED', 'LIQUIDADO', 'BAIXADO'].includes(currentSt) && parseFloat(matchedTitle.valor_pago || 0) > 0;
                    const effectiveValorPago = valorReais > 0 ? valorReais : parseFloat(matchedTitle.valor || 0);

                    // Atualiza dash_financeiro
                    await db.query(
                        `UPDATE dash_financeiro
                         SET status_pagamento = 'PAGO',
                             status_boleto = 'PAGO',
                             data_pagamento = COALESCE($1::timestamptz, data_pagamento, NOW()),
                             valor_pago = COALESCE(NULLIF($2::numeric, 0), valor_pago, valor),
                             portador_nome = 'CORA',
                             asaas_payment_id = COALESCE(asaas_payment_id, $3),
                             nosso_numero = COALESCE(NULLIF(nosso_numero, '—'), $4),
                             bank_slip_url = COALESCE(bank_slip_url, $5),
                             pdf_url = COALESCE(pdf_url, $5),
                             asaas_linha_digitavel = COALESCE(asaas_linha_digitavel, $6),
                             asaas_bar_code = COALESCE(asaas_bar_code, $7)
                         WHERE id = $8`,
                        [
                            paidAt,
                            effectiveValorPago,
                            coraId,
                            nossoNumero || null,
                            pdfUrl,
                            digitable,
                            barCode,
                            matchedTitle.id
                        ]
                    );

                    // Enfileira em pending_payments para o ERP Coliseu (Firebird) dar baixa na retaguarda
                    const numDoc = matchedTitle.numero_documento || matchedTitle.id_firebird || matchedTitle.id;
                    await db.query(`
                        INSERT INTO pending_payments (tenant_id, titulo_id, id_firebird, nosso_numero, numero_documento, valor_pago, data_pagamento, forma_pagamento, status, tentativas)
                        VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, 'BOLETO_CORA', 'PENDENTE', 0)
                        ON CONFLICT (tenant_id, titulo_id) DO UPDATE
                        SET valor_pago = EXCLUDED.valor_pago,
                            data_pagamento = EXCLUDED.data_pagamento,
                            forma_pagamento = COALESCE(EXCLUDED.forma_pagamento, pending_payments.forma_pagamento),
                            id_firebird = COALESCE(EXCLUDED.id_firebird, pending_payments.id_firebird),
                            nosso_numero = COALESCE(EXCLUDED.nosso_numero, pending_payments.nosso_numero),
                            numero_documento = COALESCE(EXCLUDED.numero_documento, pending_payments.numero_documento),
                            status = 'PENDENTE',
                            tentativas = 0,
                            processado_em = NULL,
                            erro_mensagem = NULL;
                    `, [
                        tenantId,
                        matchedTitle.id,
                        matchedTitle.id_firebird || null,
                        nossoNumero || matchedTitle.nosso_numero || null,
                        numDoc,
                        effectiveValorPago,
                        paidAt
                    ]).catch(err => logger.error('[CoraSync] Erro ao enfileirar em pending_payments:', err.message));

                    // Logs e Ocorrências apenas se ainda não constava como quitado
                    if (!isAlreadyPaid) {
                        conciliados++;
                        detalhes.push({
                            coraId,
                            tituloId: matchedTitle.id,
                            idFirebird: matchedTitle.id_firebird,
                            valor: effectiveValorPago,
                            cliente: customerName || matchedTitle.descricao
                        });

                        await db.query(
                            `INSERT INTO dash_cobrancas_ocorrencias (tenant_id, financeiro_id, tipo_contato, observacao, operador)
                             VALUES ($1, $2, 'Sincronização Cora', $3, 'Sistema Automático')`,
                            [tenantId, matchedTitle.id, `Pagamento de R$ ${effectiveValorPago.toFixed(2)} recebido e quitado automaticamente via Banco Cora (ID: ${coraId}).`]
                        ).catch(() => {});

                        await db.query(
                            `INSERT INTO dash_financeiro_logs (tenant_id, titulo_id, tipo_evento, usuario, nosso_numero, descricao)
                             VALUES ($1, $2, 'QUITACAO_CORA', 'Sistema Cora Sync', $3, $4)`,
                            [tenantId, matchedTitle.id, nossoNumero || null, `Quitação confirmada via Banco Cora (ID: ${coraId}). Valor: R$ ${effectiveValorPago.toFixed(2)}`]
                        ).catch(() => {});
                    }
                } else if (status === 'CANCELED') {
                    await db.query(
                        `UPDATE dash_financeiro SET status_boleto = 'CANCELADO' WHERE id = $1 AND status_pagamento != 'PAGO'`,
                        [matchedTitle.id]
                    );
                } else if (status === 'OVERDUE') {
                    await db.query(
                        `UPDATE dash_financeiro SET status_boleto = 'VENCIDO' WHERE id = $1 AND status_pagamento != 'PAGO'`,
                        [matchedTitle.id]
                    );
                }
            }

            logger.info('[CoraSync] Sincronização concluída com sucesso', {
                tenantId,
                totalInvoices: allInvoices.length,
                conciliados
            });

            return {
                success: true,
                totalInvoices: allInvoices.length,
                conciliados,
                detalhes
            };
        } catch (error) {
            logger.error('[CoraSync] Falha na sincronização de faturas Cora:', { error: error.message, tenantId });
            return { success: false, error: error.message };
        }
    }

    /**
     * Processa evento de Webhook recebido do Banco Cora com conciliação e baixa no ERP.
     */
    async processarEventoWebhook({ eventId, eventType, resourceId, body = {} }) {
        const evType = (eventType || body?.event_type || body?.event || body?.type || '').toLowerCase();
        const resId = resourceId || body?.resource_id || body?.data?.id || body?.id || null;
        const invData = body?.data || body?.invoice || body || {};

        logger.info('[CoraWebhook] Processando evento webhook Cora', { eventId, evType, resId });

        if (!resId) {
            logger.warn('[CoraWebhook] Evento ignorado: resourceId ausente.');
            return { ignored: true, reason: 'resourceId ausente' };
        }

        // Localiza o título correspondente no dash_financeiro
        const { rows: titles } = await db.query(
            `SELECT id, tenant_id, id_firebird, nosso_numero, numero_documento, valor, valor_pago, status_pagamento, status_boleto, asaas_payment_id
             FROM dash_financeiro
             WHERE asaas_payment_id = $1 
                OR (nosso_numero IS NOT NULL AND nosso_numero != '—' AND nosso_numero = $1)
             ORDER BY id DESC LIMIT 1`,
            [resId]
        );

        if (titles.length === 0) {
            logger.warn('[CoraWebhook] Título local não encontrado pelo ID direto. Disparando sync em lote dos tenants Cora...', { resId });
            const { rows: tenants } = await db.query(
                `SELECT tenant_id FROM dash_integracoes_config WHERE cora_ativo = true AND cora_cert_pem IS NOT NULL`
            );
            for (const t of tenants) {
                await this.sincronizarFaturasCora(t.tenant_id).catch(() => {});
            }
            return { success: true, fallbackSync: true };
        }

        const title = titles[0];
        const tenantId = title.tenant_id;

        if (evType === 'invoice.paid' || invData.status === 'PAID') {
            let amountPaid = parseFloat(title.valor || 0);
            if (invData.total_amount) {
                amountPaid = invData.total_amount / 100;
            } else if (invData.amount) {
                amountPaid = invData.amount / 100;
            }

            const paidDate = invData.paid_at || new Date().toISOString();

            await db.query(
                `UPDATE dash_financeiro
                 SET status_pagamento = 'PAGO',
                     status_boleto = 'PAGO',
                     data_pagamento = COALESCE($1::timestamptz, data_pagamento, NOW()),
                     valor_pago = COALESCE(NULLIF($2::numeric, 0), valor_pago, valor),
                     portador_nome = 'CORA',
                     asaas_payment_id = COALESCE(asaas_payment_id, $3)
                 WHERE id = $4`,
                [paidDate, amountPaid, resId, title.id]
            );

            // Enfileira em pending_payments para o Firebird dar baixa
            await db.query(`
                INSERT INTO pending_payments (tenant_id, titulo_id, id_firebird, nosso_numero, numero_documento, valor_pago, data_pagamento, forma_pagamento, status, tentativas)
                VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, 'BOLETO_CORA', 'PENDENTE', 0)
                ON CONFLICT (tenant_id, titulo_id) DO UPDATE
                SET valor_pago = EXCLUDED.valor_pago,
                    data_pagamento = EXCLUDED.data_pagamento,
                    forma_pagamento = COALESCE(EXCLUDED.forma_pagamento, pending_payments.forma_pagamento),
                    id_firebird = COALESCE(EXCLUDED.id_firebird, pending_payments.id_firebird),
                    nosso_numero = COALESCE(EXCLUDED.nosso_numero, pending_payments.nosso_numero),
                    numero_documento = COALESCE(EXCLUDED.numero_documento, pending_payments.numero_documento),
                    status = 'PENDENTE',
                    tentativas = 0,
                    processado_em = NULL,
                    erro_mensagem = NULL;
            `, [tenantId, title.id, title.id_firebird || null, title.nosso_numero || null, title.numero_documento || null, amountPaid, paidDate]).catch(err => logger.error('[CoraWebhook] Erro ao enfileirar em pending_payments:', err.message));

            await db.query(
                `INSERT INTO dash_cobrancas_ocorrencias (tenant_id, financeiro_id, tipo_contato, observacao, operador)
                 VALUES ($1, $2, 'Webhook Cora', $3, 'Sistema Automático')`,
                [tenantId, title.id, `Pagamento de R$ ${amountPaid.toFixed(2)} recebido via Webhook Cora (ID: ${resId}).`]
            ).catch(() => {});

            await db.query(
                `INSERT INTO dash_financeiro_logs (tenant_id, titulo_id, tipo_evento, usuario, nosso_numero, descricao)
                 VALUES ($1, $2, 'QUITACAO_CORA', 'Webhook Cora', $3, $4)`,
                [tenantId, title.id, title.nosso_numero || null, `Quitação confirmada via Webhook Cora (${evType}). Valor: R$ ${amountPaid.toFixed(2)}`]
            ).catch(() => {});

            logger.info('[CoraWebhook] Boleto marcado como PAGO e enfileirado para o Worker', { titleId: title.id, resId });
        } else if (evType === 'invoice.canceled' || invData.status === 'CANCELED') {
            await db.query(
                `UPDATE dash_financeiro SET status_boleto = 'CANCELADO' WHERE id = $1 AND status_pagamento != 'PAGO'`,
                [title.id]
            );
        } else if (evType === 'invoice.overdue' || invData.status === 'OVERDUE') {
            await db.query(
                `UPDATE dash_financeiro SET status_boleto = 'VENCIDO' WHERE id = $1 AND status_pagamento != 'PAGO'`,
                [title.id]
            );
        }

        return { success: true, processed: true };
    }

    /**
     * Renderiza o Boleto Bancário no Padrão Executivo Coliseu Sistemas
     * Idêntico ao modelo Asaas / Febraban com logotipo Coliseu, QR Code Pix funcional, Códigos de Barras SVG e Ficha de Compensação
     */
    renderColiseuBoletoHtml(dados) {
        const { empresa = {}, cliente = {}, titulo = {}, cora = {} } = dados;

        // Padrão Febraban ITF (Interleaved 2 of 5) para gerar código de barras SVG diretamente no servidor
        const ITF_PATTERNS = [
            '00110', // 0
            '10001', // 1
            '01001', // 2
            '11000', // 3
            '00101', // 4
            '10100', // 5
            '01100', // 6
            '00011', // 7
            '10010', // 8
            '01010'  // 9
        ];

        function generateItfSvg(digits, height = 48) {
            const clean = String(digits || '').replace(/\D/g, '');
            if (clean.length % 2 !== 0 || clean.length === 0) return '';
            let x = 0;
            const rects = [];
            // Start: bar(narrow), space(narrow), bar(narrow), space(narrow)
            rects.push(`<rect x="${x}" y="0" width="1" height="${height}" fill="#0f172a"/>`); x += 1;
            x += 1;
            rects.push(`<rect x="${x}" y="0" width="1" height="${height}" fill="#0f172a"/>`); x += 1;
            x += 1;
            for (let i = 0; i < clean.length; i += 2) {
                const d1 = parseInt(clean[i], 10);
                const d2 = parseInt(clean[i+1], 10);
                const p1 = ITF_PATTERNS[d1] || '00110';
                const p2 = ITF_PATTERNS[d2] || '00110';
                for (let j = 0; j < 5; j++) {
                    const barW = p1[j] === '1' ? 3 : 1;
                    rects.push(`<rect x="${x}" y="0" width="${barW}" height="${height}" fill="#0f172a"/>`);
                    x += barW;
                    const spcW = p2[j] === '1' ? 3 : 1;
                    x += spcW;
                }
            }
            // Stop: bar(wide), space(narrow), bar(narrow)
            rects.push(`<rect x="${x}" y="0" width="3" height="${height}" fill="#0f172a"/>`); x += 3;
            x += 1;
            rects.push(`<rect x="${x}" y="0" width="1" height="${height}" fill="#0f172a"/>`); x += 1;
            return `<svg viewBox="0 0 ${x} ${height}" preserveAspectRatio="none" width="100%" height="${height}px" style="display:block;" xmlns="http://www.w3.org/2000/svg">${rects.join('')}</svg>`;
        }

        function crc16(buffer) {
            let crc = 0xFFFF;
            for (let i = 0; i < buffer.length; i++) {
                crc ^= buffer.charCodeAt(i) << 8;
                for (let j = 0; j < 8; j++) {
                    if ((crc & 0x8000) !== 0) {
                        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
                    } else {
                        crc = (crc << 1) & 0xFFFF;
                    }
                }
            }
            return crc.toString(16).toUpperCase().padStart(4, '0');
        }

        function generatePixBrCode({ chave, nome, cidade, valor, txid = '***' }) {
            const f = (id, val) => {
                const len = String(val.length).padStart(2, '0');
                return `${id}${len}${val}`;
            };
            const cleanChave = String(chave || '47147790000104').trim();
            const cleanNome = String(nome || 'COLISEU TECNOLOGIA E CONS').normalize('NFD').replace(/[\u0300-\u036f]/g, '').substring(0, 25).toUpperCase();
            const cleanCidade = String(cidade || 'CAMPO GRANDE').normalize('NFD').replace(/[\u0300-\u036f]/g, '').substring(0, 15).toUpperCase();
            const mai = f('00', 'br.gov.bcb.pix') + f('01', cleanChave);
            let payload = 
                f('00', '01') +
                f('26', mai) +
                f('52', '0000') +
                f('53', '986') +
                (valor ? f('54', parseFloat(valor).toFixed(2)) : '') +
                f('58', 'BR') +
                f('59', cleanNome) +
                f('60', cleanCidade) +
                f('62', f('05', txid)) +
                '6304';
            const crc = crc16(payload);
            return payload + crc;
        }

        function formatarDataBr(val) {
            if (!val) return '—';
            if (val instanceof Date) {
                const y = val.getUTCFullYear();
                const m = String(val.getUTCMonth() + 1).padStart(2, '0');
                const d = String(val.getUTCDate()).padStart(2, '0');
                return `${d}/${m}/${y}`;
            }
            const str = String(val).trim();
            if (!str || str === 'null' || str === 'undefined' || str === '—') return '—';
            const matchIso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (matchIso) {
                return `${matchIso[3]}/${matchIso[2]}/${matchIso[1]}`;
            }
            const matchBr = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
            if (matchBr) {
                return `${matchBr[1]}/${matchBr[2]}/${matchBr[3]}`;
            }
            const dt = new Date(str);
            if (!isNaN(dt.getTime())) {
                const y = dt.getUTCFullYear();
                const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
                const d = String(dt.getUTCDate()).padStart(2, '0');
                return `${d}/${m}/${y}`;
            }
            return str;
        }

        function formatLinhaDigitavel(str) {
            if (!str) return '';
            const clean = str.replace(/\D/g, '');
            if (clean.length === 47) {
                return `${clean.substring(0, 5)}.${clean.substring(5, 10)} ${clean.substring(10, 15)}.${clean.substring(15, 21)} ${clean.substring(21, 26)}.${clean.substring(26, 32)} ${clean.substring(32, 33)} ${clean.substring(33)}`;
            }
            return str;
        }

        // Beneficiário oficial Coliseu (conforme modelo da imagem)
        const razaoSocial = 'COLISEU TECNOLOGIA E CONSULTORIA LTDA';
        const nomeFantasia = 'Coliseu Sistemas';
        const cnpj = '47.147.790/0001-04';
        const endereco = 'Rua Pedro Celestino, 668, Centro';
        const cidade = 'Campo Grande';
        const estado = 'MS';
        const cep = '79002370';
        const telefone = '(67) 99856-4972';
        const email = 'financeiro@coliseusistemas.com.br';
        const site = 'https://coliseusistemas.com.br/';
        const logoUrl = COLISEU_LOGO_BASE64 || 'https://transporte.coliseusistemas.com.br/logo-nexus.png';

        const clienteNome = cliente.nome || titulo.cliente_nome || 'Cliente';
        const clienteDoc = cliente.documento || titulo.cliente_documento || '—';
        const clienteEndereco = cliente.endereco_completo || cliente.endereco || titulo.cliente_endereco || '—';

        const valorNum = parseFloat(titulo.valor || 0);
        const valorFormatado = valorNum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        
        const vencimentoFormatado = formatarDataBr(titulo.data_vencimento);
        const emissaoFormatada = formatarDataBr(titulo.data_emissao) !== '—' ? formatarDataBr(titulo.data_emissao) : new Date().toLocaleDateString('pt-BR');

        const rawLinhaDigitavel = cora.linhaDigitavel || titulo.asaas_linha_digitavel || titulo.linha_digitavel || '';
        const linhaDigitavel = formatLinhaDigitavel(rawLinhaDigitavel) || rawLinhaDigitavel;
        const rawBarCode = cora.barCode || titulo.asaas_bar_code || titulo.bar_code || '';
        const barCodeDigits = rawBarCode.replace(/\D/g, '') || rawLinhaDigitavel.replace(/\D/g, '');
        const nossoNumero = cora.nossoNumero || titulo.nosso_numero || String(titulo.id || '');
        const numeroDocumento = String(titulo.id_firebird || titulo.id || '');
        const descricao = titulo.descricao || 'Cobrança Referente ao Sistema Coliseu';
        const multaPercentual = titulo.multa_percentual || 2.0;
        const jurosPercentual = titulo.juros_percentual || 1.0;
        const multaValor = ((valorNum * multaPercentual) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const pdfUrl = cora.pdfUrl || 'https://coliseusistemas.com.br';

        // Pix Copia e Cola: utiliza estritamente o código EMV gerado pelo Banco Cora.
        // NUNCA gerar fallback com a chave CNPJ da Coliseu porque essa chave está registrada no Banco Asaas,
        // o que causava desvio indevido do pagamento Pix para o Asaas enquanto o boleto era do Cora.
        const pixCopiaECola = (cora.pixCopiaECola && String(cora.pixCopiaECola).trim() !== '') ? String(cora.pixCopiaECola).trim() : null;

        // Gera os códigos de barras SVG server-side
        const topBarcodeSvg = generateItfSvg(barCodeDigits, 46);
        const bottomBarcodeSvg = generateItfSvg(barCodeDigits, 52);

        return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Boleto Bancário - ${razaoSocial}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Roboto+Mono:wght@500;700&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: #f1f5f9;
      color: #1e293b;
      padding: 24px;
      display: flex;
      justify-content: center;
    }
    .print-actions {
      position: fixed;
      top: 20px;
      right: 20px;
      display: flex;
      gap: 10px;
      z-index: 9999;
    }
    .btn-action {
      background: #0284c7;
      color: #ffffff;
      border: none;
      padding: 10px 18px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
      box-shadow: 0 4px 10px rgba(2, 132, 199, 0.3);
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s;
    }
    .btn-action:hover {
      background: #0369a1;
      transform: translateY(-1px);
    }
    .btn-close {
      background: #475569;
    }
    .btn-close:hover {
      background: #334155;
    }
    .page-container {
      width: 780px;
      background: #ffffff;
      padding: 36px 40px;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
    }
    .greeting-header {
      margin-bottom: 22px;
    }
    .greeting-header p {
      font-size: 13px;
      font-weight: 600;
      color: #334155;
    }
    .beneficiary-header {
      display: flex;
      align-items: flex-start;
      gap: 24px;
      margin-bottom: 24px;
    }
    .logo-container {
      width: 180px;
      display: flex;
      align-items: flex-start;
      justify-content: flex-start;
    }
    .logo-container img {
      max-width: 100%;
      height: auto;
      max-height: 52px;
      object-fit: contain;
    }
    .beneficiary-details {
      flex: 1;
      font-size: 11.5px;
      line-height: 1.55;
      color: #334155;
    }
    .beneficiary-details h3 {
      font-size: 13px;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 4px;
      text-transform: uppercase;
      letter-spacing: 0.2px;
    }
    .beneficiary-details a {
      color: #0284c7;
      text-decoration: none;
      font-weight: 600;
    }
    .summary-boxes {
      display: grid;
      grid-template-columns: 1fr 1fr 1.3fr;
      gap: 14px;
      margin-bottom: 24px;
    }
    .summary-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px 16px;
    }
    .summary-card .label {
      font-size: 11px;
      font-weight: 600;
      color: #64748b;
      margin-bottom: 6px;
    }
    .summary-card .value {
      font-size: 16px;
      font-weight: 800;
      color: #0284c7;
    }
    .summary-card .details {
      font-size: 11px;
      font-weight: 600;
      color: #0284c7;
      line-height: 1.45;
    }
    .payment-instruction-title {
      font-size: 13px;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 12px;
    }
    .methods-row {
      display: flex;
      gap: 20px;
      margin-bottom: 24px;
      align-items: flex-start;
    }
    .methods-left {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .method-section {
      position: relative;
    }
    .method-label {
      font-size: 11px;
      font-weight: 700;
      color: #334155;
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 3px;
    }
    .diamond-icon {
      font-size: 12px;
      color: #475569;
    }
    .barcode-icon {
      font-family: monospace;
      font-size: 11px;
      letter-spacing: -1px;
      font-weight: 900;
      color: #475569;
    }
    .copyable-code {
      font-family: 'Roboto Mono', monospace;
      font-size: 11px;
      font-weight: 700;
      color: #0284c7;
      letter-spacing: 0.2px;
      word-break: break-all;
      cursor: pointer;
      padding: 3px 0;
      transition: color 0.2s;
    }
    .copyable-code:hover {
      color: #0369a1;
      text-decoration: underline;
    }
    .copy-tooltip {
      display: none;
      position: absolute;
      right: 0;
      top: -2px;
      font-size: 9.5px;
      font-weight: 700;
      color: #059669;
      background: #ecfdf5;
      border: 1px solid #a7f3d0;
      padding: 1px 6px;
      border-radius: 4px;
    }
    .barcode-svg-container {
      margin-top: 4px;
      width: 100%;
    }
    .qr-container {
      width: 140px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      flex-shrink: 0;
    }
    .qr-header-instruction {
      font-size: 9px;
      font-weight: 700;
      color: #475569;
      margin-bottom: 6px;
      line-height: 1.25;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
    }
    .qr-box {
      background: #ffffff;
      padding: 5px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .qr-box img {
      width: 124px;
      height: 124px;
      display: block;
    }
    .cut-line {
      border-top: 1px dashed #94a3b8;
      position: relative;
      margin: 22px 0 18px 0;
    }
    .cut-line::after {
      content: "✂ corte na linha pontilhada";
      position: absolute;
      right: 0;
      top: -9px;
      background: #ffffff;
      padding-left: 8px;
      font-size: 10px;
      color: #94a3b8;
      font-style: italic;
    }
    .slip-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
      margin-bottom: 12px;
    }
    .slip-table td, .slip-table th {
      border: 1px solid #334155;
      padding: 3px 6px;
      vertical-align: top;
    }
    .slip-header-row {
      display: flex;
      align-items: flex-end;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 4px;
      margin-bottom: 4px;
    }
    .bank-logo {
      font-size: 15px;
      font-weight: 900;
      color: #0369a1;
      letter-spacing: 0.5px;
      width: 130px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .bank-code {
      font-size: 15px;
      font-weight: 800;
      color: #0f172a;
      border-left: 2px solid #0f172a;
      border-right: 2px solid #0f172a;
      padding: 0 14px;
      margin-right: 12px;
    }
    .slip-digitable {
      flex: 1;
      text-align: right;
      font-family: 'Roboto Mono', monospace;
      font-size: 13px;
      font-weight: 700;
      color: #0f172a;
    }
    .f-label {
      font-size: 8px;
      text-transform: uppercase;
      font-weight: 700;
      color: #64748b;
      display: block;
      margin-bottom: 1px;
    }
    .f-value {
      font-size: 10.5px;
      font-weight: 600;
      color: #0f172a;
      min-height: 14px;
    }
    .f-value-bold {
      font-size: 11px;
      font-weight: 800;
      color: #0f172a;
    }
    .bottom-slip-barcode {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: 14px;
    }
    .bottom-slip-barcode svg {
      height: 52px;
    }
    .slip-footer-text {
      text-align: right;
      font-size: 9px;
      font-weight: 700;
      color: #475569;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    @media print {
      body {
        background: #ffffff;
        padding: 0;
      }
      .print-actions {
        display: none !important;
      }
      .page-container {
        width: 100%;
        box-shadow: none;
        padding: 0;
        border-radius: 0;
      }
    }
  </style>
</head>
<body>

  <div class="print-actions">
    <button class="btn-action" style="background:#059669;" onclick="window.open(window.location.pathname + '?format=pdf', '_blank')">
      📥 Baixar PDF Oficial
    </button>
    <button class="btn-action" onclick="window.print()">
      🖨️ Imprimir
    </button>
    <button class="btn-action btn-close" onclick="window.close()">
      ✕ Fechar
    </button>
  </div>

  <div class="page-container">

    <!-- CABEÇALHO DO CLIENTE -->
    <div class="greeting-header">
      <p>Aqui está seu boleto.</p>
    </div>

    <!-- CABEÇALHO DA EMPRESA (COLISEU) -->
    <div class="beneficiary-header">
      <div class="logo-container">
        <img src="${logoUrl}" alt="${nomeFantasia}" onerror="this.src='https://transporte.coliseusistemas.com.br/logo-nexus.png'">
      </div>
      <div class="beneficiary-details">
        <h3>${razaoSocial}</h3>
        <div>CNPJ: ${cnpj}</div>
        <div>${endereco}</div>
        <div>${cidade} - ${estado}</div>
        <div>CEP: ${cep}</div>
        <div>${telefone}</div>
        <div>${email}</div>
        <div><a href="${site}" target="_blank">${site}</a></div>
      </div>
    </div>

    <!-- CARDS DE RESUMO (VENCIMENTO, VALOR, APÓS O VENCIMENTO) -->
    <div class="summary-boxes">
      <div class="summary-card">
        <div class="label">Vencimento</div>
        <div class="value">${vencimentoFormatado}</div>
      </div>
      <div class="summary-card">
        <div class="label">Valor</div>
        <div class="value">R$ ${valorFormatado}</div>
      </div>
      <div class="summary-card">
        <div class="label">Após o vencimento</div>
        <div class="details">
          R$ ${multaValor} de multa (${multaPercentual}%)<br>
          ${jurosPercentual}% de juros ao mês
        </div>
      </div>
    </div>

    <!-- SEÇÃO COMO REALIZAR O PAGAMENTO (IDÊNTICO AO MODELO DAS FOTOS) -->
    <div class="payment-instruction-title">Como realizar o pagamento:</div>
    <div class="methods-row">
      <div class="methods-left">
        <!-- Código Pix copia e cola (exibido apenas se retornado pelo Banco Cora) -->
        ${pixCopiaECola ? `
        <div class="method-section">
          <div class="method-label">
            <span class="diamond-icon">❖</span> Código Pix copia e cola
            <span id="pixTooltip" class="copy-tooltip">✓ Copiado!</span>
          </div>
          <div class="copyable-code" id="pixCodeText" onclick="copyToClipboard('${pixCopiaECola.replace(/'/g, "\\'")}', 'pixTooltip')" title="Clique para copiar o código Pix">
            ${pixCopiaECola}
          </div>
        </div>
        ` : ''}

        <!-- Linha digitável -->
        ${linhaDigitavel ? `
        <div class="method-section">
          <div class="method-label">
            <span class="barcode-icon">||||</span> Linha digitável
            <span id="linhaTooltip" class="copy-tooltip">✓ Copiado!</span>
          </div>
          <div class="copyable-code" id="digitableText" onclick="copyToClipboard('${rawLinhaDigitavel.replace(/\D/g, '')}', 'linhaTooltip')" title="Clique para copiar a linha digitável">
            ${linhaDigitavel}
          </div>
        </div>
        ` : ''}

        <!-- Código de Barras Superior (SVG Padrão Febraban) -->
        <div class="barcode-svg-container">
          ${topBarcodeSvg}
        </div>
      </div>

      <!-- QR Code Pix ou Instrução Febraban Cora -->
      ${pixCopiaECola ? `
      <div class="qr-container">
        <div class="qr-header-instruction">
          <span>Pague o boleto com Pix usando o QR Code abaixo</span>
        </div>
        <div class="qr-box" id="qrcode">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(pixCopiaECola)}" alt="QR Code Pix" onerror="this.style.display='none'; renderQrFallback();" />
        </div>
      </div>
      ` : `
      <div class="qr-container" style="display:flex; flex-direction:column; justify-content:center; align-items:center; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:16px; text-align:center; min-width:180px;">
        <div style="font-size:26px; margin-bottom:6px;">📄</div>
        <div style="font-weight:700; font-size:12px; color:#0f172a; margin-bottom:4px;">Boleto Febraban Cora</div>
        <div style="font-size:11px; color:#64748b; line-height:1.4;">Pague via internet banking ou app de qualquer banco escaneando o código de barras ou linha digitável.</div>
      </div>
      `}
    </div>

    <!-- LINHA DE CORTE -->
    <div class="cut-line"></div>

    <!-- FICHA DE COMPENSAÇÃO BANCÁRIA (FEBRABAN BANCO CORA 403) -->
    <div class="slip-header-row">
      <div class="bank-logo" title="Banco Cora (403)">
        <svg width="22" height="22" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:inline-block; vertical-align:middle; flex-shrink:0;">
          <rect width="32" height="32" rx="8" fill="#FE3E6D"/>
          <circle cx="16" cy="16" r="6.5" fill="white"/>
        </svg>
        <span style="font-family:'Inter', -apple-system, BlinkMacSystemFont, sans-serif; font-weight:800; font-size:21px; color:#FE3E6D; letter-spacing:-0.6px; line-height:1;">cora</span>
      </div>
      <div class="bank-code">403</div>
      <div class="slip-digitable">${linhaDigitavel}</div>
    </div>

    <table class="slip-table">
      <colgroup>
        <col style="width: 28%;">
        <col style="width: 14%;">
        <col style="width: 14%;">
        <col style="width: 14%;">
        <col style="width: 30%;">
      </colgroup>
      <tbody>
        <tr>
          <td colspan="4">
            <span class="f-label">Local de Pagamento</span>
            <div class="f-value">Pagável em qualquer banco ou casa lotérica</div>
          </td>
          <td style="background: #f8fafc;">
            <span class="f-label">Data de Vencimento</span>
            <div class="f-value-bold" style="text-align: right; color: #0284c7;">${vencimentoFormatado}</div>
          </td>
        </tr>
        <tr>
          <td colspan="4">
            <span class="f-label">Beneficiário</span>
            <div class="f-value">${razaoSocial}</div>
          </td>
          <td>
            <span class="f-label">CPF/CNPJ do Beneficiário</span>
            <div class="f-value" style="text-align: right;">${cnpj}</div>
          </td>
        </tr>
        <tr>
          <td>
            <span class="f-label">Data do Documento</span>
            <div class="f-value">${emissaoFormatada}</div>
          </td>
          <td>
            <span class="f-label">N° do Documento</span>
            <div class="f-value">${numeroDocumento}</div>
          </td>
          <td>
            <span class="f-label">Espécie Doc.</span>
            <div class="f-value">DM</div>
          </td>
          <td>
            <span class="f-label">Aceite</span>
            <div class="f-value">N</div>
          </td>
          <td>
            <span class="f-label">Agência / Código Beneficiário</span>
            <div class="f-value" style="text-align: right;">0001 / 7264541-2</div>
          </td>
        </tr>
        <tr>
          <td>
            <span class="f-label">Uso do Banco</span>
            <div class="f-value"></div>
          </td>
          <td>
            <span class="f-label">Carteira</span>
            <div class="f-value">1</div>
          </td>
          <td>
            <span class="f-label">Espécie</span>
            <div class="f-value">REAL</div>
          </td>
          <td>
            <span class="f-label">Quantidade</span>
            <div class="f-value"></div>
          </td>
          <td style="background: #f8fafc;">
            <span class="f-label">(=) Valor do Documento</span>
            <div class="f-value-bold" style="text-align: right; font-size: 13px;">R$ ${valorFormatado}</div>
          </td>
        </tr>
        <tr>
          <td colspan="4" rowspan="5" style="height: 90px; vertical-align: top;">
            <span class="f-label">Instruções (Texto de responsabilidade do beneficiário)</span>
            <div class="f-value" style="margin-top: 4px; line-height: 1.45;">
              Nao receber com cheque.<br>
              Após o vencimento aplicar multa de R$ ${multaValor} e juros de ${jurosPercentual}% ao mês.<br>
              Boleto N° ${numeroDocumento} - ${descricao}<br><br>
              Fatura disponível em: ${pdfUrl}
            </div>
          </td>
          <td>
            <span class="f-label">(-) Desconto / Abatimentos</span>
            <div class="f-value"></div>
          </td>
        </tr>
        <tr>
          <td>
            <span class="f-label">(-) Outras deduções</span>
            <div class="f-value"></div>
          </td>
        </tr>
        <tr>
          <td>
            <span class="f-label">(+) Mora / Multa</span>
            <div class="f-value"></div>
          </td>
        </tr>
        <tr>
          <td>
            <span class="f-label">(+) Outros acréscimos</span>
            <div class="f-value"></div>
          </td>
        </tr>
        <tr>
          <td>
            <span class="f-label">(=) Valor cobrado</span>
            <div class="f-value"></div>
          </td>
        </tr>
        <tr>
          <td colspan="5">
            <span class="f-label">Pagador</span>
            <div class="f-value" style="font-weight: 700;">
              ${clienteNome}, CNPJ/CPF: ${clienteDoc}<br>
              <span style="font-weight: normal; font-size: 10px; color: #475569;">${clienteEndereco}</span>
            </div>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Código de Barras Inferior e Rodapé Febraban -->
    <div class="bottom-slip-barcode">
      <div style="width: 72%;">
        ${bottomBarcodeSvg}
      </div>
      <div class="slip-footer-text">
        Autenticação Mecânica • FICHA DE COMPENSAÇÃO
      </div>
    </div>

  </div>

  <script>
    function copyToClipboard(text, tooltipId) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() {
          showTooltip(tooltipId);
        });
      } else {
        const tempInput = document.createElement("input");
        tempInput.value = text;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand("copy");
        document.body.removeChild(tempInput);
        showTooltip(tooltipId);
      }
    }

    function showTooltip(id) {
      const el = document.getElementById(id);
      if (el) {
        el.style.display = "inline-block";
        setTimeout(function() {
          el.style.display = "none";
        }, 2500);
      }
    }

    function renderQrFallback() {
      try {
        const box = document.getElementById("qrcode");
        ${pixCopiaECola ? `
        if (box && typeof QRCode !== "undefined") {
          box.innerHTML = "";
          new QRCode(box, {
            text: "${pixCopiaECola.replace(/"/g, '\\"')}",
            width: 124,
            height: 124,
            colorDark: "#0f172a",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.M
          });
        }
        ` : ''}
      } catch (e) {}
    }
  </script>
</body>
</html>`;
    }
}

module.exports = new CoraService();

