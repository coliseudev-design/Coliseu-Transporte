import paramiko
import json

try:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    # Trying connection with standard port 22
    client.connect('2.24.82.19', username='root', password='Col@13894645', port=22)
    print("Connected successfully to VPS at 2.24.82.19!")
    
    # 1. List all containers
    stdin, stdout, stderr = client.exec_command("docker ps -a --format '{{.Names}}\t{{.Status}}'")
    print("=== CONTAINERS ===")
    print(stdout.read().decode('utf-8'))

    client.close()
except Exception as e:
    print("Failed to connect or run command:", e)
