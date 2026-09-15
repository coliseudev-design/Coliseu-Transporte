import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('2.24.82.19', username='root', password='Col@13894645', port=22)

stdin, stdout, stderr = client.exec_command("docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}'")
print("=== Running Containers on 2.24.82.19 ===")
print(stdout.read().decode('utf-8'))

stdin, stdout, stderr = client.exec_command("docker ps -a --format '{{.Names}}\t{{.Status}}' | grep -v 'Up '")
print("=== Stopped Containers on 2.24.82.19 ===")
print(stdout.read().decode('utf-8'))

client.close()
