const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  user: process.env.PG_USER || 'nexus_admin',
  password: process.env.PG_PASSWORD || 'NexusDB2026Prod',
  database: 'coliseu_identity',
  port: parseInt(process.env.PG_PORT || 5432),
  ssl: false
});

async function run() {
  try {
    console.log('=== COMPANIES IN IDENTITY ===');
    const compRes = await pool.query('SELECT "Id"::text, "Name", "ContactEmail", "Status" FROM companies');
    compRes.rows.forEach(c => {
      console.log(`ID: ${c.Id} | Name: ${c.Name} | Email: ${c.ContactEmail} | Status: ${c.Status}`);
    });

    console.log('\n=== COMPANY MODULES IN IDENTITY ===');
    const modRes = await pool.query('SELECT "CompanyId"::text, "ModuleSlug", "IsActive", "MiddlewareBaseUrl" FROM company_modules');
    modRes.rows.forEach(m => {
      console.log(`CompanyId: ${m.CompanyId} | Module: ${m.ModuleSlug} | Active: ${m.IsActive} | MiddlewareURL: ${m.MiddlewareBaseUrl}`);
    });
  } catch (err) {
    console.error('SQL Error:', err.message);
  } finally {
    await pool.end();
  }
}

run();
