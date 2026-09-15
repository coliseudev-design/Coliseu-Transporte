'use strict';

/**
 * emailService.js — Nexus Email Engine
 * Serviço de envio de e-mails em lote para cobranças e marketing.
 * Suporta dois provedores:
 *   - Opção A: SMTP Transacional via Nodemailer (pool mode)
 *   - Opção B: API REST do Brevo (SendinBlue) — 1000 msgs por chamada
 */

const db = require('../db/postgres');
const logger = require('../config/logger');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getCobrancaAlertaBuffer } = require('../assets/emailAssets');

// Carregar Nodemailer de forma lazy para não quebrar se não instalado
let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch (_) {}

class EmailService {

  // ──────────────────────────────────────────────────────────────────────────
  // CONFIGURAÇÃO
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Busca a config de e-mail do tenant no banco de dados.
   */
  static async getConfig(tenantId) {
    let { rows } = await db.query(
      `SELECT * FROM dash_integracoes_config 
       WHERE ($1 = '00000000-0000-0000-0000-000000000000' OR LOWER(tenant_id::text) = LOWER($1::text)) 
         AND (email_smtp_host IS NOT NULL OR email_provedor IS NOT NULL)
       LIMIT 1`,
      [String(tenantId || '')]
    );

    if (rows.length === 0) {
      const fallback = await db.query(
        "SELECT * FROM dash_integracoes_config WHERE (email_smtp_host IS NOT NULL AND email_smtp_host != '') OR (email_smtp_user IS NOT NULL AND email_smtp_user != '') LIMIT 1"
      );
      rows = fallback.rows;
    }

    if (rows.length === 0) {
      if (process.env.SMTP_HOST) {
        return {
          provedor: 'smtp',
          smtpHost: process.env.SMTP_HOST,
          smtpPort: parseInt(process.env.SMTP_PORT || 465),
          smtpUser: process.env.SMTP_USER || '',
          smtpPass: process.env.SMTP_PASS || '',
          smtpSecure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
          remetenteNome: process.env.SMTP_FROM_NAME || 'Coliseu Sistemas',
          remetenteEmail: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || 'contato@coliseusistemas.com.br'
        };
      }
      throw new Error('Configuração de e-mail (SMTP) não encontrada. Por favor, configure o servidor de e-mail na aba Configurações > Integrações.');
    }

    const c = rows[0];
    return {
      provedor: c.email_provedor || 'smtp',           // 'smtp' | 'brevo' | 'sendgrid'
      smtpHost: c.email_smtp_host || 'smtp.gmail.com',
      smtpPort: parseInt(c.email_smtp_port || 465),
      smtpUser: c.email_smtp_user || '',
      smtpPass: c.email_smtp_pass || '',
      smtpSecure: c.email_smtp_secure === true || c.email_smtp_port === 465,
      remetenteNome: c.email_remetente_nome || 'Coliseu Transporte',
      remetenteEmail: c.email_remetente || c.empresa_email || '',
      brevoApiKey: c.email_brevo_api_key || '',
      sendgridApiKey: c.email_sendgrid_api_key || ''
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEMPLATE
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Injeta variáveis dinâmicas no template HTML do e-mail.
   * Suporta aliases diversos: {{nomeCliente}}, {{gestor_cliente}}, {{valorCobranca}}, {{valor_mensalidade}}, {{dataVencimento}}, {{linkPagamento}}, {{link_boleto_pdf}}, {{chave_pix}}, etc.
   */
  static renderTemplate(templateHtml, vars = {}) {
    if (!templateHtml) return '';
    let html = String(templateHtml);

    // Normalização e Mapa de Aliases de Variáveis
    const nome = vars.nomeCliente || vars.nome || vars.gestor_cliente || vars.nome_cliente || vars.cliente || vars.razao_social_cliente || 'Cliente';
    const valor = vars.valorCobranca || vars.valor || vars.valor_mensalidade || vars.valor_cobranca || vars.valor_atualizado || vars.valor_total || '';
    const vencimento = vars.dataVencimento || vars.vencimento || vars.data_vencimento || '';
    const linkBoleto = vars.linkPagamento || vars.link_boleto_pdf || vars.link_boleto || vars.link_pagamento || vars.bank_slip_url || '';
    const nossoNum = vars.nossoNumero || vars.nosso_numero || vars.numero_documento || vars.id || '';
    const chavePix = vars.chavePix || vars.chave_pix || vars.pix || '';

    // Cálculo automático de dias de atraso se não for informado
    let diasAtraso = vars.dias_atraso || vars.diasAtraso || vars.dias_vencido || '';
    if ((!diasAtraso || diasAtraso === '0' || diasAtraso === '{{dias_atraso}}') && vencimento) {
      try {
        const parts = String(vencimento).split('/');
        if (parts.length === 3) {
          const dtVenc = new Date(parts[2], parts[1] - 1, parts[0]);
          const hoje = new Date();
          const diffTime = hoje.getTime() - dtVenc.getTime();
          const diffDays = Math.floor(diffTime / (1000 * 3600 * 24));
          diasAtraso = diffDays > 0 ? String(diffDays) : '0';
        }
      } catch (e) {}
    }

    // Geração de Tabela HTML elegante para {{titulosEmAberto}} se houver
    let titulosTableHtml = vars.titulosEmAberto || vars.titulos_em_aberto || vars.tabela_titulos || vars.lista_titulos || '';
    if (!titulosTableHtml && (valor || vencimento || nossoNum)) {
      titulosTableHtml = `
        <table style="width: 100%; border-collapse: collapse; margin: 12px 0; font-family: Arial, sans-serif; font-size: 13px; background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0;">
          <thead>
            <tr style="background-color: #f8fafc; color: #475569; font-size: 11px; text-transform: uppercase; font-weight: bold; border-bottom: 2px solid #cbd5e1;">
              <th style="padding: 10px 14px; text-align: left;">Documento / Título</th>
              <th style="padding: 10px 14px; text-align: left;">Vencimento</th>
              <th style="padding: 10px 14px; text-align: right;">Valor</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding: 12px 14px; border-bottom: 1px solid #f1f5f9; font-weight: bold; color: #0f172a;">#${nossoNum || '1'}</td>
              <td style="padding: 12px 14px; border-bottom: 1px solid #f1f5f9; color: #dc2626; font-weight: bold;">${vencimento || 'A Vencer'}</td>
              <td style="padding: 12px 14px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: bold; color: #0f172a;">${valor || 'R$ 0,00'}</td>
            </tr>
          </tbody>
        </table>
      `.trim();
    }

    const aliasMap = {
      nomeCliente: nome,
      nome_cliente: nome,
      gestor_cliente: nome,
      razao_social_cliente: nome,
      razao_social: nome,
      nome: nome,
      cliente: nome,

      valorCobranca: valor,
      valor_cobranca: valor,
      valor_mensalidade: valor,
      valor_atualizado: valor,
      valor_total: valor,
      valor: valor,

      dataVencimento: vencimento,
      data_vencimento: vencimento,
      vencimento: vencimento,

      titulosEmAberto: titulosTableHtml,
      titulos_em_aberto: titulosTableHtml,
      tabela_titulos: titulosTableHtml,
      lista_titulos: titulosTableHtml,
      titulos: titulosTableHtml,

      dias_atraso: diasAtraso,
      dias_vencido: diasAtraso,
      diasAtraso: diasAtraso,

      linkPagamento: linkBoleto,
      link_boleto_pdf: linkBoleto,
      link_boleto: linkBoleto,
      link_pagamento: linkBoleto,

      nossoNumero: nossoNum,
      nosso_numero: nossoNum,

      chavePix: chavePix,
      chave_pix: chavePix
    };

    for (const [key, value] of Object.entries(aliasMap)) {
      html = html.replaceAll(`{{${key}}}`, value ?? '');
    }

    for (const [key, value] of Object.entries(vars)) {
      html = html.replaceAll(`{{${key}}}`, value ?? '');
    }

    return html;
  }

  /**
   * Prepara e sanitiza o HTML para envio de e-mails, preservando layouts ricos
   * (E-mail Marketing, tabelas, CSS inline, cartões 600px centralizados)
   * e formatando apenas textos planos simples com a assinatura padrão.
   */
  static prepareEmailHtml(assunto, rawBodyText, vars = {}) {
    if (!rawBodyText) return '';
    const rendered = this.renderTemplate(rawBodyText, vars);

    // Detecta se o conteúdo é um documento HTML rico ou template de e-mail marketing
    const isRichHtml = /<!DOCTYPE|<html|<head|<body|<table|<div|<section|<style/i.test(rendered);

    if (isRichHtml) {
      // Se for HTML rico mas sem a casca do documento, encapsula em um container de e-mail centralizado de 600px
      if (!/<!DOCTYPE|<html/i.test(rendered)) {
        return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${assunto || 'Comunicado Coliseu Sistemas'}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f1f5f9;padding:24px 10px;">
    <tr>
      <td align="center" valign="top">
        <table width="600" border="0" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.07);border:1px solid #e2e8f0;">
          <tr>
            <td align="left" style="padding:0;">
              ${rendered}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
      }
      return rendered;
    }

    // Se for texto plano simples, passa pelo template formatador de cobrança
    return this.wrapInColiseuHtmlTemplate(assunto, rendered, vars);
  }

  /**
   * Injeta Pixel 1x1 de abertura e reescreve links para rastreamento de cliques
   */
  static injectTracking(html, emailId, customBaseUrl) {
    if (!html || !emailId) return html;
    const baseUrl = customBaseUrl || process.env.BASE_TRACK_URL || process.env.PUBLIC_API_URL || 'https://transporte.coliseusistemas.com.br';
    
    let processed = html;

    // 1. Rewrite <a href="..."> links for click tracking (except mailto:, tel:, #, javascript:, unsubscribe)
    processed = processed.replace(/<a\s+([^>]*?)href=["']([^"']+)["']([^>]*?)>/gi, (match, prefix, href, suffix) => {
      const trimmedHref = href.trim();
      if (
        trimmedHref.startsWith('#') ||
        trimmedHref.startsWith('mailto:') ||
        trimmedHref.startsWith('tel:') ||
        trimmedHref.startsWith('javascript:') ||
        trimmedHref.includes('/track/click/') ||
        trimmedHref.toLowerCase().includes('unsubscribe') ||
        trimmedHref.toLowerCase().includes('descadastrar')
      ) {
        return match;
      }
      const trackedUrl = `${baseUrl}/api/track/click/${emailId}?url=${encodeURIComponent(trimmedHref)}`;
      return `<a ${prefix}href="${trackedUrl}"${suffix}>`;
    });

    // 2. Inject 1x1 transparent open pixel before </body> or at end
    const pixelTag = `<img src="${baseUrl}/api/track/open/${emailId}" width="1" height="1" alt="" style="display:none !important; width:1px !important; height:1px !important; border:0 !important; margin:0 !important; padding:0 !important;" />`;
    if (processed.includes('</body>')) {
      processed = processed.replace('</body>', `${pixelTag}\n</body>`);
    } else {
      processed += `\n${pixelTag}`;
    }

    return processed;
  }

  /**
   * Envolve mensagens em texto simples em um template HTML de comunicado/cobrança oficial.
   */
  static wrapInColiseuHtmlTemplate(assunto, rawBodyText, vars = {}) {
    if (!rawBodyText) rawBodyText = '';
    
    // Injeta variáveis no texto antes da análise
    let renderedText = this.renderTemplate(rawBodyText, vars);

    // Se o texto já for um documento HTML ou bloco com tags estruturadas, apenas retorna
    if (/<!DOCTYPE|<html|<table|<div|<section|<style/i.test(renderedText)) {
      return renderedText;
    }

    // Se o texto contiver "Assunto: ..." no início por engano, remove essa linha para não duplicar no corpo
    renderedText = renderedText.replace(/^Assunto:\s*[^\n]+\n?/i, '').trim();

    // Remove trechos legados indesejados (licença de terminais e opções de pagamento numeradas)
    renderedText = renderedText
      .replace(/Relembramos que o valor engloba a licença base de funcionamento.*$/gmi, '')
      .replace(/Opções de Pagamento Disponíveis:?/gmi, '')
      .replace(/1\.\s*Boleto Bancário:.*$/gmi, '')
      .replace(/2\.\s*Pix Copia e Cola.*$/gmi, '')
      .replace(/Copie o código abaixo e cole no aplicativo.*$/gmi, '');

    // Remove marcadores de Pix/Link quando vazios ou não preenchidos
    if (!vars.chave_pix || vars.chave_pix === '#' || vars.chave_pix === '{{chave_pix}}') {
      renderedText = renderedText.replace(/^[ \t]*Chave Pix Copia e Cola:.*$/gmi, '');
    }
    if (!vars.link_boleto_pdf || vars.link_boleto_pdf === '#' || vars.link_boleto_pdf === '{{link_boleto_pdf}}' || !vars.linkPagamento || vars.linkPagamento === '#') {
      renderedText = renderedText.replace(/^[ \t]*Link Seguro do Boleto:.*$/gmi, '');
    }

    // Limpa assinaturas e dados de contato pré-existentes para evitar duplicidade no final do e-mail
    renderedText = renderedText
      .replace(/^[ \t]*Setor de Controladoria.*$/gmi, '')
      .replace(/^[ \t]*\(67\)\s*3423-2227.*$/gmi, '')
      .replace(/^[ \t]*Email:\s*financeiro@coliseusistemas\.com\.br.*$/gmi, '')
      .replace(/^[ \t]*financeiro@coliseusistemas\.com\.br.*$/gmi, '')
      .replace(/^[ \t]*Coliseu Sistemas\s*-\s*Eliane.*$/gmi, '')
      .replace(/Atenciosamente,?\s*(Dpto Financeiro)?\s*(Coliseu Sistemas)?[^\n]*/gi, '')
      .trim();

    // Injeta a assinatura padrão oficial solicitada
    const assinaturaOficial = `Atenciosamente,\nDpto Financeiro\nColiseu Sistemas - Eliane Teixeira\n(67) 3423-2227 (67) 3253-6236 /(67) 99856-4972 Telefone e whatsapp\nEmail: financeiro@coliseusistemas.com.br`;

    renderedText = renderedText + '\n\n' + assinaturaOficial;

    // Se o texto não possuir quebras duplas de linha, insere quebras estruturais em pontos-chave automaticamente
    if (!renderedText.includes('\n\n')) {
      renderedText = renderedText
        .replace(/(Prezada Direção|A\/C:|Prezado\(a\)|Prezado Cliente)/gi, '\n\n$1')
        .replace(/(Constatamos|Identificamos|Lembramos|Não identificamos)/gi, '\n\n$1')
        .replace(/(De acordo com|Conforme|Para evitar|Solicitamos|A Coliseu Sistemas)/gi, '\n\n$1')
        .replace(/(DADOS PARA QUITAÇÃO|DADOS PARA PAGAMENTO)/gi, '\n\n$1')
        .replace(/(Caso o mesmo|Caso já tenha|Se o pagamento)/gi, '\n\n$1')
        .replace(/(Qualquer dúvida|Em caso de dúvidas)/gi, '\n\n$1')
        .replace(/(Cordialmente|Atenciosamente|Dpto Financeiro)/gi, '\n\n$1');
    }

    // Converte quebras duplas de linha em parágrafos e marcadores (- ou •) em listas HTML limpas
    const formattedContent = renderedText
      .split(/\n\s*\n/)
      .map(block => {
        const lines = block.trim().split('\n');
        // Se o bloco contiver marcadores de tópicos (- ou •)
        if (lines.some(l => l.trim().startsWith('-') || l.trim().startsWith('•'))) {
          const listItems = lines.map(line => {
            const cleanLine = line.trim().replace(/^[-•]\s*/, '');
            if (!cleanLine) return '';
            return `<li style="margin-bottom:6px;line-height:1.6;font-size:15px;color:#222222;font-family:Arial,Helvetica,sans-serif;">${cleanLine}</li>`;
          }).filter(Boolean).join('');
          return `<ul style="margin:0 0 16px 20px;padding:0;color:#222222;">${listItems}</ul>`;
        } else {
          const cleanP = block.trim().replace(/\n/g, '<br/>');
          if (!cleanP) return '';
          return `<p style="margin:0 0 16px 0;line-height:1.6;font-size:15px;color:#222222;font-family:Arial,Helvetica,sans-serif;">${cleanP}</p>`;
        }
      })
      .filter(Boolean)
      .join('');

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${assunto || 'Comunicado Coliseu Sistemas'}</title>
</head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#222222;-webkit-font-smoothing:antialiased;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#ffffff;padding:20px 10px;">
    <tr>
      <td align="left">
        <table width="650" border="0" cellspacing="0" cellpadding="0" style="max-width:650px;width:100%;background-color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
          <tr>
            <td style="padding:10px 0 20px 0;font-size:15px;color:#222222;line-height:1.6;">
              ${formattedContent}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  /**
   * Gera o template padrão de cobrança se nenhum for informado.
   */
  static defaultTemplateCobranca({ nomeCliente, valorCobranca, dataVencimento, linkPagamento, linhaDigitavel, mensagemPersonalizada }) {
    const textoPrincipal = mensagemPersonalizada && mensagemPersonalizada.trim()
      ? mensagemPersonalizada.trim().replace(/\n/g, '<br>')
      : 'Segue em anexo o boleto referente à <strong>Manutenção do Sistema Coliseu</strong>.';

    return `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05)">
      <div style="background:linear-gradient(135deg, #1e3a8a, #3b82f6);padding:32px 24px;text-align:center">
        <h2 style="color:#fff;margin:0;font-size:22px;font-weight:700;letter-spacing:0.5px">Cobrança Ref. ao Sistema Coliseu</h2>
      </div>
      <div style="padding:32px 24px;background:#fff">
        <p style="font-size:16px;color:#1e293b;margin-top:0;margin-bottom:20px;line-height:1.6">Prezado(a) Cliente, <strong style="color:#1e3a8a">${nomeCliente}</strong>,</p>
        <p style="font-size:15px;color:#334155;margin-bottom:24px;line-height:1.6">${textoPrincipal}</p>
        
        <div style="background:#f1f5f9;border-radius:8px;padding:20px;margin-bottom:24px;border-left:4px solid #3b82f6">
          <table style="width:100%;border-collapse:collapse">
            <tr>
              <td style="padding:6px 0;font-size:14px;color:#475569;font-weight:600">Valor da Fatura:</td>
              <td style="padding:6px 0;font-size:16px;color:#0f172a;font-weight:700;text-align:right">R$ ${valorCobranca}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;font-size:14px;color:#475569;font-weight:600">Data de Vencimento:</td>
              <td style="padding:6px 0;font-size:14px;color:#0f172a;font-weight:700;text-align:right">${dataVencimento}</td>
            </tr>
            ${linhaDigitavel ? `
            <tr>
              <td colspan="2" style="padding-top:12px;font-size:12px;color:#475569;font-weight:600;border-top:1px solid #cbd5e1;margin-top:8px">Linha Digitável:</td>
            </tr>
            <tr>
              <td colspan="2" style="padding:6px 0;font-size:12px;color:#1e3a8a;font-family:monospace;word-break:break-all;font-weight:bold;background:#fff;padding:8px;border-radius:4px;border:1px dashed #cbd5e1;text-align:center;margin-top:4px">${linhaDigitavel}</td>
            </tr>
            ` : ''}
          </table>
        </div>

        ${linkPagamento ? `
        <div style="text-align:center;margin:28px 0">
          <a href="${linkPagamento}" target="_blank" style="background-color:#1e3a8a;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:700;display:inline-block;box-shadow:0 4px 6px -1px rgba(30,58,138,0.2)">Visualizar Boleto / Pagar</a>
        </div>
        ` : ''}

        <div style="border-top:1px solid #e2e8f0;margin-top:32px;padding-top:24px">
          <p style="font-size:14px;color:#0f172a;font-weight:700;margin-top:0;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.5px">Qualquer dúvida entre em contato:</p>
          <p style="font-size:14px;color:#334155;margin:0 0 16px 0;line-height:1.6">
            Atenciosamente,<br>
            <strong>Departamento Financeiro</strong><br>
            <span style="color:#1e3a8a;font-weight:600">Coliseu Sistemas - Eliane Teixeira</span>
          </p>
          <table style="width:100%;border-collapse:collapse;font-size:13px;color:#475569">
            <tr><td style="padding:4px 0">📞 <strong>Telefones:</strong> (67) 3423-2227 | (67) 3253-6236</td></tr>
            <tr><td style="padding:4px 0">💬 <strong>WhatsApp:</strong> (67) 99856-4972</td></tr>
            <tr><td style="padding:4px 0">✉️ <strong>E-mail:</strong> <a href="mailto:financeiro@coliseusistemas.com.br" style="color:#3b82f6;text-decoration:none;font-weight:600">financeiro@coliseusistemas.com.br</a></td></tr>
          </table>
        </div>
      </div>
      <div style="background-color:#f1f5f9;padding:16px 24px;text-align:center;border-top:1px solid #e2e8f0">
        <p style="margin:0;font-size:12px;color:#94a3b8">Esta é uma mensagem automática de Coliseu Sistemas. Por favor, não responda a este e-mail.</p>
      </div>
    </div>`;
  }

  /**
   * Gera o template padrão de marketing.
   */
  static defaultTemplateMarketing({ nomeCliente, assunto, corpo }) {
    return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9f9f9;border-radius:8px;overflow:hidden">
      <div style="background:#1a56db;padding:24px 32px">
        <h2 style="color:#fff;margin:0;font-size:20px">${assunto}</h2>
      </div>
      <div style="padding:32px;background:#fff">
        <p style="font-size:15px;color:#374151">Olá, <strong>${nomeCliente}</strong>!</p>
        <div style="font-size:14px;color:#374151;line-height:1.7">${corpo}</div>
        <p style="font-size:12px;color:#9ca3af;margin-top:32px">Você está recebendo este e-mail pois é nosso cliente.</p>
      </div>
    </div>`;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // OPÇÃO A: SMTP via Nodemailer (pool mode para alto volume)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Cria um transporter SMTP em pool mode para envio em massa eficiente.
   */
  static createSmtpTransporter(config) {
    if (!nodemailer) throw new Error('Nodemailer não instalado no servidor. Verifique o deploy.');
    const port = parseInt(config.smtpPort || 465, 10);
    const isSecure = config.smtpSecure === true || port === 465;
    return nodemailer.createTransport({
      host: config.smtpHost,
      port: port,
      secure: isSecure,
      auth: (config.smtpUser && config.smtpUser.trim() !== '') ? { 
        user: config.smtpUser.trim(), 
        pass: config.smtpPass || '' 
      } : undefined,
      tls: {
        rejectUnauthorized: false
      },
      pool: false,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000
    });
  }

  static criarTransporter(config) {
    return this.createSmtpTransporter(config);
  }

  static async enviarSmtp(transporter, { de, para, replyTo, assunto, html, attachments = [] }) {
    const uniqueToken = `ref_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    
    // Inject invisible unique anti-thread token so Gmail never collapses emails into a thread
    const antiThreadToken = `<div style="display:none !important; visibility:hidden; opacity:0; color:transparent; height:0; width:0; mso-hide:all; font-size:1px; line-height:1px;">&#847;&#848;&#849; ${uniqueToken}</div>`;
    let processedHtml = html || '';
    const finalAttachments = Array.isArray(attachments) ? [...attachments] : [];

    // Auto-convert Base64 and /uploads/arts/ images into CID inline attachments
    // so Gmail/Outlook render them 100% sharply with ZERO external HTTP 404 or image blocking
    try {
      processedHtml = processedHtml.replace(/<img([^>]*)\s+src=["']([^"']+)["']([^>]*)>/gi, (fullTag, before, srcUrl, after) => {
        let buffer = null;
        let ext = 'png';
        let cidName = '';

        if (srcUrl.startsWith('data:image/')) {
          const matches = srcUrl.match(/^data:image\/([a-zA-Z0-9+\-]+);base64,(.+)$/s);
          if (matches) {
            ext = matches[1] === 'jpeg' ? 'jpg' : matches[1] || 'png';
            buffer = Buffer.from(matches[2], 'base64');
            const hash = crypto.createHash('md5').update(buffer).digest('hex');
            cidName = `art_${hash}`;
          }
        } else if (srcUrl.includes('/uploads/arts/') || srcUrl.includes('/api/uploads/arts/') || srcUrl.includes('/assets/') || srcUrl.includes('cobranca_alerta')) {
          const filename = path.basename(srcUrl).split('?')[0];
          const extMatch = filename.match(/\.(png|jpg|jpeg|gif|webp)$/i);
          ext = extMatch ? extMatch[1] : 'png';

          if (filename.includes('cobranca_alerta')) {
            buffer = getCobrancaAlertaBuffer();
            cidName = 'cobranca_alerta_icon';
          } else {
            const diskPath1 = path.join(__dirname, '../../public/uploads/arts', filename);
            const diskPath2 = path.join(__dirname, '../public/uploads/arts', filename);
            const diskPath3 = path.join(__dirname, '../../public/assets', filename);
            const diskPath4 = path.join(__dirname, '../public/assets', filename);
            const tmpPathColiseu = path.join('/tmp', 'coliseu_uploads_arts', filename);
            const tmpPathLegacy = path.join('/tmp', 'nexus_uploads_arts', filename);

            if (fs.existsSync(diskPath1)) {
              buffer = fs.readFileSync(diskPath1);
            } else if (fs.existsSync(diskPath2)) {
              buffer = fs.readFileSync(diskPath2);
            } else if (fs.existsSync(diskPath3)) {
              buffer = fs.readFileSync(diskPath3);
            } else if (fs.existsSync(diskPath4)) {
              buffer = fs.readFileSync(diskPath4);
            } else if (fs.existsSync(tmpPathColiseu)) {
              buffer = fs.readFileSync(tmpPathColiseu);
            } else if (fs.existsSync(tmpPathLegacy)) {
              buffer = fs.readFileSync(tmpPathLegacy);
            }
            cidName = `art_${filename.replace(/[^a-zA-Z0-9]/g, '_')}`;
          }
        }

        if (buffer && cidName) {
          if (!finalAttachments.some(a => a.cid === cidName)) {
            finalAttachments.push({
              filename: `${cidName}.${ext}`,
              content: buffer,
              cid: cidName
            });
          }
          return `<img${before} src="cid:${cidName}"${after}>`;
        }

        return fullTag;
      });
    } catch (err) {
      logger.warn(`[EmailService] CID inline image conversion warning: ${err.message}`);
    }

    if (processedHtml.toLowerCase().includes('</body>')) {
      processedHtml = processedHtml.replace(/<\/body>/i, `${antiThreadToken}</body>`);
    } else {
      processedHtml = processedHtml + antiThreadToken;
    }

    const mailOptions = {
      from: de,
      to: para,
      subject: assunto,
      html: processedHtml,
      attachments: finalAttachments,
      headers: {
        'X-Entity-Ref-ID': uniqueToken,
        'X-Coliseu-Mail-ID': uniqueToken,
        'X-Nexus-Mail-ID': uniqueToken
      }
    };

    if (replyTo) {
      mailOptions.replyTo = replyTo;
    }

    return transporter.sendMail(mailOptions);
  }

  /**
   * Envia um e-mail individual imediato usando a configuração de SMTP ou Brevo fornecida.
   * Suporta attachments (URLs remotas, buffers ou CIDs inline).
   */
  static async sendSingle(config, { de, para, replyTo, assunto, html, attachments = [], nomeCliente }) {
    if (!config) throw new Error('Configuração de e-mail não informada.');
    if (!para || !para.includes('@')) throw new Error(`Destinatário inválido: ${para}`);

    const remetenteNome = config.remetenteNome || 'Coliseu Transporte';
    const smtpAuthUser = (config.smtpUser || '').trim();
    const configRemetenteEmail = (config.remetenteEmail || smtpAuthUser || '').trim();

    // No Gmail SMTP: quando o remetenteEmail for diferente do smtpUser, usamos o smtpUser no "from" e o remetenteEmail no "replyTo"
    // Isso evita que o Gmail bloqueie com 553 / 550 Unrecognized sender
    let fromAddr = de;
    let replyToAddr = replyTo || configRemetenteEmail;
    if (!fromAddr) {
      if (config.provedor === 'smtp' && config.smtpHost && config.smtpHost.toLowerCase().includes('gmail') && smtpAuthUser) {
        fromAddr = `"${remetenteNome}" <${smtpAuthUser}>`;
      } else {
        fromAddr = `"${remetenteNome}" <${configRemetenteEmail || smtpAuthUser}>`;
      }
    }

    const { html: sanitizedHtml, attachments: inlineAttachments } = this.processHtmlImages(html || '');
    const finalAttachments = [...attachments, ...inlineAttachments];

    if (config.provedor === 'brevo') {
      // Separar attachments regulares dos inline CID
      const regularAtts = finalAttachments.filter(att => !att.cid);
      const inlineCidAtts = finalAttachments.filter(att => att.cid);

      const brevoAttachments = regularAtts.map(att => {
        if (att.path && (att.path.startsWith('http://') || att.path.startsWith('https://'))) {
          return { url: att.path, name: att.filename || 'anexo.pdf' };
        }
        if (att.content && Buffer.isBuffer(att.content)) {
          return { content: att.content.toString('base64'), name: att.filename || 'anexo.pdf' };
        }
        return null;
      }).filter(Boolean);

      // Para Brevo, substituir CIDs no HTML por data URIs inline (Brevo não suporta CID nativamente)
      let brevoHtml = sanitizedHtml;
      for (const cidAtt of inlineCidAtts) {
        if (cidAtt.content && Buffer.isBuffer(cidAtt.content) && cidAtt.cid) {
          const ext = (cidAtt.filename || '').split('.').pop() || 'png';
          const mimeType = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
          const b64 = cidAtt.content.toString('base64');
          brevoHtml = brevoHtml.replace(new RegExp(`src=["']cid:${cidAtt.cid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'gi'), `src="data:${mimeType};base64,${b64}"`);
        }
      }

      const payload = {
        sender: { name: remetenteNome, email: remetenteEmail },
        to: [{ email: para.trim(), name: nomeCliente || para.trim() }],
        subject: assunto,
        htmlContent: brevoHtml,
        ...(brevoAttachments.length > 0 ? { attachment: brevoAttachments } : {})
      };

      if (replyToAddr) {
        payload.replyTo = { email: replyToAddr, name: remetenteNome };
      }

      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': config.brevoApiKey
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || `Erro Brevo (${res.status}): ${JSON.stringify(data)}`);
      }
      return data;
    } else {
      const transporter = this.createSmtpTransporter(config);
      try {
        return await this.enviarSmtp(transporter, {
          de: fromAddr,
          para: para.trim(),
          replyTo: replyToAddr,
          assunto,
          html: sanitizedHtml,
          attachments: finalAttachments
        });
      } finally {
        transporter.close();
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // OPÇÃO B: API REST do Brevo (até 1000 destinatários por chamada)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Envia um lote de e-mails via API REST do Brevo.
   * O Brevo suporta envio de até 1000 destinatários por requisição.
   */
  static async enviarLoteBrevo(config, mensagens) {
    const BREVO_BATCH_SIZE = 1000;
    const resultados = [];

    for (let i = 0; i < mensagens.length; i += BREVO_BATCH_SIZE) {
      const lote = mensagens.slice(i, i + BREVO_BATCH_SIZE);

      const payload = {
        sender: { name: config.remetenteNome, email: config.remetenteEmail },
        messageVersions: lote.map(m => {
          const { html: sanitized, attachments: inlineAtts } = this.processHtmlImages(m.html || '');
          let brevoHtml = sanitized;
          for (const att of inlineAtts) {
            if (att.content && Buffer.isBuffer(att.content) && att.cid) {
              const ext = (att.filename || '').split('.').pop() || 'png';
              const mimeType = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
              const b64 = att.content.toString('base64');
              brevoHtml = brevoHtml.replace(new RegExp(`src=["']cid:${att.cid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'gi'), `src="data:${mimeType};base64,${b64}"`);
            }
          }
          return {
            to: [{ email: m.para, name: m.nomeCliente || m.para }],
            subject: m.assunto,
            htmlContent: brevoHtml
          };
        })
      };

      try {
        const res = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': config.brevoApiKey
          },
          body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (!res.ok) {
          resultados.push({ lote: i, status: 'erro', detalhes: data });
          logger.error('[EmailService] Erro no lote Brevo', { lote: i, data });
        } else {
          resultados.push({ lote: i, status: 'ok', enviados: lote.length });
          logger.info(`[EmailService] Brevo: lote ${i} enviado — ${lote.length} e-mails`);
        }
      } catch (err) {
        resultados.push({ lote: i, status: 'erro', detalhes: err.message });
        logger.error('[EmailService] Falha no fetch do Brevo', { err: err.message });
      }
    }

    return resultados;
  }

  /**
   * Processa o HTML do e-mail para:
   * 1. Converter imagens base64 (data:image/...) em anexos CID inline leves para o Nodemailer.
   *    Isso evita o corte de mensagem no Gmail ([Mensagem cortada]) e carrega as imagens/logos perfeitamente inline.
   * 2. Converter URLs de imagens relativas (/assets/...) para a URL pública HTTPS completa da plataforma.
   */
  static processHtmlImages(htmlBody) {
    if (!htmlBody) return { html: '', attachments: [] };

    let processedHtml = htmlBody;
    const attachments = [];
    let imgCounter = 0;

    // 0. Auto-inject e resolução garantida da ilustração oficial de cobrança/alerta ("Documento, relógio e alerta em vermelho")
    const cobrancaImgPattern = /<img([^>]*?)(?:alt=["'][^"']*(?:Documento|rel[oó]gio|alerta em vermelho)[^"']*["']|src=["'][^"']*(?:cobranca_alerta|alerta_cobranca)[^"']*["'])([^>]*?)>/gi;
    if (cobrancaImgPattern.test(processedHtml)) {
      processedHtml = processedHtml.replace(cobrancaImgPattern, (fullTag) => {
        let clean = fullTag;
        clean = clean.replace(/src=["'][^"']*["']/i, 'src="cid:cobranca_alerta_icon"');
        if (!/alt=/i.test(clean)) {
          clean = clean.replace(/<img/i, '<img alt="Documento, relógio e alerta em vermelho"');
        }
        if (!/width=/i.test(clean) && !/width\s*:/i.test(clean)) {
          clean = clean.replace(/<img/i, '<img width="110" style="max-width:110px;width:110px;height:auto;display:inline-block;"');
        }
        return clean;
      });

      if (!attachments.some(a => a.cid === 'cobranca_alerta_icon')) {
        attachments.push({
          filename: 'cobranca_alerta.png',
          content: getCobrancaAlertaBuffer(),
          cid: 'cobranca_alerta_icon',
          contentDisposition: 'inline'
        });
      }
    }

    // Converte base64 data URIs em anexos CID inline
    const base64Regex = /src=["']data:image\/([a-zA-Z0-9\+\-]+);base64,([^"']+)["']/gi;
    processedHtml = processedHtml.replace(base64Regex, (match, ext, base64Data) => {
      imgCounter++;
      const cleanExt = ext === 'svg+xml' ? 'svg' : ext;
      const cid = `inline_img_${imgCounter}_${Date.now()}`;
      const filename = `image_${imgCounter}.${cleanExt}`;

      attachments.push({
        filename,
        content: Buffer.from(base64Data, 'base64'),
        cid,
        contentDisposition: 'inline'
      });

      return `src="cid:${cid}"`;
    });

    // Se ainda houver referências a cobranca_alerta.png em URLs absolutas ou relativas, converte para CID
    if (/cobranca_alerta/i.test(processedHtml)) {
      processedHtml = processedHtml.replace(/src=["'][^"']*cobranca_alerta\.(?:png|jpg|jpeg|svg)["']/gi, 'src="cid:cobranca_alerta_icon"');
      if (!attachments.some(a => a.cid === 'cobranca_alerta_icon')) {
        attachments.push({
          filename: 'cobranca_alerta.png',
          content: getCobrancaAlertaBuffer(),
          cid: 'cobranca_alerta_icon',
          contentDisposition: 'inline'
        });
      }
    }

    // Converte URLs relativas (/assets/...) para HTTPS pública
    processedHtml = processedHtml.replace(/src=["'](\/)?(?:assets\/)?certificado_digital_icon\.(png|svg|jpg)["']/gi, 'src="https://transporte.coliseusistemas.com.br/assets/certificado_digital_icon.png"');
    processedHtml = processedHtml.replace(/src=["']\/(?!\/)([^"']+)["']/gi, 'src="https://transporte.coliseusistemas.com.br/$1"');
    processedHtml = processedHtml.replace(/src=["']assets\/([^"']+)["']/gi, 'src="https://transporte.coliseusistemas.com.br/assets/$1"');

    // Remove imagens com src blob: ou localhost (não acessíveis por e-mail)
    processedHtml = processedHtml.replace(/<img[^>]*src=["']blob:[^"']*["'][^>]*\/?>/gi, '');
    processedHtml = processedHtml.replace(/<img[^>]*src=["']https?:\/\/(localhost|127\.0\.0\.1)[^"']*["'][^>]*\/?>/gi, '');

    // Remove qualquer <img src="cid:..."> que não esteja nos attachments gerados (CIDs órfãos do HTML importado)
    const validCids = new Set(attachments.map(a => a.cid));
    processedHtml = processedHtml.replace(/<img[^>]*src=["']cid:([^"']+)["'][^>]*\/?>/gi, (match, cidVal) => {
      if (validCids.has(cidVal)) {
        return match;
      }
      return ''; // Purga imagem com CID inexistente que quebra no Gmail
    });

    // Remove imagens com src vazio ou inválido
    processedHtml = processedHtml.replace(/<img[^>]*src=["']\s*["'][^>]*\/?>/gi, '');
    processedHtml = processedHtml.replace(/<img[^>]*src=["']#["'][^>]*\/?>/gi, '');
    processedHtml = processedHtml.replace(/<img[^>]*src=["']undefined["'][^>]*\/?>/gi, '');

    return { html: processedHtml, attachments };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // FUNÇÃO PRINCIPAL: enviarLoteCobrancas
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Envia e-mails de cobrança em lote para um array de clientes.
   * 
   * @param {string} tenantId - ID do tenant
   * @param {Array} arrayClientes - Array de objetos: [{ email, nome, valor, vencimento, linkPagamento, linhaDigitavel }]
   * @param {string|null} templateHtml - HTML personalizado (opcional). Se null, usa template padrão.
   * @param {string} assunto - Assunto do e-mail
   * @returns {Object} Relatório de envios: { total, sucesso, falha, erros }
   */
  static async enviarLoteCobrancas(tenantId, arrayClientes, templateHtml = null, assunto = 'Cobrança Ref. ao Sistema Coliseu') {
    const config = await this.getConfig(tenantId);
    const relatorio = { total: arrayClientes.length, sucesso: 0, falha: 0, erros: [] };

    logger.info(`[EmailService] Iniciando lote de ${arrayClientes.length} cobranças — provedor: ${config.provedor}`);

    // Enriquecer dados dos títulos a partir do banco de dados se necessário
    for (const cliente of arrayClientes) {
      if (cliente.titulo_id && (!cliente.linkPagamento || !cliente.linhaDigitavel || !cliente.nossoNumero)) {
        try {
          const { rows: tRows } = await db.query(
            `SELECT nosso_numero, asaas_payment_id, asaas_bank_slip_url, asaas_linha_digitavel, bank_slip_url, pdf_url
             FROM dash_financeiro 
             WHERE id = $1 OR id_firebird = $1 LIMIT 1`,
            [parseInt(cliente.titulo_id, 10)]
          );
          if (tRows.length > 0) {
            const t = tRows[0];
            cliente.linkPagamento = cliente.linkPagamento || t.asaas_bank_slip_url || t.bank_slip_url || t.pdf_url || '';
            cliente.linhaDigitavel = cliente.linhaDigitavel || t.asaas_linha_digitavel || '';
            cliente.nossoNumero = cliente.nossoNumero || t.nosso_numero || t.asaas_payment_id || '';
          }
        } catch (e) {}
      }
    }

    if (config.provedor === 'brevo') {
      // ── Opção B: Brevo API (lote otimizado) ──────────────────────────────
      const mensagens = arrayClientes.map(cliente => {
        const html = templateHtml
          ? this.renderTemplate(templateHtml, {
              nomeCliente: cliente.nome,
              valorCobranca: cliente.valor,
              dataVencimento: cliente.vencimento,
              linkPagamento: cliente.linkPagamento || '',
              linhaDigitavel: cliente.linhaDigitavel || '',
              nossoNumero: cliente.nossoNumero || ''
            })
          : this.defaultTemplateCobranca({
              nomeCliente: cliente.nome,
              valorCobranca: cliente.valor,
              dataVencimento: cliente.vencimento,
              linkPagamento: cliente.linkPagamento,
              linhaDigitavel: cliente.linhaDigitavel
            });

        return { para: cliente.email, nomeCliente: cliente.nome, assunto, html };
      });

      const resultados = await this.enviarLoteBrevo(config, mensagens);
      for (const r of resultados) {
        if (r.status === 'ok') relatorio.sucesso += r.enviados;
        else { relatorio.falha += 1; relatorio.erros.push(r); }
      }

    } else {
      // ── Opção A: SMTP Nodemailer (pool, envio individual com retry) ──────
      const transporter = this.createSmtpTransporter(config);
      const de = `"${config.remetenteNome}" <${config.remetenteEmail}>`;

      const envios = arrayClientes.map(async cliente => {
        try {
          const rawHtml = templateHtml
            ? this.renderTemplate(templateHtml, {
                nomeCliente: cliente.nome,
                valorCobranca: cliente.valor,
                dataVencimento: cliente.vencimento,
                linkPagamento: cliente.linkPagamento || '',
                linhaDigitavel: cliente.linhaDigitavel || '',
                nossoNumero: cliente.nossoNumero || ''
              })
            : this.defaultTemplateCobranca({
                nomeCliente: cliente.nome,
                valorCobranca: cliente.valor,
                dataVencimento: cliente.vencimento,
                linkPagamento: cliente.linkPagamento,
                linhaDigitavel: cliente.linhaDigitavel
              });

          const { html, attachments } = this.processHtmlImages(rawHtml);
          const attachmentsToSend = [...attachments];
          if (cliente.linkPagamento && cliente.linkPagamento.startsWith('http')) {
            attachmentsToSend.push({
              filename: `boleto_${cliente.nossoNumero || cliente.titulo_id || 'cobranca'}.pdf`,
              path: cliente.linkPagamento
            });
          }

          await this.enviarSmtp(transporter, { de, para: cliente.email, assunto, html, attachments: attachmentsToSend });
          relatorio.sucesso++;
          logger.info(`[EmailService] SMTP OK → ${cliente.email}`);

          // Grava log de auditoria do título e log de ocorrências
          if (cliente.titulo_id) {
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
            `).catch(() => {});

            await db.query(`
              INSERT INTO dash_financeiro_logs (tenant_id, titulo_id, financeiro_id, tipo_evento, usuario, nosso_numero, descricao, data_evento)
              VALUES ($1, $2, $2, 'COBRANCA_EMAIL_LOTE', 'Sistema', $3, $4, NOW())
            `, [tenantId, cliente.titulo_id, cliente.nossoNumero || null, `Aviso de cobrança enviado por e-mail para ${cliente.email}. Assunto: ${assunto}`]).catch(() => {});

            await db.query(`
              ALTER TABLE dash_automacoes_logs ALTER COLUMN automacao_id DROP NOT NULL;
              INSERT INTO dash_automacoes_logs (tenant_id, cliente_id, financeiro_id, tipo, canal, destinatario, subcategoria, status, enviado_em)
              VALUES ($1, $2, $3, 'COBRANCA_LOTE', 'EMAIL', $4, 'cobranca', 'Sucesso', NOW())
            `, [tenantId, cliente.cliente_id || null, cliente.titulo_id, cliente.email]).catch(() => {});
          }
        } catch (err) {
          relatorio.falha++;
          relatorio.erros.push({ email: cliente.email, erro: err.message });
          logger.error(`[EmailService] SMTP falha → ${cliente.email}: ${err.message}`);
        }
      });

      // Processa todos em paralelo (o pool gerencia as conexões)
      await Promise.allSettled(envios);
      transporter.close();
    }

    logger.info(`[EmailService] Lote concluído: ${relatorio.sucesso} enviados, ${relatorio.falha} falhas`);
    if (relatorio.falha > 0 && relatorio.sucesso === 0) {
      const primeiroErro = relatorio.erros[0]?.erro || 'Falha ao enviar e-mail via servidor SMTP';
      throw new Error(primeiroErro);
    }
    return relatorio;
  }

  /**
   * Envia um lote genérico de e-mails.
   * @param {string} tenantId - ID do tenant
   * @param {Array} arrayItens - Array de objetos contendo destinatarioEmail/email/para, destinatarioNome/nome/nomeCliente, assunto, corpoHtml/html/corpo
   * @returns {Object} Relatório de envios: { total, sucesso, falha, erros }
   */
  static async enviarLote(tenantId, arrayItens) {
    const config = await this.getConfig(tenantId);
    const relatorio = { total: arrayItens.length, sucesso: 0, falha: 0, erros: [] };

    logger.info(`[EmailService] Enviar Lote: ${arrayItens.length} e-mails — provedor: ${config.provedor}`);

    if (config.provedor === 'brevo') {
      const mensagens = arrayItens.map(item => {
        const para = item.destinatarioEmail || item.email || item.para;
        const nomeCliente = item.destinatarioNome || item.nome || item.nomeCliente || 'Cliente';
        const assunto = item.assunto || 'Mensagem Coliseu Transporte';
        const rawBody = item.corpoHtml || item.html || item.corpo || '';
        const html = this.prepareEmailHtml(assunto, rawBody, { nomeCliente, ...item });

        return { para, nomeCliente, assunto, html };
      });

      const resultados = await this.enviarLoteBrevo(config, mensagens);
      for (const r of resultados) {
        if (r.status === 'ok') relatorio.sucesso += r.enviados;
        else { relatorio.falha += 1; relatorio.erros.push(r); }
      }
    } else {
      const transporter = this.createSmtpTransporter(config);
      const de = `"${config.remetenteNome}" <${config.remetenteEmail}>`;

      const envios = arrayItens.map(async item => {
        const para = item.destinatarioEmail || item.email || item.para;
        const nomeCliente = item.destinatarioNome || item.nome || item.nomeCliente || 'Cliente';
        const assunto = item.assunto || 'Mensagem Coliseu Transporte';
        const rawBody = item.corpoHtml || item.html || item.corpo || '';
        const processedHtml = this.prepareEmailHtml(assunto, rawBody, { nomeCliente, ...item });

        const { html, attachments } = this.processHtmlImages(processedHtml);
        const itemAttachments = [...(item.attachments || []), ...attachments];

        try {
          await this.enviarSmtp(transporter, { de, para, assunto, html, attachments: itemAttachments });
          relatorio.sucesso++;
          logger.info(`[EmailService] SMTP OK → ${para}`);
        } catch (err) {
          relatorio.falha++;
          relatorio.erros.push({ email: para, erro: err.message });
          logger.error(`[EmailService] SMTP falha → ${para}: ${err.message}`);
        }
      });

      await Promise.allSettled(envios);
      transporter.close();
    }

    if (relatorio.falha > 0 && relatorio.sucesso === 0) {
      const primeiroErro = relatorio.erros[0]?.erro || 'Falha ao enviar e-mail via SMTP';
      throw new Error(primeiroErro);
    }

    return relatorio;
  }

  /**
   * Envia e-mails de marketing em lote.
   * @param {string} tenantId - ID do tenant
   * @param {Array} arrayClientes - Array de objetos: [{ email, nome }]
   * @param {string} assunto - Assunto do e-mail
   * @param {string} corpoHtml - Corpo HTML da mensagem de marketing
   */
  static async enviarLoteMarketing(tenantId, arrayClientes, assunto, corpoHtml) {
    const itens = arrayClientes.map(cliente => {
      const nomeCliente = cliente.nome || cliente.destinatarioNome || 'Cliente';
      const email = cliente.email || cliente.destinatarioEmail;

      let html = corpoHtml || '';
      if (!html.includes('<div') && !html.includes('<table') && !html.includes('<html')) {
        html = this.defaultTemplateMarketing({ nomeCliente, assunto, corpo: corpoHtml });
      } else {
        html = this.renderTemplate(html, {
          nomeCliente,
          nome_cliente: nomeCliente,
          email,
          assunto
        });
      }

      return {
        email,
        nome: nomeCliente,
        assunto,
        html
      };
    });

    return this.enviarLote(tenantId, itens);
  }

  /**
   * Testa a conexão com o servidor de e-mail configurado.
   */
  static async testarConexao(tenantIdOrConfig) {
    const config = typeof tenantIdOrConfig === 'string'
      ? await this.getConfig(tenantIdOrConfig)
      : tenantIdOrConfig;

    if (config.provedor === 'brevo') {
      const res = await fetch('https://api.brevo.com/v3/account', {
        headers: { 'api-key': config.brevoApiKey }
      });
      if (!res.ok) throw new Error('Chave de API do Brevo inválida ou sem permissão.');
      const data = await res.json();
      return { ok: true, provedor: 'brevo', conta: data.email, plano: data.plan?.[0]?.type };
    }

    if (!nodemailer) throw new Error('Nodemailer não instalado no servidor. Aguarde o rebuild do Coolify.');
    const transporter = this.createSmtpTransporter(config);
    try {
      await transporter.verify();
      return { ok: true, provedor: 'smtp', host: config.smtpHost, porta: config.smtpPort };
    } finally {
      transporter.close();
    }
  }
}

module.exports = EmailService;
