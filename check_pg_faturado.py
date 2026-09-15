import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

# Primeiro descobre o container do banco nexus_dashboard
find_cmd = "docker ps --format '{{.Names}}\t{{.Status}}' | grep -v 'identity'"
stdin, stdout, stderr = client.exec_command(find_cmd)
print("=== Containers rodando ===")
print(stdout.read().decode('utf-8'))

# Query usando o container da query_postgres_today.py original
DB_CONTAINER = "nexus-db-thyqkc5gkvp7i1nld555wakz-131845936540"

# 1. Vendas FATURADO de hoje
cmd1 = f"""docker exec {DB_CONTAINER} psql -U nexus_admin -d nexus_dashboard -c "SELECT id_firebird, data_venda, valor_total, valor_custo, status FROM dash_vendas WHERE data_venda = CURRENT_DATE AND status = 'FATURADO' ORDER BY id_firebird DESC;" 2>&1"""
stdin, stdout, stderr = client.exec_command(cmd1)
print("=== Vendas FATURADO hoje no PostgreSQL ===")
print(stdout.read().decode('utf-8'))

# 2. Ultima sync (registro mais recente)
cmd2 = f"""docker exec {DB_CONTAINER} psql -U nexus_admin -d nexus_dashboard -c "SELECT id_firebird, data_venda, status, synced_at FROM dash_vendas ORDER BY id_firebird DESC LIMIT 5;" 2>&1"""
stdin, stdout, stderr = client.exec_command(cmd2)
print("=== Ultimos 5 registros (por id_firebird) ===")
print(stdout.read().decode('utf-8'))

client.close()
