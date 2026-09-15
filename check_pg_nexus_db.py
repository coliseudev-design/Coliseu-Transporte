import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

MW = "dashboard-middleware-irerzifjwjb4q8ucbpfk2gb8-143954252857"
DB = "nexus-db"

def pg(sql, label):
    cmd = f'docker exec {DB} psql -U nexus_admin -d nexus_dashboard -c "{sql}" 2>&1'
    stdin, stdout, stderr = client.exec_command(cmd)
    print(f"=== {label} ===")
    print(stdout.read().decode('utf-8'))

# 1. Vendas FATURADO de hoje
pg("SELECT id_firebird, data_venda, valor_total, valor_custo, status FROM dash_vendas WHERE data_venda = CURRENT_DATE AND status = 'FATURADO' ORDER BY id_firebird DESC;",
   "Vendas FATURADO hoje no PG")

# 2. Ultimas 5 por id_firebird
pg("SELECT id_firebird, data_venda, valor_total, valor_custo, status, synced_at FROM dash_vendas ORDER BY id_firebird DESC LIMIT 5;",
   "Ultimos 5 registros no PG")

# 3. Contagem por tenant e data
pg("SELECT tenant_id, data_venda::date, COUNT(*), SUM(valor_total) FROM dash_vendas WHERE data_venda >= CURRENT_DATE - 3 GROUP BY 1, 2 ORDER BY 2 DESC;",
   "Vendas por tenant/data (3 dias)")

client.close()
