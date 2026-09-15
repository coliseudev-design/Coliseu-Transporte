import fdb
conn = fdb.connect(dsn='localhost:C:/Nexus/Data/KSTRATOR.FDB', user='SYSDBA', password='masterkey')
c = conn.cursor()
c.execute("SELECT FIRST 1 * FROM PEDIDOS ORDER BY ID_PEDIDO DESC")
print([d[0] for d in c.description])
