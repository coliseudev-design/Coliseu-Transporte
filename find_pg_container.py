import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

# Descobre qual container tem o postgres do dashboard
find = "docker ps -a --format '{{.Names}}' | xargs -I{} sh -c 'docker inspect {} --format \"{{.Name}} {{range .Config.Env}}{{.}} {{end}}\" 2>/dev/null' | grep -i 'nexus_dashboard\\|PG_DATABASE\\|POSTGRES_DB'"
stdin, stdout, stderr = client.exec_command(find)
out = stdout.read().decode('utf-8')
print("=== Containers com nexus_dashboard ===")
print(out or "(nenhum)")

# Tenta conectar direto via psql no host
cmd = "psql -U nexus_admin -d nexus_dashboard -h localhost -c \"SELECT id_firebird, data_venda, status FROM dash_vendas ORDER BY id_firebird DESC LIMIT 5;\" 2>&1"
stdin, stdout, stderr = client.exec_command(cmd)
print("=== psql direto no host ===")
print(stdout.read().decode('utf-8'))

# Pega as env vars do middleware para descobrir PG_HOST/USER/PASS/DB
cmd2 = "docker inspect dashboard-middleware-irerzifjwjb4q8ucbpfk2gb8-143954252857 --format '{{range .Config.Env}}{{.}}\n{{end}}' | grep PG_"
stdin, stdout, stderr = client.exec_command(cmd2)
print("=== Env vars PG do middleware ===")
print(stdout.read().decode('utf-8'))

client.close()
