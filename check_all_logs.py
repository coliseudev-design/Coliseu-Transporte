import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

stdin, stdout, stderr = client.exec_command("docker ps --format '{{.Names}}' | grep 'dashboard-middleware'")
MW = stdout.read().decode('utf-8').strip().split('\n')[0]
print(f"Container: {MW}")

# Fetch last 15,000 lines of logs
stdin, stdout, stderr = client.exec_command(f"docker logs --tail 15000 {MW} 2>&1")
logs = stdout.read().decode('utf-8')

print("=== SEARCHING MIDDLEWARE LOGS FOR SYNC/INTERNAL/ERROR/POST ===")
lines = logs.splitlines()
matches = 0
for line in lines:
    if "sync" in line.lower() or "internal" in line.lower() or "post /" in line.lower() or "put /" in line.lower():
        print(line)
        matches += 1

print(f"\nTotal matches found: {matches}")
client.close()
