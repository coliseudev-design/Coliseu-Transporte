import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('2.24.82.19', username='root', password='Col@13894645', port=22)

# Get active container
stdin, stdout, stderr = client.exec_command("docker ps --format '{{.Names}}' | grep 'nexus-middleware'")
MW = stdout.read().decode('utf-8').strip().split('\n')[0]
print(f"Active Nexus MW Container: {MW}")

# Get last 500 lines of logs
stdin, stdout, stderr = client.exec_command(f"docker logs --tail 500 {MW} 2>&1")
print("=== MIDDLEWARE LOGS ===")
print(stdout.read().decode('utf-8'))

client.close()
