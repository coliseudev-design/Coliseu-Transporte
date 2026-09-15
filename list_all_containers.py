import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

# Lista TODOS os containers sem filtro
stdin, stdout, stderr = client.exec_command("docker ps -a --format '{{.Names}}\t{{.Image}}\t{{.Status}}'")
print("=== TODOS os containers ===")
print(stdout.read().decode('utf-8'))

# Verifica todos os containers que ouvem 5432
stdin, stdout, stderr = client.exec_command("docker ps -a --format '{{.Names}}\t{{.Ports}}' | grep 5432")
print("=== Containers com porta 5432 ===")
print(stdout.read().decode('utf-8'))

# Tenta resolver nexus-db pelos aliases de cada container na rede coolify
stdin, stdout, stderr = client.exec_command("docker network inspect coolify | python3 -c \"import json,sys; n=json.load(sys.stdin); [(print(c['Name'],c.get('IPv4Address'),c.get('Aliases','')) ) for c in n[0]['Containers'].values()]\" 2>&1")
print("=== Aliases na rede coolify ===")
print(stdout.read().decode('utf-8'))

client.close()
