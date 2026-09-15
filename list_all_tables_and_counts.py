import paramiko
import json

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

# Dynamically find the middleware container name
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
        elif line.startswith('ERROR:'):
            print("SQL Error:", line)
            return None
    return None

# 1. Get all tables in public schema
tables_res = run_query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name")
tables = [row['table_name'] for row in tables_res] if tables_res else []

print("Database Tables:")
print(tables)

print("\nCounts and tenant_ids for each table:")
for table in tables:
    # Check if table has tenant_id column
    cols_res = run_query(f"SELECT column_name FROM information_schema.columns WHERE table_name='{table}' AND column_name='tenant_id'")
    has_tenant_id = len(cols_res) > 0 if cols_res else False
    
    if has_tenant_id:
        counts = run_query(f"SELECT tenant_id::text, COUNT(*) as count FROM {table} GROUP BY tenant_id")
        print(f"Table: {table}")
        if counts:
            for c in counts:
                print(f"  Tenant: {c['tenant_id']} -> Count: {c['count']}")
        else:
            print("  No records.")
    else:
        total = run_query(f"SELECT COUNT(*) as count FROM {table}")
        tot = total[0]['count'] if total else 0
        print(f"Table: {table} (No tenant_id) -> Total Count: {tot}")

client.close()
