import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('2.24.82.19', username='root', password='Col@13894645', port=22)

# JS script content to query details
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
    const tenantId = '1e40d65f-4319-4c68-ae13-66223820c095';
    
    // 1. Query client 5746
    const cli = await pool.query('SELECT * FROM dash_clientes WHERE tenant_id = $1 AND id_firebird = 5746', [tenantId]);
    console.log('CLIENT_5746:', JSON.stringify(cli.rows));

    // 2. Query title 371927
    const fin = await pool.query('SELECT * FROM dash_financeiro WHERE tenant_id = $1 AND id_firebird = 371927', [tenantId]);
    console.log('TITLE_371927:', JSON.stringify(fin.rows));

  } catch(e) {
    console.error('ERROR:', e.message);
  } finally {
    pool.end();
  }
}
run();
"""

# Write the JS script using SFTP
container = "nexus-middleware-br0y0d05a1fq8fpwppb3y5bb-030128186593"
sftp = client.open_sftp()
with sftp.file('/tmp/query_details.js', 'w') as f:
    f.write(js_code)
sftp.close()

# Copy and execute inside container
client.exec_command(f"docker cp /tmp/query_details.js {container}:/usr/src/app/query_details.js")
stdin, stdout, stderr = client.exec_command(f"docker exec -w /usr/src/app {container} node query_details.js 2>&1")
print("=== QUERY DETAILS RESULTS ===")
print(stdout.read().decode('utf-8'))
client.close()
