const fs = require('fs');
const path = require('path');
const db = require('./src/db/postgres');

async function run() {
    try {
        const sql = fs.readFileSync(path.join(__dirname, 'src', 'db', 'views.sql'), 'utf8');
        console.log('Aplicando views materializadas...');
        await db.query(sql);
        console.log('Views aplicadas com sucesso!');
    } catch (err) {
        console.error('Erro ao aplicar views:', err);
    } finally {
        process.exit();
    }
}
run();
