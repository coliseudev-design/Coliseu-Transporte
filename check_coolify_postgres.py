import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

# List databases in coolify-db
print("=== DATABASES IN coolify-db ===")
stdin, stdout, stderr = client.exec_command("docker exec coolify-db psql -U coolify -c '\\l' 2>&1")
print(stdout.read().decode('utf-8'))

# List schemas/tables if coliseu_dashboard or nexus_dashboard exists
print("=== CHECKING nexus_dashboard IN coolify-db ===")
stdin, stdout, stderr = client.exec_command("docker exec coolify-db psql -U coolify -d nexus_dashboard -c '\\dt' 2>&1")
print(stdout.read().decode('utf-8'))

print("=== CHECKING coliseu_dashboard IN coolify-db ===")
stdin, stdout, stderr = client.exec_command("docker exec coolify-db psql -U coolify -d coliseu_dashboard -c '\\dt' 2>&1")
print(stdout.read().decode('utf-8'))

client.close()
