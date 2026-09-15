import paramiko
import json

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('2.24.82.19', username='root', password='Col@13894645', port=22)

# Get active container
stdin, stdout, stderr = client.exec_command("docker ps --format '{{.Names}}' | grep 'nexus-middleware'")
MW = stdout.read().decode('utf-8').strip().split('\n')[0]

tenant_id = 'ce3067f6-04a3-4b6c-a1b8-6aa47f24aad6'
token = 'EAAY9pr1qoj8BRZCdBdPTQcqbZBtczoZAMKmPEnnGcw3jZB4DwxTxJPSxJlSkGiDx1yclYpziGWE0cSINsxbxmLEVP6q7XgkP5T6pJYJ91jgrYUDxAj7jZCktWccSWyVgx1sov5d3kEcdisEdnXxiHG3JcpeAQqXXSsx7h4ZA2EtROPy0xnkLiMbeYMpZCqOVjNkiAPzqric0plZCVh42YZArEcMoyFd4RKoEMBQDFZAo0UQbeK2hR6iSSq7lOKDiWEbHzoyEV15ijZB7AycW9kYEMjmzEVf'
phone_id = '1167832076413350'
business_id = '1369770171673359'

sql = f"""
UPDATE dash_integracoes_config 
SET whatsapp_api_provider = 'meta',
    whatsapp_meta_token = '{token}',
    whatsapp_meta_phone_id = '{phone_id}',
    whatsapp_meta_business_id = '{business_id}',
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

print(f"Updating all Meta configuration details on container {MW}...")
stdin, stdout, stderr = client.exec_command(cmd)
output = stdout.read().decode('utf-8')
print("Output:", output)

client.close()
