import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('2.24.82.19', username='root', password='Col@13894645', port=22)

container = "nexus-middleware-br0y0d05a1fq8fpwppb3y5bb-030128186593"

# Read routes/clientes.js from container app directory
stdin, stdout, stderr = client.exec_command(f"docker exec {container} cat /usr/src/app/src/routes/clientes.js")
print("=== VPS src/routes/clientes.js ===")
content = stdout.read().decode('utf-8')
lines = content.splitlines()

# Print lines 150 to 250 (around detalhes-360)
for idx, line in enumerate(lines[150:250], start=151):
    print(f"{idx}: {line}")

client.close()
