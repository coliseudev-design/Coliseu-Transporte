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

print("Vendedores for tenant ce3067f6-04a3-4b6c-a1b8-6aa47f24aad6:")
res_vend = run_query("""
    SELECT id, id_firebird, nome 
    FROM dash_vendedores
    WHERE tenant_id = 'ce3067f6-04a3-4b6c-a1b8-6aa47f24aad6'
""")
if res_vend:
    for v in res_vend:
        print(f"ID: {v['id']} | FB: {v['id_firebird']} | Nome: {v['nome']}")
else:
    print("No vendedores found.")

print("\nChecking if any table has a foreign key or column linking client and vendedor:")
res_cols = run_query("""
    SELECT table_name, column_name 
    FROM information_schema.columns 
    WHERE column_name = 'vendedor_id' OR column_name = 'vendedor_nome' OR column_name = 'id_vendedor'
""")
if res_cols:
    for c in res_cols:
        print(f"Table: {c['table_name']} | Column: {c['column_name']}")

client.close()
