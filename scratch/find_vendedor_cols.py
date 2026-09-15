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

print("Columns containing 'vendedor':")
res_cols = run_query("""
    SELECT table_name, column_name 
    FROM information_schema.columns 
    WHERE column_name LIKE '%vendedor%'
""")
if res_cols:
    for c in res_cols:
        print(f"Table: {c['table_name']} | Column: {c['column_name']}")
else:
    print("None found.")

print("\nColumns containing 'venda':")
res_venda_cols = run_query("""
    SELECT table_name, column_name 
    FROM information_schema.columns 
    WHERE column_name = 'cliente_id' OR column_name = 'id_cliente'
""")
if res_venda_cols:
    for c in res_venda_cols:
        print(f"Table: {c['table_name']} | Column: {c['column_name']}")
else:
    print("None found.")

client.close()
