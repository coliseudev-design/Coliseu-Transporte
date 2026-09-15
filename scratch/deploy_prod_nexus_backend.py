import paramiko
import os

def deploy():
    host = '2.24.82.19'
    user = 'root'
    password = 'Col@13894645'

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        print("Conectando ao servidor SSH da Producao...")
        client.connect(host, username=user, password=password)

        sftp = client.open_sftp()

        def run_cmd(cmd_str):
            stdin, stdout, stderr = client.exec_command(cmd_str)
            out_val = stdout.read().decode('utf-8')
            err_val = stderr.read().decode('utf-8')
            status = stdout.channel.recv_exit_status()
            return status, out_val, err_val

        # Descobre o container atual do nexus-middleware (dinamicamente)
        status, out, err = run_cmd("docker ps --format '{{.Names}}' | grep 'nexus-middleware'")
        if status != 0 or not out.strip():
            print("Erro ao encontrar container do nexus-middleware:", err)
            return
        container = out.strip().split('\n')[0]
        print(f"Usando container middleware de producao: {container}")

        # CRITICAL: Create backup of routes, utils, and root entry files inside the container
        print("Criando backup dos arquivos existentes no contêiner de producao...")
        run_cmd(f"docker exec {container} mkdir -p /usr/src/app/src/backup_pre_deploy")
        run_cmd(f"docker exec {container} cp -r /usr/src/app/src/routes /usr/src/app/src/backup_pre_deploy/routes_backup")
        run_cmd(f"docker exec {container} cp -r /usr/src/app/src/utils /usr/src/app/src/backup_pre_deploy/utils_backup")
        run_cmd(f"docker exec {container} cp /usr/src/app/src/app.js /usr/src/app/src/backup_pre_deploy/app.js")
        run_cmd(f"docker exec {container} cp /usr/src/app/src/index.js /usr/src/app/src/backup_pre_deploy/index.js")
        print("Backup completo realizado com sucesso dentro do contêiner!")

        # 1. Copiar app.js em binário
        print("Lendo local app.js...")
        with open('middleware/src/app.js', 'rb') as f:
            app_content = f.read()
        
        print("Gravando app.js no container...")
        temp_path = '/tmp/app.js'
        with sftp.file(temp_path, 'wb') as f:
            f.write(app_content)
        
        status, out, err = run_cmd(f"docker cp {temp_path} {container}:/usr/src/app/src/app.js")
        if status != 0:
            print("Erro ao copiar app.js:", err)
        run_cmd(f"rm {temp_path}")

        # 1b. Copiar index.js em binário
        print("Lendo local index.js...")
        with open('middleware/src/index.js', 'rb') as f:
            index_content = f.read()
        
        print("Gravando index.js no container...")
        temp_path_idx = '/tmp/index.js'
        with sftp.file(temp_path_idx, 'wb') as f:
            f.write(index_content)
        
        status, out, err = run_cmd(f"docker cp {temp_path_idx} {container}:/usr/src/app/src/index.js")
        if status != 0:
            print("Erro ao copiar index.js:", err)
        run_cmd(f"rm {temp_path_idx}")

        # 1c. Copiar db/postgres.js em binário
        print("Lendo local db/postgres.js...")
        with open('middleware/src/db/postgres.js', 'rb') as f:
            pg_content = f.read()
        
        print("Gravando postgres.js no container...")
        temp_path_pg = '/tmp/postgres.js'
        with sftp.file(temp_path_pg, 'wb') as f:
            f.write(pg_content)
        
        status, out, err = run_cmd(f"docker cp {temp_path_pg} {container}:/usr/src/app/src/db/postgres.js")
        if status != 0:
            print("Erro ao copiar postgres.js:", err)
        run_cmd(f"rm {temp_path_pg}")

        # 2. Copiar todas as rotas da pasta local middleware/src/routes em binário
        routes_dir = 'middleware/src/routes'
        route_files = [f for f in os.listdir(routes_dir) if f.endswith('.js') and not f.startswith('.')]
        
        print(f"Encontrados {len(route_files)} arquivos de rotas locais para copiar...")
        for filename in route_files:
            local_file_path = os.path.join(routes_dir, filename)
            remote_temp_path = f'/tmp/{filename}'
            
            with open(local_file_path, 'rb') as f:
                route_content = f.read()
                
            with sftp.file(remote_temp_path, 'wb') as f:
                f.write(route_content)
                
            status, out, err = run_cmd(f"docker cp {remote_temp_path} {container}:/usr/src/app/src/routes/{filename}")
            if status != 0:
                print(f"Erro ao copiar {filename}:", err)
            run_cmd(f"rm {remote_temp_path}")
            print(f"Copiado: {filename}")

        # 2b. Copiar todas as rotas da pasta local middleware/src/utils em binário
        utils_dir = 'middleware/src/utils'
        utils_files = [f for f in os.listdir(utils_dir) if f.endswith('.js') and not f.startswith('.')]
        
        print(f"Encontrados {len(utils_files)} arquivos de utilitários locais para copiar...")
        for filename in utils_files:
            local_file_path = os.path.join(utils_dir, filename)
            remote_temp_path = f'/tmp/{filename}'
            
            with open(local_file_path, 'rb') as f:
                utils_content = f.read()
                
            with sftp.file(remote_temp_path, 'wb') as f:
                f.write(utils_content)
                
            status, out, err = run_cmd(f"docker cp {remote_temp_path} {container}:/usr/src/app/src/utils/{filename}")
            if status != 0:
                print(f"Erro ao copiar utilitário {filename}:", err)
            run_cmd(f"rm {remote_temp_path}")
            print(f"Copiado utilitário: {filename}")

        # 2c. Copiar todas as migrações da pasta local middleware/src/db/migrations
        migrations_dir = 'middleware/src/db/migrations'
        migration_files = []
        if os.path.exists(migrations_dir):
            migration_files = [f for f in os.listdir(migrations_dir) if f.endswith('.sql') and not f.startswith('.')]
        
        print(f"Encontrados {len(migration_files)} arquivos de migração locais para copiar...")
        for filename in migration_files:
            local_file_path = os.path.join(migrations_dir, filename)
            remote_temp_path = f'/tmp/{filename}'
            
            with open(local_file_path, 'rb') as f:
                mig_content = f.read()
                
            with sftp.file(remote_temp_path, 'wb') as f:
                f.write(mig_content)
                
            status, out, err = run_cmd(f"docker cp {remote_temp_path} {container}:/usr/src/app/src/db/migrations/{filename}")
            if status != 0:
                print(f"Erro ao copiar migração {filename}:", err)
            run_cmd(f"rm {remote_temp_path}")
            print(f"Copiada migração: {filename}")

        sftp.close()

        # 3. Reiniciar container
        print("Reiniciando o container middleware de producao...")
        status, out, err = run_cmd(f"docker restart {container}")
        print("Container reiniciado:", out.strip())
        
        # 4. Verificar logs
        print("Aguardando 3 segundos...")
        import time
        time.sleep(3)
        status, out, err = run_cmd(f"docker logs {container} --tail 15")
        print("Logs do container:")
        print(out)

    except Exception as e:
        print("Erro durante o deploy:", e)
    finally:
        client.close()

if __name__ == '__main__':
    deploy()
