import paramiko

def check_frontend():
    host = '177.39.17.7'
    user = 'root'
    password = '6EFBC!c0:wzr%Ij'

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    try:
        print("Conectando ao VPS...")
        client.connect(host, username=user, password=password)

        print("Buscando o container dashboard-frontend...")
        stdin, stdout, stderr = client.exec_command("docker ps --format '{{.Names}}' | grep 'dashboard-frontend'")
        container = stdout.read().decode('utf-8').strip()
        if not container:
            print("Erro: container dashboard-frontend não encontrado.")
            return

        print(f"Container encontrado: {container}")

        # Busca pela string específica do commit
        print("\n=== Verificando arquivos JS compilados no Frontend ===")
        cmd_search = f"docker exec {container} sh -c 'grep -rn \"DADOS IMPORTADOS VIA CONSULTA DE CNPJ AUTOMÁTICA\" /usr/share/nginx/html/assets/ 2>/dev/null'"
        stdin, stdout, stderr = client.exec_command(cmd_search)
        search_res = stdout.read().decode('utf-8').strip()
        if search_res:
            print("Sucesso: A string em caixa alta foi encontrada!")
            print(search_res[:300] + ("..." if len(search_res) > 300 else ""))
        else:
            print("Aviso: A string em caixa alta NÃO foi encontrada. O frontend antigo (com minúsculas) pode estar rodando.")

    except Exception as e:
        print(f"Erro na conexão/execução: {e}")
    finally:
        client.close()

if __name__ == '__main__':
    check_frontend()
