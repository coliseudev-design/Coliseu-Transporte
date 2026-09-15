import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('2.24.82.19', username='root', password='Col@13894645', port=22)

db_container = 'vasjsucz4yxcb7m4rtqindd2'

def query_db(db_name, sql):
    # Pass SQL with double quotes properly escaped
    cmd = f"docker exec -i {db_container} psql -U coliseu_admin -d {db_name} -c \"{sql}\""
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode('utf-8')
    err = stderr.read().decode('utf-8')
    return out, err

# Run queries
print("=== CIPLAN Search in nexus_dashboard ===")
out, err = query_db('nexus_dashboard', "SELECT nome, telefone, celular_secundario FROM dash_clientes WHERE nome ILIKE '%ciplan%' LIMIT 5;")
print(out)

print("=== PAX PRIMAVERA Search in nexus_dashboard ===")
out, err = query_db('nexus_dashboard', "SELECT nome, telefone, celular_secundario FROM dash_clientes WHERE nome ILIKE '%pax primavera%' LIMIT 5;")
print(out)

print("=== First 10 clients in nexus_dashboard ===")
out, err = query_db('nexus_dashboard', "SELECT nome, telefone, celular_secundario FROM dash_clientes LIMIT 10;")
print(out)

client.close()
