import paramiko
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')
script = "docker exec nexus-db-thyqkc5gkvp7i1nld555wakz-131845936540 psql -U nexus_admin -d nexus_dashboard -c 'SELECT COUNT(*), EXTRACT(MONTH FROM data_venda) AS mes FROM dash_vendas GROUP BY mes ORDER BY mes;'"
stdin, stdout, stderr = client.exec_command(script)
print(stdout.read().decode('utf-8'))
