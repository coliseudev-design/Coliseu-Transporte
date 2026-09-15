import fdb
conn = fdb.connect(dsn='localhost:C:/Nexus/Data/PIVETA.FDB', user='SYSDBA', password='masterkey')
c = conn.cursor()
c.execute("SELECT RDB$VIEW_SOURCE FROM RDB$RELATIONS WHERE RDB$RELATION_NAME = 'DASH_VENDAS'")
res = c.fetchone()
if res:
    print(res[0])
else:
    print("VIEW NAO ENCONTRADA")
