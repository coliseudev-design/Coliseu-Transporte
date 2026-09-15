import paramiko
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')
script = "docker exec nexus-db-thyqkc5gkvp7i1nld555wakz-131845936540 psql -U nexus_admin -d nexus_dashboard -c 'DELETE FROM dash_vendas WHERE EXTRACT(YEAR FROM data_venda) > 2030;'"
stdin, stdout, stderr = client.exec_command(script)
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))
