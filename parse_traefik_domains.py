import paramiko
import json

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('2.24.82.19', username='root', password='Col@13894645', port=22)

# Get the list of all running containers and their names
stdin, stdout, stderr = client.exec_command("docker ps --format '{{.Names}}'")
containers = stdout.read().decode('utf-8').strip().split()

print("=== DETECTING CONTAINERS AND DOMAINS ===")
for container in containers:
    # Get labels for each container using docker inspect as json
    stdin, stdout, stderr = client.exec_command(f"docker inspect {container}")
    data = json.loads(stdout.read().decode('utf-8'))
    labels = data[0]['Config']['Labels']
    
    # Check if there is a Host rule in Traefik labels
    rules = []
    for k, v in labels.items():
        if 'traefik.http.routers' in k and 'rule' in k:
            rules.append(v)
            
    if rules:
        print(f"Container: {container}")
        for rule in rules:
            print(f"  Rule: {rule}")

client.close()
