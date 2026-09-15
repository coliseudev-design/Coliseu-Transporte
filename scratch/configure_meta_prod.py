import paramiko
import sys

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('2.24.82.19', username='root', password='Col@13894645', port=22)

# Get active container
stdin, stdout, stderr = client.exec_command("docker ps --format '{{.Names}}' | grep 'nexus-middleware'")
containers = stdout.read().decode('utf-8').strip().split('\n')
if not containers or not containers[0]:
    print("Error: middleware container not found.")
    sys.exit(1)
MW = containers[0]

tenant_id = 'ce3067f6-04a3-4b6c-a1b8-6aa47f24aad6'
verify_token = 'nexus_webhook_verify_2026'

sql = f"""
UPDATE dash_integracoes_config 
SET whatsapp_api_provider = 'meta',
    whatsapp_meta_business_id = '1802790444437659',
    whatsapp_meta_phone_id = '119891423301663',
    whatsapp_meta_verify_token = '{verify_token}',
    whatsapp_admin_phone = '556799699415',
    whatsapp_enabled = true
WHERE tenant_id = '{tenant_id}';
"""

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
  console.log('SUCCESS:' + res.rowCount);
  pool.end();
}}).catch(err => {{
  console.log('ERROR:' + err.message);
  pool.end();
}});
" 2>&1"""

print(f"Executing SQL on production container {MW}...")
stdin, stdout, stderr = client.exec_command(cmd)
output = stdout.read().decode('utf-8')
print("Output:", output)

client.close()
