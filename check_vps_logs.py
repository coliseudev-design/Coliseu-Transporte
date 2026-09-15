import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

# Find dashboard-middleware container name
stdin, stdout, stderr = client.exec_command("docker ps --format '{{.Names}}' | grep 'dashboard-middleware'")
MW = stdout.read().decode('utf-8').strip().split('\n')[0]
print("Middleware Container:", MW)

# Get the last 200 lines of docker logs
stdin, stdout, stderr = client.exec_command(f"docker logs --tail 200 {MW}")
print("=== DOCKER LOGS ===")
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))

client.close()
