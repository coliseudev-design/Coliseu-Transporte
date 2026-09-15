import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

# Containers parados com postgres
stdin, stdout, stderr = client.exec_command("docker ps -a --format '{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.CreatedAt}}' | grep -i 'postgres\\|db' | head -20")
print("=== Containers DB (todos, incluindo parados) ===")
print(stdout.read().decode('utf-8'))

# Volumes que contem dados postgres
stdin, stdout, stderr = client.exec_command("docker volume ls | grep -i 'nexus\\|dash\\|pg\\|postgres'")
print("=== Volumes relacionados ===")
print(stdout.read().decode('utf-8'))

# Lista TODOS os containers parados para encontrar o nexus-db antigo
stdin, stdout, stderr = client.exec_command("docker ps -a --format '{{.Names}}\t{{.Status}}' | grep -v 'Up ' | head -20")
print("=== Containers PARADOS ===")
print(stdout.read().decode('utf-8'))

# IP resolve no container middleware - pode ser um IP externo ou de outro servidor
stdin, stdout, stderr = client.exec_command("docker run --rm --network coolify alpine nslookup nexus-db 2>&1 | head -20")
print("=== DNS nexus-db na rede coolify ===")
print(stdout.read().decode('utf-8'))

client.close()
