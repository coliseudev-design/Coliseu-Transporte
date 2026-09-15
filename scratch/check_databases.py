import paramiko
import json

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

stdin, stdout, stderr = client.exec_command("docker ps --format '{{.Names}}' | grep 'dashboard-middleware'")
MW = stdout.read().decode('utf-8').strip().split('\n')[0]

def run_query(db_name, sql):
    cmd = f"""docker exec {MW} node -e "
const pg = require('pg');
const pool = new pg.Pool({{
  host: process.env.PG_HOST || 'localhost',
  user: '{db_name.split('_')[0]}_admin',
  password: '{db_name.split('_')[0].capitalize()}DB2026Prod',
  database: '{db_name}',
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
    for line in output.splitlines():
        if line.startswith('RESULT:'):
            return json.loads(line.replace('RESULT:', '').strip())
        elif line.startswith('ERROR:'):
            print(f"[{db_name}] SQL Error:", line)
            return None
    return None

print("Searching in nexus_dashboard:")
res_nexus = run_query('nexus_dashboard', """
    SELECT id, id_firebird, nome, tenant_id::text
    FROM dash_clientes
    WHERE nome ILIKE '%JEFFERSON%'
    LIMIT 5
""")
print("Nexus:", res_nexus)

print("\nSearching in coliseu_dashboard:")
res_coliseu = run_query('coliseu_dashboard', """
    SELECT id, id_firebird, nome, tenant_id::text
    FROM dash_clientes
    WHERE nome ILIKE '%JEFFERSON%'
    LIMIT 5
""")
print("Coliseu:", res_coliseu)

client.close()
