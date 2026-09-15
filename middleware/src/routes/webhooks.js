'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db/postgres');
const logger = require('../config/logger');

/**
 * Normalizes Brazilian phone numbers for database matching.
 */
function cleanPhoneNumber(phone) {
    if (!phone) return '';
    return phone.replace(/\D/g, '');
}

/**
 * Helper to process inbound message and route it to CRM timeline or billing occurrences
 */
async function processInboundMessage(tenantId, provider, cleanSender, text, messageId, rawPayload) {
    try {
        // 1. Log in dash_whatsapp_mensagens
        await db.query(
            `INSERT INTO dash_whatsapp_mensagens (
                tenant_id, whatsapp_message_id, sender, recipient, text_body, direction, status, provider, payload
            ) VALUES ($1, $2, $3, $4, $5, 'INBOUND', 'RECEIVED', $6, $7)`,
            [
                tenantId,
                messageId || null,
                cleanSender,
                'system',
                text,
                provider,
                JSON.stringify(rawPayload)
            ]
        );

        const senderNoCountry = cleanSender.startsWith('55') ? cleanSender.substring(2) : cleanSender;

        // 2. Look up matching Lead/Opportunity in CRM (dash_oportunidades)
        const oppsRes = await db.query(
            `SELECT id FROM dash_oportunidades 
             WHERE tenant_id = $1 
               AND (
                   REGEXP_REPLACE(telefone, '\\D', '', 'g') = $2 
                   OR REGEXP_REPLACE(telefone, '\\D', '', 'g') = $3
               )
             ORDER BY created_at DESC LIMIT 1`,
            [tenantId, cleanSender, senderNoCountry]
        );

        if (oppsRes.rows.length > 0) {
            const oppId = oppsRes.rows[0].id;
            await db.query(
                `INSERT INTO dash_oportunidades_interacoes (
                    tenant_id, oportunidade_id, tipo, descricao, criado_por
                ) VALUES ($1, $2, 'WHATSAPP', $3, 'Sistema (Webhook)')`,
                [tenantId, oppId, `[WhatsApp Recebido] ${text}`]
            );
            logger.info(`[🔗 WEBHOOK] Mensagem do número ${cleanSender} vinculada à Oportunidade CRM #${oppId}`);
        }

        // 3. Look up matching Customer (dash_clientes)
        const clientsRes = await db.query(
            `SELECT id, id_firebird FROM dash_clientes 
             WHERE tenant_id = $1 
               AND (
                   REGEXP_REPLACE(telefone, '\\D', '', 'g') = $2 
                   OR REGEXP_REPLACE(telefone, '\\D', '', 'g') = $3
               )
             ORDER BY id DESC LIMIT 1`,
            [tenantId, cleanSender, senderNoCountry]
        );

        if (clientsRes.rows.length > 0) {
            const clientId = clientsRes.rows[0].id;
            const clientFirebirdId = clientsRes.rows[0].id_firebird;

            if (clientFirebirdId) {
                // Find most recent open invoice/title in billing (dash_financeiro)
                const finRes = await db.query(
                    `SELECT id FROM dash_financeiro 
                     WHERE tenant_id = $1 
                       AND cliente_id_firebird = $2
                       AND TRIM(status_pagamento) = 'ABERTO'
                     ORDER BY data_vencimento ASC LIMIT 1`,
                    [tenantId, clientFirebirdId]
                );

                if (finRes.rows.length > 0) {
                    const finId = finRes.rows[0].id;
                    await db.query(
                        `INSERT INTO dash_cobrancas_ocorrencias (
                            tenant_id, financeiro_id, tipo_contato, observacao, operador
                        ) VALUES ($1, $2, 'WhatsApp', $3, 'Sistema (Webhook)')`,
                        [tenantId, finId, `[WhatsApp Recebido] ${text}`]
                    );
                    logger.info(`[🔗 WEBHOOK] Mensagem do número ${cleanSender} vinculada ao Financeiro #${finId} do cliente #${clientId}`);
                }
            }
        }
    } catch (err) {
        logger.error(`[🔗 WEBHOOK] Erro ao processar mensagem recebida via webhook: ${err.message}`);
    }
}

/**
 * @route GET /api/v1/webhooks/whatsapp-meta
 * @desc Meta Webhook Validation (Subscribe mode challenge)
 */
