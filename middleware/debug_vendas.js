const db = require('./src/db/postgres');

async function debug() {
    try {
        const { rows } = await db.query(`
            SELECT status, especie, COUNT(*) as qtd, SUM(valor_total) as valor_total
            FROM dash_vendas
            WHERE data_venda >= '2026-05-11' AND data_venda < '2026-05-12'
            GROUP BY status, especie
            ORDER BY qtd DESC
        `);
        console.log("=== Vendas do dia 11 ===");
        console.table(rows);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
debug();
