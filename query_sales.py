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

print("=== RECENT SALES (LAST 30 DAYS OR FUTURE) ===")
res = run_query("""
    SELECT id, data_venda::text, valor_total, status, tenant_id::text, id_cliente, created_at
    FROM dash_vendas
    WHERE data_venda >= '2026-04-20' OR data_venda > '2027-01-01'
    ORDER BY data_venda DESC
    LIMIT 20
""")
if res:
    for row in res:
        # Get client name if possible
        cli_res = run_query(f"SELECT nome FROM dash_clientes WHERE id_firebird = {row['id_cliente']} AND tenant_id = '{row['tenant_id']}'")
        cli_name = cli_res[0]['nome'] if cli_res else "Desconhecido"
        print(f"ID: {row['id']} | Date: {row['data_venda']} | Val: {row['valor_total']} | Tenant: {row['tenant_id']} | Client: {cli_name} | Created: {row['created_at']}")
else:
    print("No recent sales found.")

print("\n=== TOTAL CLIENTS BY TENANT ===")
cli_counts = run_query("SELECT tenant_id::text, COUNT(*) FROM dash_clientes GROUP BY tenant_id")
if cli_counts:
    for row in cli_counts:
        print(f"Tenant: {row['tenant_id']} -> Clients: {row['count']}")

client.close()
