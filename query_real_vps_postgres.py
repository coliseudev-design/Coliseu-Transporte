import paramiko
import json

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('2.24.82.19', username='root', password='Col@13894645', port=22)

# We will run a node snippet inside nexus-middleware to query its database,
# because it already has pg installed and correct credentials in env.
# Let's run a query to count rows in all tables for all tenants in the nexus_dashboard database!

# JS script content
js_code = """
const pg = require('pg');
const pool = new pg.Pool({
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  port: parseInt(process.env.PG_PORT || 5432),
  ssl: false
});

async function run() {
  try {
    // 1. Group clients by tenant_id
    let r1 = await pool.query('SELECT tenant_id::text, COUNT(*) FROM dash_clientes GROUP BY tenant_id');
    console.log('CLIENTS_BY_TENANT:', JSON.stringify(r1.rows));

    // 2. Group financeiro by tenant_id
    let r2 = await pool.query('SELECT tenant_id::text, COUNT(*) FROM dash_financeiro GROUP BY tenant_id');
    console.log('FINANCEIRO_BY_TENANT:', JSON.stringify(r2.rows));

    // 3. Get sync metadata
    let r3 = await pool.query('SELECT tenant_id::text, tabela, ultima_sincronizacao, registros_sincronizados, status FROM dash_sync_metadata ORDER BY ultima_sincronizacao DESC');
    console.log('SYNC_METADATA:', JSON.stringify(r3.rows));

    // 4. Check if there are any companies in coliseu_identity if it exists (using a new pool)
    const poolId = new pg.Pool({
      host: process.env.PG_HOST,
      user: process.env.PG_USER,
      password: process.env.PG_PASSWORD,
      database: 'coliseu_identity',
      port: 5432,
      ssl: false
    });
    let r4 = await poolId.query('SELECT * FROM companies').catch(e => ({ rows: [{ error: e.message }] }));
    console.log('COMPANIES:', JSON.stringify(r4.rows));
    await poolId.end();

  } catch(e) {
    console.error('ERROR:', e.message);
  } finally {
    pool.end();
  }
}
run();
"""

# Write the JS script to a file on the VPS using SFTP and copy/execute it inside the container
container = "nexus-middleware-br0y0d05a1fq8fpwppb3y5bb-030128186593"
sftp = client.open_sftp()
with sftp.file('/tmp/query_db.js', 'w') as f:
    f.write(js_code)
sftp.close()

# Find working directory
stdin, stdout, stderr = client.exec_command(f"docker exec {container} pwd")
app_dir = stdout.read().decode('utf-8').strip()
print("App directory inside container:", app_dir)

client.exec_command(f"docker cp /tmp/query_db.js {container}:{app_dir}/query_db.js")
stdin, stdout, stderr = client.exec_command(f"docker exec -w {app_dir} {container} node query_db.js 2>&1")
print("=== QUERY RESULTS ===")
print(stdout.read().decode('utf-8'))
client.close()
