import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

# Find the postgres container
stdin, stdout, stderr = client.exec_command("docker ps --format '{{.Names}}' | grep 'coliseu-db'")
db_container = stdout.read().decode('utf-8').strip().split('\n')[0]

def query_db(db_name, sql):
    cmd = f"docker exec -i {db_container} psql -U coliseu_admin -d {db_name} -c \"{sql}\""
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode('utf-8')
    err = stderr.read().decode('utf-8')
    return out, err

out, err = query_db('coliseu_dashboard', "SELECT nome, tenant_id FROM dash_clientes WHERE nome ILIKE '%planalto%' LIMIT 10;")
print("PLANALTO search:")
print(out)

out, err = query_db('coliseu_dashboard', "SELECT nome, tenant_id FROM dash_clientes WHERE nome ILIKE '%pax%' LIMIT 10;")
print("PAX search:")
print(out)

out, err = query_db('coliseu_dashboard', "SELECT nome, tenant_id FROM dash_clientes WHERE nome ILIKE '%tramontina%' LIMIT 10;")
print("TRAMONTINA search:")
print(out)

client.close()
