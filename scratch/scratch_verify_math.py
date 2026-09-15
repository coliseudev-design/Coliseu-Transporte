import paramiko
import json

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('2.24.82.19', username='root', password='Col@13894645', timeout=10)

def run_psql(db, sql):
    cmd = f'docker exec vasjsucz4yxcb7m4rtqindd2 psql -U coliseu_admin -d {db} -c "{sql}"'
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode('utf-8')
    err = stderr.read().decode('utf-8')
    return out

tenant = 'ce3067f6-04a3-4b6c-a1b8-6aa47f24aad6' # Compensados Dourados
start = '2026-06-10 00:00:00-03'
end = '2026-06-15 23:59:59-03'

# 1. Query faturamento total from dash_vendas using sales filter and coalesced date
sql_sales = f"""
SELECT 
    COALESCE(SUM(v.valor_total - COALESCE(v.valor_desconto, 0)), 0) AS faturamento_total,
    COUNT(DISTINCT v.id_firebird) AS total_pedidos
FROM dash_vendas v
WHERE v.tenant_id = '{tenant}' 
  AND COALESCE(v.data_vencimento, v.data_venda) >= '{start}' 
  AND COALESCE(v.data_vencimento, v.data_venda) <= '{end}'
  AND UPPER(TRIM(v.status)) IN ('FATURADO', 'FINALIZADO', 'PROCESSADO')
"""

print("=== CALCULATED VALUES IN NEXUS_DASHBOARD ===")
print(run_psql("nexus_dashboard", sql_sales))

print("=== COLISEU_DASHBOARD (FOR COMPARISON) ===")
print(run_psql("coliseu_dashboard", sql_sales))

client.close()
