import paramiko
import os
import tarfile
import tempfile

def deploy_frontend():
    host = '177.39.17.7'
    user = 'root'
    password = '6EFBC!c0:wzr%Ij'

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        print("Conectando ao servidor SSH...")
        client.connect(host, username=user, password=password)

        sftp = client.open_sftp()

        def run_cmd(cmd_str):
            stdin, stdout, stderr = client.exec_command(cmd_str)
            out_val = stdout.read().decode('utf-8')
            err_val = stderr.read().decode('utf-8')
            status = stdout.channel.recv_exit_status()
            return status, out_val, err_val

        # 1. Encontrar o container do frontend dinamicamente
        status, out, err = run_cmd("docker ps --format '{{.Names}}' | grep 'dashboard-frontend'")
        if status != 0 or not out.strip():
            print("Erro ao encontrar container do frontend:", err)
            return
        container = out.strip().split('\n')[0]
        print(f"Usando container frontend: {container}")

        # 2. Criar tar.gz local da pasta frontend sem node_modules e dist
        print("Compactando pasta frontend localmente...")
        temp_tar = tempfile.mktemp(suffix=".tar.gz")
        with tarfile.open(temp_tar, "w:gz") as tar:
            for root, dirs, files in os.walk("frontend"):
                # Ignorar node_modules e dist
                if "node_modules" in dirs:
                    dirs.remove("node_modules")
                if "dist" in dirs:
                    dirs.remove("dist")
                for file in files:
                    local_path = os.path.join(root, file)
                    # Caminho relativo para ficar com a pasta frontend na raiz do tar
                    tar.add(local_path, arcname=os.path.relpath(local_path, "."))

        # 3. Upload do tar.gz para o VPS
        print("Enviando arquivo compactado para o VPS...")
        remote_tar = "/tmp/frontend.tar.gz"
        sftp.put(temp_tar, remote_tar)
        os.remove(temp_tar)

        # 4. Extrair e compilar no VPS usando container do Node
        print("Limpando pasta temporária de compilação no VPS...")
        run_cmd("rm -rf /tmp/frontend_build")
        run_cmd("mkdir -p /tmp/frontend_build")
        
        print("Extraindo arquivos no VPS...")
        run_cmd(f"tar -xzf {remote_tar} -C /tmp/frontend_build")
        run_cmd(f"rm {remote_tar}")

        # O tar extrai como frontend/... então a raiz está em /tmp/frontend_build/frontend
        print("Executando compilação (npm install && npm run build) dentro do container do Node 20 no VPS...")
        build_cmd = (
            "docker run --rm "
            "-v /tmp/frontend_build/frontend:/app "
            "-w /app "
            "node:20-alpine "
            "sh -c 'npm install && npm run build'"
        )
        print("Isso pode levar alguns minutos...")
        status, out, err = run_cmd(build_cmd)
        print("Saída do build:", out)
        if status != 0:
            print("Erro durante a compilação do frontend:", err)
            return

        # 5. Copiar o resultado para o container Nginx
        print("Copiando arquivos compilados para o container Nginx...")
        # Limpar pasta antiga de assets no container
        run_cmd(f"docker exec {container} sh -c 'rm -rf /usr/share/nginx/html/assets/*'")
        # Copiar nova build
        status, out, err = run_cmd(f"docker cp /tmp/frontend_build/frontend/dist/. {container}:/usr/share/nginx/html/")
        if status != 0:
            print("Erro ao copiar arquivos para o container:", err)
            return
        
        # 6. Limpar pasta temporária no VPS
        print("Limpando arquivos temporários no VPS...")
        run_cmd("rm -rf /tmp/frontend_build")

        print("Frontend atualizado com sucesso no container!")

    except Exception as e:
        print("Erro durante a publicação:", e)
    finally:
        client.close()

if __name__ == '__main__':
    deploy_frontend()
