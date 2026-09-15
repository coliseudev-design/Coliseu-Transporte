import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('2.24.82.19', username='root', password='Col@13894645', port=22)

# Get Traefik routing rules (labels) for all containers
stdin, stdout, stderr = client.exec_command("docker inspect --format '{{.Name}}\t{{.Config.Labels}}' $(docker ps -q)")
print("=== CONTAINER ROUTING LABELS ===")
labels_out = stdout.read().decode('utf-8')
for line in labels_out.splitlines():
    if "nexus" in line.lower():
        print(line)

client.close()
