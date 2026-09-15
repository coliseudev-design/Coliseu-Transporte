import paramiko, json

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

# Acha o container atual do middleware
stdin, stdout, stderr = client.exec_command("docker ps --format '{{.Names}}\t{{.Status}}' | grep dashboard-middleware")
out = stdout.read().decode('utf-8').strip()
print("Middleware container:", out)

if not out:
    stdin, stdout, stderr = client.exec_command("docker ps --format '{{.Names}}\t{{.Status}}'")
    print("Todos containers:")
    print(stdout.read().decode('utf-8'))
    client.close()
    exit()

MW = out.split('\t')[0].strip()
print(f"Usando: {MW}")

# Query usando o node do container atual
script = (
    "const {Pool}=require('pg');"
    "const p=new Pool({host:process.env.PG_HOST,user:process.env.PG_USER,"
    "password:process.env.PG_PASSWORD,database:process.env.PG_DATABASE,port:5432});"
    "p.query('SELECT data_venda::text,status,COUNT(*),SUM(valor_total) FROM dash_vendas "
    "WHERE data_venda>=CURRENT_DATE-7 GROUP BY 1,2 ORDER BY 1 DESC')"
    ".then(r=>{r.rows.forEach(x=>console.log(JSON.stringify(x)));return p.query('SELECT NOW() n,CURRENT_DATE d')})"
    ".then(r=>console.log('TIME:'+JSON.stringify(r.rows[0])))"
    ".then(()=>p.end()).catch(e=>{console.error('ERR:'+e.message);p.end()});"
)

cmd = f"docker exec {MW} node -e '{script}' 2>&1"
stdin, stdout, stderr = client.exec_command(cmd)
result = stdout.read().decode('utf-8')
print("=== Resultado ===")
print(result)

client.close()
