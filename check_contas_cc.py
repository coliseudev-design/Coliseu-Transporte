import fdb
conn = fdb.connect(dsn='localhost:C:/Nexus/Data/PIVETA.FDB', user='SYSDBA', password='masterkey')
c = conn.cursor()
# Check CONTAS columns related to centro de custo
c.execute("SELECT FIRST 5 ID_CONTA, DC, ID_CLIENTE, VALOR, DATA_EMISSAO, DATA_VENCIMENTO FROM CONTAS WHERE DATA_EMISSAO >= '2026-01-01' ORDER BY ID_CONTA DESC")
print("CONTAS sample:")
for r in c.fetchall():
    print(r)

# Check if there's a centro de custo column
c.execute("SELECT FIRST 1 * FROM CONTAS")
cols = [d[0] for d in c.description]
cc_cols = [col for col in cols if 'CENTR' in col or 'CUSTO' in col or 'DEPTO' in col or 'CC' in col]
print("\nColunas com centro/custo/depto/cc:", cc_cols)
print("\nTODAS as colunas:", cols)
