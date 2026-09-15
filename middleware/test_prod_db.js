const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:0r0E6oV!qG3h@2.24.82.19:5432/nexusdash',
  connectionTimeoutMillis: 5000
});

const TENANT = 'c06a45f5-fd16-4f8c-92b6-af73c00ca278';

async function run() {
  console.log('Connecting to Hostinger DB at 2.24.82.19...');
  try {
    const timeRes = await pool.query('SELECT NOW()');
    console.log('Connected! Server time:', timeRes.rows[0].now);

    // Get all tables
    const tablesRes = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema='public' AND table_name LIKE 'dash_%'
    `);
    console.log('Tables:', tablesRes.rows.map(r => r.table_name));

    // Get counts for PetClub tenant
    const cliRes = await pool.query('SELECT COUNT(*) FROM dash_clientes WHERE tenant_id = $1', [TENANT]);
    console.log(`Clientes for ${TENANT}:`, cliRes.rows[0].count);

    const finRes = await pool.query('SELECT COUNT(*) FROM dash_financeiro WHERE tenant_id = $1', [TENANT]);
    console.log(`Financeiro for ${TENANT}:`, finRes.rows[0].count);

    const venRes = await pool.query('SELECT COUNT(*) FROM dash_vendas WHERE tenant_id = $1', [TENANT]);
    console.log(`Vendas for ${TENANT}:`, venRes.rows[0].count);

    const syncRes = await pool.query(`
      SELECT tabela, ultima_sincronizacao, registros_sincronizados, status 
      FROM dash_sync_metadata 
      WHERE tenant_id = $1 
      ORDER BY ultima_sincronizacao DESC
    `, [TENANT]);
    console.log(`Sync Metadata for ${TENANT}:`);
    syncRes.rows.forEach(r => {
      console.log(`  Table: ${r.tabela} | Time: ${r.ultima_sincronizacao} | Count: ${r.registros_sincronizados} | Status: ${r.status}`);
    });

  } catch (err) {
    console.error('Database connection error:', err.message);
  } finally {
    await pool.end();
  }
}

run();
