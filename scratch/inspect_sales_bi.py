import paramiko
import json

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('2.24.82.19', username='root', password='Col@13894645', port=22)

# Get active container
stdin, stdout, stderr = client.exec_command("docker ps --format '{{.Names}}' | grep 'nexus-middleware'")
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

print("Querying sales for June 10-14, 2026:")
res = run_query("""
    SELECT id, id_firebird, cliente_id_firebird, numero_pedido, data_venda::text, valor_total, status, especie, natureza_operacao, deval
    FROM (
        SELECT v.*, 
               (SELECT SUM(vi.valor_total) FROM dash_vendas_itens vi WHERE vi.venda_id_firebird = v.id_firebird AND vi.tenant_id = v.tenant_id) as deval
        FROM dash_vendas v
    ) x
    WHERE tenant_id = 'ce3067f6-04a3-4b6c-a1b8-6aa47f24aad6'
      AND data_venda >= '2026-06-10T00:00:00Z'
      AND data_venda <= '2026-06-15T23:59:59Z'
    ORDER BY data_venda DESC
""")

if res:
    for r in res:
        print(f"ID: {r['id']} | FB: {r['id_firebird']} | Pedido: {r['numero_pedido']} | Date: {r['data_venda']} | Total: {r['valor_total']} | Status: {r['status']} | Especie: {r['especie']} | Natureza: {r['natureza_operacao']} | SumItens: {r['deval']}")
else:
    print("No sales found.")

client.close()
