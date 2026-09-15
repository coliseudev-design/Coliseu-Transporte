'use strict';

const logger = require('../config/logger');
const db = require('../db/postgres');

let delayPool = [];

/**
 * Gets a randomized, unique delay in milliseconds between min and max seconds.
 * Guarantees that delays do not repeat within a cycle of 501 sends.
 * @param {number} min Minimum delay in seconds (default 2.0)
 * @param {number} max Maximum delay in seconds (default 7.0)
 * @returns {number} Delay in milliseconds
 */
function getUniqueDelay(min = 2.0, max = 7.0) {
    if (delayPool.length === 0) {
        const step = 0.01;
        const pool = [];
        // Generate values from min to max with 2 decimal places (precision of 10ms)
        for (let val = min; val <= max; val = parseFloat((val + step).toFixed(2))) {
            pool.push(Math.round(val * 1000));
        }
        // Fisher-Yates Shuffle
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        delayPool = pool;
        logger.info(`[📲 WHATSAPP] Gerado novo pool de delays aleatórios únicos. Tamanho: ${delayPool.length}`);
    }
    return delayPool.pop();
}

/**
 * Normalizes full name capitalization (keeps particles in lowercase).
 * @param {string} fullName 
 * @returns {string} Formatted name
 */
function formatName(fullName) {
    if (!fullName) return '';
    const lowerParticles = ['de', 'da', 'do', 'dos', 'das', 'e'];
    return fullName.trim().toLowerCase().split(/\s+/).map(word => {
        if (word.length === 0) return '';
        if (lowerParticles.includes(word)) return word;
        return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
}

/**
 * Normalizes and extracts the first name from a full name.
 * @param {string} fullName 
 * @returns {string} Formatted first name
 */
function formatFirstName(fullName) {
    if (!fullName) return '';
    const first = fullName.trim().split(/\s+/)[0];
    return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

/**
 * Humanizes message text by rotating greetings/emojis at the start and adding a footprint in the footer.
 * @param {string} text Raw message text
 * @returns {string} Humanized message text
 */
function humanizeMessageText(text) {
    if (!text) return '';
    
    const greetings = ["Olá", "Oi", "Tudo bem", "Como vai", "Ei"];
    const emojis = ["👋", "😊", "✨", "👍", "🤝"];
    
    let randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
    
    // Evitar repetição como "Tudo bem, tudo bem?"
    if (randomGreeting.toLowerCase() === "tudo bem" && text.toLowerCase().includes("tudo bem")) {
        randomGreeting = "Olá";
    }
    
    let processedText = text.trim();
    
    // Match common greetings at the start (case-insensitive)
    const greetingRegex = /^(ol[áa]|oi|tudo\s+bem|como\s+vai|ei)[\s,!]*/i;
    if (greetingRegex.test(processedText)) {
        processedText = processedText.replace(greetingRegex, `${randomGreeting} ${randomEmoji}, `);
    } else {
        processedText = `${randomGreeting} ${randomEmoji}!\n${processedText}`;
    }
    
    // Add unique footprint at the footer (4 character alphanumeric ID + current date/time)
    const uniqueId = Math.random().toString(36).substring(2, 6).toUpperCase();
    const now = new Date();
    const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    
    processedText = `${processedText}\n\n_Ref: #${uniqueId} em ${dateStr} às ${timeStr}_`;
    
    return processedText;
}

/**
 * Clean and format Brazilian phone numbers for the Uazapi standard.
 * Prepend '55' and strip the 9th digit for mobile numbers.
 * @param {string} phone 
 * @returns {string} Formatted phone number
 */
function formatPhoneBrazil(phone) {
    if (!phone) return '';

    // Remove non-digits
    let cleaned = phone.replace(/\D/g, '');

    // If empty after cleaning, cancel
    if (cleaned.length < 8) return '';

    // If the number has 13 digits and starts with 55 (e.g. 5567999998888)
    if (cleaned.length === 13 && cleaned.startsWith('55')) {
        const ddd = cleaned.substring(2, 4);
        const number = cleaned.substring(5); // skip the 9th digit
        cleaned = `55${ddd}${number}`;
    }
    // If it has 11 digits (DDD + 9 + 8 digits) and doesn't start with 55
    else if (cleaned.length === 11 && !cleaned.startsWith('55')) {
        const ddd = cleaned.substring(0, 2);
        const number = cleaned.substring(3); // skip the 9th digit
        cleaned = `55${ddd}${number}`;
    }
    // If it has 10 digits (DDD + 8 digits) and doesn't start with 55
    else if (cleaned.length === 10 && !cleaned.startsWith('55')) {
        cleaned = `55${cleaned}`;
    }
    // If it has 12 digits and starts with 55 (55 + DDD + 8 digits)
    else if (cleaned.length === 12 && !cleaned.startsWith('55')) {
        cleaned = `55${cleaned.substring(2)}`;
    }
    else if (!cleaned.startsWith('55')) {
        cleaned = `55${cleaned}`;
    }

    return cleaned;
}

/**
 * Helper to log outbound messages in the database
 */
async function logSentMessage(tenantId, provider, phone, message, direction, messageId, status, payload = null) {
    try {
        const query = `
            INSERT INTO dash_whatsapp_mensagens (
                tenant_id, whatsapp_message_id, sender, recipient, text_body, direction, status, provider, payload
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `;
        const sender = 'system';
        const recipient = phone;
        await db.query(query, [
            tenantId,
            messageId || null,
            sender,
            recipient,
            message,
            direction,
            status,
            provider,
            payload ? JSON.stringify(payload) : null
        ]);
    } catch (err) {
        logger.error(`[📲 WHATSAPP] Erro ao gravar log de mensagem no banco: ${err.message}`);
    }
}

/**
 * Private helper to perform standard HTTP fetches with an AbortSignal timeout.
 * Eliminates redundant AbortController and timeout cleanup boilerplate.
 * 
 * @param {string} url Target URL
 * @param {object} options Fetch options
 * @param {number} timeoutMs Timeout in milliseconds (default 10000)
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options, timeoutMs = 10000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (err) {
        clearTimeout(id);
        throw err;
    }
}

/**
 * Uploads a base64 image to Meta and returns the media ID.
 * @param {string} phoneId Meta Phone Number ID
 * @param {string} metaToken Meta Access Token
 * @param {string} base64String Base64 image data URI
 * @returns {Promise<string>} Media ID
 */
async function uploadMediaToMeta(phoneId, metaToken, base64String) {
    const matches = base64String.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
        throw new Error('Formato Base64 inválido');
    }

    const mimeType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');

    const blob = new Blob([buffer], { type: mimeType });
    const formData = new FormData();
    formData.append('file', blob, `image.${mimeType.split('/')[1] || 'png'}`);
    formData.append('messaging_product', 'whatsapp');
    formData.append('type', mimeType);

    const url = `https://graph.facebook.com/v19.0/${phoneId}/media`;

    const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${metaToken}`
        },
        body: formData
    }, 15000); // 15s timeout for media upload

    const responseText = await response.text();
    if (!response.ok) {
        throw new Error(`Meta media upload failed with status ${response.status}: ${responseText}`);
    }

    const data = JSON.parse(responseText);
    if (!data.id) {
        throw new Error(`Meta media upload did not return an ID: ${responseText}`);
    }

    return data.id;
}

/**
 * Helper to extract client name from message greeting.
 * @param {string} message 
 * @returns {string} Client name
 */
function parseClientName(message) {
    const nameMatch = message.match(/^(?:olá|oi|tudo bem|como vai|ei)[\s,]+([^!\n.,_]+)/i);
    if (nameMatch) {
        return nameMatch[1].replace(/[!.,]$/, '').trim();
    }
    return 'Cliente';
}

/**
 * Helper to parse billing parameters from message text.
 * @param {string} message 
 * @returns {object} { dueDate, amount, pixKey, boletoSuffix }
 */
function parseBillingParams(message) {
    let dueDate = '';
    const dateMatch = message.match(/\b\d{2}\/\d{2}\/\d{4}\b/) || message.match(/\b\d{2}\/\d{2}\b/);
    if (dateMatch) {
        dueDate = dateMatch[0];
    } else {
        const d = new Date();
        d.setDate(d.getDate() + 5);
        dueDate = d.toLocaleDateString('pt-BR');
    }

    let amount = '';
    const amountMatch = message.match(/(?:r\$|R\$)\s*([0-9.,]+)/) || message.match(/\b\d+([.,]\d{2})\b/);
    if (amountMatch) {
        amount = amountMatch[0].trim();
        if (!amount.toUpperCase().includes('R$')) {
            amount = `R$ ${amount}`;
        }
    } else {
        amount = 'R$ 0,00';
    }

    let pixKey = '';
    const pixCopyPasteMatch = message.match(/(000201[a-zA-Z0-9]+)/);
    if (pixCopyPasteMatch) {
        pixKey = pixCopyPasteMatch[0];
    } else {
        const keyMatch = message.match(/(?:chave|pix|copia e cola):\s*([a-zA-Z0-9@.-_\s]+)/i);
        if (keyMatch) {
            pixKey = keyMatch[1].trim();
        } else {
            pixKey = 'financeiro@coliseusistemas.com.br';
        }
    }

    let boletoSuffix = 'boleto';
    const urlMatch = message.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
        const urlStr = urlMatch[0];
        const segments = urlStr.split('/');
        const lastSegment = segments[segments.length - 1].split('?')[0];
        if (lastSegment && lastSegment.length > 3) {
            boletoSuffix = lastSegment;
        }
    }

    return { dueDate, amount, pixKey, boletoSuffix };
}

/**
 * Helper to parse relationship/order parameters from message text.
 * @param {string} message 
 * @returns {object} { orderNumber }
 */
function parseRelationshipParams(message) {
    let orderNumber = '0000';
    const orderMatch = message.match(/(?:pedido|nº|processo|compra|ref|#)\s*(?:nº|num)?[:#\s]*([a-zA-Z0-9-]+)/i) || message.match(/\b\d{4,8}\b/);
    if (orderMatch) {
        orderNumber = orderMatch[1] || orderMatch[0];
    }
    return { orderNumber };
}

/**
 * Automatically detects the context of a free-text message and dispatches it
 * using the appropriate approved Meta Cloud API template.
 * @param {object} configs Database integration configuration row
 * @param {string} phone Recipient's phone number
 * @param {string} message Text message content
 * @param {string|null} imageUrl Optional image URL
 * @returns {Promise<{success: boolean, response?: string, error?: string, status?: number}>}
 */
async function sendWhatsAppMetaTemplateAuto(configs, phone, message, imageUrl = null) {
    if (!configs.whatsapp_enabled) {
        logger.info('[📲 WHATSAPP] Integration disabled in settings. Message not sent.');
        return { success: false, error: 'Integration disabled' };
    }

    const cleanPhone = formatPhoneBrazil(phone);
    if (!cleanPhone) {
        logger.warn(`[📲 WHATSAPP] Invalid phone number provided for auto template: '${phone}'`);
        return { success: false, error: 'Invalid phone number' };
    }

    const isBilling = /fatura|boleto|vencimento|vence|pix|pagamento|cobrança/i.test(message);
    const isRelationship = /pedido|processo|nps|satisfação|obrigado|compra|suporte/i.test(message);

    const clientName = parseClientName(message);

    if (isBilling) {
        const { dueDate, amount, pixKey, boletoSuffix } = parseBillingParams(message);
        const components = buildBillingTemplateComponents(clientName, dueDate, amount, pixKey, boletoSuffix);
        return sendWhatsAppTemplateMessage(configs, cleanPhone, 'aviso_faturamento_nexus', 'pt_BR', components);
    } 
    
    if (isRelationship) {
        const { orderNumber } = parseRelationshipParams(message);
        const components = buildPostSaleTemplateComponents(clientName, orderNumber);
        return sendWhatsAppTemplateMessage(configs, cleanPhone, 'pos_venda_suporte_nexus', 'pt_BR', components);
    }

    const marketingImg = imageUrl || 'https://transporte.coliseusistemas.com.br/logobranco.jpg';
    const components = buildMarketingTemplateComponents(clientName, marketingImg);
    return sendWhatsAppTemplateMessage(configs, cleanPhone, 'campanha_marketing_nexus', 'pt_BR', components);
}

/**
 * Sends a WhatsApp message using Uazapi or Meta Cloud API
 * @param {object} configs Database integration configuration row
 * @param {string} phone Recipient's phone number
 * @param {string} message Text message content
 * @param {string|null} imageUrl Optional image URL
 * @returns {Promise<{success: boolean, response?: string, error?: string, status?: number}>}
 */
async function sendWhatsAppMessage(configs, phone, message, imageUrl = null) {
    if (!configs.whatsapp_enabled) {
        logger.info('[📲 WHATSAPP] Integration disabled in settings. Message not sent.');
        return { success: false, error: 'Integration disabled' };
    }

    const cleanPhone = formatPhoneBrazil(phone);
    if (!cleanPhone) {
        logger.warn(`[📲 WHATSAPP] Invalid phone number provided: '${phone}'`);
        return { success: false, error: 'Invalid phone number' };
    }

    const provider = configs.whatsapp_api_provider || 'uazapi';

    if (provider === 'meta') {
        return sendWhatsAppMetaTemplateAuto(configs, cleanPhone, message, imageUrl);
    } else {
        if (!configs.whatsapp_server_url || !configs.whatsapp_token) {
            logger.warn('[📲 WHATSAPP] Uazapi server URL or Token not configured. Message discarded.');
            return { success: false, error: 'Server URL or Token not configured' };
        }

        try {
            const baseUrl = configs.whatsapp_server_url.replace(/\/$/, '');
            let url;
            let payload;

            if (imageUrl && imageUrl.trim() !== '') {
                url = `${baseUrl}/send/media`;
                payload = {
                    number: cleanPhone,
                    mediatype: 'image',
                    media: imageUrl,
                    caption: message,
                    delay: 1200
                };
            } else {
                url = `${baseUrl}/send/text`;
                payload = {
                    number: cleanPhone,
                    text: message,
                    delay: 1200
                };
            }

            const response = await fetchWithTimeout(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'token': configs.whatsapp_token
                },
                body: JSON.stringify(payload)
            }, 10000);

            const responseContent = await response.text();
            let responseData = {};
            try {
                responseData = JSON.parse(responseContent);
            } catch (e) {
                responseData = { raw: responseContent };
            }

            if (response.status >= 200 && response.status < 300) {
                logger.info(`[📲 WHATSAPP] Uazapi Message successfully sent to ${cleanPhone}. Response: ${responseContent.substring(0, 80)}`);
                const messageId = responseData.messageId || responseData.id || responseData.data?.key?.id;
                await logSentMessage(configs.tenant_id, 'uazapi', cleanPhone, message, 'OUTBOUND', messageId, 'SENT', responseData);
                return { success: true, response: responseContent };
            }

            logger.error(`[📲 WHATSAPP] Uazapi error sending message to ${cleanPhone}. Status: ${response.status}. Response: ${responseContent}`);
            await logSentMessage(configs.tenant_id, 'uazapi', cleanPhone, message, 'OUTBOUND', null, 'FAILED', responseData);
            return { success: false, status: response.status, error: responseContent };
        } catch (err) {
            logger.error(`[📲 WHATSAPP] Exception during Uazapi WhatsApp send to ${cleanPhone}: ${err.message}`);
            await logSentMessage(configs.tenant_id, 'uazapi', cleanPhone, message, 'OUTBOUND', null, 'FAILED', { exception: err.message });
            return { success: false, error: err.message };
        }
    }
}

/**
 * Sends a WhatsApp message using a pre-approved template via Meta Cloud API.
 * Required to initiate conversations with cold clients.
 * 
 * @param {object} configs Database integration configuration row
 * @param {string} phone Recipient's phone number
 * @param {string} templateName Name of the approved template in Meta
 * @param {string} languageCode Language code (e.g. 'pt_BR')
 * @param {array} components Array of template component objects (header, body, button, etc.)
 * @returns {Promise<{success: boolean, response?: string, error?: string, status?: number}>}
 */
async function sendWhatsAppTemplateMessage(configs, phone, templateName, languageCode = 'pt_BR', components = []) {
    if (!configs.whatsapp_enabled) {
        logger.info('[📲 WHATSAPP] Integration disabled in settings. Template message not sent.');
        return { success: false, error: 'Integration disabled' };
    }

    const cleanPhone = formatPhoneBrazil(phone);
    if (!cleanPhone) {
        logger.warn(`[📲 WHATSAPP] Invalid phone number provided for template: '${phone}'`);
        return { success: false, error: 'Invalid phone number' };
    }

    const provider = configs.whatsapp_api_provider || 'uazapi';
    if (provider !== 'meta') {
        logger.warn(`[📲 WHATSAPP] Template messages are only supported on 'meta' provider. Current: '${provider}'`);
        return { success: false, error: 'Templates only supported on Meta provider' };
    }

    const phoneId = configs.whatsapp_meta_phone_id;
    const metaToken = configs.whatsapp_meta_token;

    if (!phoneId || !metaToken) {
        logger.warn('[📲 WHATSAPP] Meta Phone Number ID or Access Token not configured. Template message discarded.');
        return { success: false, error: 'Meta credentials not configured' };
    }

    try {
        const url = `https://graph.facebook.com/v20.0/${phoneId}/messages`;
        
        const payload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: cleanPhone,
            type: 'template',
            template: {
                name: templateName,
                language: {
                    code: languageCode
                },
                components: components
            }
        };

        const response = await fetchWithTimeout(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${metaToken}`
            },
            body: JSON.stringify(payload)
        }, 10000);

        const responseContent = await response.text();
        let responseData = {};
        try {
            responseData = JSON.parse(responseContent);
        } catch (e) {
            responseData = { raw: responseContent };
        }

        const logMsgBody = `[Template: ${templateName}] components: ${JSON.stringify(components)}`;

        if (response.status >= 200 && response.status < 300) {
            const messageId = responseData.messages?.[0]?.id;
            logger.info(`[📲 WHATSAPP] Meta Template Message (${templateName}) successfully sent to ${cleanPhone}. MessageID: ${messageId}`);
            await logSentMessage(configs.tenant_id, 'meta', cleanPhone, logMsgBody, 'OUTBOUND', messageId, 'SENT', responseData);
            return { success: true, response: responseContent };
        }

        logger.error(`[📲 WHATSAPP] Meta error sending template (${templateName}) to ${cleanPhone}. Status: ${response.status}. Response: ${responseContent}`);
        await logSentMessage(configs.tenant_id, 'meta', cleanPhone, logMsgBody, 'OUTBOUND', null, 'FAILED', responseData);
        return { success: false, status: response.status, error: responseContent };
    } catch (err) {
        logger.error(`[📲 WHATSAPP] Exception during Meta WhatsApp template send to ${cleanPhone}: ${err.message}`);
        await logSentMessage(configs.tenant_id, 'meta', cleanPhone, `[Template Exception: ${templateName}]`, 'OUTBOUND', null, 'FAILED', { exception: err.message });
        return { success: false, error: err.message };
    }
}

/**
 * Builder for Marketing template components (campanha_marketing_nexus)
 */
function buildMarketingTemplateComponents(clientName, imageUrl) {
    return [
        {
            type: 'header',
            parameters: [
                { type: 'image', image: { link: imageUrl } }
            ]
        },
        {
            type: 'body',
            parameters: [
                { type: 'text', text: clientName }
            ]
        }
    ];
}

/**
 * Builder for Invoicing/Billing template components (aviso_faturamento_nexus)
 */
function buildBillingTemplateComponents(clientName, dueDate, amount, pixKey, boletoSuffix) {
    return [
        {
            type: 'body',
            parameters: [
                { type: 'text', text: clientName },
                { type: 'text', text: dueDate },
                { type: 'text', text: amount },
                { type: 'text', text: pixKey }
            ]
        },
        {
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [
                { type: 'text', text: boletoSuffix }
            ]
        }
    ];
}

/**
 * Builder for Post-Sales template components (pos_venda_suporte_nexus)
 */
function buildPostSaleTemplateComponents(clientName, orderNumber) {
    return [
        {
            type: 'body',
            parameters: [
                { type: 'text', text: clientName },
                { type: 'text', text: orderNumber }
            ]
        }
    ];
}

module.exports = {
    formatPhoneBrazil,
    sendWhatsAppMessage,
    sendWhatsAppTemplateMessage,
    sendWhatsAppMetaTemplateAuto,
    buildMarketingTemplateComponents,
    buildBillingTemplateComponents,
    buildPostSaleTemplateComponents,
    getUniqueDelay,
    formatName,
    formatFirstName,
    humanizeMessageText
};
