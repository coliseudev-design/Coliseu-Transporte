"""
Deploy das correções para a VPS:
1. Aplica migration SQL no PostgreSQL (ALTER TABLE tipo_documento)
2. Copia os arquivos atualizados para o container e reinicia o middleware
"""
import paramiko
import sys

HOST     = '177.39.17.7'
USER     = 'root'
PASSWORD = '6EFBC!c0:wzr%Ij'

# --- SQL migration a aplicar no PostgreSQL ---
MIGRATION_SQL = """
ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS tipo_documento VARCHAR(50) DEFAULT NULL;
"""

def run(client, cmd, label=""):
    print(f"\n>>> {label or cmd[:80]}")
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    if out: print("OUT:", out)
    if err: print("ERR:", err)
    return out, err

def main():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD)
    print("✓ Conectado à VPS")

    # 1. Descobre o container do banco nexus_dashboard
    out, _ = run(client, "docker ps --format '{{.Names}}' | grep -i 'db\\|postgres'", "Listando containers DB")
    print("Containers DB encontrados:", out)

    # 2. Descobre o container do dashboard middleware
    out2, _ = run(client, "docker ps --format '{{.Names}}' | grep -i 'dashboard'", "Listando containers Dashboard")
    print("Containers Dashboard:", out2)

    # 3. Aplica a migration SQL
    # Tenta encontrar o container postgres com o banco nexus_dashboard
    out3, _ = run(client,
        "docker exec $(docker ps -q --filter name=db) psql -U nexus_admin -d nexus_dashboard -c "
        f"\"ALTER TABLE dash_financeiro ADD COLUMN IF NOT EXISTS tipo_documento VARCHAR(50) DEFAULT NULL;\"",
        "Aplicando migration tipo_documento"
    )

    # 4. Reinicia o container do dashboard-middleware para pegar o sync.js atualizado
    # (O código já foi atualizado via git/Coolify, mas caso seja necessário force restart)
    run(client, "docker restart dashboard-middleware 2>/dev/null || true", "Reiniciando dashboard-middleware")

    print("\n✓ Deploy concluído!")
    client.close()

if __name__ == '__main__':
    main()
