import paramiko
import json

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

MW = "dashboard-middleware-irerzifjwjb4q8ucbpfk2gb8-184550465141"

def run_query(sql):
    cmd = f"""docker exec {MW} node -e "
const pg = require('pg');
const pool = new pg.Pool({{
  host: 'coolify-db',
  user: 'coliseu_admin',
  password: 'ColiseuDB2026Prod',
  database: 'coliseu_dashboard',
  port: 5432,
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
        elif line.startswith('ERROR:'):
            print("SQL Error:", line)
            return None
    print("Full Output:", output)
    return None

# 1. Total counts
res_total = run_query("SELECT COUNT(*) AS total FROM dash_clientes")
print("Total Clientes:", res_total)

res_active = run_query("SELECT COUNT(*) AS total FROM dash_clientes WHERE ativo = true")
print("Total Clientes Ativos:", res_active)

# 2. Unique tenants in Clientes
res_tenants = run_query("SELECT tenant_id::text, COUNT(*) FROM dash_clientes GROUP BY tenant_id")
print("Clientes por Tenant:", res_tenants)

# 3. Sample clients
res_sample = run_query("SELECT id, id_firebird, nome, documento, ativo, tenant_id::text FROM dash_clientes LIMIT 5")
print("Sample Clientes:")
if res_sample:
    for r in res_sample:
        print(f"  ID {r['id']} | Firebird={r['id_firebird']} | Nome={r['nome']} | Ativo={r['ativo']} | Tenant={r['tenant_id']}")

client.close()
