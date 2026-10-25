'use strict';

const axios = require('axios');
const logger = require('../../config/logger');

const URLS = {
    producao: 'https://api.focusnfe.com.br/v2',
    homologacao: 'https://homologacao.focusnfe.com.br/v2'
};

/**
 * Rate limit da Focus NFe: 100 requisições por minuto POR TOKEN.
 * O controle é local (janela deslizante em memória) para nunca estourar a cota
 * e evitar o HTTP 429 que devolveria.
 */
class TokenRateLimiter {
    constructor(maxPorMinuto = 100) {
        this.max = maxPorMinuto;
        this.hits = new Map(); // token → array de timestamps
    }

    _limpar(token) {
        const agora = Date.now();
        const janela = (hits) => hits.filter(t => agora - t < 60000);
        const atuais = this.hits.get(token) || [];
        const validos = janela(atuais);
        if (validos.length !== atuais.length) {
            this.hits.set(token, validos);
        }
        return validos;
    }

    /**
     * Aguarda (se necessário) até haver vaga na janela de 1 minuto.
     */
    async adquirir(token) {
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const validos = this._limpar(token);
            if (validos.length < this.max) {
                validos.push(Date.now());
                this.hits.set(token, validos);
                return;
            }
            const maisAntigo = Math.min(...validos);
            const esperaMs = Math.max(1000, maisAntigo + 60000 - Date.now());
            logger.warn(`[FocusClient] Rate limit atingido para token. Aguardando ${Math.ceil(esperaMs / 1000)}s.`);
            await new Promise(r => setTimeout(r, esperaMs));
        }
    }
}

const rateLimiter = new TokenRateLimiter(
    parseInt(process.env.FOCUS_RATE_LIMIT_POR_MINUTO || '100', 10)
);

