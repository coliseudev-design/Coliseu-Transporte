import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

FE = "dashboard-frontend-irerzifjwjb4q8ucbpfk2gb8-184550458446"

# Check main nginx.conf
stdin, stdout, stderr = client.exec_command(f"docker exec {FE} cat /etc/nginx/nginx.conf")
print("=== nginx.conf ===")
print(stdout.read().decode('utf-8'))

# Check conf.d files
stdin, stdout, stderr = client.exec_command(f"docker exec {FE} ls -l /etc/nginx/conf.d/")
print("=== conf.d files ===")
print(stdout.read().decode('utf-8'))

stdin, stdout, stderr = client.exec_command(f"docker exec {FE} cat /etc/nginx/conf.d/default.conf 2>&1")
print("=== default.conf ===")
print(stdout.read().decode('utf-8'))

client.close()
