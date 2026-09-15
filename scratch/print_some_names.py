import paramiko
import json

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

stdin, stdout, stderr = client.exec_command("docker ps --format '{{.Names}}' | grep 'dashboard-middleware'")
MW = stdout.read().decode('utf-8').strip().split('\n')[0]

def run_query(sql):
    cmd = f"""docker exec {MW} node -e "
const pg = require('pg');
const pool = new pg.Pool({{
  host: process.env.PG_HOST || 'coliseu-db',
  user: process.env.PG_USER || 'coliseu_admin',
  password: process.env.PG_PASSWORD || 'ColiseuDB2026Prod',
  database: 'coliseu_dashboard_vet', // coliseu_dashboard_vet database
  port: parseInt(process.env.PG_PORT || 5432),
  ssl: false
}});
pool.query(\`{sql}\`).then(res => {{
  console.log('RESULT:' + JSON.stringify(res.rows));
  pool.end();
}}).catch(err => {{
  console.error('ERROR:' + err.message);
  pool.end();
}});
" 2>&1"""
    stdin, stdout, stderr = client.exec_command(cmd)
    output = stdout.read().decode('utf-8')
    for line in output.splitlines():
        if line.startswith('RESULT:'):
            return json.loads(line.replace('RESULT:', '').strip())
    return None

print("=== UNIQUE TENANTS AND CLIENT COUNTS IN COLISEU_DASHBOARD_VET ===")
res_tenants = run_query("SELECT tenant_id::text, COUNT(*) FROM dash_clientes GROUP BY tenant_id")
print(res_tenants)

print("=== CLIENTS IN COLISEU_DASHBOARD_VET ===")
res = run_query("SELECT id_firebird, nome, telefone, celular_secundario FROM dash_clientes LIMIT 20")
if res:
    for r in res:
        print(r)

print("=== SEARCH FOR CIPLAN IN COLISEU_DASHBOARD_VET ===")
res_ciplan = run_query("SELECT id_firebird, nome, telefone, celular_secundario FROM dash_clientes WHERE nome ILIKE '%CIPLAN%'")
print(res_ciplan)

client.close()
