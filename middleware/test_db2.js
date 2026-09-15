require('dotenv').config({ path: '.env' });
const db = require('./src/db/postgres');

async function test() {
    try {
        const tenantId = 'ed1d3a98-4c4d-48db-99c0-8751926eb8e5';
        
        // Obter data máxima da base de vendas (pois a base de teste pode ser muito antiga)
        const { rows: rMax } = await db.query(`SELECT COALESCE(MAX(data_venda), CURRENT_DATE) as d FROM dash_vendas WHERE tenant_id = $1`, [tenantId]);
        const maxDate = rMax[0].d;
        console.log('Max Date Vendas:', maxDate);

        // Vendas hoje e mês (Relativos à data mais recente daquele tenant)
        const { rows: vHoje } = await db.query(`SELECT COALESCE(SUM(valor_total),0) AS total, COUNT(*) AS qtd FROM dash_vendas WHERE tenant_id = $1 AND DATE(data_venda) = DATE($2)`, [tenantId, maxDate]);
        console.log('vHoje:', vHoje[0]);

        const { rows: pAbertos } = await db.query(`SELECT COUNT(*) AS qtd FROM dash_vendas WHERE tenant_id = $1 AND status != 'FATURADO'`, [tenantId]);
        console.log('Abertos:', pAbertos[0].qtd);

        const { rows: fReceber } = await db.query(`SELECT COALESCE(SUM(valor - valor_pago),0) AS v FROM dash_financeiro WHERE tenant_id = $1 AND tipo = 'RECEBER' AND status_pagamento = 'ABERTO'`, [tenantId]);
        console.log('fReceber:', fReceber[0].v);

    } catch(e) {
        console.error(e);
    }
    process.exit(0);
}

test();
