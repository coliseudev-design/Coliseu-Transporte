import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

# Chama o debug-db via curl dentro do container middleware
MW = "dashboard-middleware-irerzifjwjb4q8ucbpfk2gb8-143954252857"

# Pega o token JWT/API key das env vars e chama o endpoint de debug
cmd = f"""docker exec {MW} node -e "
const http = require('http');
const opts = {{hostname:'localhost', port:3200, path:'/api/estatisticas/debug-db', headers:{{'x-internal-key':'aQbY3eqVz2xd8PSr0AUKtfwFRo7n1IickE6sMGWTNCpXhZ95'}}}};
http.get(opts, r=>{{let d='';r.on('data',c=>d+=c);r.on('end',()=>console.log(d));}}).on('error',e=>console.error(e.message));
" 2>&1"""
stdin, stdout, stderr = client.exec_command(cmd)
out = stdout.read().decode('utf-8')
print("=== debug-db via x-internal-key ===")
print(out)

# Tenta tambem via pg direto com outra abordagem - lista databases do postgres
cmd2 = "docker exec coolify-db psql -U coolify -c '\\\\l' 2>&1"
stdin, stdout, stderr = client.exec_command(cmd2)
print("=== Databases no coolify-db ===")
print(stdout.read().decode('utf-8'))

client.close()
