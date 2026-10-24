'use strict';

const axios = require('axios');
const logger = require('../../config/logger');

const URLS = {
    producao: 'https://api.focusnfe.com.br/v2',
    homologacao: 'https://homologacao.focusnfe.com.br/v2'
};

class FocusClient {
    /**
     * Instancia o cliente configurado para um emitente específico.
     * @param {Object} options
     * @param {string} options.token - Token da Focus NFe da empresa
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
                password: '' // Autenticação Basic da Focus usa senha em branco
            },
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
    }

    // ─────────────────────────────────────────────────────────
    // CT-e (Conhecimento de Transporte Eletrônico)
    // ─────────────────────────────────────────────────────────

    /**
     * Envia o CT-e para autorização na SEFAZ.
     * @param {string} ref - Referência única do CT-e
     * @param {Object} payload - Dados completos no formato Focus NFe
     */
    async emitirCte(ref, payload) {
        try {
            logger.info(`[FocusClient] Emitindo CT-e (ref=${ref}) no ambiente ${this.ambiente}`);
            const res = await this.http.post(`/cte?ref=${encodeURIComponent(ref)}`, payload);
            return res.data;
        } catch (err) {
            this._handleError('emitirCte', err, ref);
        }
    }

    /**
     * Consulta o status do CT-e pela referência.
     * @param {string} ref
     * @param {boolean} [completa=false] - Se true, inclui o protocolo completo da SEFAZ
     */
    async consultarCte(ref, completa = false) {
        try {
            const query = completa ? '?completa=1' : '';
            const res = await this.http.get(`/cte/${encodeURIComponent(ref)}${query}`);
            return res.data;
        } catch (err) {
            this._handleError('consultarCte', err, ref);
        }
    }

    /**
     * Cancela um CT-e já autorizado na SEFAZ.
     * @param {string} ref
     * @param {string} justificativa - Mínimo 15 caracteres
     */
    async cancelarCte(ref, justificativa) {
        if (!justificativa || justificativa.trim().length < 15) {
            throw new Error('[FocusClient] Justificativa de cancelamento deve ter no mínimo 15 caracteres');
        }
        try {
            logger.info(`[FocusClient] Cancelando CT-e (ref=${ref})`);
            const res = await this.http.delete(`/cte/${encodeURIComponent(ref)}`, {
                data: { justificativa: justificativa.trim() }
            });
            return res.data;
        } catch (err) {
            this._handleError('cancelarCte', err, ref);
        }
    }

    /**
     * Emite Carta de Correção Eletrônica (CC-e) para o CT-e.
     */
    async cartaCorrecaoCte(ref, correcao) {
        if (!correcao || correcao.trim().length < 15) {
            throw new Error('[FocusClient] Texto da correção deve ter no mínimo 15 caracteres');
        }
        try {
            const res = await this.http.post(`/cte/${encodeURIComponent(ref)}/carta_correcao`, {
                correcao: correcao.trim()
            });
            return res.data;
        } catch (err) {
            this._handleError('cartaCorrecaoCte', err, ref);
        }
    }

    // ─────────────────────────────────────────────────────────
    // MDF-e (Manifesto Eletrônico de Documentos Fiscais)
    // ─────────────────────────────────────────────────────────

    /**
     * Envia o MDF-e para autorização na SEFAZ.
     */
    async emitirMdfe(ref, payload) {
        try {
            logger.info(`[FocusClient] Emitindo MDF-e (ref=${ref}) no ambiente ${this.ambiente}`);
            const res = await this.http.post(`/mdfe?ref=${encodeURIComponent(ref)}`, payload);
            return res.data;
        } catch (err) {
            this._handleError('emitirMdfe', err, ref);
        }
    }

    /**
     * Consulta o status do MDF-e.
     */
    async consultarMdfe(ref) {
        try {
            const res = await this.http.get(`/mdfe/${encodeURIComponent(ref)}`);
            return res.data;
        } catch (err) {
            this._handleError('consultarMdfe', err, ref);
        }
    }

    /**
     * Encerra um MDF-e autorizado.
     * @param {string} ref
     * @param {Object} dados - { data, sigla_uf, nome_municipio }
     */
    async encerrarMdfe(ref, { data, sigla_uf, nome_municipio }) {
        try {
            logger.info(`[FocusClient] Encerrando MDF-e (ref=${ref}) em ${nome_municipio}/${sigla_uf}`);
            const res = await this.http.post(`/mdfe/${encodeURIComponent(ref)}/encerrar`, {
                data: data || new Date().toISOString().split('T')[0],
                sigla_uf: sigla_uf.toUpperCase(),
                nome_municipio
            });
            return res.data;
        } catch (err) {
            this._handleError('encerrarMdfe', err, ref);
        }
    }

    /**
     * Adiciona um condutor ao MDF-e em trânsito.
     */
    async incluirCondutorMdfe(ref, { nome, cpf }) {
        try {
            const res = await this.http.post(`/mdfe/${encodeURIComponent(ref)}/inclusao_condutor`, {
                nome,
                cpf: cpf.replace(/\D/g, '')
            });
            return res.data;
        } catch (err) {
            this._handleError('incluirCondutorMdfe', err, ref);
        }
    }

    /**
     * Adiciona documentos (CT-e/NF-e) a um MDF-e já autorizado.
     */
    async incluirDfeMdfe(ref, { protocolo, codigo_municipio_carregamento, documentos }) {
        try {
            const res = await this.http.post(`/mdfe/${encodeURIComponent(ref)}/inclusao_dfe`, {
                protocolo,
                codigo_municipio_carregamento,
                documentos
            });
            return res.data;
        } catch (err) {
            this._handleError('incluirDfeMdfe', err, ref);
        }
    }

    /**
     * Cancela o MDF-e na SEFAZ.
     */
    async cancelarMdfe(ref, justificativa) {
        try {
            const res = await this.http.delete(`/mdfe/${encodeURIComponent(ref)}`, {
                data: { justificativa }
            });
            return res.data;
        } catch (err) {
            this._handleError('cancelarMdfe', err, ref);
        }
    }

    _handleError(metodo, err, ref) {
        const status = err.response?.status;
        const data = err.response?.data;
        logger.error(`[FocusClient] Erro em ${metodo} (ref=${ref}, status=${status}):`, data || err.message);

        const errorMsg = data?.mensagem || data?.error || err.message;
        const customErr = new Error(`[Focus NFe ${metodo}] ${errorMsg}`);
        customErr.status = status;
        customErr.response = data;
        throw customErr;
    }
}

module.exports = FocusClient;
