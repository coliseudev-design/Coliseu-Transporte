import paramiko
import json

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

stdin, stdout, stderr = client.exec_command("docker ps --format '{{.Names}}' | grep 'dashboard-middleware'")
MW = stdout.read().decode('utf-8').strip().split('\n')[0]

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
    // Query which tables have records for tenant_id = '1e40d65f-4319-4c68-ae13-66223820c095'
    const tables = ['dash_clientes', 'dash_produtos', 'dash_vendedores', 'dash_vendas', 'dash_vendas_itens', 'dash_financeiro', 'dash_sync_metadata'];
    for (const t of tables) {{
      const res = await pool.query('SELECT COUNT(*) FROM ' + t + ' WHERE tenant_id = \\$1', ['1e40d65f-4319-4c68-ae13-66223820c095']);
      console.log(t + ': ' + res.rows[0].count);
    }}
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
