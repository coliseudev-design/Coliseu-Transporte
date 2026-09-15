import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

stdin, stdout, stderr = client.exec_command("docker ps --format '{{.Names}}' | grep 'dashboard-middleware'")
MW = stdout.read().decode('utf-8').strip().split('\n')[0]
print(f"Container: {MW}")

# Fetch logs
stdin, stdout, stderr = client.exec_command(f"docker logs {MW} 2>&1")
logs = stdout.read().decode('utf-8')

print("=== SEARCHING MIDDLEWARE LOGS FOR AUTH ===")
lines = logs.splitlines()
matches = 0
for line in lines:
    if "auth" in line.lower() or "bearer" in line.lower() or "jwt" in line.lower():
        print(line)
        matches += 1

print(f"\nTotal matches: {matches}")
client.close()
