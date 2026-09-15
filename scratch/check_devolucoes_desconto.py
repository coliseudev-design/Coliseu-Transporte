import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('2.24.82.19', username='root', password='Col@13894645', timeout=10)

def run_psql(db, sql):
    cmd = f'docker exec vasjsucz4yxcb7m4rtqindd2 psql -U coliseu_admin -d {db} -c "{sql}"'
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode('utf-8')
    return out

# Query all sales count for tenant
sql = """
SELECT COUNT(*) FROM dash_vendas WHERE tenant_id = 'ce3067f6-04a3-4b6c-a1b8-6aa47f24aad6';
"""

print("=== NEXUS SALES COUNT ===")
print(run_psql("nexus_dashboard", sql))

client.close()
