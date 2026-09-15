const db = require('./middleware/src/db/postgres');

async function test() {
    try {
        const { rows } = await db.query(`
            SELECT 
                SUM(valor_total) as sum_v,
                (SELECT SUM(vi.valor_total) FROM dash_vendas_itens vi WHERE vi.venda_id_firebird = v.id_firebird) as sum_vi
            FROM dash_vendas v
            WHERE data_venda >= '2026-05-01 00:00:00' AND data_venda <= '2026-05-31 23:59:59'
            AND TRIM(status) IN ('FATURADO', 'FINALIZADO')
        `);
        console.log("Total v.valor_total vs vi.valor_total:");
        console.log(rows);
        
        const { rows: top } = await db.query(`
            SELECT id_firebird, valor_total, data_venda,
            (SELECT SUM(vi.valor_total) FROM dash_vendas_itens vi WHERE vi.venda_id_firebird = v.id_firebird) as items_sum
            FROM dash_vendas 
            WHERE data_venda >= '2026-05-01 00:00:00' AND data_venda <= '2026-05-31 23:59:59'
            AND TRIM(status) IN ('FATURADO', 'FINALIZADO')
            LIMIT 10
        `);
        console.log("Amostra 10 notas:");
        console.table(top);
    } catch(e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
test();
