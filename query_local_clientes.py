import fdb

try:
    conn = fdb.connect(dsn='localhost:C:/Coliseu/Data/PIVETA.FDB', user='SYSDBA', password='masterkey')
    c = conn.cursor()
    
    print("=== CHECKING LOCAL DASH_CLIENTES FOR 5746 ===")
    c.execute("SELECT * FROM DASH_CLIENTES WHERE id_firebird = 5746")
    rows = c.fetchall()
    print("DASH_CLIENTES with ID 5746:", rows)

    c.execute("SELECT FIRST 5 * FROM DASH_CLIENTES ORDER BY id_firebird DESC")
    print("Recent DASH_CLIENTES:", c.fetchall())

    c.execute("SELECT COUNT(*) FROM DASH_CLIENTES")
    print("Total DASH_CLIENTES:", c.fetchone()[0])

except Exception as e:
    print("Error:", e)
