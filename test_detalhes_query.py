import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('2.24.82.19', username='root', password='Col@13894645', port=22)

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
    const bindId = 5746;
    const clientId = 160973;

    const res = await pool.query(
      `SELECT * FROM dash_financeiro 
       WHERE tenant_id = $1 
         AND tipo = 'RECEBER'
         AND (cliente_id_firebird = $2 OR contrato_id IN (SELECT id FROM dash_contratos WHERE cliente_id = $3))
       ORDER BY data_vencimento DESC`,
      [tenantId, bindId, clientId]
    );
    console.log('QUERY_RESULT:', JSON.stringify(res.rows));

  } catch(e) {
    console.error('ERROR:', e.message);
  } finally {
    pool.end();
  }
}
run();
"""

container = "nexus-middleware-br0y0d05a1fq8fpwppb3y5bb-030128186593"
sftp = client.open_sftp()
with sftp.file('/tmp/test_detalhes.js', 'w') as f:
    f.write(js_code)
sftp.close()

client.exec_command(f"docker cp /tmp/test_detalhes.js {container}:/usr/src/app/test_detalhes.js")
stdin, stdout, stderr = client.exec_command(f"docker exec -w /usr/src/app {container} node test_detalhes.js 2>&1")
print("=== QUERY TEST RESULTS ===")
print(stdout.read().decode('utf-8'))
client.close()
