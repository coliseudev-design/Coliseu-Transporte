import paramiko
import os

migration_path = "/Users/kleber/Documents/GitHub/Nexus/middleware/src/db/migrations/014_extend_automacoes.sql"
with open(migration_path, "r", encoding="utf-8") as f:
    sql_content = f.read()

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

stdin, stdout, stderr = client.exec_command("docker ps --format '{{.Names}}' | grep 'dashboard-middleware'")
containers = stdout.read().decode('utf-8').strip().split('\n')
MW = containers[0] if containers else None

if not MW:
    print("Middleware container not found!")
    client.close()
    exit(1)

print(f"Connecting to container: {MW}")

# Escaping backticks and double quotes for node -e execution
escaped_sql = sql_content.replace("\\", "\\\\").replace("`", "\\`").replace('"', '\\"').replace('$', '\\$')

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
pool.query(\`{escaped_sql}\`).then(res => {{
  console.log('MIGRATION_SUCCESS');
  pool.end();
}}).catch(err => {{
  console.error('MIGRATION_ERROR:' + err.message);
  pool.end();
}});
" 2>&1"""

stdin, stdout, stderr = client.exec_command(cmd)
output = stdout.read().decode('utf-8')
print("STDOUT:")
print(output)

client.close()
