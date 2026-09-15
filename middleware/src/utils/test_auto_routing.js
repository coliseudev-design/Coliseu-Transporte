'use strict';

const whatsapp = require('./whatsapp');

// Mock configs
const configs = {
    whatsapp_enabled: true,
    whatsapp_api_provider: 'meta',
    whatsapp_meta_phone_id: '123456789',
    whatsapp_meta_token: 'EAAG...',
    tenant_id: '00000000-0000-0000-0000-000000000000'
};

// Mock fetch for sendWhatsAppTemplateMessage
// We temporarily override the global fetch or mock sendWhatsAppTemplateMessage for verification
const originalSendTemplate = whatsapp.sendWhatsAppTemplateMessage;

whatsapp.sendWhatsAppTemplateMessage = async function(configs, phone, templateName, languageCode, components) {
    console.log(`\n>>> Intercepted Template Send to: ${phone}`);
    console.log(`Template Name: ${templateName}`);
    console.log(`Language: ${languageCode}`);
    console.log(`Components:`, JSON.stringify(components, null, 2));
    return { success: true, response: 'Mock Success' };
};

async function testAutoRouting() {
    console.log('=== RUNNING AUTO-ROUTING PARSER TESTS ===');

    // Test 1: Billing Message
    console.log('\n--- Test 1: Billing Message ---');
    const msg1 = 'Olá, Kleber da Silva! A sua fatura com vencimento em 25/06/2026 no valor de R$ 150,00 foi gerada. Pix: 00020101021226300014br.gov.bcb.pix0114123456780001995204000053039865802BR5915NexusFinanceiro6009... Acesse em https://transporte.coliseusistemas.com.br/financeiro/boletos/BOL-2026-9812-XYZ';
    await whatsapp.sendWhatsAppMessage(configs, '5567999998888', msg1);

    // Test 2: Relationship/Post-sale Message
    console.log('\n--- Test 2: Post-Sales & Support ---');
    const msg2 = 'Oi, Edson Nunez Morinigo. Obrigado pela parceria. O seu pedido nº PED-2026-8910 foi concluído. Entre em contato se precisar.';
    await whatsapp.sendWhatsAppMessage(configs, '5567999998888', msg2);

    // Test 3: Marketing Message
    console.log('\n--- Test 3: Marketing Campaign ---');
    const msg3 = 'Olá, Maria de Souza! Confira a promoção exclusiva de produtos para sua empresa!';
    await whatsapp.sendWhatsAppMessage(configs, '5567999998888', msg3, 'https://transporte.coliseusistemas.com.br/images/promo.jpg');

    // Restore original method
    whatsapp.sendWhatsAppTemplateMessage = originalSendTemplate;
}

testAutoRouting().catch(console.error);
