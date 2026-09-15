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
try:
    cur.execute("SELECT FIRST 1 * FROM PRODUTOS")
    desc = cur.description
    print("PRODUTOS Columns: ", [d[0] for d in desc])
except Exception as e:
    print(e)
conn.close()
