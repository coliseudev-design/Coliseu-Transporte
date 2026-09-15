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

print("Checking schema of dash_vendedores:")
res_schema = run_query("""
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'dash_vendedores'
""")
if res_schema:
    for r in res_schema:
        print(f"Column: {r['column_name']} | Type: {r['data_type']}")

print("\nChecking vendedores named 'coliseu':")
res_vendedores = run_query("""
    SELECT id, id_firebird, nome, tenant_id::text
    FROM dash_vendedores
    WHERE nome ILIKE '%coliseu%'
""")
if res_vendedores:
    for r in res_vendedores:
        print(f"ID: {r['id']} | FB: {r['id_firebird']} | Nome: {r['nome']} | Tenant: {r['tenant_id']}")
else:
    print("No vendedor named 'coliseu' found.")

client.close()
