import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

MW = "dashboard-middleware-irerzifjwjb4q8ucbpfk2gb8-143954252857"

# Usa o middleware node para consultar PG com as credenciais corretas
cmd = f"""docker exec {MW} node -e "
const pg = require('pg');
// Pega config do processo
const pool = new pg.Pool({{
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  port: parseInt(process.env.PG_PORT || 5432),
  ssl: false
}});

async function run() {{
  // 1. Ultimos 5 por id_firebird
  let r1 = await pool.query('SELECT id_firebird, data_venda, valor_total, valor_custo, status, synced_at FROM dash_vendas ORDER BY id_firebird DESC LIMIT 5');
  console.log('ULTIMOS_5:', JSON.stringify(r1.rows));
  
  // 2. Contagem por data (ultimos 7 dias)
  let r2 = await pool.query(\\"SELECT data_venda::text, status, COUNT(*), SUM(valor_total) FROM dash_vendas WHERE data_venda >= CURRENT_DATE - 7 GROUP BY 1,2 ORDER BY 1 DESC\\");
  console.log('POR_DATA:', JSON.stringify(r2.rows));
  
  // 3. Hora atual do servidor PG
  let r3 = await pool.query('SELECT NOW() as agora, CURRENT_DATE as hoje');
  console.log('PG_NOW:', JSON.stringify(r3.rows[0]));
  
  await pool.end();
}}
run().catch(e => {{ console.error('ERRO:', e.message); pool.end(); }});
" 2>&1"""

stdin, stdout, stderr = client.exec_command(cmd)
out = stdout.read().decode('utf-8')
import json

for line in out.splitlines():
    if line.startswith('ULTIMOS_5:'):
        print("=== Ultimos 5 registros ===")
        rows = json.loads(line.replace('ULTIMOS_5:','').strip())
        for r in rows:
            print(f"  ID {r['id_firebird']} | data={r['data_venda']} | total={r['valor_total']} | custo={r['valor_custo']} | status='{r['status']}' | synced={r.get('synced_at','?')}")
    elif line.startswith('POR_DATA:'):
        print("\n=== Vendas por data (ultimos 7 dias) ===")
        rows = json.loads(line.replace('POR_DATA:','').strip())
        if rows:
            for r in rows:
                print(f"  {r['data_venda']} | status='{r['status']}' | count={r['count']} | total={r['sum']}")
        else:
            print("  (nenhum registro)")
    elif line.startswith('PG_NOW:'):
        print("\n=== Data/hora do PostgreSQL ===")
        r = json.loads(line.replace('PG_NOW:','').strip())
        print(f"  NOW: {r['agora']}  |  CURRENT_DATE: {r['hoje']}")
    elif line.startswith('ERRO:'):
        print("ERRO:", line)

client.close()
