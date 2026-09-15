const { Pool } = require('pg');
require('dotenv').config({ path: './middleware/.env' });
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: { rejectUnauthorized: false }
});
async function run() {
  const { rows } = await pool.query("SELECT * FROM dash_vendedores LIMIT 10;");
  console.log(rows);
  const { rows: v2 } = await pool.query("SELECT DISTINCT vend.nome FROM dash_vendas v LEFT JOIN dash_vendedores vend ON vend.id_firebird = v.vendedor_id_firebird;");
  console.log(v2);
  pool.end();
}
run();
