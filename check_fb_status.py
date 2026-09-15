import fdb
conn = fdb.connect(dsn='localhost:C:/Nexus/Data/KSTRATOR.FDB', user='SYSDBA', password='masterkey')
c = conn.cursor()
c.execute("SELECT STATUS, COUNT(*) FROM PEDIDOS WHERE DATA_HORA >= '2026-04-27' GROUP BY STATUS")
print(c.fetchall())
