import paramiko
import json

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('2.24.82.19', username='root', password='Col@13894645', port=22)

# Get active container
stdin, stdout, stderr = client.exec_command("docker ps --format '{{.Names}}' | grep 'nexus-middleware'")
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

print("Checking sales for targeted clients:")
ids = (11, 12, 13, 14, 15, 16, 20, 22, 26, 28, 29, 30, 32, 33, 34, 35, 36, 37, 38, 41)
res = run_query(f"""
    SELECT id, cliente_id_firebird, vendedor_id_firebird, tenant_id::text
    FROM dash_vendas
    WHERE tenant_id = 'ce3067f6-04a3-4b6c-a1b8-6aa47f24aad6'
      AND cliente_id_firebird IN {ids}
""")

if res:
    print(f"Found {len(res)} sales:")
    for r in res:
        print(f"Sale ID: {r['id']} | Client FB: {r['cliente_id_firebird']} | Seller FB: {r['vendedor_id_firebird']}")
else:
    print("No sales found for these clients.")

client.close()
