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
  host: process.env.PG_HOST || 'coliseu-db',
  user: process.env.PG_USER || 'coliseu_admin',
  password: process.env.PG_PASSWORD || 'ColiseuDB2026Prod',
  database: 'coliseu_dashboard',
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

print("=== SEARCHING FOR TABLE NAMES ===")
tables_res = run_query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")
tables = [t['table_name'] for t in tables_res] if tables_res else []

print("Searching for 'ciplan' in tables...")
for t in tables:
    # Get text/varchar columns
    cols_res = run_query(f"SELECT column_name FROM information_schema.columns WHERE table_name='{t}' AND data_type IN ('character varying', 'text')")
    if cols_res:
        cols = [c['column_name'] for c in cols_res]
        for col in cols:
            res = run_query(f"SELECT COUNT(*) FROM {t} WHERE {col} ILIKE '%ciplan%'")
            if res and int(res[0]['count']) > 0:
                print(f"Found in Table {t}, Column {col}: {res[0]['count']} matches")
                # print some samples
                samples = run_query(f"SELECT * FROM {t} WHERE {col} ILIKE '%ciplan%' LIMIT 3")
                print("  Samples:", samples)

client.close()
