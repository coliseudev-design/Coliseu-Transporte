import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

MW = "dashboard-middleware-irerzifjwjb4q8ucbpfk2gb8-143954252857"

# Verifica /etc/hosts do middleware (pode ter alias nexus-db)
stdin, stdout, stderr = client.exec_command(f"docker exec {MW} cat /etc/hosts")
print("=== /etc/hosts do middleware ===")
print(stdout.read().decode('utf-8'))

# Tenta via IP direto do coolify-db (10.0.1.3)
cmd = f'''docker exec {MW} node -e "
const {{Pool}} = require('pg');
const pool = new Pool({{host:'10.0.1.3',user:'nexus_admin',password:'NexusDB2026Prod',database:'nexus_dashboard',port:5432}});
pool.query('SELECT id_firebird, data_venda, valor_total, status FROM dash_vendas ORDER BY id_firebird DESC LIMIT 5').then(r=>{{console.log(JSON.stringify(r.rows,null,2));pool.end()}}).catch(e=>{{console.error('ERRO:',e.message);pool.end()}});
" 2>&1'''
stdin, stdout, stderr = client.exec_command(cmd)
print("=== Ultimos registros PG (10.0.1.3) ===")
print(stdout.read().decode('utf-8'))

client.close()
