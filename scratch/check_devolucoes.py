import paramiko

def main():
    host = '177.39.17.7'
    user = 'root'
    password = '6EFBC!c0:wzr%Ij'

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    try:
        client.connect(host, username=user, password=password)

        stdin, stdout, stderr = client.exec_command("docker ps --format '{{.Names}}' | grep 'dashboard-middleware'")
        container = stdout.read().decode('utf-8').strip()
        if not container:
            print("Erro: container dashboard-middleware não encontrado.")
            return

        js_code = """
const { Pool } = require('pg');
const p = new Pool({
  host: process.env.PG_HOST || 'localhost',
  user: process.env.PG_USER || 'nexus_admin',
  password: process.env.PG_PASSWORD || 'NexusDB2026Prod',
  database: process.env.PG_DATABASE || 'nexus_dashboard',
  port: 5432
});

p.query(`
  SELECT id_firebird, numero_pedido, status, valor_total::float, data_venda::text, tenant_id
  FROM dash_vendas
  WHERE UPPER(TRIM(status)) LIKE '%DEVOL%'
  LIMIT 10
`).then(r => {
  console.log('ROWS:' + JSON.stringify(r.rows));
  p.end();
}).catch(e => {
  console.error('ERROR:' + e.message);
  p.end();
});
"""
        temp_file = '/tmp/check_devolucoes.js'
        sftp = client.open_sftp()
        with sftp.file(temp_file, 'w') as f:
            f.write(js_code)

        client.exec_command(f"docker cp {temp_file} {container}:/usr/src/app/check_devolucoes.js")
        stdin, stdout, stderr = client.exec_command(f"docker exec {container} node /usr/src/app/check_devolucoes.js")
        result = stdout.read().decode('utf-8')
        print(result)

        client.exec_command(f"rm {temp_file}")
        client.exec_command(f"docker exec {container} rm /usr/src/app/check_devolucoes.js")

    except Exception as e:
        print(f"Erro: {e}")
    finally:
        client.close()

if __name__ == '__main__':
    main()
