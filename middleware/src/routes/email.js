'use strict';

/**
 * email.js — Nexus E-mail API Routes
 * Endpoints para configuração, teste de conexão e envio em lote de e-mails.
 */

const express = require('express');
const router = express.Router();
const EmailService = require('../services/emailService');
const db = require('../db/postgres');
const logger = require('../config/logger');

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/email/test-connection
// Testa a conexão com o servidor de e-mail configurado para o tenant.
// ──────────────────────────────────────────────────────────────────────────────
router.post('/test-connection', async (req, res) => {
  try {
    const tenantId = req.tenant?.id;
    const { provedor, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure,
            remetente_nome, remetente_email, brevo_api_key } = req.body || {};

    const dbConfig = await EmailService.getConfig(tenantId).catch(() => null);

    const isPassMasked = !smtp_pass || String(smtp_pass).includes('...') || String(smtp_pass).includes('•') || String(smtp_pass).includes('*');

    const config = {
      provedor:       provedor || dbConfig?.provedor || 'smtp',
      smtpHost:       (smtp_host && !String(smtp_host).includes('...')) ? smtp_host : (dbConfig?.smtpHost || 'smtp.gmail.com'),
      smtpPort:       parseInt(smtp_port || dbConfig?.smtpPort || 465),
      smtpUser:       (smtp_user && !String(smtp_user).includes('...')) ? smtp_user : (dbConfig?.smtpUser || ''),
      smtpPass:       (!isPassMasked) ? smtp_pass : (dbConfig?.smtpPass || ''),
      smtpSecure:     smtp_secure !== undefined ? (smtp_secure === true || String(smtp_port) === '465') : (dbConfig?.smtpSecure ?? true),
      remetenteNome:  remetente_nome || dbConfig?.remetenteNome || 'Coliseu Transporte',
      remetenteEmail: remetente_email || dbConfig?.remetenteEmail || '',
      brevoApiKey:    brevo_api_key || dbConfig?.brevoApiKey || ''
    };

    if (!config.smtpHost && config.provedor === 'smtp') {
      return res.status(400).json({ error: 'Host SMTP não configurado. Preencha os dados na aba Comunicação.' });
    }

    const resultado = await EmailService.testarConexao(config);
    res.json({ success: true, message: 'Conexão com o servidor de e-mail OK!', data: resultado });
  } catch (err) {
    logger.error('[EmailRoute] test-connection falhou', { err: err.message });
    res.status(400).json({ error: err.message });
  }
});


// ──────────────────────────────────────────────────────────────────────────────
// POST /api/email/enviar-lote-cobranca
// Envia e-mails de cobrança em lote para uma lista de clientes/títulos.
// ──────────────────────────────────────────────────────────────────────────────
router.post('/enviar-lote-cobranca', async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { clientes, assunto, templateHtml } = req.body;

    if (!clientes || !Array.isArray(clientes) || clientes.length === 0) {
      return res.status(400).json({ error: 'Nenhum destinatário informado.' });
    }

    const relatorio = await EmailService.enviarLoteCobrancas(
      tenantId,
      clientes,
      templateHtml || null,
      assunto || 'Aviso de Cobrança'
    );

    res.json({ success: true, relatorio });
  } catch (err) {
    logger.error('[EmailRoute] enviar-lote-cobranca falhou', { err: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/email/enviar-lote-marketing
// Envia e-mails de marketing em lote para uma lista de clientes.
// ──────────────────────────────────────────────────────────────────────────────
router.post('/enviar-lote-marketing', async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { clientes, assunto, corpoHtml } = req.body;

    if (!clientes || !Array.isArray(clientes) || clientes.length === 0) {
      return res.status(400).json({ error: 'Nenhum destinatário informado.' });
    }
    if (!assunto || !corpoHtml) {
      return res.status(400).json({ error: 'Assunto e corpo HTML são obrigatórios.' });
    }

    const relatorio = await EmailService.enviarLoteMarketing(tenantId, clientes, assunto, corpoHtml);
    res.json({ success: true, relatorio });
  } catch (err) {
    logger.error('[EmailRoute] enviar-lote-marketing falhou', { err: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/email/config
// Retorna a config de e-mail do tenant (sem expor senhas)
// ──────────────────────────────────────────────────────────────────────────────
router.get('/config', async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { rows } = await db.query(
      'SELECT email_provedor, email_smtp_host, email_smtp_port, email_smtp_user, email_smtp_secure, email_remetente_nome, email_remetente, email_brevo_api_key FROM dash_integracoes_config WHERE tenant_id = $1',
      [tenantId]
    );
    res.json({ data: rows[0] || {} });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
