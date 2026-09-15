import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

PGPASS = "j5iLfzAvUbj+2bvpZGJ1Syeh8EK6QKNuA+YjLUxT1o4="

# Lista databases no coolify-db
stdin, stdout, stderr = client.exec_command(f"docker exec coolify-db psql -U coolify -c '\\l' 2>&1")
print("=== Databases no coolify-db ===")
print(stdout.read().decode('utf-8'))

# Lista users
stdin, stdout, stderr = client.exec_command(f"docker exec coolify-db psql -U coolify -c '\\du' 2>&1")
print("=== Users no coolify-db ===")
print(stdout.read().decode('utf-8'))

# Verifica se nexus_dashboard existe la
stdin, stdout, stderr = client.exec_command(f"docker exec coolify-db psql -U coolify -d nexus_dashboard -c 'SELECT data_venda::text, status, COUNT(*) FROM dash_vendas WHERE data_venda >= CURRENT_DATE - 7 GROUP BY 1,2 ORDER BY 1 DESC;' 2>&1")
print("=== Vendas ultimos 7 dias (coolify-db/nexus_dashboard) ===")
print(stdout.read().decode('utf-8'))

client.close()
