import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('2.24.82.19', username='root', password='Col@13894645', port=22)

# Query coolify applications
cmd = "docker exec coolify-db psql -U coolify -d coolify -c \"SELECT id, name, git_repository, git_branch, fqdn FROM applications;\" 2>&1"
stdin, stdout, stderr = client.exec_command(cmd)

print("=== COOLIFY APPLICATIONS ===")
print(stdout.read().decode('utf-8'))

client.close()
