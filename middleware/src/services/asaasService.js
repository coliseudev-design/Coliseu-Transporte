'use strict';

/**
 * AsaasService.js - Antigravity Nexus Financial Engine
 * Módulo de Integração com a API V3 do Banco Asaas para Emissão de Boletos Bancários.
 */

const db = require('../db/postgres');
const logger = require('../config/logger');

class AsaasService {
  /**
   * Obtém a URL base conforme o ambiente configurado no banco de dados para o tenant.
   */
  static getBaseUrl(ambiente) {
    const isProd = (ambiente || '').toLowerCase() === 'producao' || (ambiente || '').toLowerCase() === 'produção';
    return isProd ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3';
  }

  /**
   * Recupera a configuração do Asaas para o tenant no banco PostgreSQL.
   */
  static async getConfig(tenantId) {
    let { rows } = await db.query(
      `SELECT * FROM dash_integracoes_config 
       WHERE ($1 = '00000000-0000-0000-0000-000000000000' OR LOWER(tenant_id::text) = LOWER($1::text)) 
         AND asaas_access_token IS NOT NULL 
         AND TRIM(asaas_access_token) != ''
       LIMIT 1`,
      [String(tenantId)]
    );

    if (rows.length === 0) {
      const fallback = await db.query(
        "SELECT * FROM dash_integracoes_config WHERE asaas_access_token IS NOT NULL AND asaas_access_token != '' LIMIT 1"
      );
      rows = fallback.rows;
    }

    if (rows.length === 0 || !rows[0].asaas_access_token) {
      throw new Error('Configuração do Banco Asaas não encontrada ou token de acesso (access_token) não informado.');
    }

    const conf = rows[0];
    return {
      token: conf.asaas_access_token,
      ambiente: conf.asaas_ambiente || 'Produção',
      baseUrl: this.getBaseUrl(conf.asaas_ambiente || 'Produção'),
      jurosPadrao: parseFloat(conf.asaas_juros_padrao || 1),
      multaPadrao: parseFloat(conf.asaas_multa_padrao || 2),
      descontoPadrao: parseFloat(conf.asaas_desconto_padrao || 0)
    };
  }

  /**
   * Retorna os Headers HTTP padrões exigidos pela API V3 do Asaas.
   */
  static getHeaders(token) {
    return {
      'Content-Type': 'application/json',
      'User-Agent': 'Coliseu-Transporte-ERP/1.0',
      'access_token': token
    };
  }

  static async testConnection(token, ambiente) {
    let targetAmbiente = ambiente || 'Produção';
    let baseUrl = this.getBaseUrl(targetAmbiente);

    // 1. Tenta primeiro no ambiente selecionado pelo usuário
    let response = null;
    try {
      response = await fetch(`${baseUrl}/finance/balance`, {
        method: 'GET',
        headers: this.getHeaders(token)
      });
    } catch (fetchErr) {
      logger.warn('[AsaasService] Falha ao comunicar com o Asaas no ambiente inicial', { ambiente: targetAmbiente, err: fetchErr.message });
    }

    // 2. Se falhou (401, 502, fetch erro), tenta autodetectar no ambiente alternativo
    if (!response || !response.ok) {
      const isCurrentlySandbox = (targetAmbiente || '').toLowerCase().includes('sandbox') || (targetAmbiente || '').toLowerCase().includes('homolog');
      const altAmbiente = isCurrentlySandbox ? 'Produção' : 'Sandbox';
      const altBaseUrl = this.getBaseUrl(altAmbiente);

      try {
        const altRes = await fetch(`${altBaseUrl}/finance/balance`, {
          method: 'GET',
          headers: this.getHeaders(token)
        });

        if (altRes.ok) {
          const altData = await altRes.json();
          logger.info('[AsaasService] Token pertence ao ambiente alternativo', { ambienteDetectado: altAmbiente });
          return {
            ...altData,
            ambienteDetectado: altAmbiente,
            avisoAmbiente: `A sua Chave API foi validada no ambiente de **${altAmbiente}**! O campo "Ambiente" foi ajustado automaticamente para ${altAmbiente}.`
          };
        }
      } catch (altErr) {
        // Ignora erro alternativo
      }
    }

    // 3. Se respondeu no ambiente principal, trata o retorno
    if (response && response.ok) {
      return await response.json();
    }

    // 4. Tratamento detalhado de erros HTTP (incluindo HTML 502 / 503)
    let errDescription = '';
    if (response) {
      try {
        const errData = await response.json();
        errDescription = Array.isArray(errData?.errors) && errData.errors.length > 0
          ? errData.errors.map(e => e.description || e.message).join(' | ')
          : (errData?.message || `HTTP ${response.status}`);
      } catch (e) {
        if (response.status === 401) {
          errDescription = 'Chave API (access_token) inválida ou não autorizada. Verifique a chave informada.';
        } else {
          errDescription = `Erro de comunicação com os servidores do Asaas (HTTP ${response.status} - Indisponibilidade/Bad Gateway). Verifique se o seu Token pertence ao ambiente de ${targetAmbiente}.`;
        }
      }
    } else {
      errDescription = 'Não foi possível conectar ao servidor do Asaas (Timeout/Sem internet).';
    }

    throw new Error(`Falha na autenticação com o Asaas: ${errDescription}`);
  }

