import fdb
conn = fdb.connect(dsn='localhost:C:/Nexus/Data/KSTRATOR.FDB', user='SYSDBA', password='masterkey')
c = conn.cursor()
c.execute("SELECT TRIM(RDB$FIELD_NAME) FROM RDB$RELATION_FIELDS WHERE RDB$RELATION_NAME = 'CONTAS' AND RDB$FIELD_NAME LIKE '%CENTRO%'")
print(c.fetchall())
