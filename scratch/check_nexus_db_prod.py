import paramiko
import json

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('2.24.82.19', username='root', password='Col@13894645', port=22)

# Get active container
stdin, stdout, stderr = client.exec_command("docker ps --format '{{.Names}}' | grep 'nexus-middleware'")
MW = stdout.read().decode('utf-8').strip().split('\n')[0]
print(f"Active Nexus MW Container: {MW}")

# Get env vars for DB
stdin, stdout, stderr = client.exec_command(f"docker inspect {MW} --format '{{{{range .Config.Env}}}}{{{{.}}}}|{{{{end}}}}' | tr '|' '\\n' | grep PG_")
print("=== PG Env vars ===")
print(stdout.read().decode('utf-8'))

# Function to run query in this container
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

# Search for the client names from Image 1 in this DB
print("Searching for JEFFERSON COLISEU TESTE:")
res = run_query("""
    SELECT id, id_firebird, nome, telefone, tenant_id::text
    FROM dash_clientes
    WHERE nome ILIKE '%JEFFERSON%'
""")
if res:
    for r in res:
        print(f"ID: {r['id']} | FB: {r['id_firebird']} | Nome: {r['nome']} | Phone: {r['telefone']} | Tenant: {r['tenant_id']}")
else:
    print("Not found.")

client.close()
