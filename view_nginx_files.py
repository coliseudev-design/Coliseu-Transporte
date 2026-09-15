import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

FE = "dashboard-frontend-irerzifjwjb4q8ucbpfk2gb8-184550458446"

stdin, stdout, stderr = client.exec_command(f"docker exec {FE} ls -l /var/log/nginx/")
print("=== NGINX LOG DIRECTORY ===")
print(stdout.read().decode('utf-8'))

stdin, stdout, stderr = client.exec_command(f"docker exec {FE} tail -n 100 /var/log/nginx/access.log")
print("=== ACCESS LOG TAIL ===")
print(stdout.read().decode('utf-8'))

client.close()
