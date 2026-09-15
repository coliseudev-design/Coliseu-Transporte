import paramiko
import json

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('2.24.82.19', username='root', password='Col@13894645', port=22)

# Inspect frontend container
stdin, stdout, stderr = client.exec_command("docker inspect dashboard-frontend-br0y0d05a1fq8fpwppb3y5bb-155221790013")
data = json.loads(stdout.read().decode('utf-8'))
labels = data[0]['Config']['Labels']

print("=== FRONTEND LABELS ===")
for k, v in labels.items():
    if any(x in k.lower() or x in v.lower() for x in ['repo', 'git', 'branch', 'coolify', 'project', 'source']):
        print(f"{k}: {v}")

# Inspect middleware container
stdin, stdout, stderr = client.exec_command("docker inspect nexus-middleware-br0y0d05a1fq8fpwppb3y5bb-155221793279")
data = json.loads(stdout.read().decode('utf-8'))
labels = data[0]['Config']['Labels']

print("\n=== MIDDLEWARE LABELS ===")
for k, v in labels.items():
    if any(x in k.lower() or x in v.lower() for x in ['repo', 'git', 'branch', 'coolify', 'project', 'source']):
        print(f"{k}: {v}")

client.close()
