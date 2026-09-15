import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

FE = "dashboard-frontend-irerzifjwjb4q8ucbpfk2gb8-184550458446"

# Check if log files exist and read them
cmd = f"docker exec {FE} ls -la /var/log/nginx/"
stdin, stdout, stderr = client.exec_command(cmd)
print("=== NGINX LOG FILES ===")
print(stdout.read().decode('utf-8'))

# Search for sync or tenant ID in access log
cmd_search = f"docker exec {FE} grep -i 'sync\\|c06a45f5\\|a822a7e7' /var/log/nginx/access.log /var/log/nginx/error.log 2>&1"
stdin, stdout, stderr = client.exec_command(cmd_search)
print("=== NGINX MATCHING ENTRIES ===")
print(stdout.read().decode('utf-8')[:20000]) # Limit output

client.close()
