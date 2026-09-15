import fdb
conn = fdb.connect(dsn='localhost:C:/Nexus/Data/KSTRATOR.FDB', user='SYSDBA', password='masterkey')
c = conn.cursor()
c.execute("SELECT VALOR_PEDIDO, VALOR_FRETE FROM PEDIDOS WHERE ID_PEDIDO=22204")
print("PEDIDO:", c.fetchone())

c.execute("SELECT SUM(VALOR_TOTAL) FROM PEDIDO_ITENS WHERE ID_PEDIDO=22204")
print("SUM ITENS:", c.fetchone())
