const db = require('./middleware/src/db/postgres');

async function run() {
    try {
        const { rows } = await db.query(`
            SELECT numero_pedido, valor_total, valor_custo, valor_desconto 
            FROM dash_vendas 
            WHERE numero_pedido IN ('6445', '6447', '26926', '26928') OR id_firebird IN (26926, 26928, 6445, 6447)
            ORDER BY id DESC LIMIT 10
        `);
        console.log('Result:', rows);
    } catch (err) {
        console.error(err);
    } finally {
        await db.pool.end();
    }
}
run();
