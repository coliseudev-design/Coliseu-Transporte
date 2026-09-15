import paramiko
import os
import tarfile
import tempfile

def deploy_frontend():
    host = '2.24.82.19'
    user = 'root'
    password = 'Col@13894645'

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        print("Conectando ao servidor SSH de producao...")
        client.connect(host, username=user, password=password)

        sftp = client.open_sftp()

        def run_cmd(cmd_str):
            stdin, stdout, stderr = client.exec_command(cmd_str)
            out_val = stdout.read().decode('utf-8')
            err_val = stderr.read().decode('utf-8')
            status = stdout.channel.recv_exit_status()
            return status, out_val, err_val

        # 1. Encontrar o container do frontend de producao dinamicamente
        # Queremos o container 'dashboard-frontend' que responda por nexus.coliseusistemas.com.br
        status, out, err = run_cmd("docker ps -q")
        if status != 0 or not out.strip():
            print("Erro ao listar containers:", err)
            return
        container_ids = out.strip().split()
        
        container = None
        for cid in container_ids:
            # Pegar inspect
            status_insp, out_insp, err_insp = run_cmd(f"docker inspect --format '{{{{.Name}}}}\t{{{{range $k, $v := .Config.Labels}}}}{{{{if contains $v \"nexus.coliseusistemas.com.br\"}}}}{{{{$v}}}}{{{{end}}}}{{{{end}}}}' {cid}")
            if "nexus.coliseusistemas.com.br" in out_insp:
                # O nome vem como /nome-do-container
                container = out_insp.split()[0].replace('/', '').strip()
                break
                
        if not container:
            # Fallback para grep se o format falhar
            status, out, err = run_cmd("docker ps --format '{{.Names}}' | grep 'dashboard-frontend-br0y0d05a1fq8fpwppb3y5bb'")
            if status == 0 and out.strip():
                container = out.strip().split('\n')[0]
                
        if not container:
            print("Erro ao encontrar container do frontend de producao da nexus.")
            return
            
        print(f"Usando container frontend de producao: {container}")

        # 2. Criar tar.gz local da pasta frontend sem node_modules e dist
        print("Compactando pasta frontend localmente...")
        temp_tar = tempfile.mktemp(suffix=".tar.gz")
        with tarfile.open(temp_tar, "w:gz") as tar:
            for root, dirs, files in os.walk("frontend"):
                if "node_modules" in dirs:
                    dirs.remove("node_modules")
                if "dist" in dirs:
                    dirs.remove("dist")
                for file in files:
                    local_path = os.path.join(root, file)
                    tar.add(local_path, arcname=os.path.relpath(local_path, "."))

        # 3. Upload do tar.gz para o VPS
        print("Enviando arquivo compactado para o VPS...")
        remote_tar = "/tmp/frontend_nexus.tar.gz"
        sftp.put(temp_tar, remote_tar)
        os.remove(temp_tar)

        # 4. Extrair e compilar no VPS usando container do Node
        print("Limpando pasta temporária de compilação no VPS...")
        run_cmd("rm -rf /tmp/frontend_nexus_build")
        run_cmd("mkdir -p /tmp/frontend_nexus_build")
        
        print("Extraindo arquivos no VPS...")
        run_cmd(f"tar -xzf {remote_tar} -C /tmp/frontend_nexus_build")
        run_cmd(f"rm {remote_tar}")

        # Compilar
        print("Executando compilação (npm install && npm run build) dentro do container do Node 20 no VPS...")
        build_cmd = (
            "docker run --rm "
            "-v /tmp/frontend_nexus_build/frontend:/app "
            "-w /app "
            "node:20-alpine "
            "sh -c 'npm install && npm run build'"
        )
        print("Isso pode levar alguns minutos...")
        status, out, err = run_cmd(build_cmd)
        print("Saída do build:", out)
        if status != 0:
            print("Erro durante a compilação do frontend no VPS:", err)
            return

        # 5. Copiar o resultado para o container Nginx
        print("Copiando arquivos compilados para o container Nginx...")
        run_cmd(f"docker exec {container} sh -c 'rm -rf /usr/share/nginx/html/assets/*'")
        status, out, err = run_cmd(f"docker cp /tmp/frontend_nexus_build/frontend/dist/. {container}:/usr/share/nginx/html/")
        if status != 0:
            print("Erro ao copiar arquivos para o container:", err)
            return
        
        # 6. Limpar pasta temporária no VPS
        print("Limpando arquivos temporários no VPS...")
        run_cmd("rm -rf /tmp/frontend_nexus_build")

        print("Frontend de producao atualizado com sucesso no container!")

    except Exception as e:
        print("Erro durante a publicação:", e)
    finally:
        client.close()

if __name__ == '__main__':
    deploy_frontend()
