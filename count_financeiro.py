import paramiko
import json

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

stdin, stdout, stderr = client.exec_command("docker ps --format '{{.Names}}' | grep 'dashboard-middleware'")
MW = stdout.read().decode('utf-8').strip().split('\n')[0]

TENANT = '1e40d65f-4319-4c68-ae13-66223820c095'

cmd = f"""docker exec {MW} node -e "
const pg = require('pg');
const pool = new pg.Pool({{
  host: process.env.PG_HOST || 'localhost',
  user: process.env.PG_USER || 'nexus_admin',
  password: process.env.PG_PASSWORD || 'NexusDB2026Prod',
  database: process.env.PG_DATABASE || 'nexus_dashboard',
  port: parseInt(process.env.PG_PORT || 5432),
  ssl: false
}});

async function run() {{
  try {{
    // 1. Check title by id_firebird
    let r1 = await pool.query('SELECT * FROM dash_financeiro WHERE tenant_id = \\$1 AND id_firebird = 371927', ['{TENANT}']);
    console.log('SPECIFIC_TITLE:' + JSON.stringify(r1.rows));

    // 2. Check all titles for client 5746
    let r2 = await pool.query('SELECT * FROM dash_financeiro WHERE tenant_id = \\$1 AND (cliente_id_firebird = 5746 OR fornecedor_id_firebird = 5746)', ['{TENANT}']);
    console.log('CLIENT_TITLES:' + JSON.stringify(r2.rows));

    // 3. Count total titles
    let r3 = await pool.query('SELECT COUNT(*) AS total FROM dash_financeiro WHERE tenant_id = \\$1', ['{TENANT}']);
    console.log('TOTAL_ROWS:' + JSON.stringify(r3.rows));

    // 4. Sample financeiro rows
    let r4 = await pool.query('SELECT id_firebird, tipo, descricao, data_vencimento::text, valor, status_pagamento FROM dash_financeiro WHERE tenant_id = \\$1 ORDER BY data_vencimento DESC LIMIT 5', ['{TENANT}']);
    console.log('SAMPLES:' + JSON.stringify(r4.rows));

    // 5. Let's see sync metadata count
    let r5 = await pool.query('SELECT * FROM dash_sync_metadata WHERE tenant_id = \\$1', ['{TENANT}']);
    console.log('METADATA:' + JSON.stringify(r5.rows));
  }} catch(e) {{
    console.error('ERROR:' + e.message);
  }} finally {{
    pool.end();
  }}
}}
run();
" 2>&1"""

stdin, stdout, stderr = client.exec_command(cmd)
output = stdout.read().decode('utf-8')
print(output)
client.close()
