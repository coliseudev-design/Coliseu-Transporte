import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

# 1. Vendas de hoje no PostgreSQL
script1 = """docker exec $(docker ps -q --filter name=db | head -1) psql -U nexus_admin -d nexus_dashboard -c "SELECT COUNT(*), COALESCE(SUM(valor_total),0) AS total, COALESCE(SUM(valor_custo),0) AS custo FROM dash_vendas WHERE data_venda = CURRENT_DATE;" """
stdin, stdout, stderr = client.exec_command(script1)
print("=== 1. Vendas hoje no PostgreSQL ===")
print(stdout.read().decode('utf-8'))
err = stderr.read().decode('utf-8')
if err: print("ERR:", err)

# 2. Ultimas vendas no PostgreSQL
script2 = """docker exec $(docker ps -q --filter name=db | head -1) psql -U nexus_admin -d nexus_dashboard -c "SELECT id_firebird, data_venda, valor_total, valor_custo, status FROM dash_vendas ORDER BY id_firebird DESC LIMIT 5;" """
stdin, stdout, stderr = client.exec_command(script2)
print("=== 2. Ultimas 5 vendas no PostgreSQL ===")
print(stdout.read().decode('utf-8'))

# 3. Qual tenant_id existe
script3 = """docker exec $(docker ps -q --filter name=db | head -1) psql -U nexus_admin -d nexus_dashboard -c "SELECT tenant_id, COUNT(*), MAX(data_venda) FROM dash_vendas GROUP BY tenant_id;" """
stdin, stdout, stderr = client.exec_command(script3)
print("=== 3. Tenants com vendas ===")
print(stdout.read().decode('utf-8'))

client.close()
