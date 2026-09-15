import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

script = "docker exec nexus-db-thyqkc5gkvp7i1nld555wakz-131845936540 psql -U nexus_admin -d nexus_dashboard -c \"SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'dash_financeiro';\""
script2 = "docker exec nexus-db-thyqkc5gkvp7i1nld555wakz-131845936540 psql -U nexus_admin -d nexus_dashboard -c \"SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'dash_vendas';\""

print("--- dash_financeiro ---")
stdin, stdout, stderr = client.exec_command(script)
print(stdout.read().decode('utf-8'))

print("--- dash_vendas ---")
stdin, stdout, stderr = client.exec_command(script2)
print(stdout.read().decode('utf-8'))
