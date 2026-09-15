import psycopg2
import sys

try:
    conn = psycopg2.connect("postgresql://postgres:0r0E6oV!qG3h@2.24.82.19:5432/nexusdash")
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM dash_financeiro")
    print(f"Total dash_financeiro: {cur.fetchone()[0]}")
    
    cur.execute("SELECT COUNT(*) FROM dash_vendas")
    print(f"Total dash_vendas: {cur.fetchone()[0]}")
    
    cur.execute("SELECT MAX(data_emissao), MAX(data_vencimento), MAX(data_pagamento) FROM dash_financeiro")
    print(f"Dates: {cur.fetchone()}")
    
    cur.execute("SELECT * FROM dash_financeiro LIMIT 1")
    row = cur.fetchone()
    print(f"Sample row: {row}")
except Exception as e:
    print(e)
