import paramiko, json

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

# Descobre o container atual do middleware (dinamicamente)
stdin, stdout, stderr = client.exec_command("docker ps --format '{{.Names}}' | grep 'dashboard-middleware'")
MW = stdout.read().decode('utf-8').strip()
print(f"Container middleware: {MW}")

# Descobre PG_HOST do container atual
stdin, stdout, stderr = client.exec_command(f"docker inspect {MW} --format '{{{{range .Config.Env}}}}{{{{.}}}}|{{{{end}}}}' 2>&1 | tr '|' '\\n' | grep PG_")
env_out = stdout.read().decode('utf-8').strip()
print(f"Env PG_:\n{env_out}\n")

# Script node para query
script = (
    "const {Pool}=require('pg');"
    "const p=new Pool({host:process.env.PG_HOST||'localhost',"
    "user:process.env.PG_USER||'nexus_admin',"
    "password:process.env.PG_PASSWORD||'NexusDB2026Prod',"
    "database:process.env.PG_DATABASE||'nexus_dashboard',"
    "port:parseInt(process.env.PG_PORT||5432),"
    "connectionTimeoutMillis:5000});"
    # Now -> server date
    "p.query('SELECT NOW() as ts, CURRENT_DATE as hoje').then(r=>{"
    "console.log('SRV_DATE:'+JSON.stringify(r.rows[0]));"
    # Sales last 10 days
    "return p.query('SELECT data_venda::text, status, COUNT(*), COALESCE(SUM(valor_total),0) FROM dash_vendas WHERE data_venda>=CURRENT_DATE-10 GROUP BY 1,2 ORDER BY 1 DESC');"
    "}).then(r=>{"
    "r.rows.forEach(x=>console.log('VENDA:'+JSON.stringify(x)));"
    "return p.end();"
    "}).catch(e=>{console.error('ERR:'+e.message);p.end();});"
)

cmd = f"docker exec {MW} node -e \"{script}\" 2>&1"
stdin, stdout, stderr = client.exec_command(cmd)
result = stdout.read().decode('utf-8')
print("=== Resultado ===")
for line in result.splitlines():
    if line.startswith('SRV_DATE:'):
        d = json.loads(line.replace('SRV_DATE:',''))
        print(f"  Servidor: {d['ts']}  |  Hoje: {d['hoje']}")
    elif line.startswith('VENDA:'):
        d = json.loads(line.replace('VENDA:',''))
        print(f"  {d['data_venda']} | status='{d['status']}' | count={d['count']} | total={d['sum']}")
    elif line.startswith('ERR:'):
        print(f"  ERRO: {line}")
    else:
        print(f"  {line}")

client.close()
