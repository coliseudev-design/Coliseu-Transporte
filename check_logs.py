import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

# Dynamically find the middleware container name
stdin, stdout, stderr = client.exec_command("docker ps --format '{{.Names}}' | grep 'dashboard-middleware'")
MW = stdout.read().decode('utf-8').strip().split('\n')[0]
print(f"Middleware container: {MW}")

# Query recent logs
cmd = f"docker logs --tail 2000 {MW} 2>&1"
stdin, stdout, stderr = client.exec_command(cmd)
logs = stdout.read().decode('utf-8')

print("=== RECENT LOGS ===")
for line in logs.splitlines()[-100:]:  # Print last 100 lines
    print(line)

print("=== SEARCHING FOR TENANT OR SYNC OR ERROR ===")
count = 0
for line in logs.splitlines():
    if "c06a45f5" in line or "sync" in line.lower() or "error" in line.lower() or "fail" in line.lower():
        print(line)
        count += 1

print(f"Found {count} matching lines.")
client.close()
