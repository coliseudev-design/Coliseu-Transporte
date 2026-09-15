import paramiko

def main():
    host = '177.39.17.7'
    user = 'root'
    password = '6EFBC!c0:wzr%Ij'

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    try:
        print("Conectando ao servidor SSH no VPS...")
        client.connect(host, username=user, password=password)

        sftp = client.open_sftp()

        # Descobre o container do middleware
        print("Buscando o container dashboard-middleware...")
        stdin, stdout, stderr = client.exec_command("docker ps --format '{{.Names}}' | grep 'dashboard-middleware'")
        container = stdout.read().decode('utf-8').strip()
        if not container:
            print("Erro: container dashboard-middleware não encontrado.")
            return

        print(f"Container encontrado: {container}")

        # Cria código JS temporário
        js_code = """
const { Pool } = require('pg');
const p = new Pool({
  host: process.env.PG_HOST || 'localhost',
  user: process.env.PG_USER || 'nexus_admin',
  password: process.env.PG_PASSWORD || 'NexusDB2026Prod',
  database: process.env.PG_DATABASE || 'nexus_dashboard',
  port: parseInt(process.env.PG_PORT || 5432),
  connectionTimeoutMillis: 5000
});

p.query(`
  UPDATE dash_clientes
  SET nome = UPPER(nome),
      cidade = UPPER(cidade),
      estado = UPPER(estado),
      classificacao = UPPER(classificacao),
      responsavel_nome = UPPER(responsavel_nome),
      regime_tributario = UPPER(regime_tributario),
      endereco_completo = UPPER(endereco_completo),
      tipo_cliente = UPPER(tipo_cliente),
      observacoes = UPPER(observacoes)
`).then(r => {
  console.log('SQL_SUCCESS:' + r.rowCount);
  p.end();
}).catch(e => {
  console.error('SQL_ERROR:' + e.message);
  p.end();
});
"""

        temp_file_path = '/tmp/update_clients.js'
        print(f"Gravando arquivo temporário em {temp_file_path}...")
        with sftp.file(temp_file_path, 'w') as f:
            f.write(js_code)

        print(f"Copiando arquivo para o container {container}...")
        stdin, stdout, stderr = client.exec_command(f"docker cp {temp_file_path} {container}:/usr/src/app/update_clients.js")
        stdout.read() # espera terminar

        print("Executando script node de atualização no container...")
        stdin, stdout, stderr = client.exec_command(f"docker exec {container} node /usr/src/app/update_clients.js")
        result = stdout.read().decode('utf-8')
        err_res = stderr.read().decode('utf-8')

        print("=== Resultados ===")
        for line in (result + err_res).splitlines():
            if line.startswith('SQL_SUCCESS:'):
                rows_updated = line.split(':')[1]
                print(f"Sucesso: {rows_updated} registros de clientes atualizados para caixa alta.")
            elif line.startswith('SQL_ERROR:'):
                print(f"Erro ao executar SQL: {line.split(':')[1]}")
            else:
                print(f"Log: {line}")

        # Cleanup
        print("Limpando arquivos temporários...")
        client.exec_command(f"rm {temp_file_path}")
        client.exec_command(f"docker exec {container} rm /usr/src/app/update_clients.js")

    except Exception as e:
        print(f"Erro durante a execução: {e}")
    finally:
        client.close()

if __name__ == '__main__':
    main()
