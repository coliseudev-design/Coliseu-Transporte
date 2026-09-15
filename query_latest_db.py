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
    found = False
    for line in output.splitlines():
        if line.startswith('RESULT:'):
            found = True
            return json.loads(line.replace('RESULT:', '').strip())
        elif line.startswith('ERROR:'):
            found = True
            print("SQL Error:", line)
            return None
    if not found:
        print("Raw Output:", output)
    return None

print("=== LATEST 10 SALES ===")
# Try ordering by created_at or id if it exists, or just query without ordering first to see columns
res_cols = run_query("SELECT column_name FROM information_schema.columns WHERE table_name='dash_vendas' LIMIT 5")
print("dash_vendas columns:", res_cols)

res_sales = run_query("SELECT * FROM dash_vendas LIMIT 3")
print("Sample sales:", res_sales)

client.close()
