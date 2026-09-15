import paramiko
import json

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

# Dynamically find the middleware container name
stdin, stdout, stderr = client.exec_command("docker ps --format '{{.Names}}' | grep 'dashboard-middleware'")
MW = stdout.read().decode('utf-8').strip().split('\n')[0]
print(f"Using middleware container: {MW}")

TENANT = "c06a45f5-fd16-4f8c-92b6-af73c00ca278"

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
        elif line.startswith('ERROR:'):
            print("SQL Error:", line)
            return None
    print("Full Output:", output)
    return None

print("--- COUNTING DATA FOR TENANT", TENANT, "---")

# Clients count
res_cli = run_query(f"SELECT COUNT(*) AS total FROM dash_clientes WHERE tenant_id = '{TENANT}'")
print("Clientes:", res_cli)

# Active clients count
res_cli_active = run_query(f"SELECT COUNT(*) AS total FROM dash_clientes WHERE tenant_id = '{TENANT}' AND ativo = true")
print("Clientes Ativos:", res_cli_active)

# Financeiro count
res_fin = run_query(f"SELECT COUNT(*) AS total FROM dash_financeiro WHERE tenant_id = '{TENANT}'")
print("Financeiro (Títulos):", res_fin)

# Vendas count
res_ven = run_query(f"SELECT COUNT(*) AS total FROM dash_vendas WHERE tenant_id = '{TENANT}'")
print("Vendas:", res_ven)

# Sync metadata
res_sync = run_query(f"SELECT tabela, ultima_sincronizacao, registros_sincronizados, status FROM dash_sync_metadata WHERE tenant_id = '{TENANT}' ORDER BY ultima_sincronizacao DESC")
print("Sync Metadata:")
if res_sync:
    for row in res_sync:
        print(f"  Tabela: {row['tabela']} | Ultima Sync: {row['ultima_sincronizacao']} | Registros: {row['registros_sincronizados']} | Status: {row['status']}")
else:
    print("  Nenhum registro de sync encontrado.")

# Print some clients from this tenant
res_sample_cli = run_query(f"SELECT id_firebird, nome, ativo FROM dash_clientes WHERE tenant_id = '{TENANT}' ORDER BY nome LIMIT 10")
print("Sample Clientes (first 10 sorted by name):")
if res_sample_cli:
    for row in res_sample_cli:
        print(f"  {row['id_firebird']} - {row['nome']} (Ativo: {row['ativo']})")

client.close()
