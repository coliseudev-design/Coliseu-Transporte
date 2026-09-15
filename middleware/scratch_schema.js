require('dotenv').config();
const db = require('./src/db/postgres');

async function run() {
  try {
    const res = await db.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'dash_financeiro'");
    console.log("--- dash_financeiro ---");
    res.rows.forEach(r => console.log(r.column_name, r.data_type));

    const res2 = await db.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'dash_vendas'");
    console.log("--- dash_vendas ---");
    res2.rows.forEach(r => console.log(r.column_name, r.data_type));
    
  } catch(e) {
    console.error(e);
  }
  process.exit();
}
run();
