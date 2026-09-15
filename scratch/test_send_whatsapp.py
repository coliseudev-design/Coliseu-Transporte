import paramiko
import sys

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('2.24.82.19', username='root', password='Col@13894645', port=22)

# Get active container
stdin, stdout, stderr = client.exec_command("docker ps --format '{{.Names}}' | grep 'nexus-middleware'")
MW = stdout.read().decode('utf-8').strip().split('\n')[0]

tenant_id = 'ce3067f6-04a3-4b6c-a1b8-6aa47f24aad6'
phone = '556799699415'
message = 'Olá! Este é um teste da API Oficial do WhatsApp Meta configurada no Nexus. Se você recebeu esta mensagem, significa que a integração está ativa e configurada perfeitamente! 🚀'

js_code = f"""
const pg = require('pg');
const {{ sendWhatsAppMessage }} = require('./src/utils/whatsapp');

const pool = new pg.Pool({{
  host: process.env.PG_HOST || 'localhost',
  user: process.env.PG_USER || 'nexus_admin',
  password: process.env.PG_PASSWORD || 'NexusDB2026Prod',
  database: process.env.PG_DATABASE || 'nexus_dashboard',
  port: parseInt(process.env.PG_PORT || 5432),
  ssl: false
}});

pool.query('SELECT * FROM dash_integracoes_config WHERE tenant_id = \\'{tenant_id}\\'').then(async res => {{
  if (res.rows.length === 0) {{
    console.log('ERROR: Config not found');
    pool.end();
    return;
  }}
  const configs = res.rows[0];
  console.log('Sending message via Meta to {phone}...');
  try {{
    const result = await sendWhatsAppMessage(configs, '{phone}', '{message}');
    console.log('RESULT:' + JSON.stringify(result));
  }} catch(e) {{
    console.log('ERROR:' + e.message);
  }}
  pool.end();
}}).catch(err => {{
  console.log('ERROR:' + err.message);
  pool.end();
}});
"""

escaped_js_code = js_code.replace('"', '\\"')
cmd = f"""docker exec {MW} node -e "{escaped_js_code}" 2>&1"""

print(f"Running test WhatsApp send on container {MW}...")
stdin, stdout, stderr = client.exec_command(cmd)
output = stdout.read().decode('utf-8')
print("Output:", output)

client.close()
