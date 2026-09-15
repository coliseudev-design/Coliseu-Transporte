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

async function align() {
  console.log('Fetching sales from coliseu_dashboard...');
  const resColiseu = await poolColiseu.query(`
    SELECT 
      id_firebird, numero_pedido, 
      valor_total::float, valor_desconto::float, valor_custo::float, 
      es, processo, cfop, numero_nota, status,
      data_venda::text, data_vencimento::text, data_hora_proc::text
    FROM dash_vendas 
    WHERE tenant_id = $1
  `, [tenant]);
  
  console.log(`Found ${resColiseu.rows.length} sales in coliseu_dashboard.`);

  console.log('Fetching sales from nexus_dashboard...');
  const resNexus = await poolNexus.query(`
    SELECT id_firebird, valor_total::float, valor_desconto::float 
    FROM dash_vendas 
    WHERE tenant_id = $1
  `, [tenant]);
  
  console.log(`Found ${resNexus.rows.length} sales in nexus_dashboard.`);

  // Create a map of existing sales in nexus
  const nexusMap = new Map();
  for (const row of resNexus.rows) {
    nexusMap.set(row.id_firebird, row);
  }

  let updatedCount = 0;
  let insertedCount = 0;

  for (const colRow of resColiseu.rows) {
    const isDevolucao = parseInt(colRow.es) === 2 || parseInt(colRow.processo) === 2 || colRow.valor_total < 0;
    
    let targetTotal, targetDesc, targetCusto;
    
    if (isDevolucao) {
      // Treat return discount as positive per user request
      const desc = Math.abs(colRow.valor_desconto || 0);
      const netVal = (colRow.valor_total || 0) - (colRow.valor_desconto || 0);
      targetTotal = netVal + desc;
      targetDesc = desc;
      targetCusto = colRow.valor_custo;
    } else {
      targetTotal = colRow.valor_total;
      targetDesc = colRow.valor_desconto;
      targetCusto = colRow.valor_custo;
    }

    const exists = nexusMap.has(colRow.id_firebird);
    
    if (exists) {
      // Compare if we need to update
      const nexusRow = nexusMap.get(colRow.id_firebird);
      const diffTotal = Math.abs((nexusRow.valor_total || 0) - targetTotal) > 0.01;
      const diffDesc = Math.abs((nexusRow.valor_desconto || 0) - targetDesc) > 0.01;
      
      // Update the record in nexus
      await poolNexus.query(`
        UPDATE dash_vendas 
        SET 
          valor_total = $1, valor_desconto = $2, valor_custo = $3, 
          es = $4, processo = $5, cfop = $6, numero_nota = $7, 
          data_venda = $8, data_vencimento = $9, data_hora_proc = $10,
          status = $11
        WHERE tenant_id = $12 AND id_firebird = $13
      `, [
        targetTotal, targetDesc, targetCusto,
        colRow.es, colRow.processo, colRow.cfop, colRow.numero_nota,
        colRow.data_venda, colRow.data_vencimento, colRow.data_hora_proc,
        colRow.status, tenant, colRow.id_firebird
      ]);
      updatedCount++;
    } else {
      // Insert missing sales in nexus
      await poolNexus.query(`
        INSERT INTO dash_vendas (
          tenant_id, id_firebird, numero_pedido, 
          valor_total, valor_desconto, valor_custo, 
          es, processo, cfop, numero_nota, 
          data_venda, data_vencimento, data_hora_proc, 
          status, sincronizado_em
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
      `, [
        tenant, colRow.id_firebird, colRow.numero_pedido,
        targetTotal, targetDesc, targetCusto,
        colRow.es, colRow.processo, colRow.cfop, colRow.numero_nota,
        colRow.data_venda, colRow.data_vencimento, colRow.data_hora_proc,
        colRow.status
      ]);
      insertedCount++;
    }
  }

  console.log(`Alignment completed. Updated: ${updatedCount}, Inserted: ${insertedCount}`);
  await poolColiseu.end();
  await poolNexus.end();
}

align().catch(err => {
  console.error('Error during alignment:', err);
  poolColiseu.end();
  poolNexus.end();
});
