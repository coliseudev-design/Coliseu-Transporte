import fdb

try:
    conn = fdb.connect(dsn='localhost:C:/Coliseu/Data/PIVETA.FDB', user='SYSDBA', password='masterkey')
    c = conn.cursor()
    
    print("=== CHECKING TABLE CONTAS ===")
    c.execute("SELECT FIRST 5 ID_CONTA, ID_PEDIDO, DESCRICAO, VALOR, DATA_EMISSAO, DATA_VENCIMENTO FROM CONTAS WHERE ID_CONTA = 371927")
    rows = c.fetchall()
    print("Contas with ID 371927:", rows)

    c.execute("SELECT MAX(ID_CONTA) FROM CONTAS")
    max_id = c.fetchone()[0]
    print("Max ID_CONTA in CONTAS:", max_id)

    print("\n=== CHECKING VIEW/TABLE DASH_FINANCEIRO ===")
    # Let's check if DASH_FINANCEIRO table/view exists
    c.execute("SELECT FIRST 1 * FROM DASH_FINANCEIRO")
    col_names = [desc[0] for desc in c.description]
    print("DASH_FINANCEIRO columns:", col_names)

    c.execute("SELECT FIRST 5 * FROM DASH_FINANCEIRO WHERE id_firebird = 371927")
    rows_dash = c.fetchall()
    print("DASH_FINANCEIRO with ID 371927:", rows_dash)

    c.execute("SELECT MAX(id_firebird) FROM DASH_FINANCEIRO")
    max_dash_id = c.fetchone()[0]
    print("Max id_firebird in DASH_FINANCEIRO:", max_dash_id)

except Exception as e:
    print("Error:", e)
