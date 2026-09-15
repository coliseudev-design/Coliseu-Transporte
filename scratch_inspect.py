import fdb

conn = fdb.connect(
    host="localhost",
    port=3050,
    database=r"C:\PROJETOS COLISEU\Bancodedados\COMPENSADOSMAMA1203.FDB",
    user="SYSDBA",
    password="masterkey",
    charset="WIN1252"
)
cur = conn.cursor()

def get_cols(table):
    cur.execute(f"SELECT RDB$FIELD_NAME FROM RDB$RELATION_FIELDS WHERE RDB$RELATION_NAME = '{table.upper()}';")
    return [r[0].strip() for r in cur.fetchall()]

print("CLIENTES:", get_cols("CLIENTES"))
print("PRODUTOS:", get_cols("PRODUTOS"))
print("FUNCIONARIOS:", get_cols("FUNCIONARIOS"))
print("PEDIDOS:", get_cols("PEDIDOS"))
print("CONTAS:", get_cols("CONTAS"))

conn.close()
