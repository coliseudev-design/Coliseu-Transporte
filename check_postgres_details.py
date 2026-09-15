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

print("=== ALL SCHEMAS ===")
schemas = run_query("SELECT schema_name FROM information_schema.schemata")
if schemas:
    for s in schemas:
        print(s['schema_name'])

print("\n=== SEARCHING TABLES WITH 'cliente' OR 'venda' OR 'financeiro' IN ALL SCHEMAS ===")
tables = run_query("""
    SELECT table_schema, table_name 
    FROM information_schema.tables 
    WHERE table_name LIKE '%cliente%' OR table_name LIKE '%venda%' OR table_name LIKE '%finan%'
""")
if tables:
    for t in tables:
         # Count rows
         cnt_res = run_query(f"SELECT COUNT(*) FROM {t['table_schema']}.{t['table_name']}")
         cnt = cnt_res[0]['count'] if cnt_res else 0
         print(f"Schema: {t['table_schema']} | Table: {t['table_name']} | Count: {cnt}")

client.close()
