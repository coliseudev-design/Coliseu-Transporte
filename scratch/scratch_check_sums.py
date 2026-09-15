import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('2.24.82.19', username='root', password='Col@13894645', timeout=10)

def run_psql(db, sql):
    cmd = f'docker exec vasjsucz4yxcb7m4rtqindd2 psql -U coliseu_admin -d {db} -c "{sql}"'
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode('utf-8')
    return out

tenant = 'ce3067f6-04a3-4b6c-a1b8-6aa47f24aad6' # Compensados Dourados
sql = f"SELECT id_firebird, numero_pedido, data_venda::text, valor_total, valor_desconto, valor_custo, es, processo, status FROM dash_vendas WHERE tenant_id = '{tenant}' AND data_venda >= '2026-06-10' ORDER BY id_firebird"

print("=== COLISEU ===")
print(run_psql("coliseu_dashboard", sql))

print("=== NEXUS ===")
print(run_psql("nexus_dashboard", sql))

client.close()
