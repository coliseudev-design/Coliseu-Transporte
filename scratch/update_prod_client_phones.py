import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('2.24.82.19', username='root', password='Col@13894645', port=22)

db_container = 'vasjsucz4yxcb7m4rtqindd2'

def execute_sql(sql):
    cmd = f"docker exec -i {db_container} psql -U coliseu_admin -d nexus_dashboard -c \"{sql}\""
    stdin, stdout, stderr = client.exec_command(cmd)
    return stdout.read().decode('utf-8'), stderr.read().decode('utf-8')

# Run updates
out, err = execute_sql("UPDATE dash_clientes SET celular_secundario = '(61)-99999-8888' WHERE nome = 'CIPLAN CIMENTO PLANALTO SA';")
print("Update CIPLAN:", out, err)

out, err = execute_sql("UPDATE dash_clientes SET celular_secundario = '(67)-98888-7777' WHERE nome = 'PAX PRIMAVERA SERVICOS POSTUMOS ASSISTENCIA FAMILIAR LTDA';")
print("Update PAX:", out, err)

# Check the updated rows
out, err = execute_sql("SELECT nome, telefone, celular_secundario FROM dash_clientes WHERE nome IN ('CIPLAN CIMENTO PLANALTO SA', 'PAX PRIMAVERA SERVICOS POSTUMOS ASSISTENCIA FAMILIAR LTDA');")
print("Updated clients check:")
print(out)

client.close()
