require('dotenv').config({ path: '/Users/kleber/Documents/GitHub/Nexus-Dash/middleware/.env' });
const { Pool } = require('pg');
const pool = new Pool();
async function test() {
  const tenantId = '10b8cf8b-f404-4b53-b09e-7bd02476b7e7'; // Need a valid tenant_id. Or just get one from DB.
  const { rows } = await pool.query('SELECT tenant_id FROM dash_vendas LIMIT 1');
  if (rows.length === 0) { console.log("No tenant"); pool.end(); return; }
  const t = rows[0].tenant_id;
  
  const start = '2026-04-01';
  const end = '2026-05-10';
  try {
        const { rows: prods } = await pool.query(`
            SELECT COALESCE(vi.produto, 'Produto ' || COALESCE(vi.produto_id_firebird::text, '?')) AS nome, SUM(vi.valor_total) as vendas
            FROM dash_vendas_itens vi
            JOIN dash_vendas v ON v.id_firebird = vi.venda_id_firebird AND v.tenant_id = vi.tenant_id
            WHERE vi.tenant_id = $1 AND v.data_venda >= $2 AND v.data_venda <= $3 AND TRIM(v.status) IN ('FATURADO', 'FINALIZADO')
              AND COALESCE(vi.produto, vi.produto_id_firebird::text) IS NOT NULL
            GROUP BY COALESCE(vi.produto, 'Produto ' || COALESCE(vi.produto_id_firebird::text, '?'))
            ORDER BY vendas DESC
            LIMIT 10
        `, [t, start, end]);
        console.log("PRODS OK");
        
        const { rows: brands } = await pool.query(`
            SELECT COALESCE(vi.marca, v.marca, 'S/ MARCA') as nome, SUM(vi.valor_total) as vendas
            FROM dash_vendas_itens vi
            JOIN dash_vendas v ON v.id_firebird = vi.venda_id_firebird AND v.tenant_id = vi.tenant_id
            WHERE vi.tenant_id = $1 AND v.data_venda >= $2 AND v.data_venda <= $3 AND TRIM(v.status) IN ('FATURADO', 'FINALIZADO')
              AND COALESCE(vi.marca, v.marca) IS NOT NULL AND COALESCE(vi.marca, v.marca) != ''
            GROUP BY COALESCE(vi.marca, v.marca)
        `, [t, start, end]);
        console.log("BRANDS OK");

        const { rows: categories } = await pool.query(`
            SELECT COALESCE(vi.categoria, v.categoria, 'S/ GRUPO') as nome, SUM(vi.valor_total) as vendas
            FROM dash_vendas_itens vi
            JOIN dash_vendas v ON v.id_firebird = vi.venda_id_firebird AND v.tenant_id = vi.tenant_id
            WHERE vi.tenant_id = $1 AND v.data_venda >= $2 AND v.data_venda <= $3 AND TRIM(v.status) IN ('FATURADO', 'FINALIZADO')
              AND COALESCE(vi.categoria, v.categoria) IS NOT NULL AND COALESCE(vi.categoria, v.categoria) != ''
            GROUP BY COALESCE(vi.categoria, v.categoria)
            ORDER BY vendas DESC
            LIMIT 10
        `, [t, start, end]);
        console.log("CATEGORIES OK");
  } catch(e) { console.error(e); }
  pool.end();
}
test();