class FocusClient {
    /**
     * @param {Object} options
     * @param {string} options.token - Token da Focus NFe da empresa (por CNPJ)
     * @param {'homologacao'|'producao'} [options.ambiente='homologacao']
     */
    constructor({ token, ambiente = 'homologacao' }) {
        if (!token) {
            throw new Error('[FocusClient] Token da Focus NFe é obrigatório');
        }
        this.token = token.trim();
        this.ambiente = ambiente === 'producao' ? 'producao' : 'homologacao';
        this.baseUrl = URLS[this.ambiente];

        this.http = axios.create({
            baseURL: this.baseUrl,
            timeout: 45000,
            auth: {
                username: this.token,
                password: '' // HTTP Basic da Focus: usuário = token, senha em branco
            },
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
    }

    // ─────────────────────────────────────────────────────────
    // CT-e (Conhecimento de Transporte Eletrônico — modelo 57)
    // ─────────────────────────────────────────────────────────

    /**
     * POST /cte?ref={ref} — Emite o CT-e (assíncrono).
     * Regra Focus: o `ref` é único por token. Após autorizado, o ref fica
     * travado (cancelamento não o libera).
     */
    async emitirCte(ref, payload) {
        return this._request('POST', `/cte`, payload, { ref }, 'emitirCte');
    }

    /**
     * GET /cte/{ref}[?completa=1] — Consulta status, protocolo, XML e DACTE.
     */
    async consultarCte(ref, completa = false) {
        const query = completa ? '?completa=1' : '';
        return this._request('GET', `/cte/${encodeURIComponent(ref)}${query}`, null, null, 'consultarCte');
    }

    /**
     * DELETE /cte/{ref} — Cancela CT-e autorizado.
     * Só funciona com status "autorizado" e dentro do prazo (7 dias na prática).
     */
    async cancelarCte(ref, justificativa) {
        if (!justificativa || String(justificativa).trim().length < 15) {
            throw new Error('[FocusClient] Justificativa de cancelamento deve ter no mínimo 15 caracteres.');
        }
        return this._request('DELETE', `/cte/${encodeURIComponent(ref)}`, { justificativa: String(justificativa).trim() }, null, 'cancelarCte');
    }

    /**
     * POST /cte/{ref}/carta_correcao — Carta de Correção Eletrônica.
     */
    async cartaCorrecaoCte(ref, correcao) {
        if (!correcao || String(correcao).trim().length < 15) {
            throw new Error('[FocusClient] Texto da correção deve ter no mínimo 15 caracteres.');
        }
        return this._request('POST', `/cte/${encodeURIComponent(ref)}/carta_correcao`, { correcao: String(correcao).trim() }, null, 'cartaCorrecaoCte');
    }

    /**
     * POST /cte/{ref}/evento — Registra evento do CT-e na SEFAZ.
     */
    async eventoCte(ref, payload) {
        return this._request('POST', `/cte/${encodeURIComponent(ref)}/evento`, payload, null, 'eventoCte');
    }

    // ─────────────────────────────────────────────────────────
    // MDF-e (Manifesto Eletrônico de Documentos Fiscais — modelo 58)
    // ─────────────────────────────────────────────────────────

    /**
     * POST /mdfe?ref={ref} — Emite o MDF-e (assíncrono).
     */
    async emitirMdfe(ref, payload) {
        return this._request('POST', `/mdfe`, payload, { ref }, 'emitirMdfe');
    }

    /**
     * GET /mdfe/{ref} — Consulta status, protocolo, XML e DAMDFE.
     */
    async consultarMdfe(ref) {
        return this._request('GET', `/mdfe/${encodeURIComponent(ref)}`, null, null, 'consultarMdfe');
    }

    /**
     * POST /mdfe/{ref}/encerrar — Encerra o MDF-e.
     * Resposta síncrona. Libera veículo e condutor na SEFAZ.
     */
    async encerrarMdfe(ref, { data, sigla_uf, nome_municipio }) {
        if (!nome_municipio) {
            throw new Error('[FocusClient] Município de encerramento é obrigatório.');
        }
        return this._request('POST', `/mdfe/${encodeURIComponent(ref)}/encerrar`, {
            data: data || new Date().toISOString().split('T')[0],
            sigla_uf: String(sigla_uf || '').toUpperCase(),
            nome_municipio
        }, null, 'encerrarMdfe');
    }

    /**
     * POST /mdfe/{ref}/inclusao_condutor — Inclui condutor durante a viagem.
     */
    async incluirCondutorMdfe(ref, { nome, cpf }) {
        if (!nome || !cpf) {
            throw new Error('[FocusClient] Nome e CPF do condutor são obrigatórios.');
        }
        return this._request('POST', `/mdfe/${encodeURIComponent(ref)}/inclusao_condutor`, {
            nome,
            cpf: String(cpf).replace(/\D/g, '')
        }, null, 'incluirCondutorMdfe');
    }

    /**
     * POST /mdfe/{ref}/inclusao_dfe — Inclui CT-e/NF-e em MDF-e já autorizado.
     */
    async incluirDfeMdfe(ref, { protocolo, codigo_municipio_carregamento, documentos }) {
        if (!protocolo || !codigo_municipio_carregamento || !Array.isArray(documentos) || documentos.length === 0) {
            throw new Error('[FocusClient] protocolo, codigo_municipio_carregamento e documentos são obrigatórios.');
        }
        return this._request('POST', `/mdfe/${encodeURIComponent(ref)}/inclusao_dfe`, {
            protocolo,
            codigo_municipio_carregamento: String(codigo_municipio_carregamento),
            documentos
        }, null, 'incluirDfeMdfe');
    }

    /**
     * DELETE /mdfe/{ref} — Cancela o MDF-e.
     */
    async cancelarMdfe(ref, justificativa) {
        return this._request('DELETE', `/mdfe/${encodeURIComponent(ref)}`, { justificativa }, null, 'cancelarMdfe');
    }

    /**
     * POST /mdfe/{ref}/reenviar_hook — Reenvia a notificação do manifesto.
     */
    async reenviarHookMdfe(ref) {
        return this._request('POST', `/mdfe/${encodeURIComponent(ref)}/reenviar_hook`, null, null, 'reenviarHookMdfe');
    }

    // ─────────────────────────────────────────────────────────
    // Infraestrutura interna
    // ─────────────────────────────────────────────────────────

    /**
     * Executa a requisição com rate limit, retry e normalização de erro.
     */
    async _request(method, path, body, query, metodo) {
        const started = Date.now();

        try {
            await rateLimiter.adquirir(this.token);

            const config = { method, params: query || undefined };
            if (body !== null && body !== undefined) config.data = body;

            const res = await this.http.request(path, config);
            logger.info(
                `[FocusClient] ${metodo} OK em ${Date.now() - started}ms (ambiente=${this.ambiente})`
            );
            return res.data;
        } catch (err) {
            this._handleError(metodo, err, path);
        }
    }

    _handleError(metodo, err, path) {
        const status = err.response?.status;
        const data = err.response?.data;

        // 429 = rate limit estourado: a Focus cobra retry com backoff
        if (status === 429) {
            logger.warn(`[FocusClient] HTTP 429 (rate limit) em ${metodo}. Reenvie em instantes.`);
            const erro = new Error(`[Focus NFe ${metodo}] Limite de requisições excedido (429). Tente novamente em instantes.`);
            erro.status = 429;
            erro.response = data;
            throw erro;
        }

        // 409 = conflito (ref já em processamento ou já autorizado) — não é erro fatal
        if (status === 409) {
            logger.warn(`[FocusClient] HTTP 409 em ${metodo}: ${data?.codigo || data?.mensagem}`);
            const erro = new Error(data?.mensagem || `[Focus NFe ${metodo}] Operação já em andamento (409).`);
            erro.status = 409;
            erro.response = data;
            erro.codigo = data?.codigo;
            throw erro;
        }

        logger.error(`[FocusClient] Erro em ${metodo} [${path}] status=${status}:`, data || err.message);

        const errorMsg = data?.mensagem || data?.error || err.message;
        const customErr = new Error(`[Focus NFe ${metodo}] ${errorMsg}`);
        customErr.status = status;
        customErr.response = data;
        customErr.codigo = data?.codigo;
        throw customErr;
    }
}

module.exports = FocusClient;
module.exports.rateLimiter = rateLimiter;
