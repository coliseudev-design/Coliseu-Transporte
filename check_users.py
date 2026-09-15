import paramiko
import json

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

MW = "dashboard-middleware-irerzifjwjb4q8ucbpfk2gb8-184550465141"

cmd = """docker exec """ + MW + """ node -e "
const pg = require('pg');
const pool = new pg.Pool({
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  port: parseInt(process.env.PG_PORT || 5432),
  ssl: false
});

async function run() {
  const tenant = 'ed1d3a98-4c4d-48db-99c0-8751926eb8e5';
  
  // 1. Contar registros por tipo
  let r1 = await pool.query('SELECT TRIM(tipo) as t, COUNT(*) FROM dash_financeiro WHERE tenant_id = \\$1 GROUP BY t', [tenant]);
  console.log('COUNTS_BY_TYPE:', JSON.stringify(r1.rows));
  
  // 2. Limites de data_vencimento por tipo
  let r2 = await pool.query('SELECT TRIM(tipo) as t, MIN(data_vencimento) as min_v, MAX(data_vencimento) as max_v FROM dash_financeiro WHERE tenant_id = \\$1 GROUP BY t', [tenant]);
  console.log('MIN_MAX_BY_TYPE:', JSON.stringify(r2.rows));

  // 3. Contar registros com data_vencimento em 2026
  let r3 = await pool.query(\\"SELECT TRIM(tipo) as t, COUNT(*) FROM dash_financeiro WHERE tenant_id = \\$1 AND data_vencimento >= '2026-01-01' AND data_vencimento <= '2026-12-31' GROUP BY t\\", [tenant]);
  console.log('COUNTS_2026:', JSON.stringify(r3.rows));

  await pool.end();
}
run().catch(e => { console.error('ERRO:', e.message); pool.end(); });
" 2>&1"""

stdin, stdout, stderr = client.exec_command(cmd)
out = stdout.read().decode('utf-8')

for line in out.splitlines():
    if line.startswith('COUNTS_BY_TYPE:'):
        print("=== Contagens por Tipo ===")
        print(line.replace('COUNTS_BY_TYPE:', '').strip())
    elif line.startswith('MIN_MAX_BY_TYPE:'):
        print("=== Limites por Tipo ===")
        print(line.replace('MIN_MAX_BY_TYPE:', '').strip())
    elif line.startswith('COUNTS_2026:'):
        print("=== Contagens em 2026 ===")
        print(line.replace('COUNTS_2026:', '').strip())
    else:
        print(line)

client.close()
