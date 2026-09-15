import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

# Lista TODOS os containers postgres (incluindo parados)
stdin, stdout, stderr = client.exec_command("docker ps -a --format '{{.Names}}\t{{.Image}}\t{{.Status}}' | grep -i 'postgres\\|pg\\|db'")
out = stdout.read().decode('utf-8')
print("=== Containers PG/DB ===")
print(out)

# Tenta achar o container correto inspecionando as labels de coolify com nexus-db
stdin, stdout, stderr = client.exec_command("docker ps -a --format '{{.Names}}' | xargs -I{} docker inspect {} --format '{{.Name}} {{index .Config.Labels \"coolify.serviceId\"}} {{range .Config.Env}}{{if (stringContains . \"POSTGRES\")}}{{.}} {{end}}{{end}}' 2>/dev/null | grep -i 'nexus\\|dash'")
out2 = stdout.read().decode('utf-8')
print("=== Containers com label Nexus ===")
print(out2)

# Verifica se tem postgres rodando direto no host
stdin, stdout, stderr = client.exec_command("ss -tlnp | grep 5432 2>&1")
out3 = stdout.read().decode('utf-8')
print("=== Porta 5432 no host ===")
print(out3)

# Tenta conectar ao localhost:5432 com psql
stdin, stdout, stderr = client.exec_command("PGPASSWORD='NexusDB2026Prod' psql -h 127.0.0.1 -U nexus_admin -d nexus_dashboard -c 'SELECT data_venda, status, COUNT(*) FROM dash_vendas WHERE data_venda >= NOW()-interval\\'10 days\\' GROUP BY 1,2 ORDER BY 1 DESC;' 2>&1")
out4 = stdout.read().decode('utf-8')
print("=== psql localhost ===")
print(out4)

client.close()
