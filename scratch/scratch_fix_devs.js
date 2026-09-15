const pg = require('pg');

const poolColiseu = new pg.Pool({
  host: 'vasjsucz4yxcb7m4rtqindd2',
  user: 'coliseu_admin',
  password: '4ZPvDoFBiel28PT8s4r13NxMUGNRQ3gzSMchxs11U9yoQ5zbdYy1hilNLi4yfUNH',
  database: 'coliseu_dashboard',
  port: 5432
});

const poolNexus = new pg.Pool({
  host: 'vasjsucz4yxcb7m4rtqindd2',
  user: 'coliseu_admin',
  password: '4ZPvDoFBiel28PT8s4r13NxMUGNRQ3gzSMchxs11U9yoQ5zbdYy1hilNLi4yfUNH',
  database: 'nexus_dashboard',
  port: 5432
});

const tenant = 'ce3067f6-04a3-4b6c-a1b8-6aa47f24aad6'; // Compensados Dourados

async function sync() {
  console.log('Fetching devolucoes from coliseu_dashboard...');
  const res = await poolColiseu.query("SELECT id_firebird, valor_total, valor_desconto, valor_custo, es, processo, data_venda::text, data_vencimento::text, data_hora_proc::text FROM dash_vendas WHERE tenant_id = $1 AND (es = 2 OR processo = 2 OR valor_total < 0)", [tenant]);
  console.log(`Found ${res.rows.length} devolucoes/negative rows in coliseu_dashboard.`);
  
  for (const row of res.rows) {
    console.log(`Updating row in nexus_dashboard: ${row.id_firebird}`);
    await poolNexus.query(
      'UPDATE dash_vendas SET valor_total = $1, valor_desconto = $2, valor_custo = $3, es = $4, processo = $5, data_venda = $6, data_vencimento = $7, data_hora_proc = $8 WHERE tenant_id = $9 AND id_firebird = $10',
      [row.valor_total, row.valor_desconto, row.valor_custo, row.es, row.processo, row.data_venda, row.data_vencimento, row.data_hora_proc, tenant, row.id_firebird]
    );
  }
  
  console.log('Sync completed successfully.');
  await poolColiseu.end();
  await poolNexus.end();
}

sync().catch(err => {
  console.error('Error during sync:', err);
  poolColiseu.end();
  poolNexus.end();
});
