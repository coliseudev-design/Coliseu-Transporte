'use strict';

const { getUniqueDelay } = require('../middleware/src/utils/whatsapp');

console.log('--- Iniciando Teste de Delays Aleatórios Únicos ---');

const count = 400;
const delays = [];
const seen = new Set();
let hasDuplicates = false;
let outOfRange = false;
let incorrectPrecision = false;

for (let i = 0; i < count; i++) {
    const delay = getUniqueDelay();
    delays.push(delay);
    
    // Verificar limites (2000ms a 7000ms)
    if (delay < 2000 || delay > 7000) {
        outOfRange = true;
        console.error(`❌ Erro: Delay fora dos limites: ${delay}ms`);
    }

    // Verificar precisão de 2 casas decimais (múltiplo de 10ms)
    if (delay % 10 !== 0) {
        incorrectPrecision = true;
        console.error(`❌ Erro: Delay sem a precisão correta de centésimos de segundo: ${delay}ms`);
    }

    // Verificar duplicações
    if (seen.has(delay)) {
        hasDuplicates = true;
        console.error(`❌ Erro: Delay duplicado encontrado: ${delay}ms`);
    }
    seen.add(delay);
}

console.log(`\nGerados ${count} delays.`);
console.log(`Menor delay gerado: ${Math.min(...delays)}ms (${Math.min(...delays) / 1000}s)`);
console.log(`Maior delay gerado: ${Math.max(...delays)}ms (${Math.max(...delays) / 1000}s)`);

console.log('\nAmostra dos 10 primeiros delays:');
console.log(delays.slice(0, 10).map(d => `${d}ms (${d/1000}s)`).join(', '));

console.log('\n--- RESULTADOS DO TESTE ---');
console.log(`Valores dentro do limite (2.0s - 7.0s): ${!outOfRange ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Precisão de centésimos de segundo:     ${!incorrectPrecision ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Ausência de repetições em 400 envios:   ${!hasDuplicates ? '✅ PASS' : '❌ FAIL'}`);

if (!outOfRange && !incorrectPrecision && !hasDuplicates) {
    console.log('\n✅ Todos os testes de verificação de delay passaram com sucesso!');
    process.exit(0);
} else {
    console.error('\n❌ Um ou mais testes falharam.');
    process.exit(1);
}
