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

res_syncs = run_query("SELECT tenant_id::text, tabela, ultima_sincronizacao, registros_sincronizados, status FROM dash_sync_metadata ORDER BY ultima_sincronizacao DESC")
print("=== ALL SYNCS ===")
if res_syncs:
    for row in res_syncs:
        print(f"Tenant: {row['tenant_id']} | Table: {row['tabela']} | Time: {row['ultima_sincronizacao']} | Count: {row['registros_sincronizados']} | Status: {row['status']}")

# Check sales counts by date and tenant for today/recent days
res_sales = run_query("""
    SELECT tenant_id::text, MAX(data_venda)::text as max_date, COUNT(*) as total_sales,
           COUNT(*) FILTER (WHERE data_venda >= '2026-05-20') as recent_sales
    FROM dash_vendas
    GROUP BY tenant_id
""")
print("\n=== SALES BY TENANT ===")
if res_sales:
    for row in res_sales:
        print(f"Tenant: {row['tenant_id']} | Max Date: {row['max_date']} | Total Sales: {row['total_sales']} | Recent Sales (>=2026-05-20): {row['recent_sales']}")

client.close()
