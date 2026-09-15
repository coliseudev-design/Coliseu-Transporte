import fdb
conn = fdb.connect(dsn='localhost:C:/Nexus/Data/KSTRATOR.FDB', user='SYSDBA', password='masterkey')
c = conn.cursor()
c.execute("SELECT ID_PEDIDO, VALOR_PEDIDO, VALOR_FRETE, VALOR_DESCONTO, VALOR_ACRESCIMO, OUTRAS_DESPESAS FROM PEDIDOS WHERE VALOR_FRETE > 0 OR VALOR_DESCONTO > 0 ROWS 5")
for r in c.fetchall():
    print(r)
    
c.execute("SELECT ID_PEDIDO, SUM(VALOR_TOTAL) FROM PEDIDO_ITENS WHERE ID_PEDIDO IN (SELECT FIRST 5 ID_PEDIDO FROM PEDIDOS WHERE VALOR_FRETE > 0 OR VALOR_DESCONTO > 0) GROUP BY ID_PEDIDO")
print("ITENS:")
for r in c.fetchall():
    print(r)
