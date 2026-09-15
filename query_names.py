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
    return None

print("=== SEARCHING CLIENT NAMES IN coliseu_dashboard ===")
res_cli = run_query("""
    SELECT id, id_firebird, nome, tenant_id::text 
    FROM dash_clientes 
    WHERE nome ILIKE '%KLEBER%' OR nome ILIKE '%COLISEU%' OR nome ILIKE '%ADELINO%'
""")
if res_cli:
    for row in res_cli:
        print(f"ID: {row['id']} | FB: {row['id_firebird']} | Name: {row['nome']} | Tenant: {row['tenant_id']}")
else:
    print("No matching clients found.")

print("\n=== SEARCHING SALES FOR CLIENT 1147 OR ADELINO ===")
# The user mentioned Adelino code 1147
res_sales = run_query("""
    SELECT id, data_venda::text, valor_total, status, tenant_id::text, cliente_id_firebird 
    FROM dash_vendas 
    WHERE cliente_id_firebird = 1147
""")
if res_sales:
    for row in res_sales:
        print(row)
else:
     print("No sales for client 1147.")

client.close()
