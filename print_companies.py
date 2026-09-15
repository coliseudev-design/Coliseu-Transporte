import paramiko
import json

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

stdin, stdout, stderr = client.exec_command("docker ps --format '{{.Names}}' | grep 'dashboard-middleware'")
MW = stdout.read().decode('utf-8').strip().split('\n')[0]

# We will run node command using a clean JS script written to a file inside the container, or just using simple quotes
# Let's write a script that does not require double quotes in the SQL query:
# We can use: SELECT * FROM companies
# and extract the fields in JS code.
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
pool.query('SELECT * FROM companies').then(res => {{
  console.log('COMPANIES:' + JSON.stringify(res.rows));
  pool.query('SELECT * FROM company_modules').then(res2 => {{
    console.log('MODULES:' + JSON.stringify(res2.rows));
    pool.end();
  }});
}}).catch(err => {{
  console.error('ERROR:' + err.message);
  pool.end();
}});
" 2>&1"""

stdin, stdout, stderr = client.exec_command(cmd)
output = stdout.read().decode('utf-8')
for line in output.splitlines():
    if line.startswith('COMPANIES:'):
        print("=== COMPANIES ===")
        rows = json.loads(line[10:])
        for r in rows:
            print(f"ID: {r.get('Id')} | Name: {r.get('Name')} | Status: {r.get('Status')} | Email: {r.get('ContactEmail')}")
    elif line.startswith('MODULES:'):
        print("\n=== MODULES ===")
        rows = json.loads(line[8:])
        for r in rows:
            print(f"CompanyId: {r.get('CompanyId')} | Module: {r.get('ModuleSlug')} | Active: {r.get('IsActive')} | URL: {r.get('MiddlewareBaseUrl')}")
    elif 'ERROR' in line or 'Error' in line:
        print(line)

client.close()
