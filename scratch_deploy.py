import paramiko
import os

def deploy():
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

        # Descobre o container atual do middleware (dinamicamente)
        status, out, err = run_cmd("docker ps --format '{{.Names}}' | grep 'dashboard-middleware'")
        if status != 0 or not out.strip():
            print("Erro ao encontrar container do middleware:", err)
            return
        container = out.strip().split('\n')[0]
        print(f"Usando container middleware: {container}")

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

        # 2. Copiar todas as rotas da pasta local middleware/src/routes em binário
        routes_dir = 'middleware/src/routes'
        route_files = [f for f in os.listdir(routes_dir) if f.endswith('.js') and not f.startswith('.')]
        
        print(f"Encontrados {len(route_files)} arquivos de rotas locais para copiar...")
        for filename in route_files:
            local_file_path = os.path.join(routes_dir, filename)
            remote_temp_path = f'/tmp/{filename}'
            
            # Ler local em binário
            with open(local_file_path, 'rb') as f:
                route_content = f.read()
                
            # Gravar no host em binário
            with sftp.file(remote_temp_path, 'wb') as f:
                f.write(route_content)
                
            # Copiar do host para o container
            status, out, err = run_cmd(f"docker cp {remote_temp_path} {container}:/usr/src/app/src/routes/{filename}")
            if status != 0:
                print(f"Erro ao copiar {filename}:", err)
            run_cmd(f"rm {remote_temp_path}")
            print(f"Copiado: {filename}")

        # 2c. Copiar todos os utilitários da pasta local middleware/src/utils em binário
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

        # 2d. Copiar todos os serviços da pasta local middleware/src/services em binário
        services_dir = 'middleware/src/services'
        if os.path.exists(services_dir):
            services_files = [f for f in os.listdir(services_dir) if f.endswith('.js') and not f.startswith('.')]
            print(f"Encontrados {len(services_files)} arquivos de serviços locais para copiar...")
            for filename in services_files:
                local_file_path = os.path.join(services_dir, filename)
                remote_temp_path = f'/tmp/{filename}'
                with open(local_file_path, 'rb') as f:
                    services_content = f.read()
                with sftp.file(remote_temp_path, 'wb') as f:
                    f.write(services_content)
                status, out, err = run_cmd(f"docker cp {remote_temp_path} {container}:/usr/src/app/src/services/{filename}")
                if status != 0:
                    print(f"Erro ao copiar serviço {filename}:", err)
                run_cmd(f"rm {remote_temp_path}")
                print(f"Copiado serviço: {filename}")

        # 2e. Copiar todos os middlewares da pasta local middleware/src/middleware em binário
        mw_dir = 'middleware/src/middleware'
        if os.path.exists(mw_dir):
            mw_files = [f for f in os.listdir(mw_dir) if f.endswith('.js') and not f.startswith('.')]
            print(f"Encontrados {len(mw_files)} arquivos de middleware locais para copiar...")
            for filename in mw_files:
                local_file_path = os.path.join(mw_dir, filename)
                remote_temp_path = f'/tmp/{filename}'
                with open(local_file_path, 'rb') as f:
                    mw_content = f.read()
                with sftp.file(remote_temp_path, 'wb') as f:
                    f.write(mw_content)
                status, out, err = run_cmd(f"docker cp {remote_temp_path} {container}:/usr/src/app/src/middleware/{filename}")
                if status != 0:
                    print(f"Erro ao copiar middleware {filename}:", err)
                run_cmd(f"rm {remote_temp_path}")
                print(f"Copiado middleware: {filename}")

        # 2f. Copiar app.js principal
        app_js_path = 'middleware/src/app.js'
        if os.path.exists(app_js_path):
            with open(app_js_path, 'rb') as f:
                app_js_content = f.read()
            with sftp.file('/tmp/app.js', 'wb') as f:
                f.write(app_js_content)
            run_cmd(f"docker cp /tmp/app.js {container}:/usr/src/app/src/app.js")
            run_cmd(f"rm /tmp/app.js")
            print("Copiado app.js principal")

        # 2b. Copiar todas as migrações da pasta local middleware/src/db/migrations
        migrations_dir = 'middleware/src/db/migrations'
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
        print("Reiniciando o container middleware...")
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
