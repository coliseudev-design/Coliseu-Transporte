#!/usr/bin/env python3
"""
apply_migration.py - Aplicador de Migracoes Controlado
Nexusboard - Migracao 001: Filtro por Filial/Departamento

Uso:
  python apply_migration.py --local      # Aplica no Postgres LOCAL (porta 5433)

NOTA: A migracao na producao e aplicada AUTOMATICAMENTE pelo middleware
no startup (index.js). Basta fazer um redeploy no Coolify.
"""

import argparse
import os
import sys


def apply_local():
    """Aplica a migracao no banco PostgreSQL LOCAL (docker-compose.local.yml)"""
    import psycopg2

    CONN = {
        "host": "localhost",
        "port": 5433,
        "database": "nexus_dashboard_local",
        "user": "nexus_admin",
        "password": "nexus_local_test_2026"
    }

    migration_file = os.path.join(
        os.path.dirname(__file__),
        "middleware", "src", "db", "migrations", "001_add_depto_filial.sql"
    )

    print("Conectando ao PostgreSQL LOCAL (porta 5433)...")
    try:
        conn = psycopg2.connect(**CONN)
        conn.autocommit = True
        cur = conn.cursor()

        print(f"Lendo migracao: {migration_file}")
        with open(migration_file, "r", encoding="utf-8") as f:
            sql = f.read()

        print("Aplicando 001_add_depto_filial.sql...")
        cur.execute(sql)

        cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='dash_vendas' AND column_name='depto_id'")
        print("OK: dash_vendas.depto_id" if cur.fetchone() else "FALHOU: dash_vendas.depto_id")

        cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='dash_financeiro' AND column_name='depto_id'")
        print("OK: dash_financeiro.depto_id" if cur.fetchone() else "FALHOU: dash_financeiro.depto_id")

        cur.execute("SELECT table_name FROM information_schema.tables WHERE table_name='dash_filiais'")
        print("OK: dash_filiais" if cur.fetchone() else "FALHOU: dash_filiais")

        cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='dash_usuarios' AND column_name='filial_acesso'")
        print("OK: dash_usuarios.filial_acesso" if cur.fetchone() else "FALHOU: dash_usuarios.filial_acesso")

        cur.close()
        conn.close()
        print("\nMigracao LOCAL aplicada com sucesso!")

    except Exception as e:
        print(f"\nERRO: {e}")
        print("Verifique se o docker-compose.local.yml esta rodando.")
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Aplicador de Migracao: Filtro por Filial")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--local", action="store_true", help="Aplica no banco LOCAL")
    args = parser.parse_args()

    if args.local:
        apply_local()
