const axios = require('axios');

/**
 * Cliente de integração com a API Focus NFe v2
 * Documentação:
 *  - CT-e e CT-e OS: https://doc.focusnfe.com.br/reference/ctecteos
 *  - MDF-e:          https://doc.focusnfe.com.br/reference/mdfe
 *
 * Ambientes:
 *  - Homologação: https://homologacao.focusnfe.com.br
 *  - Produção:    https://api.focusnfe.com.br
 */
class FocusClient {
  /**
   * @param {Object} opts
   * @param {string} [opts.token] - Token legado / fallback
   * @param {string} [opts.tokenHomologacao] - Token específico de Homologação
   * @param {string} [opts.tokenProducao] - Token específico de Produção
   * @param {'homologacao'|'producao'} [opts.ambiente='homologacao'] - Ambiente ativo
   */
  constructor({ token, tokenHomologacao, tokenProducao, ambiente = 'homologacao' } = {}) {
    this.ambiente = ambiente === 'producao' ? 'producao' : 'homologacao';

    const resolvedToken =
      this.ambiente === 'producao'
        ? (tokenProducao || token || '').trim()
        : (tokenHomologacao || token || '').trim();

    if (!resolvedToken) {
      const label = this.ambiente === 'producao' ? 'Produção' : 'Homologação';
      throw new Error(
        `Token da Focus NFe (${label}) não configurado. Acesse Configurações > Fiscal ou Dados da Empresa e informe o token.`
      );
    }

    this.token = resolvedToken;
    this.baseURL =
      this.ambiente === 'producao'
        ? 'https://api.focusnfe.com.br'
        : 'https://homologacao.focusnfe.com.br';

    this.http = axios.create({
      baseURL: this.baseURL,
      timeout: 45000,
      auth: {
        username: this.token,
        password: '', // Focus NFe usa HTTP Basic Auth com o token no username e senha vazia
      },
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Testa a conectividade e autenticidade do Token no ambiente selecionado.
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
   * Aceita tanto objeto simples { grupo_alterado, campo_alterado, valor_alterado, numero_item_alterado }
   * quanto array { correcoes: [...] }
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
   * @param {string} ref
   * @param {string} observacoes - Mínimo 15 caracteres
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
   * @param {string} ref
   * @param {string[]} emails
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
   * Registra evento adicional em CT-e (ex: comprovante de entrega, desacordo, etc.)
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

  /**
   * Emite um CT-e OS (Modelo 67)
   * POST /v2/cteos?ref={referencia}
   */
  async emitirCteOs(ref, payload) {
    try {
      const res = await this.http.post(`/v2/cteos?ref=${encodeURIComponent(ref)}`, payload);
      return res.data;
    } catch (err) {
      throw this._formatError(err);
    }
  }

  /**
   * Consulta um CT-e OS (Modelo 67)
   * GET /v2/cteos/{ref}?completa={0|1}
   */
  async consultarCteOs(ref, completa = true) {
    try {
      const q = completa ? '?completa=1' : '';
      const res = await this.http.get(`/v2/cteos/${encodeURIComponent(ref)}${q}`);
      return res.data;
    } catch (err) {
      throw this._formatError(err);
    }
  }

  /**
   * Cancela um CT-e OS autorizado
   * DELETE /v2/cteos/{ref}
   */
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

  /**
   * Carta de Correção para CT-e OS
   * POST /v2/cteos/{ref}/carta_correcao
   */
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

  /**
   * Prestação de Serviço em Desacordo para CT-e OS
   * POST /v2/cteos/{ref}/prestacao_em_desacordo
   */
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

  /**
   * Reenvia Webhook de CT-e OS
   * POST /v2/cteos/{ref}/reenviar_hook
   */
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

  /**
   * Emite um MDF-e na Focus NFe
   * POST /v2/mdfe?ref={referencia}
   */
  async emitirMdfe(ref, payload) {
    try {
      const res = await this.http.post(`/v2/mdfe?ref=${encodeURIComponent(ref)}`, payload);
      return res.data;
    } catch (err) {
      throw this._formatError(err);
    }
  }

  /**
   * Consulta o status atual de um MDF-e na Focus NFe
   * GET /v2/mdfe/{ref}?completa={0|1}
   */
  async consultarMdfe(ref, completa = true) {
    try {
      const q = completa ? '?completa=1' : '';
      const res = await this.http.get(`/v2/mdfe/${encodeURIComponent(ref)}${q}`);
      return res.data;
    } catch (err) {
      throw this._formatError(err);
    }
  }

  /**
   * Encerra um MDF-e autorizado (obrigatório ao término da viagem)
   * POST /v2/mdfe/{ref}/encerrar
   * @param {string} ref
   * @param {Object} dados - { data, sigla_uf, nome_municipio, codigo_municipio }
   */
  async encerrarMdfe(ref, dados) {
    try {
      const res = await this.http.post(`/v2/mdfe/${encodeURIComponent(ref)}/encerrar`, dados);
      return res.data;
    } catch (err) {
      throw this._formatError(err);
    }
  }

  /**
   * Inclui novo condutor em um MDF-e em trânsito
   * POST /v2/mdfe/{ref}/incluir_condutor
   * @param {string} ref
   * @param {Object} condutor - { nome, cpf }
   */
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

  /**
   * Inclui novo DF-e (CT-e ou NF-e) em um MDF-e em trânsito
   * POST /v2/mdfe/{ref}/incluir_dfe
   */
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

  /**
   * Cancela um MDF-e autorizado (dentro do prazo legal de 24h e sem início de viagem)
   * DELETE /v2/mdfe/{ref}
   */
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

  /**
   * Solicita reenvio do Webhook do MDF-e
   * POST /v2/mdfe/{ref}/reenviar_hook
   */
  async reenviarHookMdfe(ref) {
    try {
      const res = await this.http.post(`/v2/mdfe/${encodeURIComponent(ref)}/reenviar_hook`);
      return res.data;
    } catch (err) {
      throw this._formatError(err);
    }
  }

  /**
   * Faz download de artefatos (PDF DACTE/DAMDFE ou XML) retornados pela Focus NFe
   */
  async downloadArquivo(caminhoOuUrl) {
    try {
      const url = caminhoOuUrl.startsWith('http')
        ? caminhoOuUrl
        : `${this.baseURL}${caminhoOuUrl.startsWith('/') ? '' : '/'}${caminhoOuUrl}`;
      const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000,
      });
      return res.data;
    } catch (err) {
      throw this._formatError(err);
    }
  }

  _formatError(err) {
    if (err.response && err.response.data) {
      const data = err.response.data;
      const msg =
        data.mensagem ||
        data.message ||
        (Array.isArray(data.erros)
          ? data.erros.map((e) => `${e.campo ? `[${e.campo}] ` : ''}${e.mensagem}`).join('; ')
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
