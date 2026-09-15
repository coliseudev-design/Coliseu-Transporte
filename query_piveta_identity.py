import paramiko
import json

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

stdin, stdout, stderr = client.exec_command("docker ps --format '{{.Names}}' | grep 'dashboard-middleware'")
MW = stdout.read().decode('utf-8').strip().split('\n')[0]

cmd = f"""docker exec {MW} node -e "
const pg = require('pg');
const pool = new pg.Pool({{
  host: process.env.PG_HOST || 'localhost',
  user: process.env.PG_USER || 'nexus_admin',
  password: process.env.PG_PASSWORD || 'NexusDB2026Prod',
  database: 'coliseu_identity',
  port: parseInt(process.env.PG_PORT || 5432),
  ssl: false
}});

pool.query('SELECT * FROM companies WHERE \\"Id\\" = \\'ed1d3a98-4c4d-48db-99c0-8751926eb8e5\\'').then(res => {{
  console.log('COMPANY:' + JSON.stringify(res.rows));
  pool.end();
}}).catch(err => {{
  console.error('ERROR:' + err.message);
  pool.end();
}});
" 2>&1"""

stdin, stdout, stderr = client.exec_command(cmd)
output = stdout.read().decode('utf-8')
print(output)
client.close()
