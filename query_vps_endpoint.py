import paramiko
import json

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('2.24.82.19', username='root', password='Col@13894645', port=22)

# JS code to test calling the endpoint logic directly on the VPS database
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

    const cliRes = await pool.query(
        'SELECT id, id_firebird, nome, tenant_id FROM dash_clientes WHERE nome ILIKE $1',
        ['%TESTE NEXUS%']
    );
    console.log('CLIENTS_FOUND:', JSON.stringify(cliRes.rows));
    if (cliRes.rows.length === 0) {
      console.log('No clients found with name like TESTE NEXUS');
      return;
    }
    const cli = cliRes.rows[0];
    const clientId = cli.id;
    const bindId = cli.id_firebird || -99999; 

    // 1. Contratos
    const contracts = await pool.query(
        `SELECT * FROM dash_contratos WHERE tenant_id = $1 AND (cliente_id = $2 OR cliente_id = (SELECT id FROM dash_clientes WHERE id_firebird = $3 AND tenant_id = $1 LIMIT 1))`,
        [tenantId, clientId, bindId]
    );

    // 2. Financeiro (Contas a Receber)
    const financeiro = await pool.query(
        `SELECT * FROM dash_financeiro 
         WHERE tenant_id = $1 
           AND tipo = 'RECEBER'
           AND (cliente_id_firebird = $2 OR contrato_id IN (SELECT id FROM dash_contratos WHERE cliente_id = $3))
         ORDER BY data_vencimento DESC`,
        [tenantId, bindId, clientId]
    );

    console.log('RESPONSE_FINANCEIRO_COUNT:', financeiro.rows.length);
    console.log('RESPONSE_FINANCEIRO:', JSON.stringify(financeiro.rows));

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
with sftp.file('/tmp/query_endpoint.js', 'w') as f:
    f.write(js_code)
sftp.close()

client.exec_command(f"docker cp /tmp/query_endpoint.js {container}:/usr/src/app/query_endpoint.js")
stdin, stdout, stderr = client.exec_command(f"docker exec -w /usr/src/app {container} node query_endpoint.js 2>&1")
print("=== ENDPOINT SIMULATION RESULTS ===")
print(stdout.read().decode('utf-8'))
client.close()
