import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

# Let's query companies using pg_dump/psql in the postgres container
stdin, stdout, stderr = client.exec_command("docker exec -e PGPASSWORD=NexusDB2026Prod coliseu-db-thyqkc5gkvp7i1nld555wakz-172547374937 psql -h 127.0.0.1 -U nexus_admin -d coliseu_identity -c \"SELECT \\\"Id\\\", \\\"Name\\\", \\\"CompanyKeyEncrypted\\\" FROM companies\"")
print("=== COMPANIES ===")
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))

client.close()
