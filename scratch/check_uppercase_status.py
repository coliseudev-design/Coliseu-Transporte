import paramiko
import json

def check_uppercase():
    host = '177.39.17.7'
    user = 'root'
    password = '6EFBC!c0:wzr%Ij'

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    try:
        print("Conectando ao VPS...")
        client.connect(host, username=user, password=password)

        print("Buscando o container dashboard-middleware...")
        stdin, stdout, stderr = client.exec_command("docker ps --format '{{.Names}}' | grep 'dashboard-middleware'")
        container = stdout.read().decode('utf-8').strip()
        if not container:
            print("Erro: container dashboard-middleware não encontrado.")
            return

        print(f"Container encontrado: {container}")

        # 1. Verificar se a rota de clientes no container tem a lógica de uppercase
        print("\n=== Verificando o código no Container ===")
        cmd_grep = f"docker exec {container} grep -n 'toUpperCase' /usr/src/app/src/routes/clientes.js"
        stdin, stdout, stderr = client.exec_command(cmd_grep)
        grep_res = stdout.read().decode('utf-8').strip()
        if grep_res:
            print("Lógica toUpperCase encontrada no arquivo clientes.js do container:")
            print(grep_res)
        else:
            print("ATENÇÃO: Lógica toUpperCase NÃO encontrada em clientes.js no container! O código pode não estar deployado.")

        # 2. Verificar se a rota de sync no container tem a lógica de uppercase
        cmd_grep_sync = f"docker exec {container} grep -n 'toUpperCase' /usr/src/app/src/routes/sync.js"
        stdin, stdout, stderr = client.exec_command(cmd_grep_sync)
        grep_sync_res = stdout.read().decode('utf-8').strip()
        if grep_sync_res:
            print("\nLógica toUpperCase encontrada no arquivo sync.js do container:")
            print(grep_sync_res)
        else:
            print("\nATENÇÃO: Lógica toUpperCase NÃO encontrada em sync.js no container!")

        # 3. Executar query SQL para verificar se há registros minúsculos no banco de dados
        print("\n=== Verificando o Banco de Dados (PostgreSQL) ===")
        
        js_query = """
const { Pool } = require('pg');
const p = new Pool({
  host: process.env.PG_HOST || 'localhost',
  user: process.env.PG_USER || 'nexus_admin',
  password: process.env.PG_PASSWORD || 'NexusDB2026Prod',
  database: process.env.PG_DATABASE || 'nexus_dashboard',
  port: parseInt(process.env.PG_PORT || 5432),
  connectionTimeoutMillis: 5000
});

async function run() {
  try {
    // Total de clientes
    const totalRes = await p.query('SELECT COUNT(*) as count FROM dash_clientes');
    const total = totalRes.rows[0].count;
    
    // Clientes que possuem pelo menos um campo textual com letras minúsculas
    // Usamos regex ou comparação simples para detectar minúsculas.
    // [a-z] ou [áàâãéèêíïóôõöúç] etc.
    const lowercaseRes = await p.query(`
      SELECT COUNT(*) as count 
      FROM dash_clientes 
      WHERE nome ~ '[a-z]' 
         OR cidade ~ '[a-z]' 
         OR responsavel_nome ~ '[a-z]' 
         OR regime_tributario ~ '[a-z]'
         OR endereco_completo ~ '[a-z]'
         OR observacoes ~ '[a-z]'
    `);
    const lowercaseCount = lowercaseRes.rows[0].count;

    // Amostra de clientes (últimos 5 adicionados ou atualizados)
    const sampleRes = await p.query('SELECT id, nome, cidade, estado, responsavel_nome, ativo FROM dash_clientes ORDER BY id DESC LIMIT 5');
    
    console.log(JSON.stringify({
      success: true,
      total: parseInt(total),
      lowercaseCount: parseInt(lowercaseCount),
      sample: sampleRes.rows
    }));
  } catch (err) {
    console.log(JSON.stringify({ success: false, error: err.message }));
  } finally {
    p.end();
  }
}
run();
"""
        # Salva o arquivo temporário localmente, copia para o container e executa
        temp_js_path = '/tmp/check_uppercase_db.js'
        sftp = client.open_sftp()
        with sftp.file(temp_js_path, 'w') as f:
            f.write(js_query)
        sftp.close()

        client.exec_command(f"docker cp {temp_js_path} {container}:/usr/src/app/check_uppercase_db.js")
        
        stdin, stdout, stderr = client.exec_command(f"docker exec {container} node /usr/src/app/check_uppercase_db.js")
        output = stdout.read().decode('utf-8').strip()
        
        # Limpeza
        client.exec_command(f"rm {temp_js_path}")
        client.exec_command(f"docker exec {container} rm /usr/src/app/check_uppercase_db.js")

        if output:
            try:
                res = json.loads(output)
                if res.get('success'):
                    print(f"Total de clientes cadastrados: {res['total']}")
                    print(f"Clientes com campos ainda minúsculos: {res['lowercaseCount']}")
                    if res['lowercaseCount'] > 0:
                        print("Aviso: Há registros com caracteres minúsculos no banco de dados!")
                    else:
                        print("Excelente! Todos os registros estão totalmente em CAIXA ALTA (sem minúsculas nos campos principais).")
                    
                    print("\nAmostra dos últimos 5 clientes no banco:")
                    for idx, c in enumerate(res['sample']):
                        print(f"  {idx+1}. ID: {c['id']} | Nome: '{c['nome']}' | Cidade: '{c['cidade']}' | Responsável: '{c['responsavel_nome']}'")
                else:
                    print(f"Erro na query do banco de dados: {res.get('error')}")
            except Exception as parse_err:
                print("Não foi possível decodificar a saída do script:")
                print(output)
        else:
            print("Nenhum retorno recebido da execução do script JS no container.")

    except Exception as e:
        print(f"Erro na conexão/execução: {e}")
    finally:
        client.close()

if __name__ == '__main__':
    check_uppercase()
