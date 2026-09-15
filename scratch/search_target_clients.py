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

print("=== FIRST 25 CLIENTS FOR TENANT a822a7e7-fdd4-4483-bbb5-26587a72739f ===")
res_a = run_query("""
    SELECT id, id_firebird, nome, telefone, tenant_id::text
    FROM dash_clientes
    WHERE tenant_id = 'a822a7e7-fdd4-4483-bbb5-26587a72739f'
    ORDER BY id_firebird
    LIMIT 25
""")
if res_a:
    for r in res_a:
        print(f"ID: {r['id']} | FB: {r['id_firebird']} | Name: {r['nome']} | Phone: {r['telefone']}")

print("\n=== FIRST 25 CLIENTS FOR TENANT ed1d3a98-4c4d-48db-99c0-8751926eb8e5 ===")
res_e = run_query("""
    SELECT id, id_firebird, nome, telefone, tenant_id::text
    FROM dash_clientes
    WHERE tenant_id = 'ed1d3a98-4c4d-48db-99c0-8751926eb8e5'
    ORDER BY id_firebird
    LIMIT 25
""")
if res_e:
    for r in res_e:
        print(f"ID: {r['id']} | FB: {r['id_firebird']} | Name: {r['nome']} | Phone: {r['telefone']}")

client.close()
