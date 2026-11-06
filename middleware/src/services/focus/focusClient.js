'use strict';

const axios = require('axios');

const FOCUS_URL_PRODUCAO = 'https://api.focusnfe.com.br';
const FOCUS_URL_HOMOLOGACAO = 'https://homologacao.focusnfe.com.br';

/**
 * Cliente oficial de integração com a API Focus NFe v2
 * Documentação de referência:
 *  - Introdução / Auth:   https://doc.focusnfe.com.br/reference/introducao
 *  - Revenda / Empresas:  https://doc.focusnfe.com.br/reference/empresas
 *  - Gatilhos / Webhooks: https://doc.focusnfe.com.br/reference/gatilhos
 *  - NF-es Recebidas MDe: https://doc.focusnfe.com.br/reference/nfes_recebidas
 *  - CT-e e CT-e OS:      https://doc.focusnfe.com.br/reference/ctecteos
 *  - MDF-e:               https://doc.focusnfe.com.br/reference/mdfe
 *
 * Ambientes:
 *  - Homologação: https://homologacao.focusnfe.com.br
 *  - Produção:    https://api.focusnfe.com.br
 */
class FocusClient {
  /**
   * @param {Object} opts
   * @param {string} [opts.token] - Token legado / fallback ou Master Token
   * @param {string} [opts.tokenHomologacao] - Token específico de Homologação
   * @param {string} [opts.tokenProducao] - Token específico de Produção
   * @param {'homologacao'|'producao'} [opts.ambiente='homologacao'] - Ambiente ativo
   * @param {boolean} [opts.isReseller=false] - Modo Software House / Conta Parceiro (/v2/empresas)
   */
  constructor({
    token,
    tokenHomologacao,
    tokenProducao,
    ambiente = 'homologacao',
    isReseller = false,
  } = {}) {
    this.isReseller = Boolean(isReseller);
    this.ambiente = this.isReseller || ambiente === 'producao' ? 'producao' : 'homologacao';

    const resolvedToken = this.isReseller
      ? String(token || tokenProducao || '').trim()
      : this.ambiente === 'producao'
      ? String(tokenProducao || token || '').trim()
      : String(tokenHomologacao || token || '').trim();

    if (!resolvedToken) {
      if (this.isReseller) {
        throw new Error(
          'Token Principal Focus NFe (Software House) não configurado. Configure em Dados da Empresa (Painel Master) ou na variável FOCUS_MASTER_TOKEN.'
        );
      }
      const label = this.ambiente === 'producao' ? 'Produção' : 'Homologação';
      throw new Error(
        `Token da Focus NFe (${label}) não configurado. Provisione a empresa automaticamente ou informe o token em Dados da Empresa.`
      );
    }

    this.token = resolvedToken;
    this.baseURL =
      this.ambiente === 'producao' ? FOCUS_URL_PRODUCAO : FOCUS_URL_HOMOLOGACAO;

    this.http = axios.create({
      baseURL: this.baseURL,
      timeout: 45000,
      auth: {
        username: this.token,
        password: '', // Focus NFe v2 usa HTTP Basic Auth com o token no username e senha em branco
      },
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Instancia cliente exclusivo de Revenda / Software House (/v2/empresas).
   * A API de Empresas da Focus NFe opera sempre em https://api.focusnfe.com.br com o Token Principal de Produção.
   */
  static forReseller(masterToken) {
    return new FocusClient({
      token: masterToken,
      ambiente: 'producao',
      isReseller: true,
    });
  }

  /**
   * Converte caminhos relativos retornados pela Focus NFe (ex: /arquivos_development/... ou /arquivos/...)
   * em URLs HTTPS absolutas apontando para o host correspondente da Focus NFe.
   */
  static normalizarUrlArquivo(caminhoOuUrl, ambiente = 'homologacao') {
    if (!caminhoOuUrl || typeof caminhoOuUrl !== 'string') return null;
    const clean = caminhoOuUrl.trim();
    if (!clean) return null;
    if (clean.startsWith('http://') || clean.startsWith('https://')) {
      return clean;
    }
    // Caminhos /arquivos_development pertencem a homologação; /arquivos a produção (api.focusnfe.com.br serve ambos)
    const base =
      clean.startsWith('/arquivos_development')
        ? FOCUS_URL_HOMOLOGACAO
        : ambiente === 'producao'
        ? FOCUS_URL_PRODUCAO
        : FOCUS_URL_HOMOLOGACAO;
    return `${base}${clean.startsWith('/') ? '' : '/'}${clean}`;
  }

  /**
   * Testa a conectividade e autenticidade do Token da empresa no ambiente selecionado.
   * Consulta uma referência inexistente:
   * - Se retornar 401/403 -> Token inválido para o ambiente.
   * - Se retornar 404 (Nota não encontrada) ou 200 -> Token válido e autenticado na Focus NFe!
   */
  async testarConexao() {
    const testRef = `coliseu-ping-${Date.now()}`;
    try {
      const res = await this.http.get(`/v2/cte/${encodeURIComponent(testRef)}`);
      return {
        ok: true,
        conectado: true,
        ambiente: this.ambiente,
        baseURL: this.baseURL,
        httpStatus: res.status,
        mensagem: `Conexão com Focus NFe (${this.ambiente.toUpperCase()}) autenticada com sucesso!`,
      };
    } catch (err) {
      const status = err.response?.status;
      if (status === 404) {
        return {
          ok: true,
          conectado: true,
          ambiente: this.ambiente,
          baseURL: this.baseURL,
          httpStatus: 200,
          mensagem: `Token válido! Conexão com Focus NFe (${this.ambiente.toUpperCase()}) estabelecida com sucesso.`,
        };
      }
      if (status === 401 || status === 403) {
        throw new Error(
          `Token recusado pela Focus NFe no ambiente de ${this.ambiente.toUpperCase()} (HTTP ${status}). Verifique se o token corresponde ao ambiente selecionado.`
        );
      }
      throw this._formatError(err);
    }
  }

  // =========================================================================
  // SOFTWARE HOUSE / REVENDA — GESTÃO DE EMPRESAS (/v2/empresas)
  // =========================================================================

  /**
   * Valida o Token Principal da Software House consultando /v2/empresas.
   */
  async testarMasterToken() {
    try {
      const res = await this.http.get('/v2/empresas');
      const lista = Array.isArray(res.data) ? res.data : [];
      const totalHeader = Number(res.headers?.['x-total-count'] || lista.length || 0);
      return {
        ok: true,
        conectado: true,
        baseURL: this.baseURL,
        totalEmpresas: totalHeader,
        mensagem: `Token Principal Focus NFe autenticado com sucesso! (${totalHeader} empresa(s) vinculada(s) na conta parceira).`,
      };
    } catch (err) {
      const status = err.response?.status;
      if (status === 401 || status === 403) {
        throw new Error(
          `Token Principal recusado pela Focus NFe (HTTP ${status}). Confirme se utilizou o "Token principal produção" do Painel API da Focus NFe.`
        );
      }
      throw this._formatError(err);
    }
  }

  /**
   * Lista empresas cadastradas na conta parceira Focus NFe.
   * GET /v2/empresas?cnpj={cnpj}
   */
  async listarEmpresas({ cnpj, cpf, offset } = {}) {
    try {
      const params = {};
      if (cnpj) params.cnpj = String(cnpj).replace(/\D/g, '');
      if (cpf) params.cpf = String(cpf).replace(/\D/g, '');
      if (offset !== undefined) params.offset = Number(offset);
      const res = await this.http.get('/v2/empresas', { params });
      return Array.isArray(res.data) ? res.data : [];
    } catch (err) {
      throw this._formatError(err);
    }
  }

  /**
   * Consulta uma empresa específica pelo ID ou CNPJ na Focus NFe.
   * GET /v2/empresas/{id}
   */
  async consultarEmpresa(empresaId) {
    try {
      const res = await this.http.get(`/v2/empresas/${encodeURIComponent(empresaId)}`);
      return res.data;
    } catch (err) {
      throw this._formatError(err);
    }
  }

  /**
   * Cria uma nova empresa emissora na conta da Software House.
   * POST /v2/empresas
   */
  async criarEmpresa(payload, { dryRun = false } = {}) {
    try {
      const q = dryRun ? '?dry_run=1' : '';
      const res = await this.http.post(`/v2/empresas${q}`, payload);
      return res.data;
    } catch (err) {
      throw this._formatError(err);
    }
  }

  /**
   * Atualiza dados fiscais, habilitações ou certificado A1 de uma empresa na Focus NFe.
   * PUT /v2/empresas/{id}
   */
  async atualizarEmpresa(empresaId, payload, { dryRun = false } = {}) {
    try {
      const q = dryRun ? '?dry_run=1' : '';
      const res = await this.http.put(
        `/v2/empresas/${encodeURIComponent(empresaId)}${q}`,
        payload
      );
      return res.data;
    } catch (err) {
      throw this._formatError(err);
    }
  }

  // =========================================================================
  // GATILHOS / WEBHOOKS (/v2/hooks)
  // =========================================================================

  /**
   * Lista todos os webhooks ativos para o token autenticado.
   * GET /v2/hooks
   */
  async listarHooks() {
    try {
      const res = await this.http.get('/v2/hooks');
      return Array.isArray(res.data) ? res.data : [];
    } catch (err) {
      throw this._formatError(err);
    }
  }

  /**
   * Cria um webhook na Focus NFe para eventos fiscais (cte, mdfe, nfe, etc.).
   * POST /v2/hooks
   */
  async criarHook({ cnpj, cpf, event, url, authorization, authorization_header }) {
    try {
      const body = {
        event,
        url,
      };
      if (cnpj) body.cnpj = String(cnpj).replace(/\D/g, '');
      if (cpf) body.cpf = String(cpf).replace(/\D/g, '');
      if (authorization) body.authorization = authorization;
      if (authorization_header) body.authorization_header = authorization_header;

      const res = await this.http.post('/v2/hooks', body);
      return res.data;
    } catch (err) {
      throw this._formatError(err);
    }
  }

  /**
   * Remove um webhook existente pelo ID.
   * DELETE /v2/hooks/{hook_id}
   */
  async excluirHook(hookId) {
    try {
      const res = await this.http.delete(`/v2/hooks/${encodeURIComponent(hookId)}`);
      return res.data;
    } catch (err) {
      throw this._formatError(err);
    }
  }

  // =========================================================================
  // MDe — NF-es RECEBIDAS / DESTINADAS (/v2/nfes_recebidas)
  // =========================================================================

  /**
   * Consulta as NF-es destinadas/transportadas na SEFAZ via Focus MDe.
   * GET /v2/nfes_recebidas?cnpj={cnpj}&versao={versao}
   */
  async listarNfesRecebidas({ cnpj, versao, pendente, pendente_ciencia } = {}) {
    try {
      const params = {};
      if (cnpj) params.cnpj = String(cnpj).replace(/\D/g, '');
      if (versao !== undefined && versao !== null && Number(versao) > 0) {
        params.versao = Number(versao);
      }
      if (pendente) params.pendente = 1;
      if (pendente_ciencia) params.pendente_ciencia = 1;

      const res = await this.http.get('/v2/nfes_recebidas', { params });
      const items = Array.isArray(res.data) ? res.data : [];
      const maxHeader = Number(res.headers?.['x-max-version'] || 0);
      const maxFromItems = items.reduce(
        (acc, it) => Math.max(acc, Number(it?.versao || 0)),
        0
      );
      return {
        items,
        maxVersion: Math.max(maxHeader, maxFromItems),
        totalCount: Number(res.headers?.['x-total-count'] || items.length),
      };
    } catch (err) {
      throw this._formatError(err);
    }
  }

  /**
   * Consulta detalhes (e caminho_xml) de uma NF-e recebida pela chave de 44 dígitos.
   * GET /v2/nfes_recebidas/{chave}?completa=1
   */
  async consultarNfeRecebida(chave, completa = true) {
    try {
      const cleanChave = String(chave || '').replace(/\D/g, '');
      const q = completa ? '?completa=1' : '';
      const res = await this.http.get(`/v2/nfes_recebidas/${encodeURIComponent(cleanChave)}${q}`);
      return res.data;
    } catch (err) {
      throw this._formatError(err);
    }
  }

  /**
   * Baixa diretamente o XML autorizado de uma NF-e recebida (após Ciência ou Confirmação).
   * GET /v2/nfes_recebidas/{chave}.xml
   */
  async baixarXmlNfeRecebida(chave) {
    try {
      const cleanChave = String(chave || '').replace(/\D/g, '');
      const res = await this.http.get(`/v2/nfes_recebidas/${encodeURIComponent(cleanChave)}.xml`, {
        responseType: 'text',
        headers: { Accept: 'application/xml, text/xml, */*' },
      });
      return typeof res.data === 'string' ? res.data : String(res.data || '');
    } catch (err) {
      throw this._formatError(err);
    }
  }

  /**
   * Registra Manifestação do Destinatário na SEFAZ para uma NF-e recebida.
   * POST /v2/nfes_recebidas/{chave}/manifesto
   * @param {string} chave - 44 dígitos
   * @param {Object} opts - { tipo: 'ciencia'|'confirmacao'|'desconhecimento'|'nao_realizada', justificativa?: string }
   */
  async manifestarNfeRecebida(chave, { tipo, justificativa } = {}) {
    try {
      const cleanChave = String(chave || '').replace(/\D/g, '');
      const body = { tipo };
      if (justificativa) body.justificativa = String(justificativa).trim();
      const res = await this.http.post(
        `/v2/nfes_recebidas/${encodeURIComponent(cleanChave)}/manifesto`,
        body
      );
      return res.data;
    } catch (err) {
      throw this._formatError(err);
    }
  }

  // =========================================================================
  // CT-e (Modelo 57 - /v2/cte)
  // =========================================================================

  /**
   * Envia um CT-e (Modelo 57) para processamento assíncrono na Focus NFe
   * POST /v2/cte?ref={referencia}
   */
  async emitirCte(ref, payload) {
    try {
      const res = await this.http.post(`/v2/cte?ref=${encodeURIComponent(ref)}`, payload);
      return res.data;
    } catch (err) {
      throw this._formatError(err);
    }
  }

  /**
   * Consulta o status atual de um CT-e na Focus NFe
   * GET /v2/cte/{ref}?completa={0|1}
   */
  async consultarCte(ref, completa = true) {
    try {
      const q = completa ? '?completa=1' : '';
      const res = await this.http.get(`/v2/cte/${encodeURIComponent(ref)}${q}`);
      return res.data;
    } catch (err) {
      throw this._formatError(err);
    }
  }

  /**
   * Cancela um CT-e autorizado
   * DELETE /v2/cte/{ref}
   * @param {string} ref
   * @param {string} justificativa - Mínimo 15 caracteres
   */
  async cancelarCte(ref, justificativa) {
    try {
      const res = await this.http.delete(`/v2/cte/${encodeURIComponent(ref)}`, {
        data: { justificativa },
      });
      return res.data;
    } catch (err) {
      throw this._formatError(err);
    }
  }

  /**
   * Emite Carta de Correção Eletrônica (CC-e) para o CT-e
   * POST /v2/cte/{ref}/carta_correcao
   */
  async cartaCorrecaoCte(ref, correcoesPayload) {
    try {
      const body = Array.isArray(correcoesPayload)
        ? { correcoes: correcoesPayload }
        : correcoesPayload;
      const res = await this.http.post(
        `/v2/cte/${encodeURIComponent(ref)}/carta_correcao`,
        body
      );
      return res.data;
    } catch (err) {
      throw this._formatError(err);
    }
  }

  /**
   * Registra evento de Prestação de Serviço em Desacordo no CT-e
   * POST /v2/cte/{ref}/prestacao_em_desacordo
   */
  async prestacaoDesacordoCte(ref, observacoes) {
    try {
      const res = await this.http.post(
        `/v2/cte/${encodeURIComponent(ref)}/prestacao_em_desacordo`,
        { observacoes }
      );
      return res.data;
    } catch (err) {
      throw this._formatError(err);
    }
  }

  /**
   * Registra evento de Insucesso na Entrega do CT-e
   * POST /v2/cte/{ref}/insucesso_entrega
   */
  async insucessoEntregaCte(ref, dados) {
    try {
      const res = await this.http.post(
        `/v2/cte/${encodeURIComponent(ref)}/insucesso_entrega`,
        dados
      );
      return res.data;
    } catch (err) {
      throw this._formatError(err);
    }
  }

  /**
   * Cancela evento de Insucesso na Entrega do CT-e
   * POST /v2/cte/{ref}/cancela_insucesso_entrega
   */
  async cancelarInsucessoEntregaCte(ref, numeroSequencialEvento = 1) {
    try {
      const res = await this.http.post(
        `/v2/cte/${encodeURIComponent(ref)}/cancela_insucesso_entrega`,
        { numero_sequencial_evento: Number(numeroSequencialEvento) || 1 }
      );
      return res.data;
    } catch (err) {
      throw this._formatError(err);
    }
  }

  /**
   * Envia o CT-e por e-mail para os destinatários informados
   * POST /v2/cte/{ref}/email
   */
  async enviarEmailCte(ref, emails) {
    try {
      const lista = Array.isArray(emails) ? emails : [emails];
      const res = await this.http.post(`/v2/cte/${encodeURIComponent(ref)}/email`, {
        emails: lista,
      });
      return res.data;
    } catch (err) {
      throw this._formatError(err);
    }
  }

  /**
   * Solicita reenvio do Webhook do CT-e
   * POST /v2/cte/{ref}/reenviar_hook
   */
  async reenviarHookCte(ref) {
    try {
      const res = await this.http.post(`/v2/cte/${encodeURIComponent(ref)}/reenviar_hook`);
      return res.data;
    } catch (err) {
      throw this._formatError(err);
    }
  }

  /**
   * Registra evento adicional em CT-e
   */
  async eventoCte(ref, tipoEvento, dados) {
    try {
      const res = await this.http.post(
        `/v2/cte/${encodeURIComponent(ref)}/${encodeURIComponent(tipoEvento)}`,
        dados
      );
      return res.data;
    } catch (err) {
      throw this._formatError(err);
    }
  }

  // =========================================================================
  // CT-e OS (Modelo 67 - Outros Serviços - /v2/cteos)
  // =========================================================================

  async emitirCteOs(ref, payload) {
    try {
      const res = await this.http.post(`/v2/cteos?ref=${encodeURIComponent(ref)}`, payload);
      return res.data;
    } catch (err) {
      throw this._formatError(err);
    }
  }

  async consultarCteOs(ref, completa = true) {
    try {
      const q = completa ? '?completa=1' : '';
      const res = await this.http.get(`/v2/cteos/${encodeURIComponent(ref)}${q}`);
      return res.data;
    } catch (err) {
      throw this._formatError(err);
    }
  }

  async cancelarCteOs(ref, justificativa) {
    try {
      const res = await this.http.delete(`/v2/cteos/${encodeURIComponent(ref)}`, {
        data: { justificativa },
      });
      return res.data;
    } catch (err) {
      throw this._formatError(err);
    }
  }

  async cartaCorrecaoCteOs(ref, correcoesPayload) {
    try {
      const body = Array.isArray(correcoesPayload)
        ? { correcoes: correcoesPayload }
        : correcoesPayload;
      const res = await this.http.post(
        `/v2/cteos/${encodeURIComponent(ref)}/carta_correcao`,
        body
      );
      return res.data;
    } catch (err) {
      throw this._formatError(err);
    }
  }

  async prestacaoDesacordoCteOs(ref, observacoes) {
    try {
      const res = await this.http.post(
        `/v2/cteos/${encodeURIComponent(ref)}/prestacao_em_desacordo`,
        { observacoes }
      );
      return res.data;
    } catch (err) {
      throw this._formatError(err);
    }
  }

  async reenviarHookCteOs(ref) {
    try {
      const res = await this.http.post(`/v2/cteos/${encodeURIComponent(ref)}/reenviar_hook`);
      return res.data;
    } catch (err) {
      throw this._formatError(err);
    }
  }

  // =========================================================================
  // MDF-e (Modelo 58 - /v2/mdfe)
  // =========================================================================

  async emitirMdfe(ref, payload) {
    try {
      const res = await this.http.post(`/v2/mdfe?ref=${encodeURIComponent(ref)}`, payload);
      return res.data;
    } catch (err) {
      throw this._formatError(err);
    }
  }

  async consultarMdfe(ref, completa = true) {
    try {
      const q = completa ? '?completa=1' : '';
      const res = await this.http.get(`/v2/mdfe/${encodeURIComponent(ref)}${q}`);
      return res.data;
    } catch (err) {
      throw this._formatError(err);
    }
  }

  async encerrarMdfe(ref, dados) {
    try {
      const res = await this.http.post(`/v2/mdfe/${encodeURIComponent(ref)}/encerrar`, dados);
      return res.data;
    } catch (err) {
      throw this._formatError(err);
    }
  }

  async incluirCondutorMdfe(ref, condutor) {
    try {
      const res = await this.http.post(
        `/v2/mdfe/${encodeURIComponent(ref)}/incluir_condutor`,
        condutor
      );
      return res.data;
    } catch (err) {
      throw this._formatError(err);
    }
  }

  async incluirDfeMdfe(ref, dadosDfe) {
    try {
      const res = await this.http.post(
        `/v2/mdfe/${encodeURIComponent(ref)}/incluir_dfe`,
        dadosDfe
      );
      return res.data;
    } catch (err) {
      throw this._formatError(err);
    }
  }

  async cancelarMdfe(ref, justificativa) {
    try {
      const res = await this.http.delete(`/v2/mdfe/${encodeURIComponent(ref)}`, {
        data: { justificativa },
      });
      return res.data;
    } catch (err) {
      throw this._formatError(err);
    }
  }

  async reenviarHookMdfe(ref) {
    try {
      const res = await this.http.post(`/v2/mdfe/${encodeURIComponent(ref)}/reenviar_hook`);
      return res.data;
    } catch (err) {
      throw this._formatError(err);
    }
  }

  /**
   * Faz download de artefatos (PDF DACTE/DAMDFE ou XML) retornados pela Focus NFe.
   * Compatível com paths relativos (/arquivos_development/...), endpoints /v2/... e URLs S3 assinadas.
   */
  async downloadArquivo(caminhoOuUrl) {
    const url = FocusClient.normalizarUrlArquivo(caminhoOuUrl, this.ambiente);
    if (!url) {
      throw new Error('Caminho do arquivo fiscal ausente.');
    }

    let parsedUrl = null;
    try {
      parsedUrl = new URL(url);
    } catch (_) {
      parsedUrl = null;
    }

    const isFocusApiEndpoint =
      parsedUrl &&
      parsedUrl.hostname.endsWith('focusnfe.com.br') &&
      parsedUrl.pathname.startsWith('/v2/');

    try {
      const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000,
        ...(isFocusApiEndpoint
          ? { auth: { username: this.token, password: '' } }
          : {}),
      });
      return Buffer.from(res.data);
    } catch (err) {
      // Se path estático em focusnfe.com.br exigir Basic Auth, tenta novamente autenticado
      if (
        !isFocusApiEndpoint &&
        parsedUrl &&
        parsedUrl.hostname.endsWith('focusnfe.com.br') &&
        (err.response?.status === 401 || err.response?.status === 403)
      ) {
        try {
          const retry = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 30000,
            auth: { username: this.token, password: '' },
          });
          return Buffer.from(retry.data);
        } catch (retryErr) {
          throw this._formatError(retryErr);
        }
      }
      throw this._formatError(err);
    }
  }

  _formatError(err) {
    if (err.response && err.response.data) {
      let data = err.response.data;
      if (Buffer.isBuffer(data)) {
        try {
          data = JSON.parse(data.toString('utf8'));
        } catch (_) {
          data = { mensagem: data.toString('utf8').slice(0, 300) };
        }
      }
      const msg =
        data.mensagem ||
        data.message ||
        (Array.isArray(data.erros)
          ? data.erros
              .map((e) => `${e.campo ? `[${e.campo}] ` : ''}${e.mensagem || e.codigo || JSON.stringify(e)}`)
              .join('; ')
          : typeof data === 'string'
          ? data
          : JSON.stringify(data));
      const formatted = new Error(`Focus NFe [${err.response.status}]: ${msg}`);
      formatted.statusCode = err.response.status;
      formatted.focusData = data;
      return formatted;
    }
    return err;
  }
}

module.exports = FocusClient;
