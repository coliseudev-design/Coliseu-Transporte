import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('2.24.82.19', username='root', password='Col@13894645', port=22)

stdin, stdout, stderr = client.exec_command('docker exec nexus-middleware-br0y0d05a1fq8fpwppb3y5bb-030128186593 env | grep PG')
print("=== ENVIRONMENT VARIABLES ===")
print(stdout.read().decode('utf-8'))
client.close()
