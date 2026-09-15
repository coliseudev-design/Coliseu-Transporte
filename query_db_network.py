import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

# Roda psql dentro da rede coolify para conectar ao nexus-db
cmd = (
    "docker run --rm --network coolify "
    "-e PGPASSWORD='NexusDB2026Prod' "
    "postgres:15-alpine "
    "psql -h nexus-db -U nexus_admin -d nexus_dashboard -c "
    "\"SELECT data_venda::text, status, COUNT(*), SUM(valor_total) FROM dash_vendas "
    "WHERE data_venda >= CURRENT_DATE - 7 GROUP BY 1,2 ORDER BY 1 DESC;\" 2>&1"
)
stdin, stdout, stderr = client.exec_command(cmd)
print("=== Vendas por data (via psql na rede coolify) ===")
print(stdout.read().decode('utf-8'))

client.close()
