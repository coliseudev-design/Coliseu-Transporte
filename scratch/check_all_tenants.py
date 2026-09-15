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
  database: process.env.PG_DATABASE || 'coliseu_dashboard',
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

print("=== UNIQUE TENANTS AND CLIENT COUNTS IN COLISEU_DASHBOARD ===")
res = run_query("SELECT tenant_id::text, COUNT(*) FROM dash_clientes GROUP BY tenant_id")
print(res)

print("\n=== SAMPLE CLIENTS FROM COLISEU_DASHBOARD ===")
res_sample = run_query("SELECT id_firebird, nome, telefone, celular_secundario, tenant_id::text FROM dash_clientes LIMIT 10")
print(res_sample)

client.close()
