import fdb
conn = fdb.connect(dsn='localhost:C:/Nexus/Data/PIVETA.FDB', user='SYSDBA', password='masterkey')
c = conn.cursor()
# Check ID_CC values in CONTAS
c.execute("SELECT ID_CC, COUNT(*) FROM CONTAS WHERE DATA_EMISSAO >= '2026-01-01' GROUP BY ID_CC ORDER BY 2 DESC")
print("ID_CC distribution (2026):")
for r in c.fetchall():
    print(f"  CC={r[0]} -> {r[1]} registros")

# Check ID_DEPTO values in CONTAS
c.execute("SELECT ID_DEPTO, COUNT(*) FROM CONTAS WHERE DATA_EMISSAO >= '2026-01-01' GROUP BY ID_DEPTO ORDER BY 2 DESC")
print("\nID_DEPTO distribution (2026):")
for r in c.fetchall():
    print(f"  DEPTO={r[0]} -> {r[1]} registros")

# Check ID_DEPTO values in PEDIDOS
c.execute("SELECT ID_DEPTO, COUNT(*) FROM PEDIDOS WHERE DATA_HORA >= '2026-01-01' AND STATUS=2 GROUP BY ID_DEPTO ORDER BY 2 DESC")
print("\nID_DEPTO PEDIDOS (2026, FATURADO):")
for r in c.fetchall():
    print(f"  DEPTO={r[0]} -> {r[1]} registros")
