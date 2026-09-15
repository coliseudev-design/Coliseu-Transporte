'use strict';

const { formatName, formatFirstName, humanizeMessageText } = require('../middleware/src/utils/whatsapp');

console.log('--- Iniciando Teste de Humanização e Normalização ---');

// 1. Testar formatName
console.log('\n1. Testando normalização de nomes completos (formatName):');
const testNames = [
    { input: 'JOSE DA SILVA', expected: 'Jose da Silva' },
    { input: 'MARIA DE LOURDES', expected: 'Maria de Lourdes' },
    { input: 'kleber silveira dos santos', expected: 'Kleber Silveira dos Santos' },
    { input: 'ANNA E GOMES', expected: 'Anna e Gomes' },
];

let nameFormattingPassed = true;
for (const tc of testNames) {
    const result = formatName(tc.input);
    const passed = result === tc.expected;
    console.log(`Input: "${tc.input}" -> Result: "${result}" | Expected: "${tc.expected}" | ${passed ? '✅ PASS' : '❌ FAIL'}`);
    if (!passed) nameFormattingPassed = false;
}

// 2. Testar formatFirstName
console.log('\n2. Testando extração e normalização de primeiro nome (formatFirstName):');
const testFirstNames = [
    { input: 'JOSE DA SILVA', expected: 'Jose' },
    { input: 'MARIA DE LOURDES', expected: 'Maria' },
    { input: 'kleber silveira', expected: 'Kleber' },
];

let firstNamePassed = true;
for (const tc of testFirstNames) {
    const result = formatFirstName(tc.input);
    const passed = result === tc.expected;
    console.log(`Input: "${tc.input}" -> Result: "${result}" | Expected: "${tc.expected}" | ${passed ? '✅ PASS' : '❌ FAIL'}`);
    if (!passed) firstNamePassed = false;
}

// 3. Testar humanizeMessageText
console.log('\n3. Testando humanização de texto (humanizeMessageText):');
const rawMessageWithGreeting = 'Olá, tudo bem? Segue seu boleto para pagamento.';
const rawMessageWithoutGreeting = 'Identificamos que seu sistema está com 2 terminais extras.';

console.log(`\nMensagem Original 1 (Com saudação): "${rawMessageWithGreeting}"`);
const humanized1 = humanizeMessageText(rawMessageWithGreeting);
console.log(`Mensagem Humanizada 1:\n------------------\n${humanized1}\n------------------`);

console.log(`\nMensagem Original 2 (Sem saudação): "${rawMessageWithoutGreeting}"`);
const humanized2 = humanizeMessageText(rawMessageWithoutGreeting);
console.log(`Mensagem Humanizada 2:\n------------------\n${humanized2}\n------------------`);

// Validações no texto humanizado
const validateHumanized = (text, originalText, hadGreeting) => {
    // 1. Deve conter um Ref no final
    const hasRef = /_Ref:\s*#\w+\s*em\s*\d{2}\/\d{2}\s*às\s*\d{2}:\d{2}_$/.test(text);
    // 2. Não deve conter a saudação original idêntica caso tivesse uma
    const originalGreetingIntact = hadGreeting ? text.startsWith(originalText.substring(0, 10)) : false;
    // 3. Deve ter alterado ou adicionado uma saudação com emoji
    const hasEmoji = /👋|😊|✨|👍|🤝/.test(text);

    return hasRef && !originalGreetingIntact && hasEmoji;
};

const h1Passed = validateHumanized(humanized1, rawMessageWithGreeting, true);
const h2Passed = validateHumanized(humanized2, rawMessageWithoutGreeting, false);

console.log('\n--- RESULTADOS DO TESTE ---');
console.log(`Normalização de Nomes Completos:      ${nameFormattingPassed ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Normalização de Primeiro Nome:        ${firstNamePassed ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Humanização de Msg com Saudação:      ${h1Passed ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Humanização de Msg sem Saudação:      ${h2Passed ? '✅ PASS' : '❌ FAIL'}`);

if (nameFormattingPassed && firstNamePassed && h1Passed && h2Passed) {
    console.log('\n✅ Todos os testes de humanização e normalização passaram com sucesso!');
    process.exit(0);
} else {
    console.error('\n❌ Um ou mais testes falharam.');
    process.exit(1);
}
