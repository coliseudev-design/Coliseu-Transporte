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

print("=== LATEST 10 SALES (BY ID DESC) ===")
res_sales = run_query("""
    SELECT id, data_venda::text, valor_total, status, tenant_id::text, cliente_id_firebird, sincronizado_em::text 
    FROM dash_vendas 
    ORDER BY id DESC 
    LIMIT 10
""")
if res_sales:
    for row in res_sales:
        print(f"ID: {row['id']} | Date: {row['data_venda']} | Val: {row['valor_total']} | Tenant: {row['tenant_id']} | ClientFB: {row['cliente_id_firebird']} | SyncTime: {row['sincronizado_em']}")

print("\n=== LATEST 10 CLIENTS (BY ID DESC) ===")
res_cli = run_query("""
    SELECT id, id_firebird, nome, documento, ativo, tenant_id::text, sincronizado_em::text 
    FROM dash_clientes 
    ORDER BY id DESC 
    LIMIT 10
""")
if res_cli:
    for row in res_cli:
        print(f"ID: {row['id']} | FB_ID: {row['id_firebird']} | Name: {row['nome']} | Tenant: {row['tenant_id']} | SyncTime: {row['sincronizado_em']}")

print("\n=== LATEST 10 FINANCEIRO (BY ID DESC) ===")
res_fin = run_query("""
    SELECT id, id_firebird, valor, status, tenant_id::text, data_vencimento::text, sincronizado_em::text 
    FROM dash_financeiro 
    ORDER BY id DESC 
    LIMIT 10
""")
if res_fin:
    for row in res_fin:
        print(f"ID: {row['id']} | FB_ID: {row['id_firebird']} | Val: {row['valor']} | Status: {row['status']} | Tenant: {row['tenant_id']} | Venc: {row['data_vencimento']} | SyncTime: {row['sincronizado_em']}")

client.close()
