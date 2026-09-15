import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('2.24.82.19', username='root', password='Col@13894645', port=22)

container = "nexus-middleware-br0y0d05a1fq8fpwppb3y5bb-030128186593"
stdin, stdout, stderr = client.exec_command(f"docker logs {container} 2>&1 | grep detalhes-360 | tail -n 50")
print("=== DETAILS-360 MIDDLEWARE REQUEST LOGS ===")
print(stdout.read().decode('utf-8'))
client.close()
