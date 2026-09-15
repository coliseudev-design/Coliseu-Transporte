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

print("=== COLUMNS IN DASH_CLIENTES ===")
res_cols = run_query("""
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'dash_clientes'
""")
if res_cols:
    for c in res_cols:
        print(f"{c['column_name']}: {c['data_type']}")

print("\n=== SAMPLE CLIENTS TELEPHONES ===")
res_sample = run_query("""
    SELECT id_firebird, nome, telefone, celular_secundario 
    FROM dash_clientes 
    WHERE (telefone IS NOT NULL AND telefone != '') OR (celular_secundario IS NOT NULL AND celular_secundario != '')
    LIMIT 20
""")
if res_sample:
    for r in res_sample:
        print(r)

client.close()
