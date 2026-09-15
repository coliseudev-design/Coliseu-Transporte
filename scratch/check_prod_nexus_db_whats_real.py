import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('2.24.82.19', username='root', password='Col@13894645')

db_container = "vasjsucz4yxcb7m4rtqindd2"

def query_db(db_name, sql):
    cmd = f"docker exec -i {db_container} psql -U coliseu_admin -d {db_name} -c \"{sql}\""
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode('utf-8')
    err = stderr.read().decode('utf-8')
    return out, err

print("=== Search clients by phone 9223-3616 ===")
out, err = query_db('nexus_dashboard', """
SELECT id, nome, telefone, celular_secundario FROM dash_clientes 
WHERE telefone ILIKE '%9223%3616%' OR celular_secundario ILIKE '%9223%3616%';
""")
print(out)

print("=== Search clients by phone 9938-4354 ===")
out, err = query_db('nexus_dashboard', """
SELECT id, nome, telefone, celular_secundario FROM dash_clientes 
WHERE telefone ILIKE '%9938%4354%' OR celular_secundario ILIKE '%9938%4354%';
""")
print(out)

print("=== Search RODRIGO DA SILVA SOUZA details ===")
out, err = query_db('nexus_dashboard', """
SELECT id, nome, telefone, celular_secundario FROM dash_clientes 
WHERE nome ILIKE '%RODRIGO DA SILVA SOUZA%';
""")
print(out)

print("=== Search PAULISTA COMERCIO details ===")
out, err = query_db('nexus_dashboard', """
SELECT id, nome, telefone, celular_secundario FROM dash_clientes 
WHERE nome ILIKE '%PAULISTA COMERCIO%';
""")
print(out)

client.close()
