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
  user: 'coliseu_admin',
  password: 'ColiseuDB2026Prod',
  database: 'coliseu_dashboard',
  port: parseInt(process.env.PG_PORT || 5432),
  ssl: false
}});
pool.query(\`{sql}\`).then(res => {{
  console.log('RESULT:' + JSON.stringify(res.rows));
  pool.end();
}}).catch(err => {{
  console.log('ERROR:' + err.message);
  pool.end();
}});
" 2>&1"""
    stdin, stdout, stderr = client.exec_command(cmd)
    output = stdout.read().decode('utf-8')
    for line in output.splitlines():
        if line.startswith('RESULT:'):
            return json.loads(line.replace('RESULT:', '').strip())
        elif line.startswith('ERROR:'):
            print("SQL Error:", line)
            return None
    return None

print("Querying clients by id_firebird in coliseu_dashboard:")
ids = (11, 12, 13, 14, 15, 16, 20, 22, 26, 28, 29, 30, 32, 33, 34, 35, 36, 37, 38, 41)
res = run_query(f"""
    SELECT id, id_firebird, nome, telefone, tenant_id::text
    FROM dash_clientes
    WHERE id_firebird IN {ids}
    ORDER BY id_firebird
""")

if res:
    print(f"Found {len(res)} clients:")
    for r in res:
        print(f"ID: {r['id']} | FB: {r['id_firebird']} | Name: {r['nome']} | Phone: {r['telefone']} | Tenant: {r['tenant_id']}")
else:
    print("No clients found.")

client.close()
