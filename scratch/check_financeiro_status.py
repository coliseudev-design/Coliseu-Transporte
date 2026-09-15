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
  host: process.env.PG_HOST || 'localhost',
  user: process.env.PG_USER || 'nexus_admin',
  password: process.env.PG_PASSWORD || 'NexusDB2026Prod',
  database: process.env.PG_DATABASE || 'nexus_dashboard',
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

print("=== UNIQUE STATUS_PAGAMENTO IN DASH_FINANCEIRO ===")
res = run_query("""
    SELECT DISTINCT status_pagamento, COUNT(*)
    FROM dash_financeiro
    GROUP BY status_pagamento
""")
print(res)

print("\n=== SAMPLE RECORDS IN DASH_FINANCEIRO ===")
res_sample = run_query("""
    SELECT id, id_firebird, tipo, status_pagamento, valor, valor_pago, data_vencimento::text, data_pagamento::text
    FROM dash_financeiro
    LIMIT 20
""")
if res_sample:
    for r in res_sample:
        print(r)

client.close()
