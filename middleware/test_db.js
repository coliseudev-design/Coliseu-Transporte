const { Pool } = require('pg');
require('dotenv').config({ path: '/Users/kleber/Documents/GitHub/Nexus-Dash/middleware/.env' });
const pool = new Pool();
pool.query('SELECT column_name FROM information_schema.columns WHERE table_name = \'dash_vendas\'', (err, res) => {
  if (err) console.error(err);
  else console.log(res.rows.map(r => r.column_name).join(', '));
  pool.end();
});
