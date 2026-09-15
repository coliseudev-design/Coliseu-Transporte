import fdb
conn = fdb.connect(dsn='localhost:C:/Nexus/Data/PIVETA.FDB', user='SYSDBA', password='masterkey')
c = conn.cursor()
c.execute("SELECT RDB$PROCEDURE_SOURCE FROM RDB$PROCEDURES WHERE RDB$PROCEDURE_NAME = 'MOB_CADASTRAR_PEDIDO_ITEM'")
print(c.fetchone()[0])
