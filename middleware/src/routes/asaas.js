'use strict';

/**
 * asaas.js - Antigravity Nexus Financial Engine
 * Rotas da API e Webhooks do Banco Asaas
 */

const express = require('express');
const router = express.Router();
const AsaasService = require('../services/asaasService');
const db = require('../db/postgres');
const logger = require('../config/logger');

/**
 * POST /api/asaas/test-connection
 * Testa a chave de API do Asaas.
 */
router.post('/test-connection', async (req, res, next) => {
  try {
    const tenantId = req.tenant ? req.tenant.id : null;
    let { token, ambiente } = req.body;

    // Se o token for nulo, vazio ou o placeholder com '...', busca o token real salvo no banco
    if (!token || typeof token !== 'string' || token.trim() === '' || token.includes('...')) {
      const config = await AsaasService.getConfig(tenantId).catch(() => null);
      if (config && config.token) {
        token = config.token;
        ambiente = ambiente || config.ambiente;
      }
    }

    if (!token || typeof token !== 'string' || token.trim() === '' || token.includes('...')) {
      const globalConfig = await db.query(
        "SELECT asaas_access_token, asaas_ambiente FROM dash_integracoes_config WHERE asaas_access_token IS NOT NULL AND asaas_access_token != '' LIMIT 1"
      );
      if (globalConfig.rows.length > 0) {
        token = globalConfig.rows[0].asaas_access_token;
        ambiente = ambiente || globalConfig.rows[0].asaas_ambiente;
      }
    }

    if (!token) {
      return res.status(400).json({ error: 'Token de acesso do Asaas não informado.' });
    }

    const data = await AsaasService.testConnection(token, ambiente || 'Produção');
    res.json({ success: true, message: 'Conexão com o Asaas realizada com sucesso!', data });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/asaas/emitir-boleto
 * Emite um boleto real no Banco Asaas para um título de dash_financeiro.
 */
router.post('/emitir-boleto', async (req, res, next) => {
  try {
    const tenantId = req.tenant.id;
    const { titleId, vencimento, valor } = req.body;

    if (!titleId) {
      return res.status(400).json({ error: 'ID do título não informado.' });
    }

    // 1. Busca os dados do título e do cliente no banco PostgreSQL
    const { rows } = await db.query(
      `SELECT 
         f.*, 
         COALESCE(cl.nome, f.cliente_nome, f.descricao, 'Cliente Coliseu Transporte') AS cliente_nome_resolvido, 
         COALESCE(cl.documento, f.cliente_documento, f.cpf_cnpj) AS cliente_documento_resolvido, 
         COALESCE(cl.email_financeiro, cl.email, f.cliente_email) AS cliente_email_resolvido, 
         COALESCE(cl.celular_secundario, cl.telefone, f.cliente_telefone) AS cliente_telefone_resolvido,
         COALESCE(cl.cidade, f.cliente_cidade) AS cliente_cidade_resolvido,
         cl.estado AS cliente_estado,
         COALESCE(cl.endereco_completo, f.cliente_endereco) AS cliente_endereco_resolvido
       FROM dash_financeiro f
       LEFT JOIN dash_clientes cl ON (
         (f.cliente_id IS NOT NULL AND cl.id = f.cliente_id) OR
         (f.cliente_id_firebird IS NOT NULL AND (cl.id_firebird = f.cliente_id_firebird OR cl.id = f.cliente_id_firebird))
       ) AND LOWER(cl.tenant_id::text) = LOWER(f.tenant_id::text)
       WHERE (f.id = $2 OR f.id_firebird = $2) 
         AND ($1 = '00000000-0000-0000-0000-000000000000' OR LOWER(f.tenant_id::text) = LOWER($1::text))`,
      [String(tenantId), parseInt(titleId, 10)]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Título financeiro não localizado.' });
    }

    const title = rows[0];
    const targetTenantId = title.tenant_id || tenantId;

    // 2. Garante o cadastro do cliente no Asaas
    const customerAsaas = await AsaasService.createOrGetCustomer(targetTenantId, {
      name: req.body.cliente_nome || title.cliente_nome_resolvido,
      cpfCnpj: req.body.cpfCnpj || req.body.cpf_cnpj || title.cliente_documento_resolvido,
      email: req.body.email || title.cliente_email_resolvido,
      phone: req.body.phone || req.body.telefone || title.cliente_telefone_resolvido,
      address: req.body.address || req.body.endereco || title.cliente_endereco_resolvido,
      province: req.body.province || req.body.cidade || title.cliente_cidade_resolvido
    });

    const formatDateToYYYYMMDD = (dateVal) => {
      if (!dateVal) return new Date().toISOString().split('T')[0];
      if (typeof dateVal === 'string') {
        const clean = dateVal.split('T')[0].split(' ')[0];
        if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
      }
      try {
        return new Date(dateVal).toISOString().split('T')[0];
      } catch {
        return new Date().toISOString().split('T')[0];
      }
    };

    // 3. Emite o boleto bancário no Asaas
    const dueDateStr = vencimento ? formatDateToYYYYMMDD(vencimento) : formatDateToYYYYMMDD(title.data_vencimento);
    const valorCobrar = valor ? parseFloat(valor) : parseFloat(title.valor);

    const paymentRes = await AsaasService.createPayment(targetTenantId, {
      customerId: customerAsaas.id,
      value: valorCobrar,
      dueDate: dueDateStr,
      description: `Boleto N° ${title.id_firebird || title.id} - ${title.descricao}`
    });

    const nossoNumStr = paymentRes.nossoNumero || paymentRes.id || 'N/A';
    const usuarioNome = req.user?.nome || req.user?.email || 'Operador';

    // 4. Salva os dados de pagamento retornados pelo Asaas no banco local (incluindo nosso_numero)
    await db.query(
      `UPDATE dash_financeiro
       SET asaas_payment_id = $1,
           asaas_customer_id = $2,
           asaas_bank_slip_url = $3,
           asaas_linha_digitavel = $4,
           asaas_bar_code = $5,
           nosso_numero = $6,
           portador_nome = 'Asaas',
           data_vinculo = NOW(),
           usuario_vinculo = $7
       WHERE (id = $8 OR id_firebird = $8)
         AND ($9 = '00000000-0000-0000-0000-000000000000' OR LOWER(tenant_id::text) = LOWER($9::text) OR tenant_id = $9::uuid)`,
      [
        paymentRes.id,
        customerAsaas.id,
        paymentRes.bankSlipUrl,
        paymentRes.linhaDigitavel || null,
        paymentRes.barCode || null,
        nossoNumStr,
        usuarioNome,
        title.id,
        String(tenantId)
      ]
    );

    // 5. Grava ocorrência no histórico de cobrança e nos logs do título
    await db.query(
      `INSERT INTO dash_cobrancas_ocorrencias (tenant_id, financeiro_id, tipo_contato, observacao, operador)
       VALUES ($1, $2, 'Emissão Boleto Asaas', $3, $4)`,
      [
        tenantId,
        title.id,
        `Boleto Asaas emitido com sucesso (Nosso N°: ${nossoNumStr}). Link: ${paymentRes.bankSlipUrl}`,
        usuarioNome
      ]
    );

    await db.query(`
      CREATE TABLE IF NOT EXISTS dash_financeiro_logs (
          id SERIAL PRIMARY KEY,
          tenant_id UUID NOT NULL,
          titulo_id INT,
          financeiro_id INT,
          tipo_evento VARCHAR(50) NOT NULL,
          data_evento TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          usuario VARCHAR(100) DEFAULT 'Sistema',
          nosso_numero VARCHAR(100),
          numero_documento VARCHAR(100),
          descricao TEXT,
          detalhes JSONB
      );
      ALTER TABLE dash_financeiro_logs ADD COLUMN IF NOT EXISTS titulo_id INT;
      ALTER TABLE dash_financeiro_logs ADD COLUMN IF NOT EXISTS financeiro_id INT;
      ALTER TABLE dash_financeiro_logs ALTER COLUMN titulo_id DROP NOT NULL;
      ALTER TABLE dash_financeiro_logs ALTER COLUMN financeiro_id DROP NOT NULL;
    `).catch(() => {});

    await db.query(
      `INSERT INTO dash_financeiro_logs (tenant_id, titulo_id, financeiro_id, tipo_evento, usuario, nosso_numero, numero_documento, descricao, data_evento)
       VALUES ($1::TEXT, $2, $3, 'EMISSAO_BOLETO', $4, $5, $6, $7, NOW())`,
      [
        String(targetTenantId),
        title.id,
        title.id,
        usuarioNome,
        nossoNumStr,
        String(title.id_firebird || title.id),
        `Boleto (Nosso Nº ${nossoNumStr}) no valor de R$ ${valorCobrar.toFixed(2)} (Vencimento: ${dueDateStr}) emitido com sucesso via Banco Asaas pelo operador ${usuarioNome}.`
      ]
    ).catch(err => console.error('[EmitirBoletoLog] Erro ao gravar log:', err.message));

    res.json({
      success: true,
      message: 'Boleto bancário emitido com sucesso no Banco Asaas!',
      paymentId: paymentRes.id,
      bankSlipUrl: paymentRes.bankSlipUrl,
      linhaDigitavel: paymentRes.linhaDigitavel,
      barCode: paymentRes.barCode,
      nossoNumero: paymentRes.nossoNumero
    });

  } catch (err) {
    logger.error('[AsaasRoute] Erro ao emitir boleto', { error: err.message });
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/asaas/bank-slip/:paymentId
 * Retorna a URL do PDF do boleto no Banco Asaas ou redireciona diretamente.
 */
router.get('/bank-slip/:paymentId', async (req, res) => {
  try {
    const tenantId = req.tenant ? req.tenant.id : null;
    const { paymentId } = req.params;

    if (!paymentId) {
      return res.status(400).json({ error: 'ID da cobrança Asaas não informado.' });
    }

    let bankSlipUrl = null;

    // 1. Tenta buscar no banco local se já temos o link salvo (inclusive de outros bancos integrados como Cora)
    if (tenantId) {
      const { rows } = await db.query(
        `SELECT bank_slip_url, pdf_url, asaas_bank_slip_url, portador_nome 
         FROM dash_financeiro 
         WHERE LOWER(tenant_id::text) = LOWER($1::text) 
           AND (asaas_payment_id = $2 OR nosso_numero = $2 OR CAST(id AS TEXT) = $2 OR CAST(id_firebird AS TEXT) = $2)
         LIMIT 1`,
        [tenantId, paymentId]
      );
      if (rows.length > 0) {
        bankSlipUrl = rows[0].bank_slip_url || rows[0].pdf_url || rows[0].asaas_bank_slip_url;
        if (!bankSlipUrl && String(rows[0].portador_nome || '').toUpperCase() === 'CORA') {
          try {
            const CoraService = require('../services/coraService');
            const coraInvoice = await CoraService.consultarBoleto(tenantId, paymentId);
            const bs = coraInvoice?.payment_options?.bank_slip || coraInvoice?.payment_details?.bank_slip;
            bankSlipUrl = bs?.url || bs?.pdf_url || coraInvoice?.pdf_url || null;
            if (bankSlipUrl) {
              await db.query(
                `UPDATE dash_financeiro SET bank_slip_url = $1, pdf_url = $1, asaas_bank_slip_url = $1 WHERE LOWER(tenant_id::text) = LOWER($2::text) AND asaas_payment_id = $3`,
                [bankSlipUrl, tenantId, paymentId]
              ).catch(() => {});
            }
          } catch (errCora) {
            logger.warn('[BankSlip] Erro ao consultar boleto no Cora:', errCora.message);
          }
        }
      }
    }

    // 2. Se for ID com prefixo 'inv_' (Cora) e ainda não tem URL, tenta consultar direto no Cora
    if (!bankSlipUrl && String(paymentId).startsWith('inv_') && tenantId) {
      try {
        const CoraService = require('../services/coraService');
        const coraInvoice = await CoraService.consultarBoleto(tenantId, paymentId);
        const bs = coraInvoice?.payment_options?.bank_slip || coraInvoice?.payment_details?.bank_slip;
        bankSlipUrl = bs?.url || bs?.pdf_url || coraInvoice?.pdf_url || null;
      } catch (errCora) {
        logger.warn('[BankSlip] Erro ao consultar Cora por prefixo inv_:', errCora.message);
      }
    }

    // 3. Se não estiver no banco local e não for Cora, busca no Asaas
    if (!bankSlipUrl) {
      const config = await AsaasService.getConfig(tenantId);
      const response = await fetch(`${config.baseUrl}/payments/${paymentId}`, {
        method: 'GET',
        headers: AsaasService.getHeaders(config.token)
      });

      if (!response.ok) {
        return res.status(404).json({ error: 'Cobrança não localizada no banco emissor.' });
      }

      const paymentData = await response.json();
      bankSlipUrl = paymentData.bankSlipUrl || paymentData.invoiceUrl;

      if (bankSlipUrl && tenantId) {
        await db.query(
          `UPDATE dash_financeiro SET asaas_bank_slip_url = $1, bank_slip_url = $1, pdf_url = $1 WHERE LOWER(tenant_id::text) = LOWER($2::text) AND asaas_payment_id = $3`,
          [bankSlipUrl, tenantId, paymentId]
        ).catch(() => {});
      }
    }

    if (!bankSlipUrl) {
      return res.status(404).json({ error: 'Link do boleto não disponível para esta cobrança.' });
    }

    // Redireciona se for chamado diretamente pelo navegador ou se ?redirect=true
    if (req.query.redirect === 'true' || (req.headers.accept && req.headers.accept.includes('text/html'))) {
      return res.redirect(bankSlipUrl);
    }

    res.json({ success: true, bankSlipUrl, url: bankSlipUrl });
  } catch (err) {
    logger.error('[Asaas] Erro ao buscar link do boleto', { error: err.message });
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/asaas/saldo
 * Retorna o saldo atual da conta Asaas.
 */
router.get('/saldo', async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const config = await AsaasService.getConfig(tenantId);
    const response = await fetch(`${config.baseUrl}/finance/balance`, {
      headers: AsaasService.getHeaders(config.token)
    });
    if (!response.ok) {
      const e = await response.json().catch(() => ({}));
      throw new Error(e?.errors?.[0]?.description || `HTTP ${response.status}`);
    }
    const data = await response.json();
    res.json({ success: true, saldo: data.balance, data });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Função utilitária para padronizar nomes de órgãos oficiais (DARF e DAS) nas descrições do extrato bancário
const normalizeOrganDescription = (rawDesc) => {
    if (!rawDesc) return rawDesc;
    const desc = String(rawDesc).trim();
    const upper = desc.toUpperCase();

    const isCancel = upper.includes('CANCELAMENTO');
    const prefix = isCancel ? 'Cancelamento do pagamento de conta' : 'Pagamento de conta';

    // 1. DARF / DARF-SIMPLES 0385
    if (upper.includes('DARF')) {
        return `${prefix} - DARF/DARF-SIMPLES 0385`;
    }

    // 2. DAS - SIMPLES NACIONAL (ou DASN)
    if (upper.includes('DAS') || upper.includes('DASN')) {
        return `${prefix} - DAS - SIMPLES NACIONAL`;
    }

    return desc;
};

/**
 * GET /api/asaas/extrato
 * Busca o extrato de transações financeiras do Asaas e cruza com títulos locais.
 * Query params: startDate (YYYY-MM-DD), endDate (YYYY-MM-DD), offset, limit
 */
router.get('/extrato', async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const config = await AsaasService.getConfig(tenantId);

    const { startDate, endDate, offset = 0, limit = 100, type } = req.query;

    // Garante criação da tabela de transações ocultas do extrato bancário
    await db.query(`
      CREATE TABLE IF NOT EXISTS dash_asaas_extrato_ocultos (
          id SERIAL PRIMARY KEY,
          tenant_id VARCHAR(100) NOT NULL,
          asaas_transaction_id VARCHAR(100) NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_asaas_extrato_ocultos ON dash_asaas_extrato_ocultos(tenant_id, asaas_transaction_id);
    `).catch(() => {});

    // Parâmetros de filtro para a API Asaas
    const params = new URLSearchParams({
      limit: String(Math.min(parseInt(limit) || 100, 100)),
      offset: String(parseInt(offset) || 0),
    });
    if (startDate) params.append('startDate', startDate);
    if (endDate) {
      params.append('endDate', endDate);
      params.append('finishDate', endDate);
    }

    const response = await fetch(
      `${config.baseUrl}/financialTransactions?${params.toString()}`,
      { headers: AsaasService.getHeaders(config.token) }
    );

    if (!response.ok) {
      const e = await response.json().catch(() => ({}));
      throw new Error(e?.errors?.[0]?.description || `Asaas HTTP ${response.status}`);
    }

    const asaasData = await response.json();
    const rawTransactions = asaasData.data || [];

    // Busca IDs de transações excluídas/ocultadas pelo usuário
    const { rows: ocultos } = await db.query(
      `SELECT asaas_transaction_id FROM dash_asaas_extrato_ocultos 
       WHERE ($1 = '00000000-0000-0000-0000-000000000000' OR LOWER(tenant_id::text) = LOWER($1::text))`,
      [String(tenantId)]
    ).catch(() => ({ rows: [] }));

    const hiddenSet = new Set(ocultos.map(o => String(o.asaas_transaction_id)));
    let transactions = rawTransactions.filter(t => !hiddenSet.has(String(t.id)));

    // Filtro secundário em memória por período para garantir precisão absoluta contra discrepâncias da API
    if (startDate || endDate) {
      const startMs = startDate ? new Date(startDate + 'T00:00:00').getTime() : 0;
      const endMs = endDate ? new Date(endDate + 'T23:59:59.999').getTime() : Infinity;

      transactions = transactions.filter(t => {
        const dtStr = t.date || t.dateCreated || t.paymentDate;
        if (!dtStr) return true;
        const tMs = new Date(dtStr).getTime();
        if (isNaN(tMs)) return true;
        if (startMs && tMs < startMs) return false;
        if (endMs && tMs > endMs) return false;
        return true;
      });
    }

    // Buscar saldo da conta
    const balRes = await fetch(`${config.baseUrl}/finance/balance`, {
      headers: AsaasService.getHeaders(config.token)
    });
    const balData = balRes.ok ? await balRes.json() : {};

    // Cruzar com títulos locais (por asaas_payment_id ou valor+data similar)
    const paymentIds = transactions
      .filter(t => t.payment)
      .map(t => t.payment);

    let conciliadosMap = {};
    if (paymentIds.length > 0) {
      const placeholders = paymentIds.map((_, i) => `$${i + 2}`).join(',');
      const { rows: localTitulos } = await db.query(
        `SELECT id, descricao, cliente_nome, status_pagamento, asaas_payment_id
         FROM dash_financeiro
         WHERE tenant_id = $1 AND asaas_payment_id IN (${placeholders})`,
        [tenantId, ...paymentIds]
      );
      localTitulos.forEach(t => {
        conciliadosMap[t.asaas_payment_id] = t;
      });
    }

    // Mapa de transferências por transferId para correlacionar estornos com a transferência original
    const transferMap = {};
    for (const t of transactions) {
      if (t.transferId && t.description && (t.type === 'TRANSFER' || t.value < 0)) {
        transferMap[t.transferId] = t.description;
      }
    }

    // Enriquecer transações com status de conciliação, cliente_nome, numero_fatura e sub_descricao
    const enriched = transactions.map(t => {
      // No Asaas (/financialTransactions), o valor vem categoricamente com o sinal contábil:
      // t.value > 0 -> Entrada de fundos / Crédito (C)
      // t.value < 0 -> Saída de fundos / Débito (D)
      const rawType = (t.type || '').toUpperCase();
      const rawDesc = t.description || '';
      const descLower = rawDesc.toLowerCase();

      let isCredit = false;
      if (typeof t.value === 'number' && t.value !== 0) {
        isCredit = t.value > 0;
      } else {
        // Fallback robusto se t.value não vier numérico ou for 0
        if (
          rawType.includes('RECEIVED') || rawType.includes('CREDIT') || rawType.includes('DEPOSIT') ||
          rawType.includes('DEBIT_REFUND') || (descLower.includes('estorno') && !descLower.includes('cobrança'))
        ) {
          isCredit = true;
        } else if (
          rawType.includes('FEE') || rawType.includes('SENT') || rawType.includes('DEBIT') || 
          rawType.includes('BILL_PAYMENT') || rawType.includes('TRANSFER') || rawType.includes('CREDIT_REFUND')
        ) {
          isCredit = false;
        } else if (
          descLower.includes('taxa') || 
          descLower.includes('pagamento') || 
          descLower.includes('tarifa') ||
          descLower.includes('pix com chave') ||
          descLower.includes('transferência') ||
          descLower.includes('enviad') ||
          descLower.includes('saida') ||
          descLower.includes('saída') ||
          (descLower.includes('transação via pix') && !descLower.includes('estorno'))
        ) {
          isCredit = false;
        } else if (
          descLower.includes('recebido') || 
          descLower.includes('recebimento') || 
          descLower.includes('cobrança recebida') ||
          descLower.includes('pix recebido')
        ) {
          isCredit = true;
        } else {
          isCredit = false;
        }
      }
      
      let clienteNome = null;
      let numeroFatura = null;
      let subDescricao = null;

      // 1. Verifica se é pagamento de órgão oficial (DARF / DAS)
      const normOrgan = normalizeOrganDescription(rawDesc);
      if (normOrgan !== rawDesc) {
          clienteNome = normOrgan;
          subDescricao = rawDesc !== normOrgan ? rawDesc : null;
      } else {
          // 2. Tenta extrair o número da fatura (ex: "fatura nr. 859816659")
          const fatMatch = rawDesc.match(/fatura nr\.\s*(\d+)/i) || rawDesc.match(/fatura\s*#?\s*(\d+)/i);
          if (fatMatch) numeroFatura = fatMatch[1];

          // 3. Extrai APENAS o Nome do Cliente (removendo qualquer prefixo de operação/fatura)
          let extractedName = rawDesc;
          if (fatMatch) {
              const parts = rawDesc.split(fatMatch[0]);
              if (parts[1] && parts[1].trim().length > 0) {
                  extractedName = parts[1].trim();
              } else if (parts[0]) {
                  extractedName = parts[0].replace(/^(Cobrança recebida|recebida|Taxa do Pix|Taxa|Estorno|Pagamento|Recebimento)\s*-\s*/i, '').trim();
              }
          } else {
              extractedName = rawDesc.replace(/^(Cobrança recebida|recebida|Taxa do Pix|Taxa|Estorno|Pagamento|Recebimento)\s*-\s*/i, '').trim();
          }

          extractedName = extractedName.replace(/^[-:\s]+/, '').trim();
          
          if (extractedName && extractedName.length > 1 && !extractedName.match(/^\d+$/)) {
              clienteNome = extractedName;
          } else if (conciliadosMap[t.payment] && conciliadosMap[t.payment].cliente_nome) {
              clienteNome = conciliadosMap[t.payment].cliente_nome;
          } else {
              clienteNome = rawDesc;
          }

          // Categoria amigável para exibição clara no extrato
          let categoriaDesc = t.category || '';
          if (!categoriaDesc) {
              if (rawType.includes('REFUND') || descLower.includes('estorno')) {
                  categoriaDesc = 'Estorno Pix';
              } else if (rawType.includes('TRANSFER') || descLower.includes('pix com chave') || descLower.includes('transação via pix')) {
                  categoriaDesc = 'Transferência Pix';
              } else if (rawType.includes('FEE') || descLower.includes('taxa')) {
                  categoriaDesc = 'Taxa / Tarifa';
              } else if (rawType.includes('BILL_PAYMENT') || descLower.includes('pagamento de conta')) {
                  categoriaDesc = 'Pagamento de Conta';
              } else if (rawType.includes('RECEIVED') || descLower.includes('cobrança recebida')) {
                  categoriaDesc = 'Cobrança Recebida';
              }
          }

          if (t.transferId && transferMap[t.transferId] && (rawType.includes('REFUND') || descLower.includes('estorno'))) {
              subDescricao = `Ref: ${transferMap[t.transferId]}`;
          } else if (numeroFatura) {
              const opType = rawDesc.split(/-\s*fatura/i)[0]?.trim();
              subDescricao = opType ? `${opType} • Fatura #${numeroFatura}` : `Fatura #${numeroFatura}`;
          } else {
              subDescricao = categoriaDesc || null;
          }
      }

      let categoriaFormatada = t.category || '';
      if (!categoriaFormatada) {
          if (rawType.includes('REFUND') || descLower.includes('estorno')) {
              categoriaFormatada = 'Estorno Pix';
          } else if (rawType.includes('TRANSFER') || descLower.includes('pix com chave') || descLower.includes('transação via pix')) {
              categoriaFormatada = 'Transferência Pix';
          } else if (rawType.includes('FEE') || descLower.includes('taxa')) {
              categoriaFormatada = 'Taxa / Tarifa';
          } else if (rawType.includes('BILL_PAYMENT') || descLower.includes('pagamento de conta')) {
              categoriaFormatada = 'Pagamento de Conta';
          } else if (rawType.includes('RECEIVED') || descLower.includes('cobrança recebida')) {
              categoriaFormatada = 'Cobrança Recebida';
          }
      }

      return {
        id:            t.id,
        date:          t.date,
        value:         Math.abs(t.value),
        type:          isCredit ? 'CREDIT' : 'DEBIT',
        rawType:       t.type,
        description:   rawDesc,
        cliente_nome:  clienteNome,
        numero_fatura: numeroFatura || t.payment || null,
        sub_descricao: subDescricao,
        paymentId:     t.payment || null,
        balance:       t.balance,
        status:        t.status,
        category:      categoriaFormatada,
        conciliado:    t.payment ? !!conciliadosMap[t.payment] : false,
        titulo_local:  t.payment ? (conciliadosMap[t.payment] || null) : null,
      };
    });

    let finalTransactions = enriched;
    const filterType = (type || req.query.tipo || '').toUpperCase();
    if (filterType && filterType !== 'ALL') {
      if (filterType === 'CREDITO' || filterType === 'CREDIT') {
        finalTransactions = enriched.filter(t => t.type === 'CREDIT');
      } else if (filterType === 'DEBITO' || filterType === 'DEBIT') {
        finalTransactions = enriched.filter(t => t.type === 'DEBIT');
      } else {
        finalTransactions = enriched.filter(t => t.type === filterType);
      }
    }

    res.json({
      success:      true,
      totalCount:   (filterType && filterType !== 'ALL') ? finalTransactions.length : (asaasData.totalCount || transactions.length),
      hasMore:      asaasData.hasMore || false,
      saldo_atual:  balData.balance ?? null,
      transactions: finalTransactions,
    });
  } catch (err) {
    logger.error('[Asaas] Erro ao buscar extrato', { error: err.message });
    res.status(400).json({ error: err.message });
  }
});

// GET /api/asaas/extrato/detalhes — Retorna detalhes completos do lançamento do Asaas + Cliente + Título Coliseu Transporte
router.get('/extrato/detalhes', async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { paymentId, transactionId, description, value } = req.query;
    const config = await AsaasService.getConfig(tenantId);

    let paymentData = null;
    let customerData = null;
    let realPaymentId = paymentId;

    // 1. Se passou ID de transação financeira (ex: ftn_...), consulta o Asaas para obter o paymentId original
    if (transactionId && transactionId.startsWith('ftn_')) {
      const ftRes = await fetch(`${config.baseUrl}/financialTransactions/${transactionId}`, {
        headers: AsaasService.getHeaders(config.token)
      }).catch(() => null);

      if (ftRes && ftRes.ok) {
        const ftData = await ftRes.json();
        if (ftData.payment) {
          realPaymentId = ftData.payment;
        }
      }
    }

    if (!realPaymentId && transactionId && !transactionId.startsWith('ftn_')) {
      realPaymentId = transactionId;
    }

    // 2. Extrai número da fatura/nossoNúmero da descrição se disponível
    const rawDesc = description || '';
    const fatMatch = rawDesc.match(/fatura nr\.\s*(\d+)/i) || rawDesc.match(/fatura\s*#?\s*(\d+)/i);
    const invoiceNumber = fatMatch ? fatMatch[1] : null;

    // 3. Busca a cobrança no Asaas por ID ou por número da fatura
    if (realPaymentId) {
      const pRes = await fetch(`${config.baseUrl}/payments/${realPaymentId}`, {
        headers: AsaasService.getHeaders(config.token)
      }).catch(() => null);

      if (pRes && pRes.ok) {
        paymentData = await pRes.json();
      }
    }

    if (!paymentData && invoiceNumber) {
      for (const queryParam of [`nossoNumero=${invoiceNumber}`, `externalReference=${invoiceNumber}`]) {
        const pRes = await fetch(`${config.baseUrl}/payments?${queryParam}`, {
          headers: AsaasService.getHeaders(config.token)
        }).catch(() => null);

        if (pRes && pRes.ok) {
          const pList = await pRes.json();
          if (pList.data && pList.data.length > 0) {
            paymentData = pList.data[0];
            realPaymentId = paymentData.id;
            break;
          }
        }
      }
    }

    // 4. Busca dados do Cliente no Asaas se houver ID de cliente
    if (paymentData && paymentData.customer) {
      customerData = await AsaasService.getCustomerById(tenantId, paymentData.customer).catch(() => null);
    }

    // 4B. Se a descrição do lançamento contiver o nome de um cliente (ex: BALASSO...), resolve o cliente correto no Coliseu Transporte
    const descClean = (rawDesc || '').replace(/^(Cobrança recebida|recebida|Taxa do Pix|Taxa|Estorno|Pagamento|Recebimento)\s*-\s*/i, '').trim();
    if (descClean && descClean.length > 2) {
      const { rows: matchedCusts } = await db.query(
        `SELECT nome, documento, email, telefone FROM dash_clientes 
         WHERE ($1 = '00000000-0000-0000-0000-000000000000' OR LOWER(tenant_id::text) = LOWER($1::text))
           AND (LOWER(nome) = LOWER($2) OR LOWER(razao_social) = LOWER($2) OR LOWER(nome_fantasia) = LOWER($2) OR LOWER(nome) LIKE LOWER($3))
         LIMIT 1`,
        [String(tenantId), descClean, `%${descClean}%`]
      ).catch(() => ({ rows: [] }));

      if (matchedCusts.length > 0) {
        customerData = {
          name: matchedCusts[0].nome,
          cpfCnpj: matchedCusts[0].documento,
          email: matchedCusts[0].email,
          phone: matchedCusts[0].telefone
        };
      } else if (!customerData && !descClean.match(/^(pix|taxa|estorno|tarifa|transferência)/i)) {
        customerData = {
          name: descClean,
          cpfCnpj: paymentData?.cpfCnpj || null,
          email: null,
          phone: null
        };
      }
    }

    // 5. Busca título local no PostgreSQL por vínculo de ID exato (sem busca vaga por nome)
    let localTitle = null;
    const lookupIds = [realPaymentId, transactionId, invoiceNumber].filter(Boolean);

    const { rows: matchedTitles } = await db.query(
      `SELECT f.*, c.nome AS cliente_nome_db, c.documento AS cliente_doc_db 
       FROM dash_financeiro f 
       LEFT JOIN dash_clientes c ON (c.id_firebird = f.cliente_id_firebird OR c.id = f.cliente_id) AND LOWER(c.tenant_id::text) = LOWER(f.tenant_id::text)
       WHERE ($1 = '00000000-0000-0000-0000-000000000000' OR LOWER(f.tenant_id::text) = LOWER($1::text)) 
         AND (
           (f.asaas_payment_id IS NOT NULL AND f.asaas_payment_id = ANY($2::text[])) OR 
           (f.nosso_numero IS NOT NULL AND f.nosso_numero = ANY($2::text[])) OR 
           (f.id_firebird IS NOT NULL AND CAST(f.id_firebird AS TEXT) = ANY($2::text[])) OR 
           (f.id IS NOT NULL AND CAST(f.id AS TEXT) = ANY($2::text[]))
         )
       ORDER BY 
         CASE WHEN f.asaas_payment_id = ANY($2::text[]) OR f.nosso_numero = ANY($2::text[]) THEN 1 ELSE 2 END,
         f.id DESC
       LIMIT 1`,
      [String(tenantId), lookupIds.length > 0 ? lookupIds : ['___']]
    ).catch(() => ({ rows: [] }));

    localTitle = matchedTitles[0] || null;

    // 6. Cálculo exato de Valor Pago, Valor Original e Juros/Multa informativos
    const txVal = parseFloat(value || paymentData?.value || localTitle?.valor_pago || localTitle?.valor || 0);

    let interestVal = parseFloat(
      paymentData?.interestValue || 
      paymentData?.fineValue || 
      paymentData?.interest || 
      paymentData?.fine || 0
    );

    let origVal = txVal;

    // Se o Asaas informar o valor original menor que o valor pago
    if (paymentData?.originalValue && parseFloat(paymentData.originalValue) > 0 && parseFloat(paymentData.originalValue) < txVal) {
      origVal = parseFloat(paymentData.originalValue);
      if (interestVal === 0) interestVal = txVal - origVal;
    } 
    // Se o título local tiver valor menor que o valor pago no banco/Asaas
    else if (localTitle?.valor && parseFloat(localTitle.valor) > 0 && parseFloat(localTitle.valor) < txVal) {
      origVal = parseFloat(localTitle.valor);
      if (interestVal === 0) interestVal = txVal - origVal;
    }
    // Se os juros foram informados diretamente mas origVal é igual a txVal
    else if (interestVal > 0 && origVal === txVal) {
      origVal = Math.max(0, txVal - interestVal);
    }

    const calculatedPayment = {
      ...(paymentData || {}),
      value: txVal,
      originalValue: origVal,
      interestValue: interestVal,
      calculatedOriginalValue: origVal,
      calculatedInterestValue: interestVal,
      invoiceNumber: paymentData?.invoiceNumber || invoiceNumber || paymentData?.nossoNumero
    };

    res.json({
      success: true,
      payment: calculatedPayment,
      customer: customerData,
      localTitle
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/asaas/extrato/ocultar — Exclui / oculta um lançamento do extrato bancário
router.post('/extrato/ocultar', async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { transactionId } = req.body;

    if (!transactionId) {
      return res.status(400).json({ error: 'transactionId é obrigatório.' });
    }

    await db.query(`
      CREATE TABLE IF NOT EXISTS dash_asaas_extrato_ocultos (
          id SERIAL PRIMARY KEY,
          tenant_id VARCHAR(100) NOT NULL,
          asaas_transaction_id VARCHAR(100) NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_asaas_extrato_ocultos ON dash_asaas_extrato_ocultos(tenant_id, asaas_transaction_id);
    `).catch(() => {});

    await db.query(
      `INSERT INTO dash_asaas_extrato_ocultos (tenant_id, asaas_transaction_id)
       VALUES ($1::TEXT, $2::TEXT)
       ON CONFLICT (tenant_id, asaas_transaction_id) DO NOTHING`,
      [String(tenantId), String(transactionId)]
    );

    res.json({ success: true, message: 'Lançamento excluído do extrato bancário com sucesso.' });
  } catch (err) {
    logger.error('[Asaas] Erro ao ocultar extrato', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/asaas/extrato/excluir-lote — Exclui / oculta múltiplos lançamentos do extrato bancário
router.post('/extrato/excluir-lote', async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { transactionIds } = req.body;

    if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
      return res.status(400).json({ error: 'Nenhuma transação selecionada.' });
    }

    await db.query(`
      CREATE TABLE IF NOT EXISTS dash_asaas_extrato_ocultos (
          id SERIAL PRIMARY KEY,
          tenant_id VARCHAR(100) NOT NULL,
          asaas_transaction_id VARCHAR(100) NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_asaas_extrato_ocultos ON dash_asaas_extrato_ocultos(tenant_id, asaas_transaction_id);
    `).catch(() => {});

    for (const txId of transactionIds) {
      await db.query(
        `INSERT INTO dash_asaas_extrato_ocultos (tenant_id, asaas_transaction_id)
         VALUES ($1::TEXT, $2::TEXT)
         ON CONFLICT (tenant_id, asaas_transaction_id) DO NOTHING`,
        [String(tenantId), String(txId)]
      );
    }

    res.json({ success: true, message: `${transactionIds.length} lançamento(s) excluído(s) do extrato bancário com sucesso.` });
  } catch (err) {
    logger.error('[Asaas] Erro ao excluir lote extrato', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/asaas/conciliar
 * Concilia uma transação Asaas com um título local do dash_financeiro.
 * Body: { asaas_transaction_id, asaas_payment_id, titulo_id }
 */
router.post('/conciliar', async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { asaas_payment_id, titulo_id, data_conciliacao } = req.body;

    if (!asaas_payment_id || !titulo_id) {
      return res.status(400).json({ error: 'asaas_payment_id e titulo_id são obrigatórios.' });
    }

    const dataConcil = data_conciliacao || new Date().toISOString().split('T')[0];

    // Atualiza o título local com o payment ID do Asaas e marca como conciliado
    const { rows } = await db.query(
      `UPDATE dash_financeiro
         SET asaas_payment_id    = $1,
             status_pagamento    = 'PAGO',
             data_pagamento      = $3,
             valor_pago          = valor,
             updated_at          = NOW()
       WHERE tenant_id = $4 AND id = $2
       RETURNING *`,
      [asaas_payment_id, parseInt(titulo_id, 10), dataConcil, tenantId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Título não encontrado.' });
    }

    // Registra ocorrência
    await db.query(
      `INSERT INTO dash_cobrancas_ocorrencias (tenant_id, financeiro_id, tipo_contato, observacao, operador)
       VALUES ($1, $2, 'Conciliação Bancária', $3, $4)`,
      [
        tenantId,
        parseInt(titulo_id, 10),
        `Conciliação com Asaas Payment ID: ${asaas_payment_id} em ${dataConcil}`,
        req.user?.nome || 'Sistema'
      ]
    ).catch(() => {});

    res.json({
      success: true,
      message: 'Título conciliado com sucesso!',
      titulo:  rows[0]
    });
  } catch (err) {
    logger.error('[Asaas] Erro ao conciliar', { error: err.message });
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/asaas/desconciliar
 * Remove a conciliação de um título.
 */
router.post('/desconciliar', async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { titulo_id } = req.body;

    await db.query(
      `UPDATE dash_financeiro
         SET asaas_payment_id = NULL,
             status_pagamento = 'ABERTO',
             data_pagamento   = NULL,
             updated_at       = NOW()
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, parseInt(titulo_id, 10)]
    );

    res.json({ success: true, message: 'Conciliação removida.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/asaas/sincronizar-pagamentos
 * Consulta pagamentos recebidos no Asaas e faz a conciliação automática com os títulos em aberto em dash_financeiro.
 */
router.post('/sincronizar-pagamentos', async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const paymentsData = await AsaasService.listPayments(tenantId, { limit: 300 }).catch(err => {
      logger.warn('[Asaas] Falha ao listar pagamentos no Asaas...', { err: err.message });
      return { data: [] };
    });

    const payments = (paymentsData.data || []).filter(p => p.status === 'RECEIVED' || p.status === 'CONFIRMED' || p.status === 'RECEIVED_IN_CASH');
    let conciliados = 0;
    const detalhes = [];

    for (const payment of payments) {
      const paymentId = payment.id;
      const val = parseFloat(payment.value || 0);
      const paymentDate = payment.paymentDate || payment.confirmedDate || new Date().toISOString().split('T')[0];
      const nossoNum = payment.nossoNumero;
      const cleanNossoNum = nossoNum ? nossoNum.replace(/^0+/, '') : '';
      const extRef = parseInt(payment.externalReference, 10) || -1;

      // Busca e atualiza o título correspondente no banco
      const { rows } = await db.query(
        `UPDATE dash_financeiro
         SET status_pagamento = 'PAGO',
             data_pagamento = COALESCE($1::timestamptz, data_pagamento, NOW()),
             valor_pago = COALESCE(NULLIF($2, 0), valor),
             asaas_payment_id = COALESCE(asaas_payment_id, $3)
         WHERE tenant_id = $4
           AND (status_pagamento != 'PAGO' OR data_pagamento IS NULL)
           AND (
             asaas_payment_id = $3 
             OR (nosso_numero IS NOT NULL AND (nosso_numero = $5 OR nosso_numero = $6))
             OR (numero_documento IS NOT NULL AND (numero_documento = $5 OR numero_documento = $6))
             OR (id_firebird IS NOT NULL AND id_firebird = $7)
           )
         RETURNING id, id_firebird, nosso_numero, numero_documento, descricao, valor`,
        [paymentDate, val, paymentId, tenantId, nossoNum || '', cleanNossoNum || '', extRef]
      );

      if (rows.length > 0) {
        conciliados += rows.length;
        detalhes.push({ paymentId, valor: val, titulo: rows[0] });

        // Registra ocorrência e enfileira para o ERP Coliseu (Firebird)
        for (const t of rows) {
          await db.query(
            `INSERT INTO dash_cobrancas_ocorrencias (tenant_id, financeiro_id, tipo_contato, observacao, operador)
             VALUES ($1, $2, 'Sincronização Asaas', $3, 'Sistema Automático')`,
            [tenantId, t.id, `Pagamento de R$ ${val} recebido e conciliado automaticamente via Asaas (ID: ${paymentId}).`]
          ).catch(() => {});

          if (t.id_firebird || t.nosso_numero || t.numero_documento || t.id) {
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
            `, [tenantId, t.id, t.id_firebird || null, t.nosso_numero || nossoNum || null, t.numero_documento || null, val, paymentDate]).catch(err => logger.error('[Asaas/Sync] Erro ao enfileirar em pending_payments:', err.message));
          }
        }
      }
    }

    res.json({
      success: true,
      message: `${conciliados} pagamento(s) conciliado(s) com sucesso com a tesouraria!`,
      conciliados,
      detalhes
    });
  } catch (err) {
    logger.error('[Asaas] Erro ao sincronizar pagamentos', { error: err.message });
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/webhooks/asaas ou POST /api/asaas/webhook
 * Recebe notificações instantâneas enviadas pelo Banco Asaas para dar baixa automática nos títulos (Opção A).
 */
const handleAsaasWebhookHttp = async (req, res) => {
  try {
    logger.info('[AsaasWebhook] Webhook HTTP recebido do Asaas', { body: req.body });
    const result = await AsaasService.handleWebhook(req.body);
    res.json(result);
  } catch (err) {
    logger.error('[AsaasWebhook] Erro no processamento do webhook', { error: err.message });
    res.status(500).json({ error: err.message });
  }
};

router.post('/', handleAsaasWebhookHttp);
router.post('/webhook', handleAsaasWebhookHttp);

module.exports = router;
