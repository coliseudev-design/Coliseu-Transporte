import fdb
conn = fdb.connect(dsn='localhost:C:/Nexus/Data/KSTRATOR.FDB', user='SYSDBA', password='masterkey')
c = conn.cursor()
c.execute("SELECT TRIM(RDB$RELATION_NAME), TRIM(RDB$FIELD_NAME) FROM RDB$RELATION_FIELDS WHERE RDB$FIELD_NAME LIKE '%CENTRO%'")
for r in c.fetchall(): print(r)
