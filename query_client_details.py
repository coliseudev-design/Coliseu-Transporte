import paramiko
import json

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

stdin, stdout, stderr = client.exec_command("docker ps --format '{{.Names}}' | grep 'dashboard-middleware'")
MW = stdout.read().decode('utf-8').strip().split('\n')[0]

TENANT = 'ed1d3a98-4c4d-48db-99c0-8751926eb8e5'

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
    // Query client with nome containing 'TESTE'
    let r1 = await pool.query('SELECT id, id_firebird, nome, documento, ativo FROM dash_clientes WHERE tenant_id = \\$1 AND nome ILIKE \\'%TESTE%\\'', ['{TENANT}']);
    console.log('CLIENTS:' + JSON.stringify(r1.rows));

    // Let's check all clients to see if there is one with id_firebird = 5746
    let r2 = await pool.query('SELECT id, id_firebird, nome, documento FROM dash_clientes WHERE tenant_id = \\$1 AND id_firebird = 5746', ['{TENANT}']);
    console.log('CLIENT_5746:' + JSON.stringify(r2.rows));
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
