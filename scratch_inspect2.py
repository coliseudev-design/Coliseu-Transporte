import fdb
import json

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

res = {
    "CLIENTES": get_cols("CLIENTES"),
    "PRODUTOS": get_cols("PRODUTOS"),
    "FUNCIONARIOS": get_cols("FUNCIONARIOS"),
    "PEDIDOS": get_cols("PEDIDOS"),
    "CONTAS": get_cols("CONTAS")
}

with open("scratch_mapping.json", "w") as f:
    json.dump(res, f, indent=4)

conn.close()
