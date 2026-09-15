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

print("Checking clients with id_firebird in (11,12,13,14,15,16,20,22,26,28,29,30,32,33,34,35,36,37,38,41):")
res = run_query("""
    SELECT id, id_firebird, nome, telefone, vendedor, data_nascimento, tenant_id::text
    FROM dash_clientes
    WHERE id_firebird IN (11,12,13,14,15,16,20,22,26,28,29,30,32,33,34,35,36,37,38,41)
    ORDER BY id_firebird
""")

if res:
    print(f"Found {len(res)} clients:")
    for r in res:
        print(f"ID: {r['id']} | FB: {r['id_firebird']} | Name: {r['nome']} | Phone: {r['telefone']} | Vendedor: {r['vendedor']} | Niver: {r['data_nascimento']} | Tenant: {r['tenant_id']}")
else:
    print("None found by id_firebird. Checking by ID...")
    res_id = run_query("""
        SELECT id, id_firebird, nome, telefone, vendedor, data_nascimento, tenant_id::text
        FROM dash_clientes
        WHERE id IN (11,12,13,14,15,16,20,22,26,28,29,30,32,33,34,35,36,37,38,41)
        ORDER BY id
    """)
    if res_id:
        print(f"Found {len(res_id)} clients by ID:")
        for r in res_id:
            print(f"ID: {r['id']} | FB: {r['id_firebird']} | Name: {r['nome']} | Phone: {r['telefone']} | Vendedor: {r['vendedor']} | Niver: {r['data_nascimento']} | Tenant: {r['tenant_id']}")
    else:
        print("None found by ID either.")

client.close()
