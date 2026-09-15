import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

container = "api-nsnopymisrq9qphl5qjc3w5l-145010651736"

# Fetch logs
stdin, stdout, stderr = client.exec_command(f"docker logs --tail 200 {container} 2>&1")
print("=== DOCKER LOGS FOR API (CRASHING) ===")
print(stdout.read().decode('utf-8'))

client.close()