  /**
   * Helper para requisições seguras ao Asaas com Timeout e tratamento de HTML (502/503/401)
   */
  static async requestAsaas(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout || 15000);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeout);

      const contentType = response.headers.get('content-type') || '';
      let data = null;
      if (contentType.includes('application/json')) {
        data = await response.json().catch(() => null);
      } else {
        await response.text().catch(() => '');
        if (!response.ok) {
          throw new Error(`Servidor do Asaas indisponível no momento (HTTP ${response.status}). Verifique o ambiente (Produção/Sandbox) ou o token cadastrado.`);
        }
      }

      return { ok: response.ok, status: response.status, data };
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        throw new Error('A conexão com a API do Banco Asaas excedeu o tempo limite (Timeout 15s).');
      }
      throw err;
    }
  }

  /**
   * 2A. Cadastro / Busca de Cliente no Asaas (POST /v3/customers)
   */
  static async createOrGetCustomer(tenantId, customerData) {
    const config = await this.getConfig(tenantId);
    const { name, cpfCnpj, email, phone, postalCode, addressNumber } = customerData;

    if (!cpfCnpj) {
      throw new Error(`CPF/CNPJ do cliente "${name || ''}" é obrigatório para emissão de boleto no Asaas.`);
    }

    const cleanCpfCnpj = String(cpfCnpj).replace(/\D/g, '');

    if (!cleanCpfCnpj || (cleanCpfCnpj.length !== 11 && cleanCpfCnpj.length !== 14)) {
      throw new Error(`CPF/CNPJ do cliente "${name || ''}" é inválido (${cpfCnpj}). É necessário ter 11 dígitos para CPF ou 14 para CNPJ.`);
    }

    // 1. Pesquisa se o cliente já existe no Asaas pelo CPF/CNPJ
    const searchRes = await this.requestAsaas(`${config.baseUrl}/customers?cpfCnpj=${cleanCpfCnpj}`, {
      method: 'GET',
      headers: this.getHeaders(config.token)
    }).catch(() => null);

    if (searchRes && searchRes.ok && searchRes.data?.data?.length > 0) {
      logger.info('[AsaasService] Cliente já existente localizado no Asaas', { id: searchRes.data.data[0].id, name });
      return searchRes.data.data[0];
    }

    // 2. Se não existir, cadastra novo cliente no Asaas
    const payload = {
      name: name || 'Cliente Coliseu Transporte',
      cpfCnpj: cleanCpfCnpj,
      email: email || undefined,
      phone: phone ? String(phone).replace(/\D/g, '') : undefined,
      mobilePhone: phone ? String(phone).replace(/\D/g, '') : undefined,
      postalCode: postalCode ? String(postalCode).replace(/\D/g, '') : undefined,
      addressNumber: addressNumber || undefined,
      notificationDisabled: false
    };

    const res = await this.requestAsaas(`${config.baseUrl}/customers`, {
      method: 'POST',
      headers: this.getHeaders(config.token),
      body: JSON.stringify(payload)
    });

    const responseData = res.data;

    if (!res.ok) {
      const errorMsg = Array.isArray(responseData?.errors) && responseData.errors.length > 0
        ? responseData.errors.map(e => e.description || e.message).join(' | ')
        : (responseData?.message || `Erro ao cadastrar cliente no Asaas (HTTP ${res.status}).`);
      throw new Error(errorMsg);
    }

    logger.info('[AsaasService] Cliente criado com sucesso no Asaas', { id: responseData.id, name });
    return responseData;
  }

  /**
   * Busca dados do cliente no Asaas pelo ID do cliente (cus_...)
   */
  static async getCustomerById(tenantId, customerId) {
    if (!customerId) return null;
    try {
      const config = await this.getConfig(tenantId);
      const res = await fetch(`${config.baseUrl}/customers/${customerId}`, {
        method: 'GET',
        headers: this.getHeaders(config.token)
      });
      if (res.ok) {
        return await res.json();
      }
      return null;
    } catch (err) {
      return null;
    }
  }

  /**
   * 2B. Emissão de Cobrança / Boleto Bancário (POST /v3/payments)
   */
  static async createPayment(tenantId, paymentParams) {
    const config = await this.getConfig(tenantId);
    const {
      customerId,
      value,
      dueDate,
      description,
      fine = config.multaPadrao,
      interest = config.jurosPadrao,
      discount = config.descontoPadrao
    } = paymentParams;

    if (!customerId || !value || !dueDate) {
      throw new Error('Parâmetros obrigatórios ausentes para emissão de boleto (customerId, value, dueDate).');
    }

    // Auto-ajuste de data no passado para hoje (evita rejeição do Asaas)
    const todayStr = new Date().toISOString().split('T')[0];
    let targetDueDate = String(dueDate).split('T')[0];
    if (!targetDueDate || targetDueDate < todayStr) {
      targetDueDate = todayStr;
    }

    const payload = {
      customer: customerId,
      billingType: 'BOLETO',
      value: parseFloat(value),
      dueDate: targetDueDate,
      description: description || 'Título de Cobrança Coliseu Transporte',
      fine: fine > 0 ? { value: parseFloat(fine) } : undefined,
      interest: interest > 0 ? { value: parseFloat(interest) } : undefined,
      discount: discount > 0 ? { value: parseFloat(discount), type: 'PERCENTAGE' } : undefined
    };

    const res = await this.requestAsaas(`${config.baseUrl}/payments`, {
      method: 'POST',
      headers: this.getHeaders(config.token),
      body: JSON.stringify(payload)
    });

    const responseData = res.data;

    if (!res.ok) {
      const errorMsg = Array.isArray(responseData?.errors) && responseData.errors.length > 0
        ? responseData.errors.map(e => e.description || e.message).join(' | ')
        : (responseData?.message || `Erro ao gerar cobrança no Asaas (HTTP ${res.status}).`);
      throw new Error(errorMsg);
    }

    logger.info('[AsaasService] Boleto emitido com sucesso', { paymentId: responseData?.id, value: responseData?.value });

    // Busca a linha digitável e código de barras para retorno completo
    let identificationFieldData = null;
    try {
      if (responseData?.id) {
        identificationFieldData = await this.getIdentificationField(tenantId, responseData.id);
      }
    } catch (err) {
      logger.warn('[AsaasService] Não foi possível buscar a linha digitável imediatamente', { error: err.message });
    }

    return {
      ...responseData,
      linhaDigitavel: identificationFieldData?.identificationField || null,
      barCode: identificationFieldData?.barCode || null,
      nossoNumero: identificationFieldData?.nossoNumero || responseData?.nossoNumero || responseData?.id || null
    };
  }

  /**
   * 2C. Obter Dados de um Pagamento no Asaas (GET /v3/payments/{id})
   */
  static async getPayment(tenantId, paymentId) {
    if (!paymentId) return null;
    const config = await this.getConfig(tenantId);
    const res = await this.requestAsaas(`${config.baseUrl}/payments/${paymentId}`, {
      method: 'GET',
      headers: this.getHeaders(config.token)
    });
    if (!res.ok) {
      throw new Error(`Asaas GetPayment Error: ${res.data?.message || res.status}`);
    }
    return res.data;
  }

  /**
   * 2D. Obter Linha Digitável e Código de Barras (GET /v3/payments/{paymentId}/identificationField)
   */
  static async getIdentificationField(tenantId, paymentId) {
    const config = await this.getConfig(tenantId);

    const res = await this.requestAsaas(`${config.baseUrl}/payments/${paymentId}/identificationField`, {
      method: 'GET',
      headers: this.getHeaders(config.token)
    });

    const responseData = res.data;

    if (!res.ok) {
      const errorMsg = responseData?.errors?.[0]?.description || `Erro ao obter linha digitável do Asaas (HTTP ${res.status}).`;
      throw new Error(`Asaas IdentificationField Error: ${errorMsg}`);
    }

    return responseData;
  }

  /**
   * 2E. Cancelar / Remover Cobrança no Asaas (DELETE /v3/payments/{id})
   */
  static async cancelPayment(tenantId, paymentId) {
    if (!paymentId) return null;
    const config = await this.getConfig(tenantId);

    const response = await fetch(`${config.baseUrl}/payments/${paymentId}`, {
      method: 'DELETE',
      headers: this.getHeaders(config.token)
    });

    const responseData = await response.json();

    if (!response.ok) {
      const errorMsg = responseData?.errors?.[0]?.description || 'Erro ao cancelar cobrança no Asaas.';
      throw new Error(`Asaas Cancel Error: ${errorMsg}`);
    }

    logger.info('[AsaasService] Boleto cancelado com sucesso no Asaas', { paymentId });
    return responseData;
  }

  /**
   * 2D. Processamento de Notificações Webhook recebidas do Asaas
   */
  static async handleWebhook(payload) {
    const { event, payment } = payload;

    if (!event || !payment) {
      logger.warn('[AsaasWebhook] Evento ou objeto de pagamento ausente no payload.');
      return { success: false, message: 'Payload inválido' };
    }

    const paymentId = payment.id;
    const customerId = payment.customer;
    const value = payment.value;
    const paymentDate = payment.paymentDate || payment.confirmedDate || new Date().toISOString();

    logger.info('[AsaasWebhook] Evento de webhook recebido', { event, paymentId, value });

    let newStatus = null;

    switch (event) {
      case 'PAYMENT_CONFIRMED':
      case 'PAYMENT_RECEIVED':
      case 'PAYMENT_RECEIVED_IN_CASH_UNDONE':
        newStatus = 'PAGO';
        break;
      case 'PAYMENT_OVERDUE':
        newStatus = 'ABERTO';
        break;
      case 'PAYMENT_REFUNDED':
      case 'PAYMENT_DELETED':
      case 'PAYMENT_CHARGEBACK_REQUESTED':
        newStatus = 'CANCELADO';
        break;
      default:
        logger.info(`[AsaasWebhook] Evento ignorado sem alteração de status: ${event}`);
        return { success: true, event, processed: false };
    }

    if (newStatus === 'PAGO') {
      const updateRes = await db.query(
        `UPDATE dash_financeiro 
         SET status_pagamento = 'PAGO', 
             data_pagamento = COALESCE($1, NOW()), 
             valor_pago = $2 
         WHERE asaas_payment_id = $3 
            OR (nosso_numero IS NOT NULL AND nosso_numero = $4)
            OR (id_firebird IS NOT NULL AND CAST(id_firebird AS TEXT) = $5)
         RETURNING id, tenant_id, id_firebird, nosso_numero, numero_documento`,
        [paymentDate || new Date().toISOString().split('T')[0], value, paymentId, payment.nossoNumero || '', String(payment.externalReference || '')]
      );

      if (updateRes.rowCount > 0) {
        const title = updateRes.rows[0];
        await db.query(
          `INSERT INTO dash_cobrancas_ocorrencias (tenant_id, financeiro_id, tipo_contato, observacao, operador)
           VALUES ($1, $2, 'Webhook Asaas', $3, 'Sistema Asaas')`,
          [title.tenant_id, title.id, `Pagamento do boleto confirmado via Webhook Asaas (${event}). Valor: R$ ${value}.`]
        );

        logger.info('[AsaasWebhook] Título atualizado para PAGO via Webhook', { id: title.id });

        // Enfileira para o ERP Coliseu (Firebird) dar baixa na retaguarda
        if (title.id_firebird || title.nosso_numero || title.numero_documento || title.id) {
          await db.query(`
            INSERT INTO pending_payments (tenant_id, titulo_id, id_firebird, nosso_numero, numero_documento, valor_pago, data_pagamento, forma_pagamento, status, tentativas)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'BOLETO_ASAAS', 'PENDENTE', 0)
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
          `, [title.tenant_id, title.id, title.id_firebird || null, title.nosso_numero || payment.nossoNumero || null, title.numero_documento || null, value, paymentDate || new Date().toISOString()]).catch(err => logger.error('[AsaasWebhook] Erro ao enfileirar em pending_payments:', err.message));
        }

        await db.query(`
            CREATE TABLE IF NOT EXISTS dash_financeiro_logs (
                id SERIAL PRIMARY KEY,
                tenant_id UUID NOT NULL,
                titulo_id INT NOT NULL,
                tipo_evento VARCHAR(50) NOT NULL,
                data_evento TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                usuario VARCHAR(100) DEFAULT 'Sistema',
                nosso_numero VARCHAR(100),
                numero_documento VARCHAR(100),
                descricao TEXT,
                detalhes JSONB
            );
        `).catch(() => {});

        await db.query(
          `INSERT INTO dash_financeiro_logs (tenant_id, titulo_id, tipo_evento, usuario, nosso_numero, descricao)
           VALUES ($1, $2, 'QUITACAO', 'Webhook Asaas', $3, $4)`,
          [title.tenant_id, title.id, payment.nossoNumero || null, `Quitação confirmada via Webhook Asaas (${event}). Valor: R$ ${value}`]
        ).catch(() => {});
      }
    } else if (newStatus === 'CANCELADO') {
      const updateRes = await db.query(
        `UPDATE dash_financeiro 
         SET status_pagamento = 'CANCELADO',
             data_cancelamento = NOW()
         WHERE asaas_payment_id = $1
         RETURNING id, tenant_id`,
        [paymentId]
      );

      if (updateRes.rowCount > 0) {
        const title = updateRes.rows[0];
        await db.query(`
            CREATE TABLE IF NOT EXISTS dash_financeiro_logs (
                id SERIAL PRIMARY KEY,
                tenant_id INT NOT NULL,
                titulo_id INT NOT NULL,
                tipo_evento VARCHAR(50) NOT NULL,
                data_evento TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                usuario VARCHAR(100) DEFAULT 'Sistema',
                nosso_numero VARCHAR(100),
                numero_documento VARCHAR(100),
                descricao TEXT,
                detalhes JSONB
            );
        `).catch(() => {});

        await db.query(
          `INSERT INTO dash_financeiro_logs (tenant_id, titulo_id, tipo_evento, usuario, nosso_numero, descricao)
           VALUES ($1, $2, 'CANCELAMENTO', 'Webhook Asaas', $3, $4)`,
          [title.tenant_id, title.id, payment.nossoNumero || null, `Cancelamento confirmado via Webhook Asaas (${event})`]
        ).catch(() => {});
      }
    }

    return { success: true, event, paymentId, newStatus };
  }

  /**
   * 2E. Buscar Lista de Pagamentos no Asaas (GET /v3/payments)
   */
  static async listPayments(tenantId, filters = {}) {
    const config = await this.getConfig(tenantId);

    const requestedLimit = parseInt(filters.limit || 100, 10);
    const limit = Math.min(requestedLimit, 100);
    const params = { ...filters, limit };

    const queryParams = new URLSearchParams(params).toString();
    const response = await fetch(`${config.baseUrl}/payments?${queryParams}`, {
      method: 'GET',
      headers: this.getHeaders(config.token)
    });
    if (!response.ok) {
      throw new Error(`Erro ao listar pagamentos do Asaas: HTTP ${response.status}`);
    }
    const result = await response.json();

    // Suporte a busca paginada até 1000 registros se solicitado limit > 100
    if (requestedLimit > 100 && result.hasMore && Array.isArray(result.data)) {
      let offset = limit;
      const targetLimit = Math.min(requestedLimit, 1000);
      while (offset < targetLimit && result.hasMore) {
        try {
          const nextParams = new URLSearchParams({ ...params, offset, limit: 100 }).toString();
          const nextRes = await fetch(`${config.baseUrl}/payments?${nextParams}`, {
            method: 'GET',
            headers: this.getHeaders(config.token)
          });
          if (nextRes.ok) {
            const nextJson = await nextRes.json();
            if (nextJson.data && nextJson.data.length > 0) {
              result.data.push(...nextJson.data);
            }
            result.hasMore = nextJson.hasMore;
            offset += 100;
          } else {
            break;
          }
        } catch (pageErr) {
          logger.warn('[AsaasService] Erro ao paginar listPayments', { offset, error: pageErr.message });
          break;
        }
      }
    }

    return result;
  }
}

module.exports = AsaasService;