router.get('/whatsapp-meta', async (req, res) => {
    try {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        if (mode && token) {
            if (mode === 'subscribe') {
                // Verify if token exists for any tenant config
                const { rows } = await db.query(
                    'SELECT tenant_id FROM dash_integracoes_config WHERE whatsapp_meta_verify_token = $1',
                    [token]
                );

                if (rows.length > 0) {
                    logger.info(`[🔗 WEBHOOK META] Webhook verificado com sucesso para o tenant ${rows[0].tenant_id}`);
                    return res.status(200).send(challenge);
                }
            }
        }
        logger.warn('[🔗 WEBHOOK META] Falha na verificação do Webhook Meta (Token incorreto ou nulo)');
        return res.status(403).send('Forbidden');
    } catch (err) {
        logger.error('[🔗 WEBHOOK META] Erro durante verificação GET:', err.message);
        return res.status(500).send('Internal Server Error');
    }
});

/**
 * @route POST /api/v1/webhooks/whatsapp-meta
 * @desc Receives WhatsApp inbound messages from Meta Cloud API
 */
router.post('/whatsapp-meta', async (req, res) => {
    const body = req.body;

    try {
        // Confirm it's a message event
        if (body.object === 'whatsapp_business_account') {
            const entry = body.entry?.[0];
            const change = entry?.changes?.[0]?.value;
            
            if (change && change.messages && change.messages.length > 0) {
                const phoneId = change.metadata?.phone_number_id;
                
                // 1. Resolve tenant
                const { rows } = await db.query(
                    'SELECT tenant_id FROM dash_integracoes_config WHERE whatsapp_meta_phone_id = $1',
                    [phoneId]
                );

                if (rows.length === 0) {
                    logger.warn(`[🔗 WEBHOOK META] Evento recebido para Phone ID não cadastrado: ${phoneId}`);
                    return res.status(200).send('OK'); // Return 200 to prevent Meta retries
                }

                const tenantId = rows[0].tenant_id;
                const message = change.messages[0];
                const cleanSender = cleanPhoneNumber(message.from);
                const text = message.text?.body || '';
                const messageId = message.id;

                logger.info(`[🔗 WEBHOOK META] Msg recebida de ${cleanSender} (Tenant: ${tenantId}): ${text.substring(0, 50)}`);

                // 2. Process and save inbound message
                if (text) {
                    await processInboundMessage(tenantId, 'meta', cleanSender, text, messageId, body);
                }
            }
        }
        return res.status(200).send('OK');
    } catch (err) {
        logger.error('[🔗 WEBHOOK META] Erro ao processar payload POST:', err.message);
        return res.status(200).send('OK'); // Always return 200 to avoid webhook suspension
    }
});

/**
 * @route POST /api/v1/webhooks/whatsapp-uazapi
 * @desc Receives WhatsApp inbound messages from Uazapi Broker
 */
router.post('/whatsapp-uazapi', async (req, res) => {
    const body = req.body;

    try {
        // Uazapi standard is messages.upsert or direct body.message
        if (body.event === 'messages.upsert' || body.message || body.data?.message) {
            const instanceId = body.instanceId;

            // 1. Resolve tenant
            const { rows } = await db.query(
                'SELECT tenant_id FROM dash_integracoes_config WHERE whatsapp_instancia_id = $1',
                [instanceId]
            );

            if (rows.length === 0) {
                logger.warn(`[🔗 WEBHOOK UAZAPI] Evento recebido para Instância não cadastrada: ${instanceId}`);
                return res.status(200).send('OK');
            }

            const tenantId = rows[0].tenant_id;
            
            const rawSender = body.data?.key?.remoteJid || body.sender || '';
            const cleanSender = cleanPhoneNumber(rawSender);
            const text = body.data?.message?.conversation || body.text || '';
            const messageId = body.data?.key?.id || body.messageId;

            logger.info(`[🔗 WEBHOOK UAZAPI] Msg recebida de ${cleanSender} (Tenant: ${tenantId}): ${text.substring(0, 50)}`);

            // 2. Process and save inbound message
            if (text) {
                await processInboundMessage(tenantId, 'uazapi', cleanSender, text, messageId, body);
            }
        }
        return res.status(200).send('OK');
    } catch (err) {
        logger.error('[🔗 WEBHOOK UAZAPI] Erro ao processar payload POST:', err.message);
        return res.status(200).send('OK');
    }
});

module.exports = router;
