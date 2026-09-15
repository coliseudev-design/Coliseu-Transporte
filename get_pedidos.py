import fdb
conn = fdb.connect(dsn='localhost:C:/Nexus/Data/KSTRATOR.FDB', user='SYSDBA', password='masterkey')
c = conn.cursor()
c.execute("SELECT ID_PEDIDO, VALOR_PEDIDO, VALOR_FRETE, DESCONTO, VALOR_DESCONTO, ACRESCIMO, VALOR_ACRESCIMO FROM PEDIDOS WHERE ID_PEDIDO IN (529662, 529660, 529661)")
print("ID_PEDIDO, VALOR_PEDIDO, VALOR_FRETE, DESCONTO, VALOR_DESCONTO, ACRESCIMO, VALOR_ACRESCIMO")
for r in c.fetchall():
    print(r)
