const { Pool } = require('pg');
const pool = new Pool({
  user: 'nexus',
  host: 'localhost',
  database: 'nexus_dash',
  password: 'nexus_password',
  port: 5432,
});
async function test() {
  try {
    const res = await pool.query("SELECT * FROM dash_produtos LIMIT 1");
    console.log(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
test();
