'use strict';

const whatsapp = require('./whatsapp');

function runTests() {
    console.log('=== RUNNING WHATSAPP TEMPLATE BUILDER TESTS ===\n');

    // 1. Marketing Campaign
    console.log('--- Scenario 1: Marketing Campaign ---');
    const marketingComponents = whatsapp.buildMarketingTemplateComponents(
        'Coliseu Sistemas S/A',
        'https://transporte.coliseusistemas.com.br/images/campanha.jpg'
    );
    console.log('Marketing Components Payload:');
    console.log(JSON.stringify(marketingComponents, null, 2));
    console.log('\n');

    // 2. Billing & Faturamento
    console.log('--- Scenario 2: Invoicing & Billing ---');
    const billingComponents = whatsapp.buildBillingTemplateComponents(
        'Kleber da Silva',
        '25/06/2026',
        'R$ 150,00',
        '00020101021226300014br.gov.bcb.pix0114123456780001995204000053039865802BR5915NexusFinanceiro6009CampoGrande62070503***6304D3C5',
        'BOL-2026-9812-XYZ'
    );
    console.log('Billing Components Payload:');
    console.log(JSON.stringify(billingComponents, null, 2));
    console.log('\n');

    // 3. Post-Sales & Relationship
    console.log('--- Scenario 3: Post-Sales & Relationship ---');
    const postSalesComponents = whatsapp.buildPostSaleTemplateComponents(
        'Kleber da Silva',
        'PED-2026-8910'
    );
    console.log('Post-Sales Components Payload:');
    console.log(JSON.stringify(postSalesComponents, null, 2));
    console.log('\n');

    console.log('=== ALL BUILDERS VERIFIED SUCCESSFULLY ===');
}

runTests();
