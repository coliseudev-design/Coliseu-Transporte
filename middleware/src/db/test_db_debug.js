const db = require('./postgres');

async function run() {
  try {
    console.log('--- Database Client Inspection ---');
    const countAll = await db.query('SELECT COUNT(*) as total FROM dash_clientes', []);
    console.log('TOTAL CLIENTS IN DB:', countAll.rows[0].total);

    const activeCount = await db.query('SELECT COUNT(*) as total FROM dash_clientes WHERE ativo = true', []);
    console.log('ACTIVE CLIENTS IN DB (ativo = true):', activeCount.rows[0].total);

    const sample = await db.query('SELECT id, id_firebird, nome, documento, ativo, tenant_id FROM dash_clientes LIMIT 5', []);
    console.log('SAMPLE ROWS:', sample.rows);

    const uniqueTenants = await db.query('SELECT DISTINCT tenant_id FROM dash_clientes', []);
    console.log('UNIQUE TENANTS IN CLIENTS:', uniqueTenants.rows.map(r => r.tenant_id));

    const financeiroCount = await db.query('SELECT COUNT(*) as total FROM dash_financeiro', []);
    console.log('TOTAL FINANCEIRO ROWS:', financeiroCount.rows[0].total);

    const uniqueTenantsFin = await db.query('SELECT DISTINCT tenant_id FROM dash_financeiro', []);
    console.log('UNIQUE TENANTS IN FINANCEIRO:', uniqueTenantsFin.rows.map(r => r.tenant_id));

  } catch (err) {
    console.error('Database connection failed:', err);
  } finally {
    db.pool.end();
  }
}

run();
